import { useState } from 'react'
import { Link } from 'react-router'
import { Bed, CalendarCheck, ChevronRight, Clock, CreditCard, FileText, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useMobileBar } from '@/components/layout/MobileBar'
import { useNotifications } from '@/components/layout/Notifications'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { ErrorState, LoadingState, QueryState } from '@/components/ui/States'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { catalogHelpers, useCatalog } from './apply/wizard'
import { DormitoryBoard, RegistrationPeriodCard } from './board'
import { CompareClassesModal } from './shared'
import { NextStepBanner } from '@/components/student/NextStepBanner'
import { StatCard } from '@/components/student/StatCard'
import { TermTimeline } from '@/components/student/TermTimeline'
import { campusDaysUntil } from '@/components/student/campusDays'
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

const range = (a, b) => (a ? `${formatDate(a)}${b ? ` – ${formatDate(b)}` : ''}` : '—')

/** "Closes in 3 days (20/11/2026)", counted in campus calendar days; "Closes today" on the last day. */
function closesIn(iso) {
  const n = campusDaysUntil(iso)
  if (n == null || n < 0) return null
  if (n === 0) return t('Closes today ({date})', { date: formatDate(iso) })
  return t(n === 1 ? 'Closes in {n} day ({date})' : 'Closes in {n} days ({date})', { n, date: formatDate(iso) })
}

/**
 * The one next step on Home, computed on render from the home data (no state, no effect). Priority: an unpaid
 * Invoice → apply while registration is open → an Application in review → the Room. The same conditions as before
 * decide what is possible; only the presentation changed.
 */
function getNextStep(home) {
  const stage = stageOf(home)
  const { term, application: app, allocation, dueInvoice } = home
  if (dueInvoice) {
    return {
      tone: 'warning',
      icon: CreditCard,
      title: dueInvoice.dueAt
        ? t('Pay {amount} by {date}', { amount: formatVnd(dueInvoice.amount), date: formatDateTime(dueInvoice.dueAt) })
        : t('Pay {amount}', { amount: formatVnd(dueInvoice.amount) }),
      meta: tr(dueInvoice.title) || null,
      detail: stage === 'awaiting-deposit' ? t('Unpaid Applications expire at the deadline.') : stage === 'allocated' ? t('An unpaid balance blocks check-in.') : null,
      cta: { label: 'Pay now', to: `/student/invoices/${dueInvoice.id}/pay` },
    }
  }
  if (stage === 'new') {
    const open = Boolean(term?.registrationOpen)
    return {
      tone: open ? 'primary' : 'neutral',
      icon: FileText,
      title: term ? t('Apply for a place for {term}', { term: term.name }) : t('Apply for a dormitory Bed'),
      meta: open ? closesIn(term?.registrationClosesAt) : null,
      detail: t('Choose a Room Type and Room Class. Pay the deposit to submit; the dormitory assigns your Room and Bed after review.'),
      cta: { label: 'Apply now', to: '/student/apply/term', disabled: !open },
      reason: open ? null : t('Registration is not open yet.'),
    }
  }
  if (stage === 'awaiting-deposit') {
    // The Deposit is claimed: nothing is due while a Manager checks the transfer.
    return {
      tone: 'info',
      icon: Clock,
      title: t('Your Deposit transfer is being confirmed'),
      detail: t('A Manager checks the transfer against the bank statement; your Application is submitted once it is confirmed.'),
      cta: { label: 'View application', to: `/student/applications/${app.id}` },
    }
  }
  if (stage === 'applied' || !allocation) {
    return {
      tone: 'info',
      icon: CalendarCheck,
      title: term?.resultsPublishedAt ? t('Room results on {date}', { date: formatDate(term.resultsPublishedAt) }) : t('Your Application is under review'),
      detail: t('The dormitory office reviews Applications after registration closes, then assigns Rooms and Beds.'),
      cta: { label: 'View application', to: `/student/applications/${app.id}` },
    }
  }
  return {
    tone: 'success',
    icon: Bed,
    title: t('You live in Room {room} · Bed {bed}', { room: allocation.room, bed: allocation.bed }),
    meta: !home.checkedIn && term?.checkInStart ? t('Check-in {dates}', { dates: range(term.checkInStart, term.checkInEnd) }) : null,
    detail: home.checkedIn
      ? t('You live in this Room. Report problems in your Room from Requests.')
      : t('Pay the Balance; the door code comes on My Room when check-in starts. The {block} desk hands over the keys and items.', { block: tr(allocation.block) }),
    cta: { label: 'My Room', to: '/student/room' },
  }
}

// Term milestones shown on Home (static labels; the dates come from the Term).
const MILESTONES = [
  ['Registration opens', 'registrationOpensAt'],
  ['Registration closes', 'registrationClosesAt'],
  ['Room results', 'resultsPublishedAt'],
  ['Rent due', 'balanceDueAt'],
  ['Check-in', 'checkInStart', 'checkInEnd'],
  ['Term starts', 'stayStart'],
]

function RoomTypesCard() {
  const [open, setOpen] = useState(false)
  const catalog = useCatalog()
  const { fromPrice } = catalogHelpers(catalog.data)
  return (
    <Card padding="lg" className="flex min-w-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-card-title text-text">{t('Room types')}</h2>
        <p className="text-small text-text-muted">{t('Lowest Term price per Bed.')}</p>
      </div>
      <div className="flex flex-col">
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
                  <span className="text-base font-medium text-fg num nowrap">{formatVnd(fromPrice(type.id))}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
      <Button variant="text" iconAfter={ChevronRight} iconSize={16} className="self-start text-link" onClick={() => setOpen(true)}>
        Compare Room Classes
      </Button>
      <CompareClassesModal open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

function HomeContent({ home }) {
  const stage = stageOf(home)
  const { term, application: app, allocation, dueInvoice } = home
  const step = getNextStep(home)

  // One-line summaries for the four cards, in the students' words (no internal process names).
  const cards = {
    application: app
      ? { value: tr(app.status), description: [app.id, tr(app.roomTypeName), tr(app.roomClassName)].filter(Boolean).join(' · '), to: `/student/applications/${app.id}` }
      : { value: t('No application yet'), description: term ? t('{term} · not started', { term: term.name }) : t('Not started'), to: '/student/applications' },
    room: allocation
      ? {
          value: t('{room} · Bed {bed}', { room: allocation.room, bed: allocation.bed }),
          description:
            !home.checkedIn && term?.checkInStart
              ? t('Check-in {dates}', { dates: range(term.checkInStart, term.checkInEnd) })
              : [allocation.block && t('Building {code}', { code: allocation.block }), allocation.floor != null && t('Floor {n}', { n: allocation.floor })].filter(Boolean).join(' · '),
          to: '/student/room',
        }
      : {
          value: t('Not assigned'),
          description: term?.resultsPublishedAt ? t('Results on {date}', { date: formatDate(term.resultsPublishedAt) }) : t('Assigned after your Application is reviewed'),
          to: '/student/room',
        },
    payments:
      home.invoices?.total === 0
        ? { value: t('No invoices'), description: t('The deposit Invoice is issued when you submit'), to: '/student/invoices' }
        : home.invoices?.due
          ? { value: t('{n} due', { n: home.invoices.due }), description: dueInvoice ? t('{amount} · due {date}', { amount: formatVnd(dueInvoice.amount), date: formatDate(dueInvoice.dueAt) }) : t('See Payments'), to: '/student/invoices' }
          : { value: t('{n} due', { n: 0 }), description: t('All Invoices are paid'), to: '/student/invoices' },
  }

  // Milestones before today are done; the first one after today is current.
  const now = new Date()
  const firstUpcoming = MILESTONES.findIndex(([, key]) => term?.[key] && new Date(term[key]) > now)
  const milestones = MILESTONES.map(([label, key, endKey], i) => ({
    label,
    date: endKey ? range(term?.[key], term?.[endKey]) : term?.[key] ? formatDate(term[key]) : '—',
    state: firstUpcoming === -1 || i < firstUpcoming ? 'done' : i === firstUpcoming ? 'current' : 'upcoming',
  }))

  return (
    <>
      <h1 className="text-page-title text-text max-lg:sr-only">{greeting(home.firstName)}</h1>

      <NextStepBanner step={step} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Application" {...cards.application} />
        <StatCard icon={Bed} label="My Room" {...cards.room} />
        <StatCard icon={CreditCard} label="Payments" {...cards.payments} />
        <StatCard icon={Wrench} label="Requests" value={t('{n} open', { n: home.openRequests ?? 0 })} description="Maintenance and room changes" to="/student/requests" />
      </div>

      <LatestNotification />

      <TermTimeline
        title={term?.name ? t('{name} timeline', { name: term.name }) : t('Term timeline')}
        subtitle={term?.stayStart ? t('Term {start} – {end}', { start: formatDate(term.stayStart), end: formatDate(term.stayEnd) }) : null}
        milestones={milestones}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-6">
        <DormitoryBoard />
        <div className="flex min-w-0 flex-col gap-4">
          <RegistrationPeriodCard />
          {stage !== 'allocated' && <RoomTypesCard />}
        </div>
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
