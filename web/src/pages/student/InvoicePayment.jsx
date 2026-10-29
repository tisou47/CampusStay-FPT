import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { CircleCheck, Clock, Copy, Download, Hourglass, ReceiptText, Send } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, DetailRows, Note } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-BIL-02 Invoice Payment — deposit (17:701), balance (39:1362), utility and charge Invoices.
// GET /invoices/:id/payment → {
//   invoice: { id, title, typeLabel, amount, status, dueAt, paidAt, reference },
//   qr: { image, expiresAt } | null (no bank account configured, or not waiting for a transfer),
//   bank: { name, accountName, accountNumber } | null, transferContent,
//   claim: { status, claimedAt, reference, rejected, lastRejection: { reason, at } | null } | null, canClaim }
// POST /invoices/:id/claim { reference? } — "I have transferred" (ADR-22): the Invoice waits for a Manager and its
// deadline stops; a rejection gives the time back (at least 12 hours), too many rejections cancel a Deposit or Balance.
// POST /invoices/:id/payment/refresh → new { qr }
// While a claim waits, the page asks the server every 15 seconds whether a Manager has decided.

const POLL_MS = 15000

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
 * Saves the QR image as a file. The image comes from a VietQR image service on another origin, where the
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
  const { invoice, qr, bank, transferContent, claim, canClaim } = data
  const paid = invoice.status === 'Paid'
  const waiting = invoice.status === 'Awaiting confirmation'
  const left = useSecondsLeft(qr?.expiresAt)
  const [reference, setReference] = useState('')
  const refresh = useMutation(() => api.invoices.refreshQr(invoice.id), { onSuccess: reload, onError: (e) => notifyError(e, 'Could not refresh the QR code') })
  const sendClaim = useMutation(() => api.invoices.claim(invoice.id, reference.trim() ? { reference: reference.trim() } : {}), {
    invalidates: ['invoices', 'home'],
    onSuccess: () => {
      notify({ title: 'Transfer reported', message: t('A Manager will check it. The deadline is paused until then.') })
      reload()
    },
    onError: (e) => notifyError(e, 'Could not report the transfer'),
  })
  const copy = useCopy()
  const saveQr = useSaveQr()

  // Ask again while a Manager checks the claim.
  useEffect(() => {
    if (!waiting) return undefined
    const timer = setInterval(reload, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, reload])

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
  const expired = !paid && qr && left === 0
  const qrFile = `vietqr-${invoice.id}.png`
  const rejection = !paid && !waiting && claim?.status === 'Rejected' ? claim.lastRejection : null

  // Phone: MOB-BIL-02 Invoice Payment (Figma 56:292) — QR card, Save and Copy buttons, details, "I have transferred".
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <Card padding="lg" className="flex w-full shrink-0 flex-col items-center gap-2.5 lg:w-100 lg:gap-4 lg:overflow-y-auto">
        <h2 className="text-card-title text-fg max-lg:hidden">
          {paid ? t('Payment confirmed') : waiting ? t('Transfer reported') : qr ? t('Scan with any banking app') : t('Transfer to the dormitory')}
        </h2>
        <div className="relative flex size-52 shrink-0 items-center justify-center rounded-lg border border-line lg:size-66">
          {qr?.image ? (
            <img src={qr.image} alt={t('VietQR code for {id}, {amount}', { id: invoice.id, amount: formatVnd(invoice.amount) })} className="block size-50 lg:size-64" />
          ) : paid || waiting ? null : (
            <span className="px-6 text-center text-sm text-fg-tertiary">
              {bank ? t('QR code unavailable') : t('Ask the dormitory office for the bank account to transfer to.')}
            </span>
          )}
          {(paid || waiting) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-surface/90">
              <span className={paid ? 'flex size-12 items-center justify-center rounded-full bg-success-bg text-success' : 'flex size-12 items-center justify-center rounded-full bg-info-bg text-info'}>
                {paid ? <CircleCheck size={20} aria-hidden="true" /> : <Hourglass size={20} aria-hidden="true" />}
              </span>
              <p className={paid ? 'text-base font-medium text-success-fg' : 'px-4 text-center text-base font-medium text-info-fg'}>
                {paid ? t('Paid {date}', { date: formatDate(invoice.paidAt) }) : t('Waiting for confirmation')}
              </p>
            </div>
          )}
        </div>
        <p className="text-h1 font-semibold text-fg lg:hidden">{formatVnd(invoice.amount)}</p>
        {qr && (
          <div className="flex items-center gap-2 max-lg:hidden">
            <Tag tone="info">VietQR</Tag>
            <span className="text-sm text-fg-tertiary">{t('Bank transfer · NAPAS 247')}</span>
          </div>
        )}
        {!paid && !waiting && mmss && (
          <p className="flex items-center gap-2 text-base font-medium text-warning-fg">
            <Clock size={16} aria-hidden="true" className="text-warning" />
            {left > 0 ? t('QR expires in {time}', { time: mmss }) : t('QR expired')}
          </p>
        )}
        {!waiting && (
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
        )}
      </Card>

      {!paid && !waiting && (
        <div className="flex flex-col gap-2 lg:hidden">
          {expired ? (
            <Button size="lg" block onClick={() => refresh.run()} disabled={refresh.pending}>
              {refresh.pending ? t('Refreshing…') : t('Refresh QR')}
            </Button>
          ) : (
            qr?.image && (
              <Button size="lg" block icon={Download} onClick={() => saveQr(qr.image, qrFile)}>
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
        ) : waiting ? (
          <Alert type="info" title="Waiting for a Manager" className="shrink-0">
            {t('You reported the transfer on {date}. The deadline is paused until a Manager confirms or rejects it; you will be notified.', { date: formatDateTime(claim?.claimedAt) })}
          </Alert>
        ) : (
          <>
            {rejection && (
              <Alert type="warning" title="Transfer not confirmed" className="shrink-0">
                {t('A Manager could not confirm your transfer: {reason}. Check the transfer content and report it again before the deadline.', { reason: rejection.reason })}
              </Alert>
            )}
            <Card className="flex shrink-0 flex-col gap-3">
              <h2 className="text-card-title text-fg">{t('Paid already? Tell the dormitory')}</h2>
              <p className="text-sm text-fg-secondary">
                {t('Transfer exactly {amount} with the transfer content {content}, then press I have transferred. A Manager checks the bank account and confirms it.', { amount: formatVnd(invoice.amount), content: transferContent })}
              </p>
              {canClaim ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field label="Bank reference (optional)" className="sm:flex-1">
                    <Input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="FT26300012345" />
                  </Field>
                  <Button variant="primary" size="lg" icon={Send} onClick={() => sendClaim.run()} disabled={sendClaim.pending}>
                    {sendClaim.pending ? t('Sending…') : t('I have transferred')}
                  </Button>
                </div>
              ) : (
                <Alert type="error" title="The deadline has passed">
                  {t('This Invoice can no longer be paid by transfer. Contact the dormitory office.')}
                </Alert>
              )}
              {claim?.rejected > 0 && (
                <Note>{t('Transfers rejected so far: {n}. Two rejections cancel a Deposit or a Balance.', { n: claim.rejected })}</Note>
              )}
            </Card>
          </>
        )}

        {!paid && !waiting && bank && (
          <Card className="flex shrink-0 flex-col gap-1">
            <h2 className="text-card-title text-fg">{t('Or transfer manually')}</h2>
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
          <h2 className="text-card-title text-fg">{t('Invoice')}</h2>
          <DetailRows
            className="mt-1"
            rows={[
              ['Invoice', `${invoice.id} · ${tr(invoice.typeLabel ?? invoice.title)}`],
              ...(invoice.reference ? [['For', tr(invoice.reference)]] : []),
              ['Due', <span>{formatDateTime(invoice.dueAt)}{!paid && !waiting && <TimeLeft at={invoice.dueAt} />}</span>],
              ['Total', <span className="font-medium">{formatVnd(invoice.amount)}</span>],
              ...(claim?.reference ? [['Bank reference', claim.reference]] : []),
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

/** " · 2 days left" or " · overdue" next to a deadline. */
function TimeLeft({ at }) {
  const ms = new Date(at).getTime() - Date.now()
  if (!at || Number.isNaN(ms)) return null
  const hours = Math.floor(ms / 3600000)
  const text = ms <= 0 ? t('overdue') : hours >= 48 ? t('{n} days left', { n: Math.floor(hours / 24) }) : t('{n} h left', { n: Math.max(1, hours) })
  return <span className={ms <= 0 ? 'text-error-fg' : 'text-fg-tertiary'}>{' · '}{text}</span>
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
