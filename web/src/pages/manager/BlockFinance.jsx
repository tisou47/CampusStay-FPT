import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Bell, Check, Download } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert } from '@/components/ui/Display'
import { Field, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatNumber, formatPercent, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-BIL-20 Block Finance (Figma 61:707)
// GET /finance/summary?termId&block → { invoiced, invoices, collected, overdueCount, overdueAmount, refundsPendingCount, refundsPendingAmount }
// GET /refunds?termId&block&page → { items: [{ id, name, studentCode, reason, rule, paid, amount, proposedLabel, exception, status }], total }
// POST /refunds/:id/decision { decision, note }
// GET /finance/overdue?termId&block&page → { items: [{ invoiceId, name, studentCode, typeLabel, amount, dueAt, daysOverdue, remindedAt }], total }
// POST /finance/reminders { invoiceIds } · GET /invoices?termId&block&page → { items: [{ id, name, studentCode, typeLabel, amount, dueAt, status }], total }

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
        message: decision === 'Approved' ? t('{amount} is paid to {name}.', { amount: formatVnd(refund.amount), name: refund.name }) : t('{name} was notified.', { name: refund.name }),
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
          {tr(refund.rule)}. {t('Your reason is written to the audit log for Admin review.')}
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

function RefundsTab({ scope }) {
  const [params] = useSearchParams()
  const [deciding, setDeciding] = useState(null)
  const [query, pagination] = usePaged(['refunds', scope], (p, signal) => api.finance.refunds({ ...scope, ...p }, { signal }))
  const highlight = params.get('refund')
  return (
    <>
      <Table fill>
        <THead>
          <tr>
            <Th className="w-34">Refund</Th>
            <Th className="w-44">Student</Th>
            <Th>Reason</Th>
            <Th className="w-40">Rule</Th>
            <Th className="w-28">Paid</Th>
            <Th className="w-32">Refund</Th>
            <Th className="w-48">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyTitle="No refund requests" />
          {(query.data?.items ?? []).map((r) => (
            <Tr key={r.id} selected={r.id === highlight} className="[&>td]:h-15">
              <Td className="font-medium whitespace-nowrap text-fg-brand">{r.id}</Td>
              <Td>
                <TwoLine primary={r.name} secondary={r.studentCode} />
              </Td>
              <Td>{tr(r.reason)}</Td>
              <Td className="text-sm text-fg-secondary">{tr(r.rule)}</Td>
              <Td className="tabular">{r.paid != null ? formatNumber(r.paid) : '—'}</Td>
              <Td className="font-medium whitespace-nowrap tabular">{r.proposedLabel ? tr(r.proposedLabel) : formatNumber(r.amount)}</Td>
              <Td>
                {r.status === 'Pending' ? (
                  <div className="flex items-center gap-1">
                    <Button variant="text" onClick={() => setDeciding({ refund: r, decision: 'Rejected' })}>
                      Reject
                    </Button>
                    <Button icon={Check} onClick={() => setDeciding({ refund: r, decision: 'Approved' })}>
                      Approve
                    </Button>
                  </div>
                ) : (
                  <StatusTag status={r.status} tone={r.status === 'Approved' ? 'success' : 'error'} />
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {pagination}
      {deciding && <DecisionModal {...deciding} onClose={() => setDeciding(null)} />}
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
            <Th className="w-40">Invoice</Th>
            <Th>Student</Th>
            <Th className="w-44">Type</Th>
            <Th className="w-32">Amount</Th>
            <Th className="w-32">Due</Th>
            <Th className="w-28">Overdue</Th>
            <Th className="w-44">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyTitle="No overdue Invoices" />
          {(query.data?.items ?? []).map((o) => (
            <Tr key={o.invoiceId}>
              <Td className="font-medium text-fg-brand">{o.invoiceId}</Td>
              <Td>
                <TwoLine primary={o.name} secondary={o.studentCode} />
              </Td>
              <Td>{tr(o.typeLabel)}</Td>
              <Td className="tabular">{formatNumber(o.amount)}</Td>
              <Td>{formatDate(o.dueAt)}</Td>
              <Td>
                <Tag tone="error">{t('{n} days', { n: o.daysOverdue })}</Tag>
              </Td>
              <Td>
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
            <Th className="w-40">Invoice</Th>
            <Th>Student</Th>
            <Th className="w-48">Type</Th>
            <Th className="w-32">Amount</Th>
            <Th className="w-32">Due</Th>
            <Th className="w-32">Status</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyTitle="No Invoices" />
          {(query.data?.items ?? []).map((i) => (
            <Tr key={i.id}>
              <Td className="font-medium text-fg-brand">{i.id}</Td>
              <Td>
                <TwoLine primary={i.name} secondary={i.studentCode} />
              </Td>
              <Td>{tr(i.typeLabel)}</Td>
              <Td className="tabular">{formatNumber(i.amount)}</Td>
              <Td>{formatDate(i.dueAt)}</Td>
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
  const summary = useQuery(['finance', 'summary', scope], ({ signal }) => api.finance.summary(scope, { signal }))
  const s = summary.data
  const exporting = useMutation(() => api.exports.download('block-finance', scope, 'block-finance.csv'), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title={block ? t('Finance · Block {code}', { code: block }) : 'Collections and refunds'}
        description={`${term ? `${t('{term} invoices and refunds.', { term: term.name })} ` : ''}${t('Refunds follow Admin rules; you approve exceptions and partial refunds.')}`}
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Invoiced" value={s ? formatVnd(s.invoiced) : '—'} note={s ? t('{n} Invoices', { n: formatNumber(s.invoices) }) : null} />
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
          { key: 'all', label: 'All Invoices' },
        ]}
      />

      {tab === 'refunds' && <RefundsTab scope={scope} />}
      {tab === 'overdue' && <OverdueTab scope={scope} />}
      {tab === 'all' && <AllInvoicesTab scope={scope} />}
    </>
  )
}
