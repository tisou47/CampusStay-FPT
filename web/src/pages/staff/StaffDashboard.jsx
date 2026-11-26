import { useEffect, useState } from 'react'
import { Building, CircleCheck, ClipboardCheck, ClipboardList, DoorOpen, Gauge, Hand, Inbox, KeyRound, LogIn, LogOut, TimerOff, TriangleAlert, Wrench, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { StageWork, stageSteps } from '@/components/layout/FlowTrail'
import { STAFF_STAGES } from '@/app/managerFlow'
import { Button } from '@/components/ui/Button'
import { EmptyBlock, StaleNotice } from '@/components/ui/States'
import { stageTiming } from '@/components/ui/SemesterProgress'
import { CapacityRows, DetailTip } from '@/components/ui/Work'
import { campusClock, formatDate, formatDateTime, formatDuration, formatNumber, formatRelative, formatTime, formatTimeLeft, formatWeekdayDate, greeting as greet } from '@/lib/format'
import { attentionText } from '@/lib/attention'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'
import { WorkInboxPanel } from '@/components/layout/WorkInbox'
import { Block, FilterChip, FloorBars, Queue, Section, ShiftPill, Skeleton, TermLine, Tile, Timeline } from './today/TodayParts'

// SCR-HOME-02 Staff home "Today" (Change Spec v2 §11.2), built around the person's work: their shift, the Term on
// one line, five tiles of what needs handling (they filter the queue), ONE queue of requests and Block tasks sorted
// by when they are due, today's timeline, the Block's floors and the person's last seven days.
// Reads GET /dashboards/staff, /block-staff/me (shifts, workload), /maintenance-requests (mine, unassigned),
// /check-in/today, /check-out (deadline), /door-codes (counts), /meter-periods + readings summary,
// /inspection-runs/current, /inventory/structure + /inventory/rooms per floor (the Block's beds).
// Not in the API yet, so shown as "No data yet" rather than invented: check-in appointments by the hour, resolved
// requests per day, on-time rate, average handling time and the mix of request categories over seven days.

function greeting(name) {
  const first = name?.trim().split(/\s+/).at(-1)
  return first ? `${greet()}, ${first}` : greet()
}

const attentionIcon = { room: Building, maintenance: Wrench, 'check-out': LogOut, 'meter-period': Gauge }
const STAFF_KINDS = new Set(Object.keys(attentionIcon))

/** Overdue in whole days once a day late ("5 days overdue"), else hours: the chip stays short; its title has the exact time. */
const DAY = 86_400_000
function overdueShort(ms) {
  const late = -ms
  return t('{time} overdue', { time: formatDuration(late >= DAY ? Math.floor(late / DAY) * DAY : late) })
}

/** The time now, moved on every minute, so "overdue", the shift's time left and the "Now" line move without a reload. */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const pad = (n) => String(n).padStart(2, '0')
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const isoDay = (c) => `${c.y}-${pad(c.m)}-${pad(c.d)}`

/**
 * Today's time on duty: the person's shifts touching today in minutes from midnight (an overnight shift of yesterday
 * from 0, one of today past 1440), back-to-back shifts joined into one span (07:00–15:00 then 15:00–23:00 is one
 * span). `fromYesterday`: the span began the evening before; `start`/`end`: the "HH:mm" shown.
 */
function dutySpans(shifts, c) {
  const today = c.dow + 1
  const yesterday = today === 1 ? 7 : today - 1
  const parts = []
  for (const s of shifts) {
    const [a, b] = [minutesOf(s.start), minutesOf(s.end)]
    if (s.weekday === today) parts.push({ from: a, to: a < b ? b : 1440 + b, start: s.start, end: s.end })
    if (s.weekday === yesterday && a >= b && b > 0) parts.push({ from: 0, to: b, start: s.start, end: s.end, fromYesterday: true })
  }
  parts.sort((x, y) => x.from - y.from)
  const spans = []
  for (const p of parts) {
    const last = spans[spans.length - 1]
    if (last && p.from <= last.to) {
      if (p.to > last.to) Object.assign(last, { to: p.to, end: p.end })
    } else spans.push({ ...p })
  }
  return spans
}

/** The time on duty going on now (back-to-back shifts count as one) with the minutes left, or null. */
function currentShift(shifts, c) {
  const now = c.h * 60 + c.min
  const span = dutySpans(shifts, c).find((s) => s.from <= now && now < s.to)
  return span ? { start: span.start, end: span.end, left: span.to - now } : null
}

/** Where an item goes: past its deadline, due today (or now-ish), or later. */
function groupOf(dueAt, c, now) {
  if (!dueAt) return 'today'
  const due = new Date(dueAt)
  if (due < now) return 'overdue'
  return campusClock(due).day <= c.day ? 'today' : 'upcoming'
}

const FILTERS = {
  overdue: { label: 'Overdue', test: (i) => i.group === 'overdue' },
  urgent: { label: 'Urgent', test: (i) => i.urgent },
  mine: { label: 'My work', test: (i) => i.kind === 'mine' },
  unassigned: { label: 'Unassigned', test: (i) => i.kind === 'free' },
  desk: { label: 'Check-in / check-out today', test: (i) => i.desk },
}

export default function StaffDashboard() {
  const { user, term, terms, block, blocks } = useSession()
  const { notify, notifyError } = useToast()
  const scope = useScopeQuery()
  const oneBlock = block ?? (blocks.length === 1 ? blocks[0] : null)
  const now = useMinuteClock()
  const c = campusClock(now)

  // Every block loads on its own, at the same time; each shows its own skeleton, error and empty state.
  const dash = useQuery(['dashboard', 'staff', scope], ({ signal }) => api.dashboards.staff(scope, { signal }))
  const me = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }))
  const mine = useQuery(['maintenance', 'mine', scope, me.data?.id], ({ signal }) => api.maintenance.list({ ...scope, status: 'open', assigneeId: me.data.id, pageSize: 20 }, { signal }), { enabled: Boolean(me.data?.id) })
  const unassigned = useQuery(['maintenance', 'unassigned', scope], ({ signal }) => api.maintenance.list({ ...scope, status: 'open', assigneeId: 'none', pageSize: 10 }, { signal }))
  const checkIns = useQuery(['dashboard', 'check-in-today', scope], ({ signal }) => api.desk.checkInToday(scope, { signal }), { enabled: Boolean(term) })
  const checkOuts = useQuery(['dashboard', 'check-out', scope], ({ signal }) => api.desk.checkOutList({ ...scope, pageSize: 1 }, { signal }), { enabled: Boolean(term) })
  const doorCodes = useQuery(['dashboard', 'door-codes', oneBlock], ({ signal }) => api.doorCodes.list({ block: oneBlock ?? undefined, pageSize: 1 }, { signal }))
  const periods = useQuery(['meters', 'periods', oneBlock], ({ signal }) => api.meters.periods({ block: oneBlock }, { signal }), { enabled: Boolean(oneBlock) })
  const period = periods.data?.items?.find((p) => !p.closed)
  const meters = useQuery(['meters', 'list', period?.id, 'summary'], ({ signal }) => api.meters.list(period.id, { pageSize: 1 }, { signal }), { enabled: Boolean(period) })
  const inspection = useQuery(['dashboard', 'inspection', scope], ({ signal }) => api.inspections.current(scope, { signal }))
  // The Block's floors: the same floor views Rooms and beds reads (and the same cache key, so it opens at once).
  const structure = useQuery(['inventory', 'structure', oneBlock], ({ signal }) => api.inventory.structure({ block: oneBlock }, { signal }), { enabled: Boolean(oneBlock) })
  const floorList = structure.data?.blocks?.find((b) => b.block === oneBlock)?.floors ?? []
  const floorData = useQuery(
    ['inventory', 'block-floors', term?.id, oneBlock, floorList.join()],
    async ({ signal }) => {
      const list = await Promise.all(floorList.map((f) => api.inventory.floor({ termId: term?.id, block: oneBlock, floor: f }, { signal })))
      return floorList.map((f, i) => ({ floor: f, data: list[i] }))
    },
    { enabled: Boolean(oneBlock && floorList.length) },
  )

  // Requests taken on this screen move to "My work" at once (and slide in) while the lists reload.
  const [taken, setTaken] = useState(() => new Map())
  const take = useMutation((id) => api.maintenance.update(id, { assigneeId: me.data.id }), {
    invalidates: ['maintenance', 'dashboard', 'me-duty'],
    onSuccess: (_, id) => {
      setTaken((m) => new Map(m).set(id, Date.now()))
      notify({ title: t('You are now in charge of {id}', { id }), message: 'It is in your list; start it when you get there.' })
    },
    onError: (e) => notifyError(e, 'Could not take the request'),
  })
  const [filter, setFilter] = useState(null)
  const toggle = (key) => setFilter((f) => (f === key ? null : key))

  const d = dash.data
  const ci = checkIns.data
  // Before the first check-in day the desk only knows how many will come (contract A-63, window UPCOMING).
  const ciUpcoming = ci?.window === 'UPCOMING'
  // After the last check-in day there is no desk rush: residents live in through their door codes (ADR-23).
  const ciClosed = ci?.window === 'CLOSED'
  const ciOpen = Boolean(ci) && !ciUpcoming && !ciClosed
  const co = checkOuts.data
  const coToday = Boolean(co?.checkOutBy) && co.checkOutBy.slice(0, 10) === isoDay(c) && co.pendingCount > 0
  const dc = doorCodes.data?.counts
  const ms = meters.data?.summary
  const run = inspection.data?.run

  // ---------------------------------------------------------------- the queue
  /** One maintenance request as a queue line: its title opens it (tooltip: the whole record), the button acts on it. */
  const requestItem = (r, isMine) => {
    const left = r.slaDueAt ? new Date(r.slaDueAt) - now : null
    const late = left != null && left < 0
    const soon = left != null && !late && left <= 4 * 3_600_000
    const urgent = r.priority === 'High'
    const status = isMine ? (r.status === 'Open' || r.status === 'New' || r.status === 'Unassigned' ? 'Assigned' : r.status) : 'Unassigned'
    const takenAt = taken.get(r.id)
    const group = late ? 'overdue' : !r.slaDueAt || soon || urgent ? 'today' : groupOf(r.slaDueAt, c, now)
    return {
      id: `${isMine ? 'mine' : 'free'}-${r.id}`,
      kind: isMine ? 'mine' : 'free',
      group,
      urgent,
      due: r.slaDueAt ? new Date(r.slaDueAt).getTime() : null,
      to: `/staff/maintenance/${r.id}`,
      icon: isMine ? Wrench : Hand,
      tone: late ? 'error' : urgent ? 'brand' : isMine ? 'info' : group === 'upcoming' ? 'neutral' : 'brand',
      title: `${r.room} · ${tr(r.title)}`,
      meta: [r.id, tr(r.category), formatRelative(r.reportedAt, now)].filter(Boolean).join(' · '),
      chips: [
        late && { label: overdueShort(left), tone: 'error', title: formatDateTime(r.slaDueAt) },
        !late && urgent && { label: t('Urgent'), tone: 'brand' },
        !late && soon && { label: formatTimeLeft(r.slaDueAt, now), tone: 'brand', title: formatDateTime(r.slaDueAt) },
        !late && !soon && group === 'upcoming' && { label: formatTimeLeft(r.slaDueAt, now), tone: 'neutral', title: formatDateTime(r.slaDueAt) },
        isMine && !late && { label: t(status), tone: 'info' },
      ].filter(Boolean),
      details: (
        <DetailTip
          title={`${r.room} · ${tr(r.title)}`}
          rows={[
            { label: t('Room'), value: r.room },
            { label: t('Code'), value: r.id },
            { label: t('Category'), value: tr(r.category) },
            { label: t('Priority'), value: tr(r.priority) },
            { label: t('Status'), value: t(status) },
            { label: t('In charge'), value: isMine ? (r.assignee?.name ?? user?.name) : t('Nobody is in charge') },
            { label: t('Reported'), value: formatDateTime(r.reportedAt) },
            { label: t('Due'), value: r.slaDueAt ? `${formatDateTime(r.slaDueAt)} · ${formatTimeLeft(r.slaDueAt, now)}` : null },
          ]}
        />
      ),
      fresh: Boolean(takenAt) && Date.now() - takenAt < 5000,
      action: isMine
        ? { label: 'Handle', to: `/staff/maintenance/${r.id}` }
        : { label: 'Assign to me', onClick: () => take.run(r.id), disabled: take.pending || !me.data },
    }
  }
  const mineList = mine.data?.items ?? []
  const freeList = unassigned.data?.items ?? []
  // Taken here but not in "mine" yet (it is reloading): shown in My work already.
  const justTaken = freeList.filter((r) => taken.has(r.id) && !mineList.some((m) => m.id === r.id)).map((r) => ({ ...r, status: 'Assigned' }))
  const myItems = [...justTaken, ...mineList].map((r) => requestItem(r, true))
  const freeItems = freeList.filter((r) => !taken.has(r.id)).map((r) => requestItem(r, false))

  const dayGroup = (dueAt) => groupOf(dueAt, c, now)
  const blockItems = [
    ci && ci.expected > 0 && ciUpcoming && {
      id: 'check-in',
      desk: true,
      group: 'upcoming',
      due: new Date(ci.checkInStart).getTime(),
      icon: LogIn,
      tone: 'neutral',
      title: t('Check-in opens {date} · {n} expected', { date: formatDate(ci.checkInStart), n: formatNumber(ci.expected) }),
      meta: t('{blocked} not paid yet', { blocked: ci.blocked }),
      chips: [{ label: formatTimeLeft(ci.checkInStart, now), tone: 'neutral' }],
      action: { label: 'Open', to: '/staff/check-in' },
    },
    ciOpen && ci.expected > 0 && {
      id: 'check-in',
      desk: true,
      group: 'today',
      icon: LogIn,
      tone: ci.waiting ? 'brand' : 'info',
      title: t('{n} check-ins expected today', { n: formatNumber(ci.expected) }),
      meta: [t('{done} done · {waiting} waiting · {blocked} blocked', { done: ci.checkedIn, waiting: ci.waiting, blocked: ci.blocked }), t('{n} waiting at the desk', { n: ci.waiting })].join(' · '),
      progress: { value: ci.checkedIn, max: ci.expected, label: t('Check-ins today') },
      chips: [{ label: t('Today'), tone: 'brand' }],
      action: { label: 'Open', to: '/staff/check-in' },
    },
    coToday && {
      id: 'check-out-today',
      desk: true,
      group: 'today',
      icon: LogOut,
      tone: 'brand',
      title: t('{n} students check out today', { n: formatNumber(co.pendingCount) }),
      meta: t('Check-out deadline {date}', { date: formatDate(co.checkOutBy) }),
      chips: [{ label: t('Today'), tone: 'brand' }],
      action: { label: 'Open', to: '/staff/check-out' },
    },
    dc && dc.toChange + dc.notSet > 0 && {
      id: 'door-codes',
      group: 'today',
      icon: KeyRound,
      tone: 'brand',
      title: t('{n} rooms need a door code', { n: formatNumber(dc.toChange + dc.notSet) }),
      meta: t('{c} to change after a resident left · {s} never set', { c: dc.toChange, s: dc.notSet }),
      chips: [{ label: t('Today'), tone: 'brand' }],
      action: { label: 'Set codes', to: '/staff/door-codes' },
    },
    ms && ms.missing > 0 && (() => {
      const dueAt = meters.data?.period?.dueAt
      const group = dayGroup(dueAt)
      return {
        id: 'meters',
        group,
        due: dueAt ? new Date(dueAt).getTime() : null,
        icon: Gauge,
        tone: group === 'overdue' ? 'error' : group === 'today' ? 'brand' : 'neutral',
        title: t('{n} rooms without a meter reading for {period}', { n: formatNumber(ms.missing), period: tr(period?.label) }),
        // The bar says how many are entered; the link under it gets the template to fill them in Excel.
        progress: { value: ms.entered, max: ms.roomsDue, label: t('Meter readings') },
        extra: { label: 'Download the Excel template', onClick: () => api.meters.template(period.id, period.label).catch((e) => notifyError(e, 'Could not download the template')) },
        chips: [
          dueAt &&{ label: group === 'overdue' ? overdueShort(new Date(dueAt) - now) : formatTimeLeft(dueAt, now), tone: group === 'overdue' ? 'error' : group === 'today' ? 'brand' : 'neutral', title: formatDateTime(dueAt) },
        ].filter(Boolean),
        action: { label: 'Enter readings', to: '/staff/meter-readings' },
      }
    })(),
    run && run.inspected < run.rooms && (() => {
      const group = dayGroup(run.dueAt)
      return {
        id: 'inspection',
        group,
        due: run.dueAt ? new Date(run.dueAt).getTime() : null,
        icon: ClipboardCheck,
        tone: group === 'overdue' ? 'error' : group === 'today' ? 'brand' : 'neutral',
        // The schedule's name already says "Inspection…": it is the title as it is, never prefixed again.
        title: tr(run.scheduleName),
        meta: run.dueAt ? t('Due {date}', { date: formatDate(run.dueAt) }) : null,
        progress: { value: run.inspected, max: run.rooms, label: t('Rooms inspected') },
        chips: run.dueAt ? [{ label: group === 'overdue' ? overdueShort(new Date(run.dueAt) - now) : formatTimeLeft(run.dueAt, now), tone: group === 'overdue' ? 'error' : group === 'today' ? 'brand' : 'neutral', title: formatDateTime(run.dueAt) }] : [],
        action: { label: 'Continue', to: '/staff/inspections' },
      }
    })(),
    ...(d?.attention ?? [])
      // Applications, payments and the proposal are Managers' work (ADR-19).
      .filter((a) => STAFF_KINDS.has(a.kind))
      .map((a) => {
        const late = a.severity === 'error'
        return {
          id: `att-${a.id}`,
          group: late ? 'overdue' : 'today',
          urgent: a.kind === 'maintenance',
          desk: a.kind === 'check-out',
          icon: attentionIcon[a.kind] ?? TriangleAlert,
          tone: late ? 'error' : a.severity === 'info' || a.severity === 'neutral' ? 'info' : 'brand',
          title: attentionText(a).title,
          meta: attentionText(a).body,
          chips: [{ label: late ? t('Overdue') : a.kind === 'maintenance' ? t('Urgent') : t('Today'), tone: late ? 'error' : 'brand' }],
          action: a.link ? { label: a.cta ?? 'Open', to: a.link } : null,
        }
      }),
  ].filter(Boolean)

  const all = [...myItems, ...freeItems, ...blockItems].map((i) => ({ ...i, primary: i.group !== 'upcoming' }))
  const visible = filter ? all.filter(FILTERS[filter].test) : all
  const byDue = (a, b) => (a.due ?? Infinity) - (b.due ?? Infinity)
  const groups = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Coming up' },
  ].map((g) => ({ ...g, items: visible.filter((i) => i.group === g.key).sort(byDue) }))

  // The tiles count what their filter shows; "My work" and "Unassigned" count every request, also past the page.
  const queueLoading = (me.loading && !me.data) || (mine.loading && !mine.data) || (unassigned.loading && !unassigned.data) || (dash.loading && !d)
  // The list's own total (Term and Block in the top bar), not /block-staff/me's `open`, which counts every Term and Block.
  const myTotal = Math.max(myItems.length, (mine.data?.total ?? 0) + justTaken.length)
  const freeTotal = Math.max(freeItems.length, (unassigned.data?.total ?? 0) - justTaken.length - freeList.filter((r) => taken.has(r.id) && mineList.some((m) => m.id === r.id)).length)
  const deskToday = (ciOpen ? Math.max(0, ci.expected - ci.checkedIn) : 0) + (coToday ? co.pendingCount : 0)
  const tiles = [
    { key: 'overdue', icon: TimerOff, label: 'Overdue', value: all.filter(FILTERS.overdue.test).length, tone: 'error' },
    { key: 'urgent', icon: Zap, label: 'Urgent', value: all.filter(FILTERS.urgent.test).length, tone: 'brand' },
    { key: 'mine', icon: ClipboardList, label: 'My work', value: myTotal },
    { key: 'unassigned', icon: Inbox, label: 'Unassigned', value: freeTotal },
    { key: 'desk', icon: DoorOpen, label: 'Check-in / check-out today', value: deskToday },
  ]
  const moreThanShown = (filter === 'mine' && myTotal > myItems.length) || (filter === 'unassigned' && freeTotal > freeItems.length)

  // ---------------------------------------------------------------- term
  const journey = stageSteps(STAFF_STAGES, term, undefined, {
    checkin: ci && ci.expected && !ciClosed ? (ciUpcoming ? t('Opens {date} · {n} expected', { date: formatDate(ci.checkInStart), n: ci.expected }) : t('{done} of {n} checked in today', { done: ci.checkedIn, n: ci.expected })) : undefined,
  })
  const doneSteps = journey.filter((s) => s.state === 'done').length
  const nowStep = journey.find((x) => x.state === 'current')
  const nowTiming = nowStep ? stageTiming(nowStep, now) : null
  const termSummary = !term
    ? null
    : !nowStep
      ? t('{term} completed {done}/{n} stages · ended {date}', { term: term.name, done: doneSteps, n: journey.length, date: formatDate(term.stayEnd) })
      : nowTiming && !nowTiming.before && !nowTiming.after
        ? t('{term} · {stage} · {n} days left', { term: term.name, stage: t(nowStep.label), n: nowTiming.left })
        : [term.name, t(nowStep.label), nowStep.note && tr(nowStep.note)].filter(Boolean).join(' · ')
  const nextTerm = term ? (terms ?? []).filter((x) => x.id !== term.id && x.stayStart && term.stayStart && x.stayStart > term.stayStart).sort((a, b) => a.stayStart.localeCompare(b.stayStart))[0] : null
  const nextText = nextTerm
    ? nextTerm.registrationOpensAt
      ? t('Next: {name} · registration from {date}', { name: nextTerm.name, date: formatDate(nextTerm.registrationOpensAt) })
      : t('Next: {name}', { name: nextTerm.name })
    : null

  // What is still open on each screen of the stage, from the figures this page already reads.
  const late = all.filter((i) => i.kind === 'mine' && i.group === 'overdue').length
  const myOpen = me.data?.open
  const stageCounts = {
    '/staff/maintenance': late
      ? { label: t('{n} overdue', { n: late }), tone: 'error' }
      : myOpen
        ? { label: formatNumber(myOpen), tone: 'info', title: t('{n} in your charge', { n: myOpen }) }
        : undefined,
    '/staff/inspections': run && run.inspected < run.rooms ? { label: `${run.inspected}/${run.rooms}`, tone: 'info' } : undefined,
    '/staff/meter-readings': ms
      ? { label: `${formatNumber(ms.entered)}/${formatNumber(ms.roomsDue)}`, tone: ms.missing > 0 ? 'warning' : 'success', title: period ? t('Period {label}', { label: tr(period.label) }) : undefined }
      : undefined,
    '/staff/door-codes': dc && dc.toChange + dc.notSet > 0 ? { label: formatNumber(dc.toChange + dc.notSet), tone: dc.toChange ? 'warning' : 'info' } : undefined,
    '/staff/check-in': ciOpen && ci.expected ? { label: `${formatNumber(ci.checkedIn)}/${formatNumber(ci.expected)}`, tone: ci.waiting ? 'info' : 'success' } : undefined,
  }

  // ---------------------------------------------------------------- shift and today's timeline
  const shifts = me.data?.shifts ?? []
  const shift = me.data ? currentShift(shifts, c) : null
  const pill = !me.data
    ? null
    : shift
      ? {
          tone: 'success',
          text: t('On duty · shift {span} · {time} left', { span: `${shift.start}–${shift.end}`, time: t('{h} h {m} min', { h: Math.floor(shift.left / 60), m: shift.left % 60 }) }),
        }
      : me.data.shiftToday
        ? { tone: 'neutral', text: t('Shift today {span}', { span: me.data.shiftToday }) }
        : { tone: 'neutral', text: t('No shift today') }

  const nowMin = c.h * 60 + c.min
  const blockName = oneBlock ? t('Block {code}', { code: oneBlock }) : null
  const plan = d?.checkInPlan?.days?.find((x) => x.date === isoDay(c))
  // One start and one end per span on duty: back-to-back shifts are not split, a span from last night starts the
  // day as "on duty since", and one running past midnight ends the day as "until … tomorrow".
  const timeline = [
    ...dutySpans(shifts, c).flatMap((s) => [
      s.fromYesterday
        ? { id: `since-${s.start}`, at: 0, time: '00:00', title: t('On duty since {time} yesterday', { time: s.start }), meta: blockName }
        : { id: `start-${s.from}`, at: s.from, time: s.start, title: t('Shift starts'), meta: [t('Desk handover'), blockName].filter(Boolean).join(' · ') },
      s.to > 1440
        ? { id: `end-${s.to}`, at: 1440 - 1, time: s.end, title: t('Shift ends tomorrow at {time}', { time: s.end }), meta: t('Hand over to the next shift') }
        : { id: `end-${s.to}`, at: s.to, time: s.end, title: t('Shift ends'), meta: t('Hand over to the next shift') },
    ]),
    plan?.morning > 0 && { id: 'ci-morning', at: 8 * 60, until: 12 * 60, time: t('AM'), title: t('Check-in · {n} students', { n: formatNumber(plan.morning) }), meta: t('Check-in desk') },
    plan?.afternoon > 0 && { id: 'ci-afternoon', at: 13 * 60, until: 17 * 60, time: t('PM'), title: t('Check-in · {n} students', { n: formatNumber(plan.afternoon) }), meta: t('Check-in desk') },
    run?.date && String(run.date).slice(0, 10) === isoDay(c) && { id: 'insp-start', at: 0, time: '', title: tr(run.scheduleName), meta: t('{done} of {n} rooms', { done: run.inspected, n: run.rooms }) },
    run?.dueAt && campusClock(run.dueAt).day === c.day && (() => {
      const due = campusClock(run.dueAt)
      return { id: 'insp-due', at: due.h * 60 + due.min, time: formatTime(run.dueAt), title: t('Inspection due: {name}', { name: tr(run.scheduleName) }), meta: t('{done} of {n} rooms', { done: run.inspected, n: run.rooms }) }
    })(),
    coToday && { id: 'co', at: 24 * 60 - 1, time: t('Due'), title: t('Check-out deadline · {n} students left', { n: formatNumber(co.pendingCount) }), meta: t('Check-out desk') },
  ]
    .filter(Boolean)
    .map((e) => ({ ...e, past: (e.until ?? e.at) <= nowMin && e.id !== 'co' }))
  const timelineEntries = [...timeline, { id: 'now', at: nowMin, time: formatTime(now), title: t('Now'), now: true }].sort((a, b) => a.at - b.at || (a.now ? 1 : -1))

  // ---------------------------------------------------------------- floors
  const floors = (floorData.data ?? [])
    .map((f) => {
      const used = f.data?.summary?.allocated ?? 0
      const total = f.data?.summary?.beds ?? 0
      return { floor: f.floor, used, total, pct: total ? Math.round((used / total) * 100) : 0, to: `/staff/inventory?block=${encodeURIComponent(oneBlock)}&floor=${f.floor}` }
    })
    .sort((a, b) => b.floor - a.floor)
  const bedsUsed = floors.reduce((s, f) => s + f.used, 0)
  const bedsTotal = floors.reduce((s, f) => s + f.total, 0)
  const floorQuery = !oneBlock ? dash : structure.data === undefined ? structure : floorList.length ? floorData : structure

  return (
    <>
      {/* 1. Greeting and shift (the page fills one screen: the queue and today's schedule scroll inside their cards) */}
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-h1 font-semibold text-fg">{greeting(user?.name)}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-fg-secondary">
            <span>
              {[formatWeekdayDate(now), oneBlock ? t('Block {code}', { code: oneBlock }) : blocks.length ? t('Blocks: {list}', { list: blocks.join(', ') }) : null].filter(Boolean).join(' · ')}
            </span>
            {me.loading && !me.data ? (
              <Skeleton className="h-5 w-48 rounded-full" />
            ) : (
              pill && (
                <ShiftPill tone={pill.tone} title={t(me.data.onDuty ? 'On duty' : 'Off duty')}>
                  {pill.text}
                </ShiftPill>
              )
            )}
          </div>
        </div>
      </div>

      <StaleNotice query={dash} />

      {/* 2. The Term on one line */}
      {term && (
        <TermLine
          done={!nowStep}
          summary={termSummary}
          next={nextText}
          steps={journey}
          below={<StageWork role="staff" term={term} counts={stageCounts} className="border-t border-line pt-3" />}
        />
      )}

      {/* Work inbox (#69): check-out charges and requests nobody has taken */}
      <WorkInboxPanel className="shrink-0" />

      {/* 3. What needs handling: each tile filters the queue */}
      <div role="group" aria-label={t('Filter the work queue')} className="grid shrink-0 grid-cols-2 gap-3 min-[720px]:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {tiles.map(({ key, ...tile }) => (
          <Tile key={key} {...tile} loading={queueLoading} pressed={filter === key} onToggle={() => toggle(key)} />
        ))}
      </div>

      {/* 4. The queue, and today beside it: both fill the rest of the screen and scroll inside */}
      <div className="grid min-h-[34rem] flex-1 shrink-0 grid-cols-1 lg:min-h-64 lg:shrink gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:grid-rows-[minmax(0,1fr)]">
        <Section
          scroll
          className="max-lg:max-h-[36rem]"
          title="Work to do"
          subtitle={t('{n} tasks · sorted by due time', { n: formatNumber(visible.length) })}
          aside={filter && <FilterChip label={FILTERS[filter].label} onClear={() => setFilter(null)} />}
        >
          <p className="-mt-1 text-sm text-fg-tertiary">
            {me.data
              ? t('In your charge: {assigned} · {resolved} resolved in 7 days', { assigned: formatNumber(myTotal), resolved: formatNumber(me.data.resolved7d) })
              : t('Requests in your charge')}
          </p>
          <Block query={me.data ? (mine.data === undefined && mine.error ? mine : unassigned) : me} rows={4}>
            <Queue
              groups={groups}
              empty={
                filter ? (
                  <EmptyBlock icon={CircleCheck} title="Nothing left in this list." className="py-6" />
                ) : (
                  <EmptyBlock
                    icon={CircleCheck}
                    title="You have nothing to do. Nice work!"
                    className="py-6"
                    action={
                      freeTotal > 0 ? (
                        <Button variant="primary" size="sm" onClick={() => setFilter('unassigned')}>
                          {t('View unassigned ({n})', { n: freeTotal })}
                        </Button>
                      ) : undefined
                    }
                  >
                    {t('Take an unassigned request, or wait for routing while you are on duty.')}
                  </EmptyBlock>
                )
              }
            />
            {moreThanShown && (
              <Button variant="text" size="sm" to="/staff/maintenance" className="self-start">
                {t('See all {n} in the maintenance queue', { n: formatNumber(filter === 'mine' ? myTotal : freeTotal) })}
              </Button>
            )}
          </Block>
        </Section>

        <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
          <Section scroll className="min-h-36 flex-1 max-lg:max-h-80" title="Today's schedule" link={{ to: '/staff/schedule', label: 'Work schedule' }}>
            <Block query={me} rows={3}>
              {timeline.length ? <Timeline entries={timelineEntries} /> : <EmptyBlock icon={CircleCheck} title="Nothing scheduled today" className="py-3" />}
              <p className="text-sm text-fg-tertiary">{t('Check-in appointments by the hour: no data yet.')}</p>
            </Block>
          </Section>

          {oneBlock ? (
            <Section scroll className="min-h-52 flex-[1.5] max-lg:max-h-96" title={t('Block {code} today', { code: oneBlock })} link={{ to: '/staff/inventory', label: 'Rooms and beds' }}>
              <Block query={floorQuery} rows={4}>
                {floors.length ? (
                  <>
                    <p className="-mt-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-h2 font-semibold text-fg-brand tabular">{bedsTotal ? Math.round((bedsUsed / bedsTotal) * 100) : 0}%</span>
                      <span className="text-sm text-fg-secondary">
                        {[t('of beds given out'), t('{used} of {total} beds taken', { used: formatNumber(bedsUsed), total: formatNumber(bedsTotal) }), d?.kpis?.roomsOutOfService ? t('{n} rooms out of service', { n: d.kpis.roomsOutOfService }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </p>
                    <FloorBars floors={floors} />
                  </>
                ) : (
                  <EmptyBlock icon={Building} title="No data yet" className="py-3" />
                )}
              </Block>
            </Section>
          ) : (
            <Section scroll className="max-h-[22rem] shrink-0" title="Your blocks today" link={{ to: '/staff/inventory', label: 'Rooms and beds' }}>
              <Block query={dash} rows={3}>
                {(d?.bedsByBlock?.length ?? 0) > 0 ? (
                  <CapacityRows rows={d.bedsByBlock.map((b) => ({ name: t('Block {code}', { code: b.block }), used: b.proposed, total: b.capacity }))} />
                ) : (
                  <EmptyBlock icon={Building} title="No data yet" className="py-3" />
                )}
                {d?.kpis?.roomsOutOfService ? <p className="text-sm text-fg-tertiary">{t('{n} rooms out of service', { n: d.kpis.roomsOutOfService })}</p> : null}
              </Block>
            </Section>
          )}
        </div>
      </div>
    </>
  )
}
