import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, DetailRows, ProgressTimeline } from '@/components/ui/Display'
import { Field, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-APP-03 Application Detail (Figma 17:888).
// GET /applications/:id → {
//   id, status, termName, roomTypeName, roomClassName, surchargeRate, twoBed,
//   roommate: { mode, studentCode, status, preferences } | null, allocation: { room, bed, block } | null,
//   events: [{ title, at, state: 'done'|'current'|'upcoming', note }],
//   invoices: [{ id, type, title, amount, status, dueAt, paidAt }],
//   canCancel, cancelPolicy, resultsPublishedAt, balanceDueAt, registrationClosesAt }
// POST /applications/:id/cancel { reason }

function alertFor(app) {
  const deposit = app.invoices?.find((i) => i.type === 'deposit')
  const balance = app.invoices?.find((i) => i.type === 'balance')
  switch (app.status) {
    case 'Awaiting Deposit':
      return ['warning', 'Pay the deposit to send your Application', deposit?.dueAt
        ? t('Your Application reaches the dormitory office only after the deposit is paid. It expires on {date}.', { date: formatDateTime(deposit.dueAt) })
        : t('Your Application reaches the dormitory office only after the deposit is paid.')]
    case 'Awaiting Roommate':
      return ['warning', 'Waiting for your roommate', 'Your roommate has not answered the invitation yet. Both Applications reach the dormitory office together.']
    case 'Submitted':
      return ['success', 'Deposit received', 'Your Application is now with the dormitory office. We will notify you when it is reviewed.']
    case 'Under Review':
      return ['info', 'Under review', 'The dormitory office is checking your Application. No action is needed from you.']
    case 'Approved':
      return ['info', 'Approved', app.resultsPublishedAt
        ? t('Your Room and Bed are assigned in the assignment run; results are published on {date}.', { date: formatDate(app.resultsPublishedAt) })
        : t('Your Room and Bed are assigned in the assignment run.')]
    case 'Waitlisted':
      return ['warning', 'Waitlisted', 'No matching Bed was free in Round 1. You may receive a Round 2 offer.']
    case 'Allocated':
      return ['success', 'Room and Bed assigned', `${t('{room} · Bed {bed}, {block}.', { room: app.allocation?.room, bed: app.allocation?.bed, block: tr(app.allocation?.block) })}${balance && balance.status !== 'Paid' && balance.dueAt ? ` ${t('Pay the balance by {date} to keep it.', { date: formatDateTime(balance.dueAt) })}` : ''}`]
    case 'Rejected':
      return ['error', 'Not approved', app.decisionNote ?? t('The dormitory office did not approve this Application.')]
    case 'Cancelled':
    case 'Expired':
      return ['info', app.status === 'Expired' ? 'This Application has expired' : 'This Application is cancelled', app.decisionNote ?? t('Nothing more is needed from you.')]
    default:
      return ['info', app.status, null]
  }
}

function roommateText(app) {
  if (!app.twoBed) return t('Matched automatically by gender')
  if (!app.roommate || app.roommate.mode === 'auto') return app.roommate?.preferences ? t('Matched automatically · by preferences') : t('Matched automatically')
  return `${app.roommate.studentCode}${app.roommate.status ? ` · ${tr(app.roommate.status)}` : ''}`
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
    onError: (e) => notifyError(e, 'Could not cancel the Application'),
  })

  const [alertType, alertTitle, alertBody] = alertFor(app)
  const unpaid = app.invoices?.find((i) => i.status === 'Unpaid' || i.status === 'Overdue')
  const allocated = app.status === 'Allocated'

  return (
    <>
      <Alert
        type={alertType}
        title={alertTitle}
        className="shrink-0"
        action={
          unpaid ? (
            <Button variant="primary" to={`/student/invoices/${unpaid.id}/pay`}>
              {unpaid.type === 'deposit' ? t('Pay deposit') : t('Pay now')}
            </Button>
          ) : null
        }
      >
        {alertBody}
      </Alert>

      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card padding="lg" className="flex min-h-0 flex-1 flex-col gap-4">
            <h2 className="shrink-0 text-h3 font-semibold text-fg">{t('Progress')}</h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {app.events?.length ? (
                <ProgressTimeline events={app.events.map((e) => ({ title: e.title, time: e.note ?? (e.at ? formatDateTime(e.at) : null), state: e.state }))} />
              ) : (
                <p className="text-base text-fg-secondary">{t('No events yet.')}</p>
              )}
            </div>
          </Card>

          <Card padding="lg" className="flex shrink-0 flex-col gap-1">
            <h2 className="text-h3 font-semibold text-fg">{t('Room preference')}</h2>
            <DetailRows
              className="mt-2"
              rows={[
                ['Room Type', tr(app.roomTypeName) || '—'],
                ['Room Class', app.roomClassName ? `${tr(app.roomClassName)}${app.surchargeRate != null ? ` (+${Math.round(app.surchargeRate * 100)}%)` : ''}` : '—'],
                ['Roommate', roommateText(app)],
                ['Room and Bed', app.allocation ? t('{room} · Bed {bed} · {block}', { room: app.allocation.room, bed: app.allocation.bed, block: tr(app.allocation.block) }) : <span className="text-fg-tertiary">{t('Assigned after review')}</span>],
              ]}
            />
          </Card>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-90 lg:gap-4 lg:overflow-y-auto">
          <Card padding="lg" className="flex flex-col items-start gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Payments')}</h2>
            {(app.invoices ?? []).length === 0 && <p className="text-base text-fg-secondary">{t('No Invoices yet.')}</p>}
            {(app.invoices ?? []).map((inv) => (
              <div key={inv.id} className="flex w-full items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-base font-medium text-fg">{tr(inv.title)}</p>
                  <p className="text-sm text-fg-tertiary">
                    {inv.id}
                    {inv.paidAt ? ` · ${t('paid {date}', { date: formatDate(inv.paidAt) })}` : inv.dueAt ? ` · ${t('due {date}', { date: formatDateTime(inv.dueAt) })}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-base font-medium whitespace-nowrap text-fg">{formatVnd(inv.amount)}</p>
                  {inv.status ? <StatusTag status={inv.status} /> : <Tag>Not issued</Tag>}
                </div>
              </div>
            ))}
            <Button variant="text" to="/student/invoices">
              View invoices
            </Button>
          </Card>

          {allocated ? (
            <Card padding="lg" className="flex flex-col items-start gap-3">
              <h2 className="text-h3 font-semibold text-fg">{t('Need a different Room?')}</h2>
              <p className="text-sm text-fg-secondary">{t('Room Type and Room Class are locked for this Term. After check-in you can ask for a room change or swap with another Student.')}</p>
              <Button to="/student/requests/room-change/new">New room-change request</Button>
            </Card>
          ) : app.canCancel ? (
            <Card padding="lg" className="flex flex-col items-start gap-3">
              <h2 className="text-h3 font-semibold text-fg">{t('Need to change something?')}</h2>
              <p className="text-sm text-fg-secondary">
                {app.registrationClosesAt
                  ? t('Room Type and Room Class are locked. Cancel to apply again before {date}; the deposit refund follows the dormitory refund rules.', { date: formatDateTime(app.registrationClosesAt) })
                  : t('Room Type and Room Class are locked. Cancel to apply again; the deposit refund follows the dormitory refund rules.')}
              </p>
              <Button onClick={() => setConfirmCancel(true)}>Cancel application</Button>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this Application?"
        description={[app.id, tr(app.roomTypeName), tr(app.roomClassName)].filter(Boolean).join(' · ')}
        footer={
          <>
            <Button onClick={() => setConfirmCancel(false)}>Keep application</Button>
            <Button variant="danger" onClick={() => cancel.run()} disabled={cancel.pending}>
              {cancel.pending ? t('Cancelling…') : t('Cancel application')}
            </Button>
          </>
        }
      >
        {app.cancelPolicy && <p className="text-base text-fg-secondary">{tr(app.cancelPolicy)}</p>}
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
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
    >
      {app === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={FileText} title="No Application with this number" action={<Button variant="primary" to="/student/applications">Back to my applications</Button>} />
      ) : app === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Detail app={app} />
      )}
    </StudentPage>
  )
}
