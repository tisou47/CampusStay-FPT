import { useState } from 'react'
import { Building, CircleCheck, ClipboardCheck, Gauge, Hand, KeyRound, LogIn, LogOut, TriangleAlert, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { StageNow } from '@/components/layout/FlowTrail'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { CapacityRows, DetailTip, Journey, Panel, WorkList } from '@/components/ui/Work'
import { formatDate, formatDateTime, formatDuration, formatNumber, formatRelative, formatTimeLeft, greeting as greet } from '@/lib/format'
import { attentionText } from '@/lib/attention'
import { termJourney } from '@/lib/termJourney'
import { t, tr } from '@/i18n'

// SCR-HOME-02 Staff home "Today" (Change Spec v2 §11.2), rebuilt around the person's work: their shift, the
// requests they are in charge of, what the Block needs today and where the Term stands. Each line carries its action.
// Reads GET /dashboards/staff, /block-staff/me, /maintenance-requests (mine, unassigned), /check-in/today,
// /door-codes (counts), /meter-periods + readings summary, /inspection-runs/current.

function greeting(name) {
  const first = name?.trim().split(/\s+/).at(-1)
  return first ? `${greet()}, ${first}` : greet()
}

const severityTone = { error: 'error', warning: 'warning', info: 'info', neutral: undefined }
const attentionIcon = { room: Building, maintenance: Wrench, 'check-out': LogOut, 'meter-period': Gauge }
const STAFF_KINDS = new Set(Object.keys(attentionIcon))

/** Overdue in whole days once a day late ("5 days overdue"), else hours: the badge stays short; the tooltip has the exact time. */
const DAY = 86_400_000
function overdueShort(ms) {
  const late = -ms
  return t('{time} overdue', { time: formatDuration(late >= DAY ? Math.floor(late / DAY) * DAY : late) })
}

export default function StaffDashboard() {
  const { user, term, block, blocks } = useSession()
  const { notify, notifyError } = useToast()
  const scope = useScopeQuery()
  const oneBlock = block ?? (blocks.length === 1 ? blocks[0] : null)
  const dash = useQuery(['dashboard', 'staff', scope], ({ signal }) => api.dashboards.staff(scope, { signal }))
  const me = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }))
  const mine = useQuery(['maintenance', 'mine', scope, me.data?.id], ({ signal }) => api.maintenance.list({ ...scope, status: 'open', assigneeId: me.data.id, pageSize: 8 }, { signal }), { enabled: Boolean(me.data?.id) })
  const unassigned = useQuery(['maintenance', 'unassigned', scope], ({ signal }) => api.maintenance.list({ ...scope, status: 'open', assigneeId: 'none', pageSize: 5 }, { signal }))
  const checkIns = useQuery(['dashboard', 'check-in-today', scope], ({ signal }) => api.desk.checkInToday(scope, { signal }), { enabled: Boolean(term) })
  const doorCodes = useQuery(['dashboard', 'door-codes', oneBlock], ({ signal }) => api.doorCodes.list({ block: oneBlock ?? undefined, pageSize: 1 }, { signal }))
  const periods = useQuery(['meters', 'periods', oneBlock], ({ signal }) => api.meters.periods({ block: oneBlock }, { signal }), { enabled: Boolean(oneBlock) })
  const period = periods.data?.items?.find((p) => !p.closed)
  const meters = useQuery(['meters', 'list', period?.id, 'summary'], ({ signal }) => api.meters.list(period.id, { pageSize: 1 }, { signal }), { enabled: Boolean(period) })
  const inspection = useQuery(['dashboard', 'inspection', scope], ({ signal }) => api.inspections.current(scope, { signal }))

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

  const d = dash.data
  const now = new Date()
  /** One request as a row: the row opens it; status, deadline and the whole record are on the row and its tooltip. */
  const requestItem = (r, mine) => {
    const left = r.slaDueAt ? new Date(r.slaDueAt) - now : null
    const late = left != null && left < 0
    const soon = left != null && !late && left <= 4 * 3_600_000
    const status = mine ? (r.status === 'Open' || r.status === 'New' || r.status === 'Unassigned' ? 'Assigned' : r.status) : 'Unassigned'
    const takenAt = taken.get(r.id)
    return {
      id: `${mine ? 'mine' : 'free'}-${r.id}`,
      to: `/staff/maintenance/${r.id}`,
      icon: mine ? Wrench : Hand,
      tone: late ? 'error' : r.priority === 'High' ? 'warning' : mine ? 'info' : undefined,
      title: `${r.room} · ${tr(r.title)}`,
      meta: [r.id, tr(r.category), formatRelative(r.reportedAt)].filter(Boolean).join(' · '),
      // In the Unassigned group the heading already says it; the row keeps its width for the title.
      status: mine ? status : null,
      flags: [
        !mine && r.priority === 'High' && { label: t('Urgent'), variant: 'overdue' },
        (late || soon) && { label: late ? overdueShort(left) : formatTimeLeft(r.slaDueAt), variant: late ? 'overdue' : 'pending', title: formatDateTime(r.slaDueAt) },
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
            { label: t('In charge'), value: mine ? (r.assignee?.name ?? user?.name) : t('Nobody is in charge') },
            { label: t('Reported'), value: formatDateTime(r.reportedAt) },
            { label: t('Due'), value: r.slaDueAt ? `${formatDateTime(r.slaDueAt)} · ${formatTimeLeft(r.slaDueAt)}` : null },
          ]}
        />
      ),
      fresh: Boolean(takenAt) && Date.now() - takenAt < 5000,
      action: mine ? null : { label: 'Assign to me', onClick: () => take.run(r.id), disabled: take.pending || !me.data },
    }
  }
  const mineList = mine.data?.items ?? []
  const freeList = unassigned.data?.items ?? []
  // Taken here but not in "mine" yet (it is reloading): shown at the top of My work already.
  const justTaken = freeList.filter((r) => taken.has(r.id) && !mineList.some((m) => m.id === r.id)).map((r) => ({ ...r, status: 'Assigned' }))
  const myItems = [...justTaken, ...mineList].map((r) => requestItem(r, true))
  const freeItems = freeList.filter((r) => !taken.has(r.id)).map((r) => requestItem(r, false))

  const ci = checkIns.data
  // Before the first check-in day the desk only knows how many will come (contract A-63, window UPCOMING).
  const ciUpcoming = ci?.window === 'UPCOMING'
  // After the last check-in day there is no desk rush: residents live in through their door codes (ADR-23).
  const ciClosed = ci?.window === 'CLOSED'
  const dc = doorCodes.data?.counts
  const ms = meters.data?.summary
  const run = inspection.data?.run
  const blockItems = [
    ci && ci.expected > 0 && ciUpcoming && {
      id: 'check-in',
      icon: LogIn,
      tone: 'info',
      title: t('Check-in opens {date} · {n} expected', { date: formatDate(ci.checkInStart), n: formatNumber(ci.expected) }),
      meta: t('{blocked} not paid yet', { blocked: ci.blocked }),
      action: { label: 'Open desk', to: '/staff/check-in' },
    },
    ci && ci.expected > 0 && !ciUpcoming && !ciClosed && {
      id: 'check-in',
      icon: LogIn,
      tone: ci.waiting ? 'info' : 'success',
      title: t('{n} check-ins expected today', { n: formatNumber(ci.expected) }),
      meta: t('{done} done · {waiting} waiting · {blocked} blocked', { done: ci.checkedIn, waiting: ci.waiting, blocked: ci.blocked }),
      action: { label: 'Open desk', to: '/staff/check-in', primary: ci.waiting > 0 },
    },
    dc && dc.toChange + dc.notSet > 0 && {
      id: 'door-codes',
      icon: KeyRound,
      tone: dc.toChange ? 'warning' : 'info',
      title: t('{n} rooms need a door code', { n: formatNumber(dc.toChange + dc.notSet) }),
      meta: t('{c} to change after a resident left · {s} never set', { c: dc.toChange, s: dc.notSet }),
      action: { label: 'Set codes', to: '/staff/door-codes' },
    },
    ms && ms.missing > 0 && {
      id: 'meters',
      icon: Gauge,
      tone: 'info',
      title: t('{n} rooms without a meter reading for {period}', { n: formatNumber(ms.missing), period: tr(period?.label) }),
      meta: t('{entered} of {due} entered · download the template to fill them in Excel', { entered: ms.entered, due: ms.roomsDue }),
      action: { label: 'Enter readings', to: '/staff/meter-readings' },
    },
    run && run.inspected < run.rooms && {
      id: 'inspection',
      icon: ClipboardCheck,
      tone: run.dueAt && new Date(run.dueAt) < new Date() ? 'error' : 'info',
      title: t('Inspection {name}: {done} of {n} rooms', { name: tr(run.scheduleName), done: run.inspected, n: run.rooms }),
      meta: run.dueAt ? t('Due {date}', { date: formatDate(run.dueAt) }) : null,
      action: { label: 'Continue', to: '/staff/inspections' },
    },
    ...(d?.attention ?? [])
      // Applications, payments and the proposal are Managers' work (ADR-19).
      .filter((a) => STAFF_KINDS.has(a.kind))
      .map((a) => ({
        id: `att-${a.id}`,
        icon: attentionIcon[a.kind] ?? TriangleAlert,
        tone: severityTone[a.severity],
        title: attentionText(a).title,
        meta: attentionText(a).body,
        action: a.link ? { label: a.cta ?? 'Open', to: a.link } : null,
      })),
  ].filter(Boolean)

  const journey = termJourney(term, {
    checkin: ci && ci.expected && !ciClosed ? (ciUpcoming ? t('Opens {date} · {n} expected', { date: formatDate(ci.checkInStart), n: ci.expected }) : t('{done} of {n} checked in today', { done: ci.checkedIn, n: ci.expected })) : undefined,
  })
  const myOpen = me.data?.open
  const late = myItems.filter((i) => i.tone === 'error').length

  return (
    <>
      <div className="flex shrink-0 items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-h1 font-semibold text-fg">{greeting(user?.name)}</h1>
          <p className="text-base text-fg-secondary">
            {[formatDate(new Date()), term?.name, oneBlock ? t('Block {code}', { code: oneBlock }) : blocks.length ? t('Blocks: {list}', { list: blocks.join(', ') }) : null, me.data ? t(me.data.onDuty ? 'On duty' : 'Off duty') : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={LogOut} to="/staff/check-out">
            Check-out desk
          </Button>
          <Button variant="primary" icon={LogIn} to="/staff/check-in">
            Check-in desk
          </Button>
        </div>
      </div>

      <StaleNotice query={dash} />

      {term && (
        <Panel title={t('Term {name}', { name: term.name })} subtitle="Where the term stands. The highlighted stage is now." className="shrink-0" bodyClassName="overflow-visible pt-1">
          <Journey steps={journey} />
          <StageNow role="staff" term={term} />
        </Panel>
      )}

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Wrench} label="In your charge" value={formatNumber(myOpen)} note={late ? t('{n} overdue', { n: late }) : me.data ? t('{n} resolved in 7 days', { n: me.data.resolved7d }) : null} noteTone={late ? 'error' : 'secondary'} />
        <KpiTile icon={Hand} label="Unassigned" value={formatNumber(unassigned.data?.total)} note={unassigned.data?.summary?.urgentUnassigned ? t('{n} urgent', { n: unassigned.data.summary.urgentUnassigned }) : 'Requests waiting for someone'} noteTone={unassigned.data?.summary?.urgentUnassigned ? 'error' : 'secondary'} />
        <KpiTile
          icon={LogIn}
          label="Check-ins today"
          value={ci && !ciUpcoming && !ciClosed ? `${formatNumber(ci.checkedIn)} / ${formatNumber(ci.expected)}` : '—'}
          note={ciUpcoming ? t('Opens {date} · {n} expected', { date: formatDate(ci.checkInStart), n: formatNumber(ci.expected) }) : ciClosed ? t('Check-in closed on {date}', { date: formatDate(ci.checkInEnd) }) : ci ? t('{n} waiting at the desk', { n: ci.waiting }) : 'No check-in window today'}
        />
        <KpiTile icon={Gauge} label="Meter readings" value={ms ? `${formatNumber(ms.entered)} / ${formatNumber(ms.roomsDue)}` : '—'} note={period ? t('Period {label}', { label: tr(period.label) }) : null} />
      </div>

      <div className="grid min-h-80 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_280px] min-[1440px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_320px] gap-4">
        <Panel
          title="My work"
          subtitle={me.data ? t('{n} requests · most urgent first', { n: myItems.length }) : 'Requests in your charge'}
          action={
            <Button variant="text" size="sm" to="/staff/maintenance">
              All requests
            </Button>
          }
        >
          <QueryState query={me.data ? mine : me} compact isEmpty={() => false}>
            {() => (
              <>
                <WorkList items={myItems} empty={<EmptyBlock icon={CircleCheck} title="You have nothing to do. Nice work!" className="py-6">Take a request below, or wait for routing to give you one while you are on duty.</EmptyBlock>} />
                {freeItems.length > 0 && (
                  <>
                    <p className="pt-3 pb-1 text-sm font-semibold tracking-wide text-fg-tertiary uppercase">{t('Unassigned')}</p>
                    <WorkList items={freeItems} />
                  </>
                )}
              </>
            )}
          </QueryState>
        </Panel>

        <Panel title="Your block today" subtitle="Desk, door codes, readings, inspections and rooms">
          <QueryState query={dash} compact isEmpty={() => false}>
            {() => <WorkList items={blockItems} empty={<EmptyBlock icon={ClipboardCheck} title="Your block needs nothing right now" />} />}
          </QueryState>
        </Panel>

        <Panel title="Beds" subtitle="Taken and held beds against the block's capacity">
          <QueryState query={dash} compact isEmpty={(x) => !x.bedsByBlock?.length}>
            {(data) => (
              <CapacityRows
                rows={data.bedsByBlock.map((b) => ({
                  name: t('Block {code}', { code: b.block }),
                  used: b.proposed,
                  total: b.capacity,
                  detail: d?.kpis?.roomsOutOfService ? t('{n} rooms out of service', { n: d.kpis.roomsOutOfService }) : null,
                }))}
              />
            )}
          </QueryState>
        </Panel>
      </div>
    </>
  )
}
