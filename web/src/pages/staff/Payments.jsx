import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Banknote, Check, Clock, CreditCard, Download, ReceiptText, TriangleAlert, Upload } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { DetailRows } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatPercent, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-BIL-10 Payments (Figma 23:614) and "Confirm manual payment" modal (23:1128).
// GET /payments?termId&block&q&type&status&method&date&page&pageSize → {
//   items: [{ invoiceId, studentName, studentCode, type, typeLabel, amount, method, paidAt, dueAt, status, reference, transferContent, receipt: { name, size, url } }],
//   total, summary: { collectedToday, collectedTodayCount, awaitingConfirmation, unpaidDeposits, depositsPaid, depositsSubmitted } }
// POST /payments/:invoiceId/confirm (multipart) amount, reference, receipt?

const AWAITING = 'Awaiting confirmation'

function ConfirmPaymentModal({ payment, onClose }) {
  const { notify } = useToast()
  const fileInput = useRef(null)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState(null)
  const [matched, setMatched] = useState(false)
  useEffect(() => {
    if (payment) {
      setAmount(formatNumber(payment.amount))
      setReference(payment.reference ?? '')
      setFile(null)
      setMatched(false)
    }
  }, [payment])
  const confirm = useMutation(
    () => {
      const data = new FormData()
      data.set('amount', String(Number(amount.replaceAll(',', ''))))
      data.set('reference', reference.trim())
      if (file) data.set('receipt', file)
      return api.payments.confirm(payment.invoiceId, data)
    },
    {
      invalidates: ['payments', 'applications', 'dashboard'],
      onSuccess: () => {
        notify({ title: 'Payment confirmed', message: t('{id} · {amount} from {name}.', { id: payment.invoiceId, amount: formatVnd(payment.amount), name: payment.studentName }) })
        onClose()
      },
      onError: () => {},
    },
  )
  if (!payment) return null
  const numeric = Number(amount.replaceAll(',', ''))
  const amountError = numeric !== payment.amount ? t('Must equal the expected amount. Partial payments are not accepted.') : undefined

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm manual payment"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={Boolean(amountError) || !reference.trim() || !matched || confirm.pending} onClick={() => confirm.run()}>
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
      <Field label="Amount received (VND)" error={amount && amountError} helper="Must equal the expected amount. Partial payments are not accepted.">
        {(id) => <Input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(amount && amountError)} inputMode="numeric" />}
      </Field>
      <Field label="Bank reference">{(id) => <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
      {payment.receipt?.url ? (
        <a href={payment.receipt.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-line px-3 py-2.5 text-base text-fg-link hover:underline">
          <ReceiptText size={16} aria-hidden="true" />
          {payment.receipt.name}
          {payment.receipt.size && <span className="text-sm text-fg-tertiary">· {payment.receipt.size}</span>}
        </a>
      ) : (
        <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2.5 text-left hover:border-primary">
          <Upload size={16} aria-hidden="true" className="text-fg-secondary" />
          <span className="text-base text-fg">{file ? file.name : t('Attach transfer receipt')}</span>
          <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </button>
      )}
      <Checkbox label="I matched this transfer on the bank statement." checked={matched} onChange={(e) => setMatched(e.target.checked)} />
    </Modal>
  )
}

export default function Payments() {
  const [params, setParams] = useSearchParams()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [method, setMethod] = useState('')
  const [date, setDate] = useState('today')
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
  const confirming = confirmId ? items.find((p) => p.invoiceId === confirmId && p.status === AWAITING) ?? null : null
  const close = () => setParams({}, { replace: true })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Payments"
        description="Students mark a transfer; a Manager confirms it against the bank statement."
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" icon={Banknote} label="Collected today" value={s ? formatVnd(s.collectedToday) : '—'} note={s ? t('{n} payments', { n: formatNumber(s.collectedTodayCount) }) : null} />
        <KpiTile size="md" icon={Clock} label="Awaiting confirmation" value={formatNumber(s?.awaitingConfirmation)} valueTone={s?.awaitingConfirmation ? 'warning' : undefined} note="Manual transfers" />
        <KpiTile size="md" icon={TriangleAlert} label="Unpaid deposits" value={formatNumber(s?.unpaidDeposits)} note="Expire at their deadline" />
        <KpiTile
          size="md"
          icon={CreditCard}
          label="Deposits paid"
          value={s ? `${formatNumber(s.depositsPaid)} / ${formatNumber(s.depositsSubmitted)}` : '—'}
          note={s?.depositsSubmitted ? t('{p} of submitted', { p: formatPercent(s.depositsPaid / s.depositsSubmitted, 0) }) : null}
        />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-70" aria-label={t('Search')} placeholder="Search Invoice, student or reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          wrapperClassName="w-38"
          aria-label={t('Type')}
          value={type}
          onChange={filter(setType)}
          options={[
            { value: '', label: 'Type: All' },
            { value: 'deposit', label: 'Type: Deposit' },
            { value: 'balance', label: 'Type: Balance' },
            { value: 'utility', label: 'Type: Utility' },
            { value: 'roomChange', label: 'Type: Room change' },
          ]}
        />
        <Select
          wrapperClassName="w-44"
          aria-label={t('Status')}
          value={status}
          onChange={filter(setStatus)}
          options={[
            { value: '', label: 'Status: All' },
            { value: AWAITING, label: 'Status: Awaiting' },
            { value: 'Paid', label: 'Status: Paid' },
            { value: 'Unpaid', label: 'Status: Unpaid' },
          ]}
        />
        <Select
          wrapperClassName="w-39"
          aria-label={t('Method')}
          value={method}
          onChange={filter(setMethod)}
          options={[
            { value: '', label: 'Method: All' },
            { value: 'VietQR', label: 'Method: VietQR' },
            { value: 'Manual transfer', label: 'Method: Manual' },
          ]}
        />
        <Select
          wrapperClassName="w-42"
          aria-label={t('Date')}
          value={date}
          onChange={filter(setDate)}
          options={[
            { value: 'today', label: 'Date: Today' },
            { value: '7d', label: 'Date: Last 7 days' },
            { value: 'term', label: 'Date: This Term' },
          ]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-36">Invoice</Th>
            <Th className="w-44">Student</Th>
            <Th className="w-28">Type</Th>
            <Th className="w-32" align="right">
              Amount
            </Th>
            <Th className="w-32">Method</Th>
            <Th className="w-40">Paid at</Th>
            <Th>Status</Th>
            <Th className="w-22">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={8} emptyIcon={ReceiptText} emptyTitle="No payments match these filters" />
          {items.map((p) => (
            <Tr key={p.invoiceId} className="[&>td]:h-12">
              <Td className="font-medium text-fg-brand">{p.invoiceId}</Td>
              <Td>
                <TwoLine primary={p.studentName} secondary={p.studentCode} />
              </Td>
              <Td>{tr(p.typeLabel)}</Td>
              <Td align="right" className="whitespace-nowrap">
                {formatVnd(p.amount)}
              </Td>
              <Td className={p.method ? 'whitespace-nowrap' : 'text-fg-tertiary'}>{tr(p.method) || '—'}</Td>
              <Td className={p.paidAt ? 'whitespace-nowrap' : 'max-w-40 truncate text-fg-tertiary'}>{p.paidAt ? formatDateTime(p.paidAt) : `— ${t('due {date}', { date: formatDateTime(p.dueAt) })}`}</Td>
              <Td>{p.status === AWAITING ? <Tag tone="warning">{AWAITING}</Tag> : <StatusTag status={p.status} />}</Td>
              <Td onClick={stop}>
                {p.status === AWAITING ? (
                  <Button onClick={() => setParams({ confirm: p.invoiceId })}>Confirm</Button>
                ) : (
                  <Button variant="text" onClick={() => setView(p)}>
                    View
                  </Button>
                )}
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
        footer={<Button onClick={() => setView(null)}>Close</Button>}
      >
        {view && (
          <DetailRows
            rows={[
              ['Amount', <span className="font-medium">{formatVnd(view.amount)}</span>],
              ['Method', tr(view.method) || '—'],
              ['Paid at', view.paidAt ? formatDateTime(view.paidAt) : t('Not paid · due {date}', { date: formatDateTime(view.dueAt) })],
              ['Status', <StatusTag status={view.status} />],
              ['Transfer content', view.transferContent ?? '—'],
              ...(view.reference ? [['Bank reference', view.reference]] : []),
            ]}
          />
        )}
      </Modal>
    </>
  )
}
