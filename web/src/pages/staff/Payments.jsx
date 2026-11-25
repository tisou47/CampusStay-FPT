import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Banknote, Check, Clock, CreditCard, Download, Eye, ReceiptText, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { DetailRows } from '@/components/ui/Display'
import { Field, FilePicker, FilterSelect, Input, SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatPercent, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-BIL-10 Payments (Figma 23:614) and "Confirm payment" modal (23:1128). Bulk confirmation of claims:
// SCR-BIL-13 Payment confirmations (/manager/payment-claims).
// GET /payments?termId&block&q&type&status&method&date&page&pageSize → {
//   items: [{ invoiceId, studentName, studentCode, type, typeLabel, amount, method, paidAt, dueAt, status, reference, transferContent, receipt: { name, size, url } }],
//   total, summary: { collectedToday, collectedTodayCount, awaitingConfirmation, unpaidDeposits, depositsPaid, depositsSubmitted } }
// POST /payments/:invoiceId/confirm (multipart) reference?, receipt — the Invoice's claim, or a transfer the
// student did not report yet (ADR-22); the amount is always the Invoice's. The receipt is required (R-23) unless one is
// already attached to the claim.

const AWAITING = 'Awaiting confirmation'
/** Statuses a Manager may confirm: a claim, or a transfer the student never reported. */
const CONFIRMABLE = [AWAITING, 'Unpaid', 'Overdue']

/**
 * One Invoice confirmed with its transfer receipt and a reference (POST /payments/:invoiceId/confirm), also when the student never
 * claimed it. Payments and Payment confirmations both open it: there is one confirmation path (backend answer Q8).
 */
export function ConfirmPaymentModal({ payment, onClose }) {
  const { notify } = useToast()
  const [reference, setReference] = useState('')
  const [file, setFile] = useState(null)
  const [matched, setMatched] = useState(false)
  useEffect(() => {
    if (payment) {
      setReference(payment.reference ?? '')
      setFile(null)
      setMatched(false)
    }
  }, [payment])
  const confirm = useMutation(
    () => {
      const data = new FormData()
      if (reference.trim()) data.set('reference', reference.trim())
      if (file) data.set('receipt', file)
      return api.payments.confirm(payment.invoiceId, data)
    },
    {
      invalidates: ['payments', 'payment-claims', 'applications', 'dashboard'],
      onSuccess: () => {
        notify({ title: 'Payment confirmed', message: t('{id} · {amount} from {name}.', { id: payment.invoiceId, amount: formatVnd(payment.amount), name: payment.studentName }) })
        onClose()
      },
      onError: () => {},
    },
  )
  if (!payment) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm payment"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!matched || !(file || payment.receipt) || confirm.pending} onClick={() => confirm.run()}>
            {confirm.pending ? t('Confirming…') : t('Confirm payment')}
          </Button>
        </>
      }
    >
      {confirm.error && <p className="rounded-md bg-error-bg px-3 py-2 text-base text-error-fg">{confirm.error.message}</p>}
      <div className="rounded-lg border border-line bg-subtle p-4">
        <DetailRows
          rowClassName="py-0.75"
          rows={[
            ['Invoice', <span className="font-medium">{payment.invoiceId} · {tr(payment.typeLabel)}</span>],
            ['Student', <span className="font-medium">{payment.studentName} · {payment.studentCode}</span>],
            ['Expected amount', <span className="font-medium">{formatVnd(payment.amount)}</span>],
            ['Transfer content', <span className="font-medium">{payment.transferContent ?? '—'}</span>],
          ]}
          className="[&>div]:border-b-0"
        />
      </div>
      <Field label="Bank reference (optional)">{(id) => <Input id={id} value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />}</Field>
      {payment.receipt?.url ? (
        <a href={payment.receipt.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-line px-3 py-2.5 text-base text-fg-link hover:underline">
          <ReceiptText size={16} aria-hidden="true" />
          {payment.receipt.name}
          {payment.receipt.size && <span className="text-sm text-fg-tertiary">· {payment.receipt.size}</span>}
        </a>
      ) : (
        <FilePicker file={file} onChange={setFile} accept="image/*,application/pdf" placeholder="Attach transfer receipt (required)" />
      )}
      <Checkbox label="I found exactly this amount with this transfer content on the bank statement." checked={matched} onChange={(e) => setMatched(e.target.checked)} />
    </Modal>
  )
}

export default function Payments() {
  const [params, setParams] = useSearchParams()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [date, setDate] = useState('term')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [view, setView] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = { ...scope, q: search, type, status, method, date, page, pageSize }
  const query = useQuery(['payments', filters], ({ signal }) => api.payments.list(filters, { signal }))
  const items = query.data?.items ?? []
  const s = query.data?.summary
  const exporting = useMutation(() => api.exports.download('payments', { ...filters, page: undefined, pageSize: undefined }, 'payments.xlsx'), { onError: (e) => notifyError(e, 'Export failed') })

  const confirmId = params.get('confirm')
  const linked = useQuery(['payments', 'one', confirmId], ({ signal }) => api.payments.list({ q: confirmId, pageSize: 5 }, { signal }), { enabled: Boolean(confirmId) })
  const confirming = confirmId
    ? [...items, ...(linked.data?.items ?? [])].find((p) => p.invoiceId === confirmId && CONFIRMABLE.includes(p.status)) ?? null
    : null
  const close = () => setParams({}, { replace: true })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Payments"
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" icon={Banknote} label="Collected today" value={s ? formatVnd(s.collectedToday) : '—'} note={s ? t('{n} payments', { n: formatNumber(s.collectedTodayCount) }) : null} />
        <KpiTile size="md" icon={Clock} label="Awaiting confirmation" value={formatNumber(s?.awaitingConfirmation)} valueTone={s?.awaitingConfirmation ? 'warning' : undefined} note="Reported by students" />
        <KpiTile size="md" icon={TriangleAlert} label="Unpaid deposits" value={formatNumber(s?.unpaidDeposits)} note="Expire at their deadline" />
        <KpiTile
          size="md"
          icon={CreditCard}
          label="Deposits paid"
          value={s ? `${formatNumber(s.depositsPaid)} / ${formatNumber(s.depositsSubmitted)}` : '—'}
          note={s?.depositsSubmitted ? t('{p} of submitted', { p: formatPercent(s.depositsPaid / s.depositsSubmitted, 0) }) : null}
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput wrapperClassName="w-70" aria-label={t('Search')} placeholder="Search invoice, student or reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterSelect
          label="Type"
          value={type}
          onChange={(v) => filter(setType)({ target: { value: v } })}
          options={[
            { value: '', label: 'All' },
            { value: 'deposit', label: 'deposit' },
            { value: 'balance', label: 'balance' },
            { value: 'termFee', label: 'Next-term fee' },
            { value: 'utility', label: 'utility' },
            { value: 'roomChange', label: 'room change' },
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => filter(setStatus)({ target: { value: v } })}
          options={[
            { value: '', label: 'All' },
            { value: AWAITING, label: 'Awaiting' },
            { value: 'Paid', label: 'Paid' },
            { value: 'Unpaid', label: 'Unpaid' },
          ]}
        />
        <FilterSelect
          label="Method"
          value={method}
          onChange={(v) => filter(setMethod)({ target: { value: v } })}
          options={[
            { value: '', label: 'All' },
            { value: 'Bank transfer', label: 'Bank transfer' },
            { value: 'VietQR', label: 'VietQR' },
            { value: 'Manual transfer', label: 'Manual' },
          ]}
        />
        <FilterSelect
          label="Date"
          value={date}
          onChange={(v) => filter(setDate)({ target: { value: v } })}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7d', label: 'Last 7 days' },
            { value: 'term', label: 'This term' },
          ]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-52">Invoice</Th>
            <Th>Student</Th>
            <Th className="w-36" align="right">
              Amount
            </Th>
            <Th className="w-56">Status</Th>
            <Th className="w-56">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} emptyIcon={ReceiptText} emptyTitle="No payments match these filters" />
          {items.map((p) => (
            <Tr key={p.invoiceId} className="[&>td]:h-14">
              <Td>
                <TwoLine primary={<span className="font-medium text-fg-brand">{p.invoiceId}</span>} secondary={tr(p.typeLabel)} />
              </Td>
              <Td>
                <TwoLine primary={p.studentName} secondary={p.studentCode} />
              </Td>
              <Td align="right" className="font-medium whitespace-nowrap tabular">
                {formatVnd(p.amount)}
              </Td>
              <Td>
                <TwoLine
                  primary={p.status === AWAITING ? <Tag tone="warning">{AWAITING}</Tag> : <StatusTag status={p.status} />}
                  secondary={p.paidAt ? formatDateTime(p.paidAt) : t('due {date}', { date: formatDateTime(p.dueAt) })}
                />
              </Td>
              <Td onClick={stop}>
                <div className="flex justify-end gap-2">
                  <Button size="sm" icon={Eye} onClick={() => setView(p)}>
                    Details
                  </Button>
                  {CONFIRMABLE.includes(p.status) && (
                    <Button size="sm" variant="primary" icon={Check} onClick={() => setParams({ confirm: p.invoiceId })}>
                      Confirm
                    </Button>
                  )}
                </div>
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

      <ConfirmPaymentModal payment={confirming} onClose={close} />

      <Modal
        open={Boolean(view)}
        onClose={() => setView(null)}
        title={view ? `${view.invoiceId} · ${tr(view.typeLabel)}` : ''}
        description={view ? `${view.studentName} · ${view.studentCode}` : ''}
        footer={
          view && CONFIRMABLE.includes(view.status) ? (
            <>
              <Button onClick={() => setView(null)}>Close</Button>
              <Button
                variant="primary"
                icon={Check}
                onClick={() => {
                  setView(null)
                  setParams({ confirm: view.invoiceId })
                }}
              >
                Confirm payment
              </Button>
            </>
          ) : (
            <Button onClick={() => setView(null)}>Close</Button>
          )
        }
      >
        {view && (
          <DetailRows
            rows={[
              ['Amount', <span className="font-medium">{formatVnd(view.amount)}</span>],
              ['Status', view.status === AWAITING ? <Tag tone="warning">{AWAITING}</Tag> : <StatusTag status={view.status} />],
              ['Paid at', view.paidAt ? formatDateTime(view.paidAt) : t('Not paid · due {date}', { date: formatDateTime(view.dueAt) })],
              ['Method', tr(view.method) || '—'],
              ['Transfer content', view.transferContent ?? '—'],
              ...(view.reference ? [['Bank reference', view.reference]] : []),
              ...(view.receipt?.url
                ? [[
                    'Receipt',
                    <a href={view.receipt.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-fg-link hover:underline">
                      <ReceiptText size={14} aria-hidden="true" />
                      {view.receipt.name}
                    </a>,
                  ]]
                : []),
            ]}
          />
        )}
      </Modal>
    </>
  )
}
