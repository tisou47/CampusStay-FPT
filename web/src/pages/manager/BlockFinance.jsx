import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Bell, Check, Download, Eye } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, DescriptionList } from '@/components/ui/Display'
import { Field, Input, SearchInput, Textarea } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { Truncate } from '@/components/ui/Tooltip'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatNumber, formatPercent, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-BIL-20 Block Finance (Figma 61:707)
// GET /finance/summary?termId&block → { invoiced, invoices, collected, overdueCount, overdueAmount, refundsPendingCount, refundsPendingAmount }
// GET /refunds?termId&block&page → { items: [{ id, name, studentCode, reason, rule, paid, amount, proposedLabel, percent, exception, status,
//   account: { holder, number, bank } | null, createdAt, accountRemindedAt }], total } — the account the student gave for refunds (A-62)
// POST /refunds/:id/decision { decision, note } · POST /refunds/:id/account-reminder → { remindedAt } (R-19, once a day)
// GET /finance/overdue?termId&block&page → { items: [{ invoiceId, name, studentCode, typeLabel, amount, dueAt, daysOverdue, remindedAt }], total }
// POST /finance/reminders { invoiceIds } · GET /invoices?termId&block&page → { items: [{ id, name, studentCode, typeLabel, amount, dueAt, status }], total }

/** Records the bank transfer of an approved refund (Approved → Paid). */
function PaidModal({ refund, onClose }) {
  const { notify } = useToast()
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const paid = useMutation(() => api.finance.markRefundPaid(refund.id, { reference: reference.trim(), note: note.trim() || undefined }), {
    invalidates: ['refunds', 'finance', 'approvals', 'dashboard'],
    onSuccess: () => {
      notify({ title: t('{id} marked paid', { id: refund.id }), message: t('{amount} was transferred to {name}.', { amount: formatVnd(refund.amount), name: refund.name }) })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Mark {id} paid', { id: refund.id })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!reference.trim() || paid.pending} loading={paid.pending} onClick={() => paid.run()}>
            {t('Mark {amount} paid', { amount: formatVnd(refund.amount) })}
          </Button>
        </>
      }
    >
      {paid.error && !paid.error.fields?.reference && (
        <Alert type="error" title="Could not mark the refund paid">{paid.error.message}</Alert>
      )}
      <Field label="Bank transfer reference" required error={paid.error?.fields?.reference}>
        {(id) => <Input id={id} value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder="e.g. FT2611210001" />}
      </Field>
      <Field label="Note">{(id) => <Textarea id={id} rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field>
    </Modal>
  )
}

function DecisionModal({ refund, decision, onClose }) {
  const { notify } = useToast()
  const [note, setNote] = useState('')
  const needsNote = decision === 'Rejected' || refund.exception
  const decide = useMutation(() => api.finance.decideRefund(refund.id, { decision, note: note.trim() || undefined }), {
    invalidates: ['refunds', 'finance', 'approvals', 'dashboard'],
    onSuccess: () => {
      notify({
        type: decision === 'Approved' ? 'success' : 'warning',
        title: t(decision === 'Approved' ? '{id} approved' : '{id} rejected', { id: refund.id }),
        message: decision === 'Approved' ? t('Transfer {amount} to {name}, then mark it paid.', { amount: formatVnd(refund.amount), name: refund.name }) : t('{name} was notified.', { name: refund.name }),
      })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t(decision === 'Approved' ? 'Approve {id}' : 'Reject {id}', { id: refund.id })}
      description={`${refund.name} · ${tr(refund.reason)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={decision === 'Approved' ? 'primary' : 'danger'} disabled={(needsNote && !note.trim()) || decide.pending} onClick={() => decide.run()}>
            {decision === 'Approved' ? t('Approve {amount}', { amount: formatVnd(refund.amount) }) : t('Reject refund')}
          </Button>
        </>
      }
    >
      {decide.error && <Alert type="error" title="Could not save the decision">{decide.error.message}</Alert>}
      {refund.exception && decision === 'Approved' && (
        <Alert type="warning" title="This refund is above the rule">
          {tr(refund.rule)}. {t('Your reason is written to the audit log for admin review.')}
        </Alert>
      )}
      <Field label={decision === 'Approved' ? 'Reason for the exception' : 'Reason shown to the student'} required={needsNote}>
        {(id) => <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Modal>
  )
}

function usePaged(key, fetcher) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // A new search (or Block, Term) starts again on the first page.
  const filters = JSON.stringify(key)
  useEffect(() => setPage(1), [filters])
  const query = useQuery([...key, page, pageSize], ({ signal }) => fetcher({ page, pageSize }, signal))
  const pagination = (
    <div className="flex shrink-0 justify-end">
      <Pagination
        total={query.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n)
          setPage(1)
        }}
      />
    </div>
  )
  return [query, pagination]
}

/** A day after the last reminder a student may be reminded again (the API refuses sooner). */
const remindedToday = (at) => Boolean(at) && Date.now() - new Date(at).getTime() < 24 * 3600 * 1000

function RefundsTab({ scope }) {
  const { notify, notifyError } = useToast()
  const [params] = useSearchParams()
  const remind = useMutation((r) => api.finance.remindAccount(r.id), {
    invalidates: ['refunds'],
    onSuccess: (_, r) => notify({ title: 'Reminder sent', message: t('{name} is asked to enter the bank account for the refund.', { name: r.name }) }),
    onError: (e) => notifyError(e, 'Could not send the reminder'),
  })
  const [deciding, setDeciding] = useState(null)
  const [paying, setPaying] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [query, pagination] = usePaged(['refunds', scope], (p, signal) => api.finance.refunds({ ...scope, ...p }, { signal }))
  const highlight = params.get('refund')
  const items = query.data?.items ?? []
  // The details show the row as the list has it now (after a reminder, a decision…).
  const shown = viewing ? items.find((r) => r.id === viewing) ?? null : null
  const canRemind = (r) => !r.account && (r.status === 'Pending' || r.status === 'Approved')
  const reminderText = (r) => (r.accountRemindedAt ? t('Reminded {date}', { date: formatDate(r.accountRemindedAt) }) : t('Remind to enter it'))
  // `compact` (the table): the reminder is a bell beside the warning, its words in the tooltip, so the cell keeps
  // its width; the details show the whole button.
  const payTo = (r, compact = false) =>
    r.account ? (
      <TwoLine primary={<span className="tabular">{r.account.number}</span>} secondary={`${r.account.holder} · ${r.account.bank}`} />
    ) : compact ? (
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 text-sm text-warning-fg">{t('No bank account yet')}</span>
        {canRemind(r) && (
          <IconButton
            size="sm"
            variant="outline"
            icon={Bell}
            iconSize={14}
            aria-label={reminderText(r)}
            disabled={remindedToday(r.accountRemindedAt) || remind.pending}
            onClick={() => remind.run(r)}
          />
        )}
      </div>
    ) : (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-sm text-warning-fg">{t('No bank account yet')}</span>
        {canRemind(r) && (
          <Button size="sm" variant="text" icon={Bell} iconSize={14} disabled={remindedToday(r.accountRemindedAt) || remind.pending} onClick={() => remind.run(r)}>
            {reminderText(r)}
          </Button>
        )}
      </div>
    )
  const actions = (r) =>
    r.status === 'Pending' ? (
      <>
        <Button size="sm" variant="text" onClick={() => setDeciding({ refund: r, decision: 'Rejected' })}>
          Reject
        </Button>
        <Button size="sm" variant="primary" icon={Check} onClick={() => setDeciding({ refund: r, decision: 'Approved' })}>
          Approve
        </Button>
      </>
    ) : r.status === 'Approved' ? (
      <Button size="sm" variant="primary" icon={Check} onClick={() => setPaying(r)}>
        Mark paid
      </Button>
    ) : null
  const open = (fn) => (r) => {
    setViewing(null)
    fn(r)
  }
  return (
    <>
      <Table fill tableClassName="table-fixed">
        <THead>
          <tr>
            <Th className="w-28">Refund</Th>
            <Th className="w-44">Student</Th>
            <Th>Reason</Th>
            <Th className="w-36" align="right">
              Total
            </Th>
            <Th className="w-48">Pay to</Th>
            <Th className="w-[300px]">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyTitle={scope.q ? 'Nothing matches this search' : 'No refund requests'} />
          {items.map((r) => (
            <Tr key={r.id} selected={r.id === highlight} className="[&>td]:h-15">
              <Td className="font-medium whitespace-nowrap text-fg-brand">{r.id}</Td>
              <Td>
                <TwoLine primary={r.name} secondary={r.studentCode} />
              </Td>
              <Td>
                <Truncate className="block">{tr(r.reason)}</Truncate>
              </Td>
              <Td align="right" className="whitespace-nowrap">
                <TwoLine primary={<span className="font-medium tabular">{formatVnd(r.amount)}</span>} secondary={r.percent != null ? t('{p}% of {paid}', { p: formatNumber(r.percent), paid: formatVnd(r.paid) }) : undefined} />
              </Td>
              <Td>{payTo(r, true)}</Td>
              <Td>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" icon={Eye} onClick={() => setViewing(r.id)}>
                    Details
                  </Button>
                  {actions(r) ?? <StatusTag status={r.status} tone={r.status === 'Paid' ? 'success' : 'error'} />}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {pagination}
      {shown && (
        <Drawer
          open
          onClose={() => setViewing(null)}
          width={520}
          title={t('Refund {id}', { id: shown.id })}
          description={`${shown.name} · ${shown.studentCode}`}
          footer={
            shown.status === 'Pending' ? (
              <>
                <Button variant="text" onClick={() => open(setDeciding)({ refund: shown, decision: 'Rejected' })}>
                  Reject
                </Button>
                <Button variant="primary" icon={Check} onClick={() => open(setDeciding)({ refund: shown, decision: 'Approved' })}>
                  Approve
                </Button>
              </>
            ) : shown.status === 'Approved' ? (
              <Button variant="primary" icon={Check} onClick={() => open(setPaying)(shown)}>
                Mark paid
              </Button>
            ) : (
              <Button onClick={() => setViewing(null)}>Close</Button>
            )
          }
        >
          {shown.exception && <Alert type="warning" title="This refund is above the rule">{tr(shown.rule)}</Alert>}
          <DescriptionList labelWidth="w-32"
            items={[
              ['Status', <StatusTag key="s" status={shown.status} tone={shown.status === 'Paid' ? 'success' : shown.status === 'Rejected' ? 'error' : undefined} />],
              ['Reason', tr(shown.reason)],
              ['Rule', tr(shown.rule)],
              ['Paid', shown.paid != null ? formatVnd(shown.paid) : '—'],
              ['Percent', shown.percent != null ? `${formatNumber(shown.percent)}%` : '—'],
              ['Total', <span key="a" className="font-semibold tabular">{formatVnd(shown.amount)}</span>],
              ['Pay to', payTo(shown)],
              shown.createdAt && ['Requested', formatDateTime(shown.createdAt)],
            ].filter(Boolean)}
          />
        </Drawer>
      )}
      {deciding && <DecisionModal {...deciding} onClose={() => setDeciding(null)} />}
      {paying && <PaidModal refund={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

function OverdueTab({ scope }) {
  const { notify, notifyError } = useToast()
  const [query, pagination] = usePaged(['finance', 'overdue', scope], (p, signal) => api.finance.overdue({ ...scope, ...p }, { signal }))
  const remind = useMutation((o) => api.finance.remind({ invoiceIds: [o.invoiceId] }), {
    invalidates: ['finance'],
    onSuccess: (_, o) => notify({ title: 'Reminder sent', message: t('{name} got an email and an in-app reminder for {id}.', { name: o.name, id: o.invoiceId }) }),
    onError: (e) => notifyError(e, 'Could not send the reminder'),
  })
  return (
    <>
      <Table fill>
        <THead>
          <tr>
            <Th className="w-52">Invoice</Th>
            <Th>Student</Th>
            <Th className="w-36" align="right">
              Amount
            </Th>
            <Th className="w-48">Due</Th>
            <Th className="w-56">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} emptyTitle={scope.q ? 'Nothing matches this search' : 'No overdue invoices'} />
          {(query.data?.items ?? []).map((o) => (
            <Tr key={o.invoiceId} className="[&>td]:h-14">
              <Td>
                <TwoLine primary={<span className="font-medium text-fg-brand">{o.invoiceId}</span>} secondary={tr(o.typeLabel)} />
              </Td>
              <Td>
                <TwoLine primary={o.name} secondary={o.studentCode} />
              </Td>
              <Td align="right" className="font-medium whitespace-nowrap tabular">
                {formatVnd(o.amount)}
              </Td>
              <Td>
                <span className="flex flex-wrap items-center gap-2">
                  {formatDate(o.dueAt)}
                  <Tag tone="error">{t('{n} days', { n: o.daysOverdue })}</Tag>
                </span>
              </Td>
              <Td align="right">
                <Button icon={Bell} disabled={Boolean(o.remindedAt) || remind.pending} onClick={() => remind.run(o)}>
                  {o.remindedAt ? t('Reminded {date}', { date: formatDate(o.remindedAt) }) : t('Send reminder')}
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {pagination}
    </>
  )
}

function AllInvoicesTab({ scope }) {
  const [query, pagination] = usePaged(['finance', 'invoices', scope], (p, signal) => api.finance.invoices({ ...scope, ...p }, { signal }))
  return (
    <>
      <Table fill>
        <THead>
          <tr>
            <Th className="w-52">Invoice</Th>
            <Th>Student</Th>
            <Th className="w-36" align="right">
              Amount
            </Th>
            <Th className="w-36">Due</Th>
            <Th className="w-40">Status</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} emptyTitle={scope.q ? 'Nothing matches this search' : 'No invoices'} />
          {(query.data?.items ?? []).map((i) => (
            <Tr key={i.id} className="[&>td]:h-14">
              <Td>
                <TwoLine primary={<span className="font-medium text-fg-brand">{i.id}</span>} secondary={tr(i.typeLabel)} />
              </Td>
              <Td>
                <TwoLine primary={i.name} secondary={i.studentCode} />
              </Td>
              <Td align="right" className="font-medium whitespace-nowrap tabular">
                {formatVnd(i.amount)}
              </Td>
              <Td className="whitespace-nowrap">{formatDate(i.dueAt)}</Td>
              <Td>
                <StatusTag status={i.status} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {pagination}
    </>
  )
}

export default function BlockFinance() {
  const { block, term } = useSession()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'refunds'
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])
  const summary = useQuery(['finance', 'summary', scope], ({ signal }) => api.finance.summary(scope, { signal }))
  const s = summary.data
  // The three lists (and the export) follow the search; the figures above stay the Term's.
  const listScope = { ...scope, q: search || undefined }
  const exporting = useMutation(() => api.exports.download('block-finance', listScope, 'block-finance.csv'), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title={block ? t('Finance · Block {code}', { code: block }) : 'Collections and refunds'}
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Invoiced" value={s ? formatVnd(s.invoiced) : '—'} note={s ? t('{n} invoices', { n: formatNumber(s.invoices) }) : null} />
        <KpiTile size="md" label="Collected" value={s ? formatVnd(s.collected) : '—'} note={s?.invoiced ? formatPercent(s.collected / s.invoiced, 0) : null} />
        <KpiTile size="md" label="Overdue" value={formatNumber(s?.overdueCount)} note={s ? formatVnd(s.overdueAmount) : null} />
        <KpiTile size="md" label="Refunds pending" value={formatNumber(s?.refundsPendingCount)} note={s ? formatVnd(s.refundsPendingAmount) : null} />
      </div>

      <Tabs
        className="shrink-0"
        value={tab}
        onChange={(key) => setParams(key === 'refunds' ? {} : { tab: key })}
        items={[
          { key: 'refunds', label: 'Refund approvals', count: s?.refundsPendingCount },
          { key: 'overdue', label: 'Overdue', count: s?.overdueCount },
          { key: 'all', label: 'All invoices' },
        ]}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput
          wrapperClassName="w-96 max-w-full"
          aria-label={t('Search')}
          placeholder={tab === 'refunds' ? 'Search student name or student code' : 'Search student, student code or invoice'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {tab === 'refunds' && <RefundsTab scope={listScope} />}
      {tab === 'overdue' && <OverdueTab scope={listScope} />}
      {tab === 'all' && <AllInvoicesTab scope={listScope} />}
    </>
  )
}
