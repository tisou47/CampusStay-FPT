import { Link } from 'react-router'
import { Bed, CalendarCheck, Clock, CreditCard, FileText, LogIn, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useMobileBar } from '@/components/layout/MobileBar'
import { useNotifications } from '@/components/layout/Notifications'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { daysFromToday, formatDate, formatDateRange, formatDateTime, formatVnd, greeting as greet } from '@/lib/format'
import { DormitoryBoard } from './board'
import { NextAction, StatusCard, StatusList, StatusRow } from './shared'
import { t, tr } from '@/i18n'

// SCR-HOME-01 Student Home (13:96) and SCR-HOME-01 Student Home · Allocated (39:1165). The next action comes first
// (R-12), then the dormitory board (spec §6.5, §11.4): the registration period with its schedule, and the announcements.
// Phone: MOB-HOME-01 Home (55:160) — Next action, a status list and the latest notification.
// GET /students/me/home?termId → {
//   firstName, term, application: { id, status, roomTypeName, roomClassName } | null,
//   allocation: { room, bed, block, floor } | null, checkedIn (a resident: door code released or desk check-in),
//   dueInvoice: { id, type, title, amount, dueAt } | null, invoices: { due, total }, openRequests }

function greeting(firstName) {
  return firstName ? `${greet()}, ${firstName}` : greet()
}

function stageOf(home) {
  if (home.allocation) return 'allocated'
  if (!home.application) return 'new'
  if (home.application.status === 'Awaiting Deposit') return 'awaiting-deposit'
  return 'applied'
}

const daysUntil = (iso) => (iso ? daysFromToday(iso) : null)
const dueIn = (iso) => {
  const d = daysUntil(iso)
  if (d == null) return null
  if (d < 0) return t('Overdue')
  if (d === 0) return t('Due today')
  return t(d === 1 ? 'Due in {n} day' : 'Due in {n} days', { n: d })
}
const range = (a, b) => (a ? formatDateRange(a, b ?? a) : '—')

function HomeContent({ home }) {
  const stage = stageOf(home)
  const { term, application: app, allocation, dueInvoice } = home
  const payLink = dueInvoice ? `/student/invoices/${dueInvoice.id}/pay` : '/student/invoices'

  // A new student whose Term's registration has closed has nothing to apply for: say so, never a live button.
  const closed = stage === 'new' && !term?.registrationOpen
  const subtitle = {
    new: closed
      ? term?.registrationClosesAt && new Date(term.registrationClosesAt) < new Date()
        ? t('{term} registration closed on {date}.', { term: term.name, date: formatDateTime(term.registrationClosesAt) })
        : t('Registration is not open yet.')
      : term?.registrationClosesAt
        ? t('{term} registration is open until {date}.', { term: term.name, date: formatDateTime(term.registrationClosesAt) })
        : t('Registration is not open yet.'),
    'awaiting-deposit': t('Pay the deposit to send {id} to the dormitory office.', { id: app?.id }),
    applied: t('Your application is with the dormitory office.'),
    allocated: dueInvoice
      ? t('Your room for {term} is ready. Pay the balance to keep it.', { term: term?.name ?? t('this term') })
      : t('Your room for {term} is confirmed.', { term: term?.name ?? t('this term') }),
  }[stage]

  let next
  if (closed) {
    next = (
      <NextAction icon={FileText} title={term ? t('Registration for {term} is closed', { term: term.name }) : t('Registration is not open yet')}>
        The next registration period is announced on the dormitory board; you can apply as soon as it opens.
      </NextAction>
    )
  } else if (stage === 'new') {
    const left = daysUntil(term?.registrationClosesAt)
    next = (
      <NextAction
        icon={FileText}
        title={term ? t('Apply for a dormitory bed for {term}', { term: term.name }) : t('Apply for a dormitory bed')}
        deadline={left != null && left >= 0 ? t(left === 1 ? 'Registration closes in {n} day' : 'Registration closes in {n} days', { n: left }) : null}
        action={
          <Button tip="Available while the registration period of a term is open." variant="primary" to="/student/apply/term" disabled={!term?.registrationOpen}>
            Start application
          </Button>
        }
      >
        Choose a room type and room tier. Pay the deposit to submit; the dormitory assigns your room and bed after review.
      </NextAction>
    )
  } else if (dueInvoice && (stage === 'awaiting-deposit' || stage === 'allocated')) {
    next = (
      <NextAction
        icon={CreditCard}
        title={`${tr(dueInvoice.title) || t('Pay your invoice')} · ${formatVnd(dueInvoice.amount)}`}
        deadline={dueIn(dueInvoice.dueAt)}
        action={
          <Button variant="primary" to={payLink}>
            Pay now
          </Button>
        }
      >
        {dueInvoice.dueAt && t('Pay by {date}.', { date: formatDateTime(dueInvoice.dueAt) })}{' '}
        {stage === 'awaiting-deposit' ? t('Unpaid applications expire at the deadline.') : t('An unpaid balance blocks check-in.')}
      </NextAction>
    )
  } else if (stage === 'awaiting-deposit') {
    // The Deposit is claimed: nothing is due while a Manager checks the transfer.
    next = (
      <NextAction
        icon={Clock}
        title="Your deposit transfer is being confirmed"
        action={
          <Button variant="primary" to={`/student/applications/${app.id}`}>
            View application
          </Button>
        }
      >
        A manager checks the transfer against the bank statement; your application is submitted once it is confirmed.
      </NextAction>
    )
  } else if (stage === 'applied' || !allocation) {
    next = (
      <NextAction
        icon={Clock}
        title="Your application is under review"
        deadline={term?.resultsPublishedAt ? t('Assignment results on {date}', { date: formatDate(term.resultsPublishedAt) }) : null}
        deadlineIcon={CalendarCheck}
        action={
          <Button variant="primary" to={`/student/applications/${app.id}`}>
            View application
          </Button>
        }
      >
        The dormitory office reviews applications after registration closes, then assigns rooms and beds.
      </NextAction>
    )
  } else {
    next = (
      <NextAction
        icon={Bed}
        title={t("You're all set · {room} · Bed {bed}", { room: allocation.room, bed: allocation.bed })}
        deadline={home.checkedIn ? null : term?.checkInStart ? t('Check-in {dates}', { dates: range(term.checkInStart, term.checkInEnd) }) : null}
        deadlineIcon={CalendarCheck}
        action={
          <Button variant="primary" to="/student/room">
            View My room
          </Button>
        }
      >
        {home.checkedIn ? t('You live in this room. Report problems in your room from requests.') : t('Pay the balance; the door code comes on My room when check-in starts. The {block} desk hands over the keys and items.', { block: tr(allocation.block) })}
      </NextAction>
    )
  }

  const cards = {
    application: app
      ? { value: app.status, note: [app.id, tr(app.roomTypeName), tr(app.roomClassName)].filter(Boolean).join(' · '), to: `/student/applications/${app.id}` }
      : allocation
        ? { value: t('Allocated'), note: [allocation.room, allocation.bed && t('Bed {bed}', { bed: allocation.bed })].filter(Boolean).join(' · '), to: '/student/room' }
        : { value: t('No application yet'), note: term ? t('{term} · not started', { term: term.name }) : t('Not started'), to: '/student/applications' },
    room: allocation
      ? { value: t('{room} · Bed {bed}', { room: allocation.room, bed: allocation.bed }), note: [tr(allocation.block), allocation.floor != null && t('Floor {n}', { n: allocation.floor })].filter(Boolean).join(' · '), to: '/student/room' }
      : { value: t('Not assigned'), note: t('Assigned after the review and assignment run'), to: '/student/room' },
    payments:
      home.invoices?.total === 0
        ? { value: t('No invoices'), note: t('The deposit invoice is issued when you submit'), to: '/student/invoices' }
        : home.invoices?.due
          ? { value: t('{n} due', { n: home.invoices.due }), note: dueInvoice ? t('{amount} · due {date}', { amount: formatVnd(dueInvoice.amount), date: formatDate(dueInvoice.dueAt) }) : t('See payments'), to: '/student/invoices' }
          : { value: t('{n} due', { n: 0 }), note: t('All invoices are paid'), to: '/student/invoices' },
  }

  return (
    <>
      <div className="flex shrink-0 flex-col gap-0.5 max-lg:sr-only lg:flex-row lg:items-baseline lg:justify-between lg:gap-4">
        <h1 className="sr-only text-h1 font-semibold text-fg lg:not-sr-only">{greeting(home.firstName)}</h1>
        <p className="text-base text-fg-secondary">{subtitle}</p>
      </div>

      {next}

      <section aria-label={t('Overview')} className="hidden shrink-0 grid-cols-2 gap-3 sm:grid lg:grid-cols-4 lg:gap-4">
        <StatusCard icon={FileText} label="Application" {...cards.application} />
        <StatusCard icon={Bed} label="My room" {...cards.room} />
        <StatusCard icon={CreditCard} label="Payments" {...cards.payments} />
        <StatusCard icon={Wrench} label="Requests" value={t('{n} open', { n: home.openRequests ?? 0 })} note="Maintenance and room-change requests" to="/student/requests" />
      </section>

      <StatusList className="sm:hidden">
        <StatusRow icon={Bed} value={cards.room.value} note={cards.room.note} to={cards.room.to} />
        {app ? (
          <StatusRow
            icon={FileText}
            value={app.id}
            note={[term?.name, tr(app.roomTypeName), tr(app.roomClassName)].filter(Boolean).join(' · ')}
            tag={<StatusTag status={app.status} />}
            to={cards.application.to}
          />
        ) : (
          <StatusRow icon={FileText} value={cards.application.value} note={cards.application.note} to={cards.application.to} />
        )}
        {allocation && term?.checkInStart && !home.checkedIn && (
          <StatusRow icon={LogIn} value="Check-in" note={[range(term.checkInStart, term.checkInEnd), tr(allocation.block)].filter(Boolean).join(' · ')} to="/student/room" />
        )}
        <StatusRow icon={CreditCard} value={`${t('Payments')} · ${cards.payments.value}`} note={cards.payments.note} to={cards.payments.to} />
        <StatusRow icon={Wrench} value={`${t('Requests')} · ${t('{n} open', { n: home.openRequests ?? 0 })}`} note="Maintenance and room-change requests" to="/student/requests" />
      </StatusList>

      <DormitoryBoard />

      <LatestNotification />
    </>
  )
}

/** Phone only (Android Home › Latest): the newest notification, linking to where it points. */
function LatestNotification() {
  const { items } = useNotifications()
  const n = items[0]
  if (!n) return null
  return (
    <Link to={n.link ?? '/student/notifications'} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 lg:hidden">
      <span className="text-sm font-medium text-fg-tertiary">{t('Latest notification')}</span>
      <span className="text-base font-medium text-fg">{n.title}</span>
      <span className="text-sm text-fg-tertiary">{formatDateTime(n.createdAt)}</span>
    </Link>
  )
}

export default function StudentHome() {
  const { term } = useSession()
  const home = useQuery(['home', term?.id], ({ signal }) => api.me.home({ termId: term?.id }, { signal }))
  useMobileBar(home.data?.firstName ? t('Hi, {name}', { name: home.data.firstName }) : t('Home'))
  return (
    <StudentContainer className="flex flex-col gap-3 pt-2 pb-4 lg:h-full lg:min-h-0 lg:gap-4 lg:py-4">
      {home.data === undefined && <h1 className="sr-only">{t('Home')}</h1>}
      {home.data === undefined && home.loading ? (
        <LoadingState />
      ) : home.data === undefined ? (
        <ErrorState error={home.error} onRetry={home.reload} title="Could not load your home page" />
      ) : (
        <HomeContent home={home.data} />
      )}
    </StudentContainer>
  )
}
