import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  ArrowRight,
  Bed,
  CalendarRange,
  Check,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { RefundAccountFields, useRefundAccount } from './refundAccount'
import { StudentPage } from './shared'
import { t, tr, tx } from '@/i18n'

// SCR-APP-03 Application Detail (Figma 17:888).
// GET /applications/:id → {
//   id, status, termName, roomTypeName, roomClassName, surchargeRate, twoBed,
//   roommate: { mode, studentCode, status, preferences } | null, allocation: { room, bed, block } | null,
//   events: [{ title, at, state: 'done'|'current'|'upcoming', note }],
//   invoices: [{ id, type, title, amount, status, dueAt, paidAt }],
//   canCancel, cancelPolicy, resultsPublishedAt, balanceDueAt, registrationClosesAt,
//   waitlist: { offer: { id, expiresAt, options } | null, until, refund } | null }
// POST /applications/:id/cancel { reason } · POST /applications/:id/withdraw → { applicationId, refund } (a waitlisted one, A-61)

function alertFor(app) {
  const deposit = app.invoices?.find((i) => i.type === 'deposit')
  const balance = app.invoices?.find((i) => i.type === 'balance')
  switch (app.status) {
    case 'Awaiting Deposit':
      return ['warning', 'Pay the deposit to send your application', deposit?.dueAt
        ? t('Your application reaches the dormitory office only after the deposit is paid. It expires on {date}.', { date: formatDateTime(deposit.dueAt) })
        : t('Your application reaches the dormitory office only after the deposit is paid.')]
    case 'Awaiting Roommate':
      return ['warning', 'Waiting for your roommate', 'Your roommate has not answered the invitation yet. Both applications reach the dormitory office together.']
    case 'Submitted':
      return ['success', 'Deposit received', 'Your application is now with the dormitory office. We will notify you when it is reviewed.']
    case 'Under Review':
      return ['info', 'Under review', 'The dormitory office is checking your application. No action is needed from you.']
    case 'Approved':
      return ['info', 'Approved', app.resultsPublishedAt
        ? t('Your room and bed are assigned in the assignment run; results are published on {date}.', { date: formatDate(app.resultsPublishedAt) })
        : t('Your room and bed are assigned in the assignment run.')]
    case 'Waitlisted': {
      const w = app.waitlist
      if (w?.offer)
        return ['warning', 'You have Round 2 options', t('No bed of your kind was free in Round 1, so {n} beds of other kinds are held for you until {date}. Choose one, or withdraw and get your deposit back in full.', { n: w.offer.options, date: formatDateTime(w.offer.expiresAt) })]
      return ['warning', 'Waitlisted', w?.until
        ? t('No bed of your kind is free yet. You get Round 2 options as soon as one frees up. If none is found by {date}, the application is cancelled and your deposit of {amount} is refunded in full.', { date: formatDate(w.until), amount: formatVnd(w.refund) })
        : t('No bed of your kind is free yet. You get Round 2 options as soon as one frees up.')]
    }
    case 'Allocated':
      return ['success', 'Room and Bed assigned', `${t('{room} · Bed {bed}, {block}.', { room: app.allocation?.room, bed: app.allocation?.bed, block: tr(app.allocation?.block) })}${balance && balance.status !== 'Paid' && balance.dueAt ? ` ${t('Pay the balance by {date} to keep it.', { date: formatDateTime(balance.dueAt) })}` : ''}`]
    case 'Rejected':
      return ['error', 'Not approved', app.decisionNote ?? t('The dormitory office did not approve this application.')]
    case 'Forfeited':
      return ['error', 'Bed released', t('The balance was not paid in time, so the bed was released and the deposit is kept.')]
    case 'Cancelled':
    case 'Expired':
      return ['info', app.status === 'Expired' ? 'This application has expired' : 'This application is cancelled', app.decisionNote ?? t('Nothing more is needed from you.')]
    default:
      return ['info', app.status, null]
  }
}

function roommateText(app) {
  if (!app.twoBed) return t('Matched automatically by gender')
  if (!app.roommate || app.roommate.mode === 'auto') return app.roommate?.preferences ? t('Matched automatically · by preferences') : t('Matched automatically')
  return `${app.roommate.studentCode}${app.roommate.status ? ` · ${tr(app.roommate.status)}` : ''}`
}

/** Clean, non-scrolling vertical milestone list with semantic status icons and aligned timestamps. */
function ApplicationMilestoneList({ events }) {
  if (!events?.length) {
    return <p className="text-base text-fg-secondary">{t('No events yet.')}</p>
  }
  return (
    <ol className="flex flex-col">
      {events.map((event, i) => {
        const last = i === events.length - 1
        const timeText = event.note ?? (event.at ? formatDateTime(event.at) : null)
        return (
          <li key={`${event.title}-${i}`} className="relative flex items-start gap-3">
            {/* Vertical connecting rail */}
            {!last && (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-6 bottom-0 left-3 w-0.5 -translate-x-1/2',
                  event.state === 'done' ? 'bg-success' : 'bg-line',
                )}
              />
            )}

            {/* Status node */}
            <span
              aria-hidden="true"
              className={cx(
                'relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                event.state === 'done' && 'bg-success text-white',
                event.state === 'current' && 'border-2 border-primary bg-brand-subtle text-fg-brand ring-4 ring-orange-500/15',
                event.state === 'upcoming' && 'border border-line-strong bg-subtle text-fg-tertiary',
              )}
            >
              {event.state === 'done' ? (
                <Check size={13} strokeWidth={2.5} />
              ) : event.state === 'current' ? (
                <span className="size-2 rounded-full bg-primary" />
              ) : (
                <span>{i + 1}</span>
              )}
            </span>

            {/* Milestone content */}
            <div
              className={cx(
                'flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4',
                !last && 'pb-3',
              )}
            >
              <p
                className={cx(
                  'text-sm',
                  event.state === 'current'
                    ? 'font-semibold text-fg-brand'
                    : event.state === 'done'
                      ? 'font-medium text-fg'
                      : 'text-fg-secondary',
                )}
              >
                {tx(event.title)}
              </p>
              {timeText && (
                <span
                  className={cx(
                    'shrink-0 text-xs tabular',
                    event.state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-tertiary',
                  )}
                >
                  {tx(timeText)}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Modern icon-based room configuration grid with highlighted allocation tile. */
function RoomConfigurationCard({ app }) {
  const surchargePct = app.surchargeRate != null ? Math.round(app.surchargeRate * 100) : null
  const specs = [
    {
      icon: Bed,
      label: t('Room type'),
      value: tr(app.roomTypeName) || '—',
    },
    {
      icon: Sparkles,
      label: t('Room tier'),
      value: app.roomClassName ? tr(app.roomClassName) : '—',
      badge: surchargePct != null ? `+${surchargePct}%` : null,
    },
    {
      icon: CalendarRange,
      label: t('Stay length'),
      value: t(app.stayTerms === 1 ? '{n} term' : '{n} terms', { n: app.stayTerms ?? 1 }),
    },
    {
      icon: Users,
      label: t('Roommate'),
      value: roommateText(app),
    },
  ]

  return (
    <Card padding="md" className="flex flex-col gap-3 rounded-xl shadow-xs lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-fg">{t('Room preference')}</h2>
        {app.termName && <Tag tone="neutral" dot={false}>{app.termName}</Tag>}
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {specs.map(({ icon: Glyph, label, value, badge }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-subtle/60 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
              <Glyph size={16} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <dt className="text-xs font-medium text-fg-tertiary">{label}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                <span className="truncate">{value}</span>
                {badge && (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-secondary">
                    {badge}
                  </span>
                )}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      {/* Assigned Room & Bed highlight strip */}
      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2.5',
          app.allocation ? 'bg-brand-subtle/70' : 'bg-subtle/60',
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cx(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              app.allocation ? 'bg-primary text-white' : 'bg-surface text-fg-tertiary',
            )}
          >
            <MapPin size={16} aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-fg-tertiary">{t('Room and bed')}</span>
            {app.allocation ? (
              <span className="text-sm font-semibold text-fg">
                {t('{room} · Bed {bed} · {block}', {
                  room: app.allocation.room,
                  bed: app.allocation.bed,
                  block: tr(app.allocation.block),
                })}
              </span>
            ) : (
              <span className="text-sm text-fg-secondary">{t('Assigned after review')}</span>
            )}
          </div>
        </div>
        {app.allocation && (
          <Button variant="secondary" size="sm" to="/student/room">
            {t('View My room')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function Detail({ app }) {
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useMutation(() => api.applications.cancel(app.id, { reason: reason.trim() || undefined }), {
    invalidates: ['applications', 'home', 'invoices'],
    onSuccess: () => {
      notify({ type: 'info', title: 'Application cancelled', message: 'Any deposit refund follows the dormitory refund rules.' })
      navigate('/student/applications')
    },
    onError: (e) => notifyError(e, 'Could not cancel the application'),
  })

  const [withdrawing, setWithdrawing] = useState(false)
  const account = useRefundAccount()
  const withdraw = useMutation(() => api.applications.withdraw(app.id), {
    invalidates: ['applications', 'home', 'invoices', 'round2-offer'],
    onSuccess: (r) => {
      setWithdrawing(false)
      notify({ type: 'info', title: 'You left the waitlist', message: t('{amount} is refunded to your bank account after a manager approves.', { amount: formatVnd(r?.refund ?? 0) }) })
      navigate('/student/applications')
    },
    onError: (e) => notifyError(e, 'Could not withdraw'),
  })
  const waitlist = app.status === 'Waitlisted' ? app.waitlist : null

  const [alertType, alertTitle, alertBody] = alertFor(app)
  const unpaid = app.invoices?.find((i) => i.status === 'Unpaid' || i.status === 'Overdue')
  const allocated = app.status === 'Allocated'
  // A paid Invoice is refunded by the rules when the Application is cancelled: the account comes first (R-19).
  const refundable = app.invoices?.some((i) => i.status === 'Paid')
  const eventsCount = app.events?.length ?? 0
  const doneEventsCount = (app.events ?? []).filter((e) => e.state === 'done').length

  return (
    <>
      <Alert
        type={alertType}
        title={alertTitle}
        className="shrink-0 py-2.5"
        action={
          waitlist?.offer ? (
            <Button variant="primary" size="sm" to="/student/round-2-offer">
              See the options
            </Button>
          ) : unpaid ? (
            <Button variant="primary" size="sm" to={`/student/invoices/${unpaid.id}/pay`}>
              {unpaid.type === 'deposit' ? t('Pay deposit') : t('Pay now')}
            </Button>
          ) : null
        }
      >
        {alertBody}
      </Alert>

      {/* Balanced 2-Column Layout fitting inside 1 viewport without nested scrollbars */}
      <div className="grid grid-cols-1 gap-3.5 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-start lg:gap-5">
        {/* Left Column (7/12): Progress & Room Configuration */}
        <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-7">
          <Card padding="md" className="flex flex-col gap-3 rounded-xl shadow-xs lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3 font-semibold text-fg">{t('Progress')}</h2>
              {eventsCount > 0 && (
                <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
                  {doneEventsCount}/{eventsCount}
                </span>
              )}
            </div>
            <ApplicationMilestoneList events={app.events} />
          </Card>

          <RoomConfigurationCard app={app} />
        </div>

        {/* Right Column (5/12): Financial Transactions & Support Actions */}
        <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-5">
          <Card padding="md" className="flex flex-col gap-3 rounded-xl shadow-xs lg:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
                <CreditCard size={18} aria-hidden="true" className="text-fg-brand" />
                {t('Payments')}
              </h2>
              <Button variant="text" size="sm" to="/student/invoices">
                {t('View invoices')}
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>

            {(app.invoices ?? []).length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('No invoices yet.')}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {(app.invoices ?? []).map((inv) => {
                  const isPaid = inv.status === 'Paid'
                  const isDue = inv.status === 'Unpaid' || inv.status === 'Overdue'
                  return (
                    <div
                      key={inv.id}
                      className={cx(
                        'flex flex-col gap-2 rounded-xl px-3.5 py-3 transition-colors',
                        isPaid ? 'border border-success/30 bg-success-bg' : isDue ? 'bg-brand-subtle/50' : 'bg-subtle/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <p className="text-sm font-semibold text-fg">{tr(inv.title)}</p>
                          <p className="font-mono text-xs text-fg-tertiary">{inv.id}</p>
                        </div>
                        <p className="text-base font-semibold whitespace-nowrap text-fg tabular">
                          {formatVnd(inv.amount)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
                        <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
                          <Clock size={12} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
                          {inv.paidAt
                            ? t('paid {date}', { date: formatDate(inv.paidAt) })
                            : inv.dueAt
                              ? t('due {date}', { date: formatDateTime(inv.dueAt) })
                              : '—'}
                        </span>
                        <div className="flex items-center gap-2">
                          {inv.status ? <StatusTag status={inv.status} /> : <Tag>Not issued</Tag>}
                          {isDue && (
                            <Button variant="primary" size="sm" to={`/student/invoices/${inv.id}/pay`}>
                              {t('Pay now')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {waitlist && (
            <Card padding="md" className="flex flex-col gap-3 rounded-xl shadow-xs lg:p-5">
              <h2 className="text-h3 font-semibold text-fg">{t('What would you like to do?')}</h2>
              <div className="flex flex-col gap-1 rounded-xl bg-brand-subtle/50 p-3.5">
                <p className="text-sm font-semibold text-fg">{t(waitlist.offer ? 'Take a Round 2 bed' : 'Keep waiting')}</p>
                <p className="text-xs text-fg-secondary">
                  {waitlist.offer
                    ? t('Choose one of the held beds before {date}. The price difference is added to or taken from your balance.', { date: formatDateTime(waitlist.offer.expiresAt) })
                    : t('Nothing to do: we notify you when a bed is held for you.')}
                </p>
                {waitlist.offer && (
                  <Button variant="primary" size="sm" className="mt-1 self-start" to="/student/round-2-offer">
                    Choose a room
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1 rounded-xl bg-subtle/60 p-3.5">
                <p className="text-sm font-semibold text-fg">{t('Withdraw and get the deposit back')}</p>
                <p className="text-xs text-fg-secondary">{t('{amount} is refunded in full to your bank account after a manager approves.', { amount: formatVnd(waitlist.refund) })}</p>
                <Button variant="danger-text" size="sm" className="mt-1 self-start" onClick={() => setWithdrawing(true)}>
                  Withdraw
                </Button>
              </div>
            </Card>
          )}

          {allocated ? (
            <Card padding="md" className="flex flex-col items-start gap-2.5 rounded-xl shadow-xs lg:p-5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
                  <HelpCircle size={15} aria-hidden="true" />
                </span>
                <h2 className="text-h3 font-semibold text-fg">{t('Need a different room?')}</h2>
              </div>
              <p className="text-sm text-fg-secondary">
                {t('Room type and room tier are locked for this term. After check-in you can ask for a room change or swap with another student.')}
              </p>
              <Button variant="secondary" size="sm" to="/student/requests/room-change/new">
                New room-change request
              </Button>
            </Card>
          ) : app.canCancel ? (
            <Card padding="md" className="flex flex-col items-start gap-2.5 rounded-xl shadow-xs lg:p-5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
                  <HelpCircle size={15} aria-hidden="true" />
                </span>
                <h2 className="text-h3 font-semibold text-fg">{t('Need to change something?')}</h2>
              </div>
              <p className="text-sm text-fg-secondary">
                {app.registrationClosesAt
                  ? t('Room type and room tier are locked. Cancel to apply again before {date}; the deposit refund follows the dormitory refund rules.', { date: formatDateTime(app.registrationClosesAt) })
                  : t('Room type and room tier are locked. Cancel to apply again; the deposit refund follows the dormitory refund rules.')}
              </p>
              <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(true)}>
                Cancel application
              </Button>
            </Card>
          ) : null}
        </div>
      </div>

      {waitlist && (
        <Modal
          open={withdrawing}
          onClose={() => setWithdrawing(false)}
          width={560}
          title="Withdraw from the waitlist?"
          description={[app.id, tr(app.roomTypeName), tr(app.roomClassName)].filter(Boolean).join(' · ')}
          footer={
            <>
              <Button onClick={() => setWithdrawing(false)}>Keep waiting</Button>
              <Button
                variant="danger"
                disabled={withdraw.pending || account.saving || (waitlist.refund > 0 && !account.unchanged && !account.draft.accepted)}
                onClick={async () => {
                  if (waitlist.refund > 0 && !(await account.save())) return
                  withdraw.run()
                }}
              >
                {withdraw.pending ? t('Withdrawing…') : t('Withdraw and request the refund')}
              </Button>
            </>
          }
        >
          <p className="text-base text-fg-secondary">
            {t('The application is cancelled{offer} and your deposit of {amount} is refunded in full after a manager approves. This cannot be undone.', {
              offer: waitlist.offer ? t(', the held beds are released') : '',
              amount: formatVnd(waitlist.refund),
            })}
          </p>
          {waitlist.refund > 0 && <RefundAccountFields draft={account.draft} setDraft={account.setDraft} error={account.error} disabled={account.saving} unchanged={account.unchanged} />}
        </Modal>
      )}

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this application?"
        description={[app.id, tr(app.roomTypeName), tr(app.roomClassName)].filter(Boolean).join(' · ')}
        footer={
          <>
            <Button onClick={() => setConfirmCancel(false)}>Keep application</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (refundable && !(await account.save())) return
                cancel.run()
              }}
              disabled={cancel.pending || account.saving || (refundable && !account.unchanged && !account.draft.accepted)}
            >
              {cancel.pending ? t('Cancelling…') : t('Cancel application')}
            </Button>
          </>
        }
      >
        {app.cancelPolicy && <p className="text-base text-fg-secondary">{tr(app.cancelPolicy)}</p>}
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {refundable && <RefundAccountFields draft={account.draft} setDraft={account.setDraft} error={account.error} disabled={account.saving} unchanged={account.unchanged} />}
      </Modal>
    </>
  )
}

export default function ApplicationDetail() {
  const { id } = useParams()
  const query = useQuery(['applications', id], ({ signal }) => api.applications.get(id, { signal }))
  const app = query.data
  return (
    <StudentPage
      breadcrumb={[{ label: 'Application', to: '/student/applications' }, { label: id }]}
      title={t('Application {id}', { id: app?.id ?? id })}
      badge={app && <StatusTag status={app.status} />}
      className="lg:gap-3"
    >
      {app === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={FileText} title="No application with this number" action={<Button variant="primary" to="/student/applications">Back to my applications</Button>} />
      ) : app === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Detail app={app} />
      )}
    </StudentPage>
  )
}
