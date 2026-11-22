import { useEffect, useState } from 'react'
import { ArrowRight, Building, CircleCheck, ClipboardCheck, Gauge, Hand, KeyRound, LogIn, LogOut, TriangleAlert, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { StageWork, stageSteps } from '@/components/layout/FlowTrail'
import { STAFF_STAGES } from '@/app/managerFlow'
import { Button } from '@/components/ui/Button'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { SemesterProgress, stageTiming } from '@/components/ui/SemesterProgress'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { CapacityRows, DetailTip, Panel, WorkList } from '@/components/ui/Work'
import { formatDate, formatDateTime, formatDuration, formatNumber, formatRelative, formatTimeLeft, greeting as greet } from '@/lib/format'
import { attentionText } from '@/lib/attention'
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

/** The time now, moved on every minute, so "5 h 54 min overdue" counts on without a reload (display only). */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
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
  const [workTab, setWorkTab] = useState('mine')
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
  const now = useMinuteClock()
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
        (late || soon) && { label: late ? overdueShort(left) : formatTimeLeft(r.slaDueAt, now), variant: late ? 'overdue' : 'pending', title: formatDateTime(r.slaDueAt) },
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
            { label: t('Due'), value: r.slaDueAt ? `${formatDateTime(r.slaDueAt)} · ${formatTimeLeft(r.slaDueAt, now)}` : null },
          ]}
        />
      ),
      fresh: Boolean(takenAt) && Date.now() - takenAt < 5000,
      action: mine ? null : { label: 'Assign to me', primary: true, onClick: () => take.run(r.id), disabled: take.pending || !me.data },
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
      action: { label: 'Open desk', to: '/staff/check-in', primary: true },
    },
    ci && ci.expected > 0 && !ciUpcoming && !ciClosed && {
      id: 'check-in',
      icon: LogIn,
      tone: ci.waiting ? 'info' : 'success',
      title: t('{n} check-ins expected today', { n: formatNumber(ci.expected) }),
      meta: t('{done} done · {waiting} waiting · {blocked} blocked', { done: ci.checkedIn, waiting: ci.waiting, blocked: ci.blocked }),
      action: { label: 'Open desk', to: '/staff/check-in', primary: true },
    },
    dc && dc.toChange + dc.notSet > 0 && {
      id: 'door-codes',
      icon: KeyRound,
      tone: dc.toChange ? 'warning' : 'info',
      title: t('{n} rooms need a door code', { n: formatNumber(dc.toChange + dc.notSet) }),
      meta: t('{c} to change after a resident left · {s} never set', { c: dc.toChange, s: dc.notSet }),
      action: { label: 'Set codes', to: '/staff/door-codes', primary: true },
    },
    ms && ms.missing > 0 && {
      id: 'meters',
      icon: Gauge,
      tone: 'info',
      title: t('{n} rooms without a meter reading for {period}', { n: formatNumber(ms.missing), period: tr(period?.label) }),
      meta: t('{entered} of {due} entered · download the template to fill them in Excel', { entered: ms.entered, due: ms.roomsDue }),
      progress: { value: ms.entered, max: ms.roomsDue, label: t('Meter readings') },
      action: { label: 'Enter readings', to: '/staff/meter-readings', primary: true },
    },
    run && run.inspected < run.rooms && {
      id: 'inspection',
      icon: ClipboardCheck,
      tone: run.dueAt && new Date(run.dueAt) < new Date() ? 'error' : 'info',
      title: t('Inspection {name}: {done} of {n} rooms', { name: tr(run.scheduleName), done: run.inspected, n: run.rooms }),
      meta: run.dueAt ? t('Due {date}', { date: formatDate(run.dueAt) }) : null,
      action: { label: 'Continue', to: '/staff/inspections', primary: true },
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
        action: a.link ? { label: a.cta ?? 'Open', to: a.link, primary: true } : null,
      })),
  ].filter(Boolean)

  const journey = stageSteps(STAFF_STAGES, term, undefined, {
    checkin: ci && ci.expected && !ciClosed ? (ciUpcoming ? t('Opens {date} · {n} expected', { date: formatDate(ci.checkInStart), n: ci.expected }) : t('{done} of {n} checked in today', { done: ci.checkedIn, n: ci.expected })) : undefined,
  })
  const myOpen = me.data?.open
  const late = myItems.filter((i) => i.tone === 'error').length
  const unassignedTotal = unassigned.data?.total
  const urgentFree = unassigned.data?.summary?.urgentUnassigned
  // Check-in figures belong to the check-in days only; out of them the tile is hidden (its data is still read).
  const ciOpen = Boolean(ci) && !ciUpcoming && !ciClosed

  // The Term card's one-line summary: the stage now and its days left.
  const nowStep = journey.find((x) => x.state === 'current')
  const nowTiming = nowStep ? stageTiming(nowStep, now) : null
  const termSummary = nowStep
    ? nowTiming && !nowTiming.before && !nowTiming.after
      ? t('{stage} · {n} days left', { stage: t(nowStep.label), n: nowTiming.left })
      : [t(nowStep.label), nowStep.note && tr(nowStep.note)].filter(Boolean).join(' · ')
    : null

  // What is still open on each screen of the stage, from the figures this page already reads.
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
        <section aria-label={t('Term {name}', { name: term.name })} className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-h3 font-semibold text-fg">{t('Term {name}', { name: term.name })}</h2>
            {termSummary && <p className="truncate text-base font-medium text-fg-brand">{termSummary}</p>}
          </div>
          <SemesterProgress steps={journey} now={now} aria-label={t('Stages of the term')} />
          <StageWork role="staff" term={term} counts={stageCounts} className="border-t border-line pt-3" />
        </section>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel
          title="My work"
          badge={
            me.data ? (
              <Tag tone={late ? 'error' : 'info'} dot={false}>
                {[t('{n} in your charge', { n: formatNumber(myItems.length) }), late ? t('{n} overdue', { n: late }) : null].filter(Boolean).join(' · ')}
              </Tag>
            ) : null
          }
          subtitle={me.data ? t('{n} resolved in 7 days', { n: me.data.resolved7d }) : 'Requests in your charge'}
          action={
            <Button variant="text" size="sm" to="/staff/maintenance">
              <span className="inline-flex items-center gap-1">
                {t('All requests')}
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Button>
          }
        >
          <QueryState query={me.data ? mine : me} compact isEmpty={() => false}>
            {() => (
              <div className="flex flex-col gap-3">
                <Segmented
                  className="w-fit self-start"
                  value={workTab}
                  onChange={setWorkTab}
                  options={[
                    { value: 'mine', label: `${t('My work')} (${formatNumber(myItems.length)})` },
                    { value: 'unassigned', label: `${t('Unassigned')} (${formatNumber(unassignedTotal ?? freeItems.length)})` },
                  ]}
                />
                {workTab === 'mine' ? (
                  <WorkList
                    items={myItems}
                    empty={
                      <EmptyBlock
                        icon={CircleCheck}
                        title="You have nothing to do. Nice work!"
                        className="py-6"
                        action={
                          (unassignedTotal ?? freeItems.length) > 0 ? (
                            <Button variant="primary" size="sm" onClick={() => setWorkTab('unassigned')}>
                              {t('View unassigned ({n})', { n: unassignedTotal ?? freeItems.length })}
                            </Button>
                          ) : undefined
                        }
                      >
                        {t('Take a request in the Unassigned tab, or wait for routing while you are on duty.')}
                      </EmptyBlock>
                    }
                  />
                ) : (
                  <WorkList
                    items={freeItems}
                    empty={<EmptyBlock icon={CircleCheck} title="No unassigned requests right now" className="py-6" />}
                  />
                )}
              </div>
            )}
          </QueryState>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Your block today" subtitle="Desk, door codes, readings, inspections and rooms" className="shrink-0" bodyClassName="overflow-visible">
            <QueryState query={dash} compact isEmpty={() => false}>
              {() => <WorkList items={blockItems} empty={<EmptyBlock icon={ClipboardCheck} title="Your block needs nothing right now" />} />}
            </QueryState>
          </Panel>

          {(ciOpen || (d?.bedsByBlock?.length ?? 0) > 0) && (
            <section className="grid shrink-0 grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
              {ciOpen && (
                <div className="flex flex-col justify-between gap-1 sm:border-r sm:border-line sm:pr-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
                    <LogIn size={14} aria-hidden="true" className="text-fg-brand" />
                    <span>{t('Check-ins today')}</span>
                  </div>
                  <p className="text-xl font-bold text-fg tabular-nums">
                    {formatNumber(ci.checkedIn)} <span className="text-sm font-normal text-fg-secondary">/ {formatNumber(ci.expected)}</span>
                  </p>
                  <p className="text-xs text-fg-secondary">{t('{n} waiting at the desk', { n: ci.waiting })}</p>
                </div>
              )}
              {(d?.bedsByBlock?.length ?? 0) > 0 && (
                <div className={ciOpen ? 'flex flex-col gap-2 sm:pl-1' : 'sm:col-span-2 flex flex-col gap-2'}>
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-fg-secondary">
                    <span>{t('Beds')}</span>
                    {d?.kpis?.roomsOutOfService ? (
                      <span className="text-fg-tertiary">{t('{n} rooms out of service', { n: d.kpis.roomsOutOfService })}</span>
                    ) : null}
                  </div>
                  <CapacityRows
                    rows={d.bedsByBlock.map((b) => ({
                      name: t('Block {code}', { code: b.block }),
                      used: b.proposed,
                      total: b.capacity,
                    }))}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
