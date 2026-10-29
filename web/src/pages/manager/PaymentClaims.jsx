import { useEffect, useMemo, useState } from 'react'
import { Check, Clock, HandCoins, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Note } from '@/components/ui/Display'
import { Field, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-BIL-13 Payment confirmations — Manager › Finance (ADR-22, spec §6.7). Students report "I have transferred";
// a Manager checks the bank statement and confirms the claims, one by one or in bulk, or rejects them with a reason.
// GET /payment-claims?termId&block&type&since&q&page&pageSize → {
//   items: [{ invoiceId, studentName, studentCode, type, typeLabel, title, amount, claimedAt, dueAt, timeLeftSeconds,
//             reference, rejected, transferContent }], total, summary: { count, amount } }
// POST /payment-claims/confirm { invoiceIds } → { confirmed, amount, skipped: [{ invoiceId, reason }] }
// POST /payment-claims/reject { invoiceIds, reason } → { rejected, cancelled, skipped }
// Each Invoice is paid and audited on its own; the dialog says what will happen in numbers (spec §11.1).
// A work queue: claims of every Term are listed (a Deposit of the next Term waits too), only the Block filter applies.

/** "2 days 4 h", "1 day 3 h", "5 h", "—" (a debt already due). */
function duration(seconds) {
  if (!seconds) return '—'
  const hours = Math.floor(seconds / 3600)
  if (hours >= 48) return t('{d} days {h} h', { d: Math.floor(hours / 24), h: hours % 24 })
  return hours >= 24 ? t('1 day {h} h', { h: hours - 24 }) : t('{n} h', { n: Math.max(1, hours) })
}

export default function PaymentClaims() {
  const { block } = useScopeQuery()
  const { notify, notifyError } = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [since, setSince] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState(() => new Set())
  const [dialog, setDialog] = useState(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const filters = { block, q: search, type, since, page, pageSize }
  const query = useQuery(['payment-claims', filters], ({ signal }) => api.paymentClaims.list(filters, { signal }))
  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const chosen = items.filter((c) => selected.has(c.invoiceId))
  const chosenTotal = chosen.reduce((sum, c) => sum + c.amount, 0)
  const allChecked = items.length > 0 && chosen.length === items.length

  // Drop selections that left the list (decided elsewhere).
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => items.some((c) => c.invoiceId === id))))
  }, [items])

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }
  const done = () => {
    setDialog(null)
    setReason('')
    setSelected(new Set())
  }

  const confirm = useMutation((ids) => api.paymentClaims.confirm({ invoiceIds: ids }), {
    invalidates: ['payment-claims', 'payments', 'applications', 'dashboard'],
    onSuccess: (r) => {
      notify({
        title: 'Payments confirmed',
        message: t('{n} confirmed, {amount} in all.', { n: formatNumber(r.confirmed), amount: formatVnd(r.amount) })
          + (r.skipped?.length ? ' ' + t('{n} skipped: decided by someone else.', { n: r.skipped.length }) : ''),
      })
      done()
    },
    onError: (e) => notifyError(e, 'Could not confirm the payments'),
  })
  const reject = useMutation((ids) => api.paymentClaims.reject({ invoiceIds: ids, reason: reason.trim() }), {
    invalidates: ['payment-claims', 'payments', 'applications', 'dashboard'],
    onSuccess: (r) => {
      notify({
        type: 'warning',
        title: 'Transfers rejected',
        message: t('{n} rejected; {c} Invoices cancelled after too many rejections.', { n: r.rejected, c: r.cancelled }),
      })
      done()
    },
    onError: (e) => notifyError(e, 'Could not reject the transfers'),
  })
  const s = query.data?.summary

  return (
    <>
      <PageHeader
        title="Payment confirmations"
        description="Students said they transferred. Find each amount and transfer content on the bank statement, then confirm or reject."
        actions={
          <>
            <Button icon={X} disabled={!chosen.length} onClick={() => setDialog('reject')}>
              {t('Reject ({n})', { n: chosen.length })}
            </Button>
            <Button variant="primary" icon={Check} disabled={!chosen.length} onClick={() => setDialog('confirm')}>
              {t('Confirm ({n})', { n: chosen.length })}
            </Button>
          </>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" icon={Clock} label="Claims waiting" value={formatNumber(s?.count)} valueTone={s?.count ? 'warning' : undefined} note="The students' deadlines are paused" />
        <KpiTile size="md" icon={HandCoins} label="Amount waiting" value={s ? formatVnd(s.amount) : '—'} note="To find on the bank statement" />
        <KpiTile size="md" icon={Check} label="Selected" value={formatNumber(chosen.length)} note={chosen.length ? formatVnd(chosenTotal) : t('Select claims to decide them')} />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-80" aria-label={t('Search')} placeholder="Search Invoice, student, transfer content or reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          wrapperClassName="w-40"
          aria-label={t('Type')}
          value={type}
          onChange={filter(setType)}
          options={[
            { value: '', label: 'Type: All' },
            { value: 'deposit', label: 'Type: Deposit' },
            { value: 'balance', label: 'Type: Balance' },
            { value: 'termFee', label: 'Type: Next-Term fee' },
            { value: 'utility', label: 'Type: Utility' },
            { value: 'damage', label: 'Type: Damage' },
          ]}
        />
        <Select
          wrapperClassName="w-48"
          aria-label={t('Claimed')}
          value={since}
          onChange={filter(setSince)}
          options={[
            { value: '', label: 'Claimed: any time' },
            { value: 'today', label: 'Claimed: today' },
            { value: '24h', label: 'Claimed: last 24 hours' },
            { value: '7d', label: 'Claimed: last 7 days' },
          ]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-10">
              <Checkbox
                aria-label={t('Select all')}
                checked={allChecked}
                indeterminate={!allChecked && chosen.length > 0}
                onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((c) => c.invoiceId)))}
              />
            </Th>
            <Th className="w-36">Invoice</Th>
            <Th className="w-48">Student</Th>
            <Th className="w-44">Type</Th>
            <Th className="w-32" align="right">
              Amount
            </Th>
            <Th className="w-40">Transfer content</Th>
            <Th className="w-40">Claimed</Th>
            <Th className="w-30">Time left</Th>
            <Th>Note</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={9} emptyIcon={HandCoins} emptyTitle="No payment claims wait for confirmation" />
          {items.map((c) => (
            <Tr key={c.invoiceId} selected={selected.has(c.invoiceId)} onClick={() => toggle(c.invoiceId)} className="[&>td]:h-12">
              <Td onClick={stop}>
                <Checkbox aria-label={t('Select {id}', { id: c.invoiceId })} checked={selected.has(c.invoiceId)} onChange={() => toggle(c.invoiceId)} />
              </Td>
              <Td className="font-medium text-fg-brand">{c.invoiceId}</Td>
              <Td>
                <TwoLine primary={c.studentName} secondary={c.studentCode} />
              </Td>
              <Td>{tr(c.title ?? c.typeLabel)}</Td>
              <Td align="right" className="whitespace-nowrap font-medium">
                {formatVnd(c.amount)}
              </Td>
              <Td className="font-mono text-sm">{c.transferContent}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(c.claimedAt)}</Td>
              <Td className="whitespace-nowrap">{duration(c.timeLeftSeconds)}</Td>
              <Td>
                <span className="flex flex-wrap items-center gap-1.5">
                  {c.reference && <span className="text-sm text-fg-secondary">{t('Ref. {ref}', { ref: c.reference })}</span>}
                  {c.rejected > 0 && <Tag tone="warning">{t('Rejected {n}×', { n: c.rejected })}</Tag>}
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

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

      <Modal
        open={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        title={t('Confirm {n} payments, {amount}', { n: formatNumber(chosen.length), amount: formatVnd(chosenTotal) })}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" icon={Check} disabled={confirm.pending} onClick={() => confirm.run(chosen.map((c) => c.invoiceId))}>
              {confirm.pending ? t('Confirming…') : t('Confirm {n} payments, {amount}', { n: formatNumber(chosen.length), amount: formatVnd(chosenTotal) })}
            </Button>
          </>
        }
      >
        <p className="text-base text-fg">
          {t('Each Invoice is marked Paid at the time its student reported the transfer, written to the Audit Log and announced to the student.')}
        </p>
        <Note>{t('Confirm only transfers you found on the bank statement with the exact amount and transfer content.')}</Note>
      </Modal>

      <Modal
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title={t('Reject {n} transfers', { n: formatNumber(chosen.length) })}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" icon={X} disabled={!reason.trim() || reject.pending} onClick={() => reject.run(chosen.map((c) => c.invoiceId))}>
              {reject.pending ? t('Rejecting…') : t('Reject transfers')}
            </Button>
          </>
        }
      >
        <Field label="Reason shown to the students" required>
          {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="No transfer with this content reached the account." />}
        </Field>
        <Alert type="warning" title="What happens">
          {t('The students are told and their deadline continues with the time that was left (at least 12 hours). A second rejection cancels a Deposit or a Balance and what depends on it.')}
        </Alert>
      </Modal>
    </>
  )
}
