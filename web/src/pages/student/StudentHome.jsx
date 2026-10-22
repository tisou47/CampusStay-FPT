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
import { CompareClassesModal, NextAction, StatusCard, StatusList, StatusRow, TermTimeline } from './shared'

// SCR-HOME-01 Student Home (13:96) and SCR-HOME-01 Student Home · Allocated (39:1165).
// Phone: MOB-HOME-01 Home (55:160) — Next action, a status list and the latest notification.
// GET /students/me/home?termId → {
//   firstName, term, application: { id, status, roomTypeName, roomClassName } | null,
//   allocation: { room, bed, block, floor } | null, checkedIn,
//   dueInvoice: { id, type, title, amount, dueAt } | null, invoices: { due, total }, openRequests }

function greeting(firstName) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return firstName ? `${part}, ${firstName}` : part
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
  if (d < 0) return 'Overdue'
  if (d === 0) return 'Due today'
  return `Due in ${d} ${d === 1 ? 'day' : 'days'}`
}
const range = (a, b) => (a ? `${formatDate(a)}${b ? ` – ${formatDate(b)}` : ''}` : '—')

function RoomTypesCard() {
  const [open, setOpen] = useState(false)
  const catalog = useCatalog()
  const { fromPrice } = catalogHelpers(catalog.data)
  return (
    <Card padding="lg" className="flex w-full shrink-0 flex-col gap-3 lg:min-h-0 lg:w-96">
      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">Room Types</h2>
        <p className="text-sm text-fg-tertiary">Lowest Term price per Bed.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <QueryState query={catalog} compact isEmpty={(d) => !d?.roomTypes?.length}>
          {(data) => (
            <ul className="flex flex-col">
              {data.roomTypes.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-t border-line py-2">
                  <Bed size={20} aria-hidden="true" className="shrink-0 text-fg-secondary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-medium text-fg">{t.name}</span>
                    <span className="text-sm text-fg-tertiary">{t.beds === 2 ? 'Roommate selection available' : 'Matched automatically'}</span>
                  </span>
                  <span className="text-base font-medium whitespace-nowrap text-fg">{formatVnd(fromPrice(t.id))}</span>
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
    new: term?.registrationClosesAt ? `${term.name} registration is open until ${formatDateTime(term.registrationClosesAt)}.` : 'Registration is not open yet.',
    'awaiting-deposit': `Pay the deposit to send ${app?.id} to the dormitory office.`,
    applied: 'Your Application is with the dormitory office.',
    allocated: dueInvoice ? `Your Room for ${term?.name ?? 'this Term'} is ready. Pay the balance to keep it.` : `Your Room for ${term?.name ?? 'this Term'} is confirmed.`,
  }[stage]

  let next
  if (stage === 'new') {
    const left = daysUntil(term?.registrationClosesAt)
    next = (
      <NextAction
        icon={FileText}
        title={`Apply for a dormitory Bed${term ? ` for ${term.name}` : ''}`}
        deadline={left != null && left >= 0 ? `Registration closes in ${left} ${left === 1 ? 'day' : 'days'}` : null}
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
        title={`${dueInvoice.title ?? 'Pay your Invoice'} · ${formatVnd(dueInvoice.amount)}`}
        deadline={dueIn(dueInvoice.dueAt)}
        action={
          <Button variant="primary" size="lg" to={payLink}>
            Pay now
          </Button>
        }
      >
        {dueInvoice.dueAt && `Pay by ${formatDateTime(dueInvoice.dueAt)}.`}{' '}
        {stage === 'awaiting-deposit' ? 'Unpaid Applications expire at the deadline.' : 'An unpaid balance blocks check-in.'}
      </NextAction>
    )
  } else if (stage === 'applied') {
    next = (
      <NextAction
        icon={Clock}
        title="Your Application is under review"
        deadline={term?.resultsPublishedAt ? `Assignment results on ${formatDate(term.resultsPublishedAt)}` : null}
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
        title={`You're all set · ${allocation.room} · Bed ${allocation.bed}`}
        deadline={home.checkedIn ? null : term?.checkInStart ? `Check-in ${range(term.checkInStart, term.checkInEnd)}` : null}
        deadlineIcon={CalendarCheck}
        action={
          <Button variant="primary" size="lg" to="/student/room">
            View My Room
          </Button>
        }
      >
        {home.checkedIn ? 'You are checked in. Report problems in your Room from Requests.' : `Bring your student ID to the ${allocation.block} desk.`}
      </NextAction>
    )
  }

  const cards = {
    application: app
      ? { value: app.status, note: [app.id, app.roomTypeName, app.roomClassName].filter(Boolean).join(' · '), to: `/student/applications/${app.id}` }
      : { value: 'No application yet', note: term ? `${term.name} · not started` : 'Not started', to: '/student/applications' },
    room: allocation
      ? { value: `${allocation.room} · Bed ${allocation.bed}`, note: [allocation.block, allocation.floor].filter(Boolean).join(' · '), to: '/student/room' }
      : { value: 'Not assigned', note: 'Assigned after the review and assignment run' },
    payments:
      home.invoices?.total === 0
        ? { value: 'No invoices', note: 'The deposit Invoice is issued when you submit', to: '/student/invoices' }
        : home.invoices?.due
          ? { value: `${home.invoices.due} due`, note: dueInvoice ? `${formatVnd(dueInvoice.amount)} · due ${formatDate(dueInvoice.dueAt)}` : 'See Payments', to: '/student/invoices' }
          : { value: '0 due', note: 'All Invoices are paid', to: '/student/invoices' },
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

      {next}

      <div className="hidden shrink-0 items-stretch gap-6 lg:flex">
        <StatusCard icon={FileText} label="Application" {...cards.application} />
        <StatusCard icon={Bed} label="My Room" {...cards.room} />
        <StatusCard icon={CreditCard} label="Payments" {...cards.payments} />
        <StatusCard icon={Wrench} label="Requests" value={`${home.openRequests ?? 0} open`} note="Maintenance and Room-Change Requests" to={allocation ? '/student/requests' : undefined} />
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
          <StatusRow icon={LogIn} value="Check-in" note={[range(term.checkInStart, term.checkInEnd), allocation.block].filter(Boolean).join(' · ')} to="/student/room" />
        )}
        <StatusRow icon={CreditCard} value={`Payments · ${cards.payments.value}`} note={cards.payments.note} to={cards.payments.to} />
        {allocation && <StatusRow icon={Wrench} value={`Requests · ${home.openRequests ?? 0} open`} note="Maintenance and Room-Change Requests" to="/student/requests" />}
      </StatusList>

      <LatestNotification />

      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        <TermTimeline term={term} milestones={milestones} className="lg:flex-1" />
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
      <span className="text-sm font-medium text-fg-tertiary">Latest notification</span>
      <span className="text-base font-medium text-fg">{n.title}</span>
      <span className="text-sm text-fg-tertiary">{formatDateTime(n.createdAt)}</span>
    </Link>
  )
}

export default function StudentHome() {
  const { term } = useSession()
  const home = useQuery(['home', term?.id], ({ signal }) => api.me.home({ termId: term?.id }, { signal }))
  useMobileBar(home.data?.firstName ? `Hi, ${home.data.firstName}` : 'Home')
  return (
    <StudentContainer className="flex flex-col gap-3 pt-2 pb-4 lg:h-full lg:min-h-0 lg:gap-5 lg:py-6">
      {home.data === undefined && <h1 className="sr-only">Home</h1>}
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
