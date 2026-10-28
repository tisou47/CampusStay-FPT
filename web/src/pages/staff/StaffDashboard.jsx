import { Building, ClipboardCheck, Gauge, Hand, KeyRound, LogIn, LogOut, TriangleAlert, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { CapacityRows, Journey, Panel, WorkList } from '@/components/ui/Work'
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import { termJourney } from '@/lib/termJourney'
import { t, tr } from '@/i18n'

// SCR-HOME-02 Staff home "Today" (Change Spec v2 §11.2), rebuilt around the person's work: their shift, the
// requests they are in charge of, what the Block needs today and where the Term stands. Each line carries its action.
// Reads GET /dashboards/staff, /block-staff/me, /maintenance-requests (mine, unassigned), /check-in/today,
// /door-codes (counts), /meter-periods + readings summary, /inspection-runs/current.

function greeting(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = name?.trim().split(/\s+/).at(-1)
  return first ? t(`${part}, {name}`, { name: first }) : t(part)
}

const severityTone = { error: 'error', warning: 'warning', info: 'info', neutral: undefined }
const attentionIcon = { room: Building, maintenance: Wrench, 'check-out': LogOut }
const STAFF_KINDS = new Set(Object.keys(attentionIcon))

function span(ms) {
  const hours = Math.round(ms / 3600000)
  if (hours < 1) return t('{n} min', { n: Math.max(1, Math.round(ms / 60000)) })
  if (hours < 48) return t('{n} h', { n: hours })
  return t('{n} days', { n: Math.round(hours / 24) })
}

/** How soon a request is due, for its line. */
function due(r) {
  if (!r.slaDueAt) return t('Reported {when}', { when: formatRelative(r.reportedAt) })
  const left = new Date(r.slaDueAt) - new Date()
  return left < 0 ? t('Overdue by {time}', { time: span(-left) }) : t('{time} left', { time: span(left) })
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

  const take = useMutation((id) => api.maintenance.update(id, { assigneeId: me.data.id }), {
    invalidates: ['maintenance', 'dashboard', 'me-duty'],
    onSuccess: (_, id) => notify({ title: t('You are now in charge of {id}', { id }), message: 'It is in your list; start it when you get there.' }),
    onError: (e) => notifyError(e, 'Could not take the request'),
  })

  const d = dash.data
  const myItems = (mine.data?.items ?? []).map((r) => {
    const late = r.slaDueAt && new Date(r.slaDueAt) < new Date()
    return {
      id: `mine-${r.id}`,
      icon: Wrench,
      tone: late ? 'error' : r.priority === 'High' ? 'warning' : 'info',
      title: `${r.room} · ${tr(r.title)}`,
      meta: `${r.id} · ${tr(r.category)} · ${due(r)}`,
      badge: { label: r.status, tone: r.status === 'In progress' ? 'info' : 'neutral' },
      action: { label: r.status === 'In progress' ? 'Continue' : 'Open', to: `/staff/maintenance/${r.id}`, primary: late },
    }
  })
  const freeItems = (unassigned.data?.items ?? []).map((r) => ({
    id: `free-${r.id}`,
    icon: Hand,
    tone: r.priority === 'High' ? 'warning' : undefined,
    title: `${r.room} · ${tr(r.title)}`,
    meta: `${r.id} · ${t('Nobody is in charge')} · ${due(r)}`,
    badge: r.priority === 'High' ? { label: 'Urgent', tone: 'error' } : null,
    secondary: { label: 'View', to: `/staff/maintenance/${r.id}` },
    action: { label: 'Take it', onClick: () => take.run(r.id), disabled: take.pending || !me.data },
  }))

  const ci = checkIns.data
  const dc = doorCodes.data?.counts
  const ms = meters.data?.summary
  const run = inspection.data?.run
  const blockItems = [
    ci && ci.expected > 0 && {
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
      title: t('{n} Rooms need a door code', { n: formatNumber(dc.toChange + dc.notSet) }),
      meta: t('{c} to change after a resident left · {s} never set', { c: dc.toChange, s: dc.notSet }),
      action: { label: 'Set codes', to: '/staff/door-codes' },
    },
    ms && ms.missing > 0 && {
      id: 'meters',
      icon: Gauge,
      tone: 'info',
      title: t('{n} Rooms without a meter reading for {period}', { n: formatNumber(ms.missing), period: tr(period?.label) }),
      meta: t('{entered} of {due} entered · download the template to fill them in Excel', { entered: ms.entered, due: ms.roomsDue }),
      action: { label: 'Enter readings', to: '/staff/meter-readings' },
    },
    run && run.inspected < run.rooms && {
      id: 'inspection',
      icon: ClipboardCheck,
      tone: run.dueAt && new Date(run.dueAt) < new Date() ? 'error' : 'info',
      title: t('Inspection {name}: {done} of {n} Rooms', { name: tr(run.scheduleName), done: run.inspected, n: run.rooms }),
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
        title: tr(a.title),
        meta: tr(a.body),
        action: a.link ? { label: a.cta ?? 'Open', to: a.link } : null,
      })),
  ].filter(Boolean)

  const journey = termJourney(term, {
    checkin: ci && ci.expected ? t('{done} of {n} checked in today', { done: ci.checkedIn, n: ci.expected }) : undefined,
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
        <Panel title={t('Term {name}', { name: term.name })} subtitle="Where the Term stands. The highlighted stage is now." className="shrink-0" bodyClassName="overflow-visible pt-1">
          <Journey steps={journey} />
        </Panel>
      )}

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Wrench} label="In your charge" value={formatNumber(myOpen)} note={late ? t('{n} past the time limit', { n: late }) : me.data ? t('{n} resolved in 7 days', { n: me.data.resolved7d }) : null} noteTone={late ? 'error' : 'secondary'} />
        <KpiTile icon={Hand} label="Nobody in charge" value={formatNumber(unassigned.data?.total)} note={unassigned.data?.summary?.urgentUnassigned ? t('{n} urgent', { n: unassigned.data.summary.urgentUnassigned }) : 'Requests waiting for someone'} noteTone={unassigned.data?.summary?.urgentUnassigned ? 'error' : 'secondary'} />
        <KpiTile icon={LogIn} label="Check-ins today" value={ci ? `${formatNumber(ci.checkedIn)} / ${formatNumber(ci.expected)}` : '—'} note={ci ? t('{n} waiting at the desk', { n: ci.waiting }) : 'No check-in window today'} />
        <KpiTile icon={Gauge} label="Meter readings" value={ms ? `${formatNumber(ms.entered)} / ${formatNumber(ms.roomsDue)}` : '—'} note={period ? t('Period {label}', { label: tr(period.label) }) : null} />
      </div>

      <div className="grid min-h-80 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] gap-4">
        <Panel
          title="My work"
          subtitle={me.data ? t('{n} requests in your charge, the most urgent first', { n: myItems.length }) : 'Requests in your charge'}
          action={
            <Button variant="text" size="sm" to="/staff/maintenance">
              All requests
            </Button>
          }
        >
          <QueryState query={me.data ? mine : me} compact isEmpty={() => false}>
            {() => (
              <>
                <WorkList items={myItems} empty={<EmptyBlock icon={Wrench} title="Nothing in your charge">Take a request below, or wait for routing to give you one while you are on duty.</EmptyBlock>} />
                {freeItems.length > 0 && (
                  <>
                    <p className="pt-3 pb-1 text-sm font-semibold tracking-wide text-fg-tertiary uppercase">{t('Nobody in charge yet')}</p>
                    <WorkList items={freeItems} />
                  </>
                )}
              </>
            )}
          </QueryState>
        </Panel>

        <Panel title="Your Block today" subtitle="Desk, door codes, readings, inspections and Rooms">
          <QueryState query={dash} compact isEmpty={() => false}>
            {() => <WorkList items={blockItems} empty={<EmptyBlock icon={ClipboardCheck} title="Your Block needs nothing right now" />} />}
          </QueryState>
        </Panel>

        <Panel title="Beds" subtitle="Taken and held Beds against the Block's capacity">
          <QueryState query={dash} compact isEmpty={(x) => !x.bedsByBlock?.length}>
            {(data) => (
              <CapacityRows
                rows={data.bedsByBlock.map((b) => ({
                  name: t('Block {code}', { code: b.block }),
                  used: b.proposed,
                  total: b.capacity,
                  detail: d?.kpis?.roomsOutOfService ? t('{n} Rooms out of service', { n: d.kpis.roomsOutOfService }) : null,
                }))}
              />
            )}
          </QueryState>
        </Panel>
      </div>
    </>
  )
}
