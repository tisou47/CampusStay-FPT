import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { CircleCheck, Clock, Copy, Download, Info, ReceiptText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, DetailRows, Note } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'

// SCR-BIL-02 Invoice Payment (VietQR) — deposit (17:701), balance (39:1362), utility and room-change Invoices.
// GET /invoices/:id/payment → {
//   invoice: { id, title, typeLabel, amount, status, dueAt, paidAt, reference },
//   qr: { image, expiresAt } | null, bank: { name, accountName, accountNumber }, transferContent }
// POST /invoices/:id/payment/refresh → new { qr }
// While unpaid, the page asks the server every 5 seconds whether the bank has confirmed the transfer.

const POLL_MS = 5000

function useSecondsLeft(expiresAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!expiresAt) return null
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
}

function CopyValue({ value, display, className }) {
  const { notify } = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      notify({ title: 'Copied', message: value })
    } catch {
      notify({ type: 'warning', title: 'Could not copy', message: 'Select the text and copy it manually.' })
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className={className}>{display ?? value}</span>
      <button type="button" onClick={copy} aria-label={`Copy ${value}`} className="rounded p-0.5 text-fg-secondary hover:bg-subtle hover:text-fg">
        <Copy size={16} aria-hidden="true" />
      </button>
    </span>
  )
}

function Payment({ data, reload }) {
  const { notify, notifyError } = useToast()
  const { invoice, qr, bank, transferContent } = data
  const paid = invoice.status === 'Paid'
  const left = useSecondsLeft(qr?.expiresAt)
  const refresh = useMutation(() => api.invoices.refreshQr(invoice.id), { onSuccess: reload, onError: (e) => notifyError(e, 'Could not refresh the QR code') })

  // Poll for the bank confirmation while the Invoice is unpaid.
  useEffect(() => {
    if (paid) return undefined
    const t = setInterval(reload, POLL_MS)
    return () => clearInterval(t)
  }, [paid, reload])

  // Announce the confirmation once.
  const [announced, setAnnounced] = useState(paid)
  useEffect(() => {
    if (paid && !announced) {
      setAnnounced(true)
      invalidate('invoices', 'home', 'applications')
      notify({ title: 'Payment received', message: `${formatVnd(invoice.amount)} for ${invoice.id} was confirmed by the bank.` })
    }
  }, [paid, announced, invoice, notify])

  const mmss = left == null ? null : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-6">
      <Card padding="lg" className="flex w-100 shrink-0 flex-col items-center gap-4 overflow-y-auto">
        <h2 className="text-h3 font-semibold text-fg">{paid ? 'Payment confirmed' : 'Scan with any banking app'}</h2>
        <div className="relative flex size-66 shrink-0 items-center justify-center rounded-lg border border-line">
          {qr?.image ? (
            <img src={qr.image} alt={`VietQR code for ${invoice.id}, ${formatVnd(invoice.amount)}`} className="block size-64" />
          ) : (
            <span className="text-sm text-fg-tertiary">QR code unavailable</span>
          )}
          {paid && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/90">
              <CircleCheck size={48} aria-hidden="true" className="text-success" />
              <p className="text-base font-medium text-success-fg">Paid {formatDate(invoice.paidAt)}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tag tone="info">VietQR</Tag>
          <span className="text-sm text-fg-tertiary">Bank transfer · NAPAS 247</span>
        </div>
        {!paid && mmss && (
          <p className="flex items-center gap-2 text-base font-medium text-warning-fg">
            <Clock size={16} aria-hidden="true" className="text-warning" />
            {left > 0 ? `QR expires in ${mmss}` : 'QR expired'}
          </p>
        )}
        {!paid && left === 0 ? (
          <Button size="lg" onClick={() => refresh.run()} disabled={refresh.pending}>
            {refresh.pending ? 'Refreshing…' : 'Refresh QR'}
          </Button>
        ) : (
          qr?.image && (
            <Button size="lg" icon={Download} href={qr.image} download={`vietqr-${invoice.id}.png`}>
              Download QR
            </Button>
          )
        )}
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        {paid ? (
          <Alert type="success" title="Payment received" className="shrink-0" action={<Button to="/student/invoices">Back to Payments</Button>}>
            The bank confirmed this transfer on {formatDateTime(invoice.paidAt)}. A receipt is available under Payments.
          </Alert>
        ) : (
          <Alert type="info" title="Waiting for your payment" className="shrink-0">
            This page updates automatically when the bank confirms the transfer. You can close it; we will notify you.
          </Alert>
        )}

        {!paid && bank && (
          <Card className="flex shrink-0 flex-col gap-1">
            <h2 className="text-h3 font-semibold text-fg">Or transfer manually</h2>
            <DetailRows
              className="mt-1"
              rows={[
                ['Bank', bank.name],
                ['Account name', <CopyValue value={bank.accountName} />],
                ['Account number', <CopyValue value={bank.accountNumber} />],
                ['Amount', <CopyValue value={String(invoice.amount)} display={formatVnd(invoice.amount)} className="font-medium" />],
                ['Transfer content', <CopyValue value={transferContent} className="font-medium text-fg-brand" />],
              ]}
            />
            <Note className="pt-1">Enter the transfer content exactly. It links your payment to this Invoice.</Note>
          </Card>
        )}

        <Card className="flex shrink-0 flex-col gap-1">
          <h2 className="text-h3 font-semibold text-fg">Invoice</h2>
          <DetailRows
            className="mt-1"
            rows={[
              ['Invoice', `${invoice.id} · ${invoice.typeLabel ?? invoice.title}`],
              ...(invoice.reference ? [['For', invoice.reference]] : []),
              ['Due', formatDateTime(invoice.dueAt)],
              ['Total', <span className="font-medium">{formatVnd(invoice.amount)}</span>],
            ]}
          />
        </Card>

        {!paid && (
          <Note icon={Info} className="shrink-0">
            Paid but not confirmed after 15 minutes? Bring your transfer receipt to the dormitory office; Staff can confirm the payment manually.
          </Note>
        )}
      </div>
    </div>
  )
}

export default function InvoicePayment() {
  const { id } = useParams()
  const query = useQuery(['invoices', 'payment', id], ({ signal }) => api.invoices.payment(id, { signal }))
  const invoice = query.data?.invoice
  return (
    <StudentPage
      breadcrumb={[{ label: 'Payments', to: '/student/invoices' }, { label: id }]}
      title={invoice?.title ?? 'Pay Invoice'}
      badge={invoice && <StatusTag status={invoice.status} />}
    >
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={ReceiptText} title="Invoice not found" action={<Button to="/student/invoices">Back to Payments</Button>}>
          It may not be issued yet. The deposit Invoice is issued when you submit; the balance after your Room and Bed are assigned.
        </EmptyBlock>
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Payment data={query.data} reload={query.reload} />
      )}
    </StudentPage>
  )
}
