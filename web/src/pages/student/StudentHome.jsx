import { useState } from 'react'
import { Link } from 'react-router'
import { Bed, CalendarCheck, ChevronRight, Clock, CreditCard, FileText, LogIn, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useMobileBar } from '@/components/layout/MobileBar'
import { useNotifications } from '@/components/layout/Notifications'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { ErrorState, LoadingState, QueryState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { catalogHelpers, useCatalog } from './apply/wizard'
import { DormitoryBoard } from './board'
import { CompareClassesModal, NextAction, StatusCard, StatusList, StatusRow, TermTimeline } from './shared'
import { t, tr } from '@/i18n'

// SCR-HOME-01 Student Home (13:96) and SCR-HOME-01 Student Home · Allocated (39:1165). The dormitory board (spec
// §6.5, §11.4) comes first: the registration period card and the announcements.
// Phone: MOB-HOME-01 Home (55:160) — Next action, a status list and the latest notification.
// GET /students/me/home?termId → {
//   firstName, term, application: { id, status, roomTypeName, roomClassName } | null,
//   allocation: { room, bed, block, floor } | null, checkedIn (a resident: door code released or desk check-in),
//   dueInvoice: { id, type, title, amount, dueAt } | null, invoices: { due, total }, openRequests }

function greeting(firstName) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return firstName ? t(`${part}, {name}`, { name: firstName }) : t(part)
}

function stageOf(home) {
  if (home.allocation) return 'allocated'
  if (!home.application) return 'new'
  if (home.application.status === 'Awaiting Deposit') return 'awaiting-deposit'
  return 'applied'
}

const daysUntil = (iso) => (iso ? Math.ceil((new Date(iso) - new Date()) / 86_400_000) : null)
const dueIn = (iso) => {
  const d = daysUntil(iso)
  if (d == null) return null
  if (d < 0) return t('Overdue')
  if (d === 0) return t('Due today')
  return t(d === 1 ? 'Due in {n} day' : 'Due in {n} days', { n: d })
}
const range = (a, b) => (a ? `${formatDate(a)}${b ? ` – ${formatDate(b)}` : ''}` : '—')

function RoomTypesCard() {
  const [open, setOpen] = useState(false)
  const catalog = useCatalog()
  const { fromPrice } = catalogHelpers(catalog.data)
  return (
    <Card padding="lg" className="flex w-full shrink-0 flex-col gap-3 lg:min-h-0 lg:w-96">
      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{t('Room Types')}</h2>
        <p className="text-sm text-fg-tertiary">{t('Lowest Term price per Bed.')}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <QueryState query={catalog} compact isEmpty={(d) => !d?.roomTypes?.length}>
          {(data) => (
            <ul className="flex flex-col">
              {data.roomTypes.map((type) => (
                <li key={type.id} className="flex items-center gap-3 border-t border-line py-2">
                  <Bed size={20} aria-hidden="true" className="shrink-0 text-fg-secondary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-medium text-fg">{tr(type.name)}</span>
                    <span className="text-sm text-fg-tertiary">{type.beds === 2 ? t('Roommate selection available') : t('Matched automatically')}</span>
                  </span>
                  <span className="text-base font-medium whitespace-nowrap text-fg">{formatVnd(fromPrice(type.id))}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
      <Button variant="text" icon={ChevronRight} className="self-start" onClick={() => setOpen(true)}>
        Compare Room Classes
      </Button>
      <CompareClassesModal open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

function HomeContent({ home }) {
  const stage = stageOf(home)
  const { term, application: app, allocation, dueInvoice } = home
  const payLink = dueInvoice ? `/student/invoices/${dueInvoice.id}/pay` : '/student/invoices'

  const subtitle = {
    new: term?.registrationClosesAt
      ? t('{term} registration is open until {date}.', { term: term.name, date: formatDateTime(term.registrationClosesAt) })
      : t('Registration is not open yet.'),
    'awaiting-deposit': t('Pay the deposit to send {id} to the dormitory office.', { id: app?.id }),
    applied: t('Your Application is with the dormitory office.'),
    allocated: dueInvoice
      ? t('Your Room for {term} is ready. Pay the balance to keep it.', { term: term?.name ?? t('this Term') })
      : t('Your Room for {term} is confirmed.', { term: term?.name ?? t('this Term') }),
  }[stage]

  let next
  if (stage === 'new') {
    const left = daysUntil(term?.registrationClosesAt)
    next = (
      <NextAction
        icon={FileText}
        title={term ? t('Apply for a dormitory Bed for {term}', { term: term.name }) : t('Apply for a dormitory Bed')}
        deadline={left != null && left >= 0 ? t(left === 1 ? 'Registration closes in {n} day' : 'Registration closes in {n} days', { n: left }) : null}
        action={
          <Button variant="primary" size="lg" to="/student/apply/term" disabled={!term?.registrationOpen}>
            Start application
          </Button>
        }
      >
        Choose a Room Type and Room Class. Pay the deposit to submit; the dormitory assigns your Room and Bed after review.
      </NextAction>
    )
  } else if (dueInvoice && (stage === 'awaiting-deposit' || stage === 'allocated')) {
    next = (
      <NextAction
        icon={CreditCard}
        title={`${tr(dueInvoice.title) || t('Pay your Invoice')} · ${formatVnd(dueInvoice.amount)}`}
        deadline={dueIn(dueInvoice.dueAt)}
        action={
          <Button variant="primary" size="lg" to={payLink}>
            Pay now
          </Button>
        }
      >
        {dueInvoice.dueAt && t('Pay by {date}.', { date: formatDateTime(dueInvoice.dueAt) })}{' '}
        {stage === 'awaiting-deposit' ? t('Unpaid Applications expire at the deadline.') : t('An unpaid balance blocks check-in.')}
      </NextAction>
    )
  } else if (stage === 'applied') {
    next = (
      <NextAction
        icon={Clock}
        title="Your Application is under review"
        deadline={term?.resultsPublishedAt ? t('Assignment results on {date}', { date: formatDate(term.resultsPublishedAt) }) : null}
        deadlineIcon={CalendarCheck}
        action={
          <Button variant="primary" size="lg" to={`/student/applications/${app.id}`}>
            View application
          </Button>
        }
      >
        The dormitory office reviews Applications after registration closes, then assigns Rooms and Beds.
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
          <Button variant="primary" size="lg" to="/student/room">
            View My Room
          </Button>
        }
      >
        {home.checkedIn ? t('You live in this Room. Report problems in your Room from Requests.') : t('Pay the Balance; the door code comes on My Room when check-in starts. The {block} desk hands over the keys and items.', { block: tr(allocation.block) })}
      </NextAction>
    )
  }

  const cards = {
    application: app
      ? { value: app.status, note: [app.id, app.roomTypeName, app.roomClassName].filter(Boolean).join(' · '), to: `/student/applications/${app.id}` }
      : { value: t('No application yet'), note: term ? t('{term} · not started', { term: term.name }) : t('Not started'), to: '/student/applications' },
    room: allocation
      ? { value: t('{room} · Bed {bed}', { room: allocation.room, bed: allocation.bed }), note: [tr(allocation.block), tr(allocation.floor)].filter(Boolean).join(' · '), to: '/student/room' }
      : { value: t('Not assigned'), note: t('Assigned after the review and assignment run') },
    payments:
      home.invoices?.total === 0
        ? { value: t('No invoices'), note: t('The deposit Invoice is issued when you submit'), to: '/student/invoices' }
        : home.invoices?.due
          ? { value: t('{n} due', { n: home.invoices.due }), note: dueInvoice ? t('{amount} · due {date}', { amount: formatVnd(dueInvoice.amount), date: formatDate(dueInvoice.dueAt) }) : t('See Payments'), to: '/student/invoices' }
          : { value: t('{n} due', { n: 0 }), note: t('All Invoices are paid'), to: '/student/invoices' },
  }

  // Milestones before today are done; the first one after today is current.
  const points = [
    ['Registration opens', term?.registrationOpensAt],
    ['Registration closes', term?.registrationClosesAt],
    ['Assignment results published', term?.resultsPublishedAt],
    ['Balance due', term?.balanceDueAt],
    ['Check-in', term?.checkInStart, term?.checkInEnd],
    ['Term starts', term?.stayStart],
  ]
  const now = new Date()
  const firstUpcoming = points.findIndex(([, d]) => d && new Date(d) > now)
  const milestones = points.map(([label, d, end], i) => ({
    label,
    date: end ? range(d, end) : d ? formatDate(d) : '—',
    state: firstUpcoming === -1 || i < firstUpcoming ? 'done' : i === firstUpcoming ? 'current' : 'upcoming',
  }))

  return (
    <>
      <div className="flex shrink-0 flex-col gap-1 max-lg:sr-only">
        <h1 className="text-h1 font-semibold text-fg">{greeting(home.firstName)}</h1>
        <p className="text-lg text-fg-secondary">{subtitle}</p>
      </div>

      <DormitoryBoard />

      {next}

      <div className="hidden shrink-0 items-stretch gap-6 lg:flex">
        <StatusCard icon={FileText} label="Application" {...cards.application} />
        <StatusCard icon={Bed} label="My Room" {...cards.room} />
        <StatusCard icon={CreditCard} label="Payments" {...cards.payments} />
        <StatusCard icon={Wrench} label="Requests" value={t('{n} open', { n: home.openRequests ?? 0 })} note="Maintenance and Room-Change Requests" to={allocation ? '/student/requests' : undefined} />
      </div>

      <StatusList className="lg:hidden">
        <StatusRow icon={Bed} value={cards.room.value} note={cards.room.note} to={cards.room.to} />
        {app ? (
          <StatusRow
            icon={FileText}
            value={app.id}
            note={[term?.name, app.roomTypeName, app.roomClassName].filter(Boolean).join(' · ')}
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
        {allocation && <StatusRow icon={Wrench} value={`${t('Requests')} · ${t('{n} open', { n: home.openRequests ?? 0 })}`} note="Maintenance and Room-Change Requests" to="/student/requests" />}
      </StatusList>

      <LatestNotification />

      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-6">
        <TermTimeline term={term} milestones={milestones} className="lg:min-w-0 lg:flex-1" />
        {stage !== 'allocated' && <RoomTypesCard />}
      </div>
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
    <StudentContainer className="flex flex-col gap-3 pt-2 pb-4 lg:gap-4 lg:py-5">
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
