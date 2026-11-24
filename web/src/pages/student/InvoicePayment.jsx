import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import {
  Building2,
  CircleCheck,
  Clock,
  Copy,
  CreditCard,
  Download,
  Hourglass,
  QrCode,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, DetailRows, Note } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatTimeLeft, formatVnd } from '@/lib/format'
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
    <span className="inline-flex items-center gap-1.5">
      <span className={className}>{display ?? value}</span>
      <button
        type="button"
        onClick={() => copy(value)}
        aria-label={t('Copy {value}', { value })}
        className="-my-1 rounded-md p-1 text-fg-secondary transition-colors hover:bg-subtle hover:text-fg-brand"
      >
        <Copy size={15} aria-hidden="true" />
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
  const [showConfirm, setShowConfirm] = useState(false)
  const refresh = useMutation(() => api.invoices.refreshQr(invoice.id), { onSuccess: reload, onError: (e) => notifyError(e, 'Could not refresh the QR code') })
  const sendClaim = useMutation(() => api.invoices.claim(invoice.id, reference.trim() ? { reference: reference.trim() } : {}), {
    invalidates: ['invoices', 'home'],
    onSuccess: () => {
      notify({ title: 'Transfer reported', message: t('A manager will check it. The deadline is paused until then.') })
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-start lg:gap-6">
      {/* LEFT COLUMN (5/12): Fintech Payment Details & VietQR Hub */}
      <Card padding="lg" className="flex flex-col gap-4 rounded-xl shadow-xs lg:col-span-5 lg:p-6">
        {/* Card Header + Urgent QR Countdown Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
              <QrCode size={17} aria-hidden="true" />
            </span>
            <h2 className="text-h3 font-semibold text-fg">
              {paid
                ? t('Payment confirmed')
                : waiting
                  ? t('Transfer reported')
                  : qr
                    ? t('Scan with any banking app')
                    : t('Transfer to the dormitory')}
            </h2>
          </div>

          {!paid && !waiting && mmss && (
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tabular',
                left > 60
                  ? 'border-orange-200 bg-brand-subtle text-fg-brand'
                  : 'border-red-200 bg-error-bg text-error-fg',
              )}
            >
              <Clock size={14} aria-hidden="true" />
              {left > 0 ? t('QR expires in {time}', { time: mmss }) : t('QR expired')}
            </span>
          )}
        </div>

        {/* Centered VietQR Frame + Prominent KPI Amount */}
        <div className="flex flex-col items-center gap-3 rounded-xl bg-subtle/50 p-4">
          <div className="relative flex size-48 shrink-0 items-center justify-center rounded-xl bg-surface p-2 ring-1 ring-line lg:size-52">
            {qr?.image ? (
              <img
                src={qr.image}
                alt={t('VietQR code for {id}, {amount}', { id: invoice.id, amount: formatVnd(invoice.amount) })}
                className="block size-44 object-contain lg:size-48"
              />
            ) : paid || waiting ? null : (
              <span className="px-4 text-center text-sm text-fg-tertiary">
                {bank ? t('QR code unavailable') : t('Ask the dormitory office for the bank account to transfer to.')}
              </span>
            )}
            {(paid || waiting) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-surface/95">
                {paid ? (
                  <CircleCheck size={44} aria-hidden="true" className="text-success" />
                ) : (
                  <Hourglass size={44} aria-hidden="true" className="text-info" />
                )}
                <p className={paid ? 'text-base font-semibold text-success-fg' : 'px-4 text-center text-base font-semibold text-info-fg'}>
                  {paid ? t('Paid {date}', { date: formatDate(invoice.paidAt) }) : t('Waiting for confirmation')}
                </p>
              </div>
            )}
          </div>

          {/* KPI Amount + VietQR / Download Controls */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <CopyValue
              value={String(invoice.amount)}
              display={formatVnd(invoice.amount)}
              className="text-kpi font-semibold text-fg tabular"
            />
            {qr && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Tag tone="info">VietQR</Tag>
                <span className="text-xs text-fg-tertiary">{t('Bank transfer · NAPAS 247')}</span>
              </div>
            )}
          </div>

          {!waiting && !paid && (
            <div className="flex w-full flex-wrap items-center justify-center gap-2 pt-0.5">
              {expired ? (
                <Button size="sm" icon={RefreshCw} onClick={() => refresh.run()} disabled={refresh.pending}>
                  {refresh.pending ? t('Refreshing…') : t('Refresh QR')}
                </Button>
              ) : (
                qr?.image && (
                  <Button variant="secondary" size="sm" icon={Download} onClick={() => saveQr(qr.image, qrFile)}>
                    {t('Download QR')}
                  </Button>
                )
              )}
            </div>
          )}
        </div>

        {/* Manual Bank Transfer Details & Highlighted Transfer Content Box */}
        {!paid && !waiting && bank && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={15} aria-hidden="true" className="text-fg-tertiary" />
              <span className="text-xs font-semibold tracking-wider text-fg-tertiary uppercase">
                {t('Or transfer manually')}
              </span>
            </div>

            <dl className="flex flex-col divide-y divide-line text-sm">
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-fg-secondary">{t('Bank')}</dt>
                <dd className="font-medium text-fg">{bank.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-fg-secondary">{t('Account number')}</dt>
                <dd>
                  <CopyValue value={bank.accountNumber} className="font-mono font-semibold text-fg" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-fg-secondary">{t('Account name')}</dt>
                <dd>
                  <CopyValue value={bank.accountName} className="font-medium text-fg" />
                </dd>
              </div>
            </dl>

            {/* Dedicated Highlight Box for Transfer Content with 1-tap Copy */}
            {transferContent && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-subtle px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-medium text-fg-secondary">{t('Transfer content')}</span>
                  <span className="truncate font-mono text-base font-bold text-fg-brand">{transferContent}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Copy}
                  onClick={() => copy(transferContent)}
                  aria-label={t('Copy {value}', { value: transferContent })}
                >
                  {t('Copy')}
                </Button>
              </div>
            )}
            <Note>{t('Enter the transfer content exactly. It links your payment to this invoice.')}</Note>
          </div>
        )}
      </Card>

      {/* RIGHT COLUMN (7/12): Action & Verification Hub + Invoice Summary */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
        {paid ? (
          <Alert
            type="success"
            title="Payment received"
            className="shrink-0"
            action={<Button to="/student/invoices">Back to payments</Button>}
          >
            {t('This payment was confirmed on {date}. A receipt is available under payments.', {
              date: formatDateTime(invoice.paidAt),
            })}
          </Alert>
        ) : waiting ? (
          <Alert type="info" title="Waiting for a manager" className="shrink-0">
            {t(
              'You reported the transfer on {date}. The deadline is paused until a manager confirms or rejects it; you will be notified.',
              { date: formatDateTime(claim?.claimedAt) },
            )}
          </Alert>
        ) : (
          <>
            {rejection && (
              <Alert type="warning" title="Transfer not confirmed" className="shrink-0">
                {t(
                  'A manager could not confirm your transfer: {reason}. Check the transfer content and report it again before the deadline.',
                  { reason: rejection.reason },
                )}
              </Alert>
            )}

            {/* Primary Action & Verification Hub (I have transferred) */}
            <Card padding="lg" className="flex shrink-0 flex-col gap-4 rounded-xl border-orange-200 shadow-xs lg:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-fg-brand">
                  <ShieldCheck size={20} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="text-h3 font-semibold text-fg">{t('Paid already? Tell the dormitory')}</h2>
                  <p className="text-sm text-fg-secondary">
                    {t(
                      'Transfer exactly {amount} with the transfer content {content}, then press I have transferred. A manager checks the bank account and confirms it.',
                      { amount: formatVnd(invoice.amount), content: transferContent },
                    )}
                  </p>
                </div>
              </div>

              {canClaim ? (
                <div className="flex flex-col gap-3 rounded-xl bg-subtle/60 p-4 sm:flex-row sm:items-end">
                  <Field label="Bank reference (optional)" className="sm:flex-1">
                    {(id) => <Input id={id} value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="FT26300012345" />}
                  </Field>
                  <Button
                    tip="Tell the dormitory you paid. A manager checks it against the bank statement, then the invoice shows as paid."
                    variant="primary"
                    size="lg"
                    icon={Send}
                    onClick={() => setShowConfirm(true)}
                    disabled={sendClaim.pending}
                  >
                    {sendClaim.pending ? t('Sending…') : t('I have transferred')}
                  </Button>
                </div>
              ) : invoice.status === 'Upcoming' ? (
                // WEB-STU-04: why a transfer is not offered depends on the status, not only on the deadline.
                <Note>{t('This invoice is not open for payment yet. You are told when it is.')}</Note>
              ) : ['Void', 'Refunded'].includes(invoice.status) ? (
                <Note>{t('This invoice was cancelled or refunded: there is nothing to pay.')}</Note>
              ) : (
                <Alert type="error" title="The deadline has passed">
                  {t('This invoice can no longer be paid by transfer. Contact the dormitory office.')}
                </Alert>
              )}

              {claim?.rejected > 0 && (
                <Note>
                  {t('Transfers rejected so far: {n}. Two rejections cancel a deposit or a balance.', {
                    n: claim.rejected,
                  })}
                </Note>
              )}

              <Modal
                open={showConfirm}
                onClose={() => setShowConfirm(false)}
                title={t('Confirm transfer submission')}
                footer={
                  <>
                    <Button variant="default" onClick={() => setShowConfirm(false)}>
                      {t('Check again')}
                    </Button>
                    <Button
                      variant="primary"
                      icon={Send}
                      disabled={sendClaim.pending}
                      onClick={() => {
                        setShowConfirm(false)
                        sendClaim.run()
                      }}
                    >
                      {sendClaim.pending ? t('Sending…') : t('Yes, I have transferred')}
                    </Button>
                  </>
                }
              >
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-fg">
                    {t('Did you transfer exactly this amount and transfer content?')}
                  </p>

                  <div className="flex flex-col gap-2 rounded-xl bg-subtle/80 p-3.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-fg-secondary">{t('Amount')}:</span>
                      <span className="font-bold text-fg tabular">{formatVnd(invoice.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-fg-secondary">{t('Transfer content')}:</span>
                      <span className="font-mono font-semibold text-fg-brand">{transferContent}</span>
                    </div>
                    {reference.trim() && (
                      <div className="flex items-center justify-between">
                        <span className="text-fg-secondary">{t('Bank reference')}:</span>
                        <span className="font-mono font-medium text-fg">{reference.trim()}</span>
                      </div>
                    )}
                  </div>

                  <Alert type="warning" title={t('Important note')}>
                    {t('Reporting a transfer before paying or with incorrect content may lead to rejection and losing your bed reservation.')}
                  </Alert>
                </div>
              </Modal>
            </Card>
          </>
        )}

        {/* Invoice Summary Card below Confirmation Hub */}
        <Card padding="lg" className="flex shrink-0 flex-col gap-3 rounded-xl shadow-xs lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
                <CreditCard size={16} aria-hidden="true" />
              </span>
              <h2 className="text-h3 font-semibold text-fg">{t('Invoice')}</h2>
            </div>
            <StatusTag status={invoice.status} />
          </div>

          <DetailRows
            className="mt-1"
            rows={[
              ['Invoice', <span className="font-medium text-fg">{`${invoice.id} · ${tr(invoice.typeLabel ?? invoice.title)}`}</span>],
              ...(invoice.reference ? [['For', tr(invoice.reference)]] : []),
              [
                'Due',
                <span>
                  {formatDateTime(invoice.dueAt)}
                  {!paid && !waiting && <TimeLeft at={invoice.dueAt} />}
                </span>,
              ],
              [
                'Total',
                <span className="text-lg font-semibold text-fg-brand tabular">{formatVnd(invoice.amount)}</span>,
              ],
              ...(claim?.reference ? [['Bank reference', <span className="font-mono">{claim.reference}</span>]] : []),
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
  const text = formatTimeLeft(at)
  return <span className={ms <= 0 ? 'text-error-fg' : 'text-fg-tertiary'}>{' · '}{text}</span>
}

export default function InvoicePayment() {
  const { id } = useParams()
  const query = useQuery(['invoices', 'payment', id], ({ signal }) => api.invoices.payment(id, { signal }))
  const invoice = query.data?.invoice
  return (
    <StudentPage
      breadcrumb={[{ label: 'Payments', to: '/student/invoices' }, { label: id }]}
      title={tr(invoice?.title) || t('Pay invoice')}
      badge={invoice && <StatusTag status={invoice.status} />}
      className="lg:gap-3"
    >
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={ReceiptText} title="Invoice not found" action={<Button to="/student/invoices">Back to payments</Button>}>
          {t('It may not be issued yet. The deposit invoice is issued when you submit; the balance after your room and bed are assigned.')}
        </EmptyBlock>
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Payment data={query.data} reload={query.reload} />
      )}
    </StudentPage>
  )
}
