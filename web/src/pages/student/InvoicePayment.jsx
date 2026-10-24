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
import { t, tr } from '@/i18n'

// SCR-BIL-02 Invoice Payment (VietQR) — deposit (17:701), balance (39:1362), utility and room-change Invoices.
// GET /invoices/:id/payment → {
//   invoice: { id, title, typeLabel, amount, status, dueAt, paidAt, reference },
//   qr: { image, expiresAt } | null, bank: { name, accountName, accountNumber }, transferContent }
// POST /invoices/:id/payment/refresh → new { qr }
// While unpaid, the page asks the server every 5 seconds whether the bank has confirmed the transfer.

const POLL_MS = 5000

// Demo aid: the API's dev profile can pay an Invoice without a bank transfer. Shown in development builds,
// or in any build with VITE_PAYMENT_SIMULATOR=true (e.g. a demo deployment whose API runs the dev profile).
const SHOW_SIMULATOR = import.meta.env.DEV || import.meta.env.VITE_PAYMENT_SIMULATOR === 'true'

function useSecondsLeft(expiresAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!expiresAt) return null
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
}

function useCopy() {
  const { notify } = useToast()
  return async (value) => {
    try {
      await navigator.clipboard.writeText(value)
      notify({ title: 'Copied', message: value })
    } catch {
      notify({ type: 'warning', title: 'Could not copy', message: 'Select the text and copy it manually.' })
    }
  }
}

/**
 * Saves the QR image as a file. The image comes from SePay's VietQR service on another origin, where the
 * `download` attribute of a link is ignored, so the bytes are fetched (the service allows CORS) and saved
 * from a blob URL. If that fails the image opens in a new tab to be saved by hand.
 */
function useSaveQr() {
  const { notify } = useToast()
  return async (url, fileName) => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      const href = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = href
      link.download = fileName
      link.click()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch {
      window.open(url, '_blank', 'noopener')
      notify({ type: 'info', title: 'QR opened in a new tab', message: 'Save the image from there (long-press it on a phone).' })
    }
  }
}

function CopyValue({ value, display, className }) {
  const copy = useCopy()
  return (
    <span className="inline-flex items-center gap-2">
      <span className={className}>{display ?? value}</span>
      <button type="button" onClick={() => copy(value)} aria-label={t('Copy {value}', { value })} className="rounded p-0.5 text-fg-secondary hover:bg-subtle hover:text-fg">
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
  const simulate = useMutation(() => api.invoices.simulatePayment(invoice.id), {
    onSuccess: reload,
    onError: (e) => notifyError(e, 'Could not simulate the payment (the API must run the dev profile)'),
  })
  const copy = useCopy()
  const saveQr = useSaveQr()

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
      notify({ title: 'Payment received', message: t('{amount} for {id} was confirmed.', { amount: formatVnd(invoice.amount), id: invoice.id }) })
    }
  }, [paid, announced, invoice, notify])

  const mmss = left == null ? null : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
  const expired = !paid && left === 0
  const qrFile = `vietqr-${invoice.id}.png`

  // Phone: MOB-BIL-02 Invoice Payment (Figma 56:292) — QR card, Save and Copy buttons, details, hint.
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <Card padding="lg" className="flex w-full shrink-0 flex-col items-center gap-2.5 lg:w-100 lg:gap-4 lg:overflow-y-auto">
        <h2 className="text-h3 font-semibold text-fg max-lg:hidden">{paid ? t('Payment confirmed') : t('Scan with any banking app')}</h2>
        <div className="relative flex size-52 shrink-0 items-center justify-center rounded-lg border border-line lg:size-66">
          {qr?.image ? (
            <img src={qr.image} alt={t('VietQR code for {id}, {amount}', { id: invoice.id, amount: formatVnd(invoice.amount) })} className="block size-50 lg:size-64" />
          ) : (
            <span className="text-sm text-fg-tertiary">{t('QR code unavailable')}</span>
          )}
          {paid && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/90">
              <CircleCheck size={48} aria-hidden="true" className="text-success" />
              <p className="text-base font-medium text-success-fg">{t('Paid {date}', { date: formatDate(invoice.paidAt) })}</p>
            </div>
          )}
        </div>
        <p className="text-h1 font-semibold text-fg lg:hidden">{formatVnd(invoice.amount)}</p>
        <div className="flex items-center gap-2 max-lg:hidden">
          <Tag tone="info">VietQR</Tag>
          <span className="text-sm text-fg-tertiary">{t('Bank transfer · NAPAS 247')}</span>
        </div>
        {!paid && mmss && (
          <p className="flex items-center gap-2 text-base font-medium text-warning-fg">
            <Clock size={16} aria-hidden="true" className="text-warning" />
            {left > 0 ? t('QR expires in {time}', { time: mmss }) : t('QR expired')}
          </p>
        )}
        <div className="max-lg:hidden">
          {expired ? (
            <Button size="lg" onClick={() => refresh.run()} disabled={refresh.pending}>
              {refresh.pending ? t('Refreshing…') : t('Refresh QR')}
            </Button>
          ) : (
            qr?.image && (
              <Button size="lg" icon={Download} onClick={() => saveQr(qr.image, qrFile)}>
                Download QR
              </Button>
            )
          )}
        </div>
      </Card>

      {!paid && (
        <div className="flex flex-col gap-2 lg:hidden">
          {expired ? (
            <Button variant="primary" size="lg" block onClick={() => refresh.run()} disabled={refresh.pending}>
              {refresh.pending ? t('Refreshing…') : t('Refresh QR')}
            </Button>
          ) : (
            qr?.image && (
              <Button variant="primary" size="lg" block icon={Download} onClick={() => saveQr(qr.image, qrFile)}>
                Save QR to gallery
              </Button>
            )
          )}
          {transferContent && (
            <Button size="lg" block icon={Copy} onClick={() => copy(transferContent)}>
              Copy transfer content
            </Button>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3 lg:flex-1 lg:gap-4 lg:overflow-y-auto">
        {paid ? (
          <Alert type="success" title="Payment received" className="shrink-0" action={<Button to="/student/invoices">Back to Payments</Button>}>
            {t('This payment was confirmed on {date}. A receipt is available under Payments.', { date: formatDateTime(invoice.paidAt) })}
          </Alert>
        ) : (
          <Alert type="info" title="Waiting for your payment" className="shrink-0 max-lg:hidden">
            {t('This page updates automatically when the payment is confirmed. You can close it; we will notify you.')}
          </Alert>
        )}

        {!paid && bank && (
          <Card className="flex shrink-0 flex-col gap-1">
            <h2 className="text-h3 font-semibold text-fg">{t('Or transfer manually')}</h2>
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
            <Note className="pt-1">{t('Enter the transfer content exactly. It links your payment to this Invoice.')}</Note>
          </Card>
        )}

        <Card className="flex shrink-0 flex-col gap-1">
          <h2 className="text-h3 font-semibold text-fg">{t('Invoice')}</h2>
          <DetailRows
            className="mt-1"
            rows={[
              ['Invoice', `${invoice.id} · ${tr(invoice.typeLabel ?? invoice.title)}`],
              ...(invoice.reference ? [['For', tr(invoice.reference)]] : []),
              ['Due', formatDateTime(invoice.dueAt)],
              ['Total', <span className="font-medium">{formatVnd(invoice.amount)}</span>],
            ]}
          />
        </Card>

        {!paid && (
          <Note icon={Info} className="shrink-0 lg:hidden">
            {t('Open your banking app and scan the saved QR. This screen updates when the payment is confirmed.')}
          </Note>
        )}
        {!paid && SHOW_SIMULATOR && (
          <Alert
            type="warning"
            title="Demo mode"
            className="shrink-0"
            action={
              <Button onClick={() => simulate.run()} disabled={simulate.pending}>
                {simulate.pending ? t('Simulating…') : t('Simulate bank transfer')}
              </Button>
            }
          >
            {t('No real bank account is linked. Simulate the exact transfer to continue the flow.')}
          </Alert>
        )}
        {!paid && (
          <Note icon={Info} className="shrink-0">
            {t('Paid but not confirmed after 15 minutes? Bring your transfer receipt to the dormitory office; a Manager can confirm the payment manually.')}
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
      title={tr(invoice?.title) || t('Pay Invoice')}
      badge={invoice && <StatusTag status={invoice.status} />}
    >
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={ReceiptText} title="Invoice not found" action={<Button to="/student/invoices">Back to Payments</Button>}>
          {t('It may not be issued yet. The deposit Invoice is issued when you submit; the balance after your Room and Bed are assigned.')}
        </EmptyBlock>
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Payment data={query.data} reload={query.reload} />
      )}
    </StudentPage>
  )
}
