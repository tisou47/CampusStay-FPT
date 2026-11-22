import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  Banknote,
  Bed,
  Building,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Layers,
  Repeat2,
  Route,
  TriangleAlert,
  Users,
  Wrench,
} from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { MANAGER_STAGES } from '@/app/managerFlow'
import { useScopeQuery, useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { stageSteps } from '@/components/layout/FlowTrail'
import { Button } from '@/components/ui/Button'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Avatar } from '@/components/ui/Display'
import { SemesterProgress, stageTiming } from '@/components/ui/SemesterProgress'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { Tooltip } from '@/components/ui/Tooltip'
import { Panel, WorkList } from '@/components/ui/Work'
import { cx } from '@/lib/cx'
import { formatCompactVnd, formatDate, formatNumber, formatPercent, formatVnd } from '@/lib/format'
import { attentionText } from '@/lib/attention'
import { COLLECTED_RULE, floorPercent } from '@/lib/money'
import { t, tr, tx } from '@/i18n'

// SCR-HOME-03 Manager overview (Change Spec v2 §11.2):
// Executive fit-to-screen Bento Dashboard with zero whole-page scrolling on desktop.
// Row 1: PageHeader
// Row 2: Visual Semester Progress Card (Full 5 stages + current status description + 5 rounded action chips)
// Row 3: 4 KPI Tiles (Occupancy, Collected/Owed, Overdue, SLA)
// Row 4: 2 Columns:
//   - Left (7/12): Action Required (Cần xử lý) with sorted priority items
//   - Right (5/12): Operations (Vận hành) with Tabs [Blocks | Staff]

const waitingIcon = {
  refund: CreditCard,
  escalation: TriangleAlert,
  routing: Route,
  'check-out': CalendarClock,
  'meter-period': Gauge,
}

const LOW_OCCUPANCY = 60
const HIGH_OCCUPANCY = 95

const badgeTone = {
  error: 'bg-error-bg text-error-fg',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info-fg',
  success: 'bg-success-bg text-success-fg',
  neutral: 'bg-subtle text-fg-secondary',
}

export default function ManagerDashboard() {
  const { term, user, block } = useSession()
  const scope = useScopeQuery()
  const query = useQuery(['dashboard', 'manager', scope], ({ signal }) => api.dashboards.manager(scope, { signal }))
  const approvals = useQuery(['dashboard', 'approvals', scope], ({ signal }) => api.approvals.summary(scope, { signal }))
  const round2 = useQuery(['round2', term?.id], ({ signal }) => api.assignment.round2(term?.id, { signal }), { enabled: Boolean(term) })
  const claims = useQuery(['dashboard', 'claims', scope], ({ signal }) => api.paymentClaims.list({ ...scope, pageSize: 1 }, { signal }))
  const staff = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))

  const [activeTab, setActiveTab] = useState('blocks')

  const d = query.data
  const k = d?.kpis
  const w = d?.work
  const a = approvals.data
  const r2 = round2.data
  const claim = claims.data?.summary
  const proposal = w?.proposal
  const routingGaps = (d?.waiting ?? []).filter((x) => x.kind === 'routing')
  const gapBlocks = [...new Set(routingGaps.map((x) => x.values?.block ?? /Block (\w+)/.exec(x.title)?.[1]).filter(Boolean))]

  const rawItems = [
    claim?.count > 0 && {
      id: 'claims',
      icon: Banknote,
      tone: 'warning',
      title: t('{n} transfers to confirm', { n: formatNumber(claim.count) }),
      meta: t('{amount} that students say they transferred; their deadlines are paused until you decide', { amount: formatCompactVnd(claim.amount) }),
      action: { label: t('Confirm'), to: '/manager/payment-claims', primary: true, className: 'w-28 justify-center' },
    },
    w?.toReview > 0 && {
      id: 'applications',
      icon: FileText,
      tone: 'info',
      title: t('{n} applications to review', { n: formatNumber(w.toReview) }),
      meta: t('{s} Submitted · {u} Under Review', { s: w.submitted, u: w.underReview }),
      action: { label: t('Review'), to: '/manager/applications', className: 'w-28 justify-center' },
    },
    proposal && proposal.committedBlocks < proposal.totalBlocks && {
      id: 'proposal',
      icon: Layers,
      tone: proposal.conflicts ? 'warning' : 'info',
      title: t('{run}: {c} of {n} blocks committed', { run: proposal.runId, c: proposal.committedBlocks, n: proposal.totalBlocks }),
      meta: proposal.conflicts ? t('{n} conflicts to resolve before committing', { n: proposal.conflicts }) : t('{n} students proposed; commit each block to allocate them', { n: proposal.proposed }),
      action: { label: proposal.conflicts ? t('Resolve') : t('Commit'), to: `/manager/assignment/${proposal.runId}`, className: 'w-28 justify-center' },
    },
    r2?.waitlisted > 0 && {
      id: 'round2',
      icon: Repeat2,
      tone: 'info',
      title: t('{n} waitlisted students without a Round 2 offer', { n: formatNumber(r2.waitlisted) }),
      meta: r2.freeBeds ? t('{n} free beds can be offered', { n: formatNumber(r2.freeBeds) }) : t('No free bed yet: they get one when a bed frees up'),
      action: { label: t('Round 2'), to: '/manager/assignment?tab=round2', className: 'w-28 justify-center' },
    },
    r2?.openOffers > 0 && {
      id: 'round2-open',
      icon: Repeat2,
      tone: 'info',
      title: t('{n} Round 2 offers waiting for an answer', { n: formatNumber(r2.openOffers) }),
      meta: t('Their beds are held until each offer expires'),
      action: { label: t('See who'), to: '/manager/assignment?tab=round2', className: 'w-28 justify-center' },
    },
    a?.lateCheckIn > 0 && {
      id: 'late',
      icon: CalendarClock,
      tone: 'warning',
      title: t('{n} late check-ins to decide', { n: formatNumber(a.lateCheckIn) }),
      meta: t('Students asked to move in after the check-in window'),
      action: { label: t('Decide'), to: '/manager/approvals', className: 'w-28 justify-center' },
    },
    a?.swaps > 0 && {
      id: 'swaps',
      icon: ArrowRightLeft,
      tone: 'info',
      title: t('{n} swaps waiting for a manager', { n: formatNumber(a.swaps) }),
      meta: t('Both students agreed; the swap needs your decision'),
      action: { label: t('Decide'), to: '/manager/room-changes/swaps', className: 'w-28 justify-center' },
    },
    k?.escalationsWaiting > 0 && {
      id: 'escalations',
      icon: TriangleAlert,
      tone: 'error',
      title: t('{n} overdue requests', { n: formatNumber(k.escalationsWaiting) }),
      meta: t('Past their time limit: reassign them or offer a temporary bed'),
      action: { label: t('Handle'), to: '/manager/maintenance?view=overdue', primary: true, className: 'w-28 justify-center' },
    },
    k?.refundsWaiting > 0 && {
      id: 'refunds',
      icon: CreditCard,
      tone: 'warning',
      title: t('{n} refunds to decide', { n: formatNumber(k.refundsWaiting) }),
      meta: t('Cancelled applications, ended stays and terminations'),
      action: { label: t('Decide'), to: '/manager/finance', className: 'w-28 justify-center' },
    },
    ...(d?.waiting ?? [])
      .filter((x) => x.kind === 'check-out' || x.kind === 'meter-period')
      .map((x) => ({
        id: x.id,
        icon: waitingIcon[x.kind] ?? TriangleAlert,
        tone: x.severity === 'error' ? 'error' : x.severity === 'warning' ? 'warning' : 'info',
        title: attentionText(x).title,
        meta: attentionText(x).body,
        action: x.link ? { label: x.cta ?? t('Open'), to: x.link, className: 'w-28 justify-center' } : null,
      })),
  ].filter(Boolean)

  // Elevate missing routing rules as a critical item
  if (routingGaps.length > 0) {
    rawItems.unshift({
      id: 'routing-gaps',
      icon: Route,
      tone: 'error',
      title: t('No routing rules for Blocks {list}', { list: gapBlocks.join(', ') }),
      meta: t('{n} routing rules missing; new requests stay unassigned until set up', { n: routingGaps.length }),
      action: { label: t('Add rule'), to: '/manager/routing-rules', primary: true, className: 'w-28 justify-center' },
    })
  }

  // Sort items: error (highest) -> warning -> info -> neutral
  const items = useMemo(() => {
    const toneRank = { error: 0, warning: 1, info: 2, neutral: 3 }
    return [...rawItems].sort((x, y) => (toneRank[x.tone] ?? 2) - (toneRank[y.tone] ?? 2))
  }, [rawItems])

  const journey = stageSteps(MANAGER_STAGES, term, undefined, {
    assignment: w?.toReview
      ? t('{n} applications to review', { n: w.toReview })
      : proposal && proposal.committedBlocks < proposal.totalBlocks
        ? t('{run} in review', { run: proposal.runId })
        : undefined,
    payment: claim?.count ? t('{n} transfers to confirm', { n: claim.count }) : undefined,
  })

  const nowStep = journey.find((x) => x.state === 'current')

  const stageCounts = {
    '/manager/applications': w?.toReview ? { label: formatNumber(w.toReview), tone: 'info' } : undefined,
    '/manager/assignment':
      proposal && proposal.committedBlocks < proposal.totalBlocks
        ? { label: `${proposal.committedBlocks}/${proposal.totalBlocks}`, tone: proposal.conflicts ? 'warning' : 'info' }
        : undefined,
    '/manager/payment-claims': claim?.count ? { label: formatNumber(claim.count), tone: 'warning' } : undefined,
    '/manager/finance': k?.refundsWaiting ? { label: formatNumber(k.refundsWaiting), tone: 'warning' } : undefined,
    '/manager/approvals': a?.lateCheckIn ? { label: formatNumber(a.lateCheckIn), tone: 'warning' } : undefined,
    '/manager/room-changes': a?.swaps ? { label: formatNumber(a.swaps), tone: 'info' } : undefined,
  }

  const currentStage = MANAGER_STAGES.find((s) => s.key === nowStep?.key) ?? MANAGER_STAGES[MANAGER_STAGES.length - 1]
  const stageScreens = currentStage?.screens ?? []
  const people = staff.data?.items ?? []
  const s = staff.data?.summary

  // Staff on duty calculations
  const allBlocks = useMemo(() => d?.bedsByBlock?.map((b) => b.block) ?? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [d])
  const blocksWithDutyStaff = useMemo(
    () => new Set(people.filter((p) => p.onDuty).flatMap((p) => p.blocks ?? [])),
    [people],
  )
  const blocksWithoutDutyStaff = useMemo(
    () => allBlocks.filter((b) => !blocksWithDutyStaff.has(b)),
    [allBlocks, blocksWithDutyStaff],
  )

  // Sorted staff (on-duty first, then p.open descending, followed by off-duty)
  const sortedStaff = useMemo(() => {
    return [...people].sort((x, y) => {
      if (x.onDuty !== y.onDuty) return x.onDuty ? -1 : 1
      return y.open - x.open
    })
  }, [people])

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* Row 1: Header */}
      <PageHeader
        compact
        title={d?.block ? t('Block {code} overview', { code: d.block }) : t('Dormitory overview')}
        actions={
          <Button size="sm" icon={Download} to="/manager/reports">
            {t('Reports')}
          </Button>
        }
      />

      <StaleNotice query={query} />

      {/* Row 2: Visual Semester Progress Card (Full stages, description & 5 rounded action chips) */}
      {term && (
        <section
          aria-label={t('Term {name}', { name: term.name })}
          className="flex shrink-0 flex-col gap-3 rounded-xl border border-line bg-surface px-5 pt-4 pb-3 shadow-xs"
        >
          {/* Full 5-stage timeline with connected lines, checkmarks, stage names & dates */}
          <SemesterProgress steps={journey} aria-label={t('Stages of the term')} />

          {/* Now: the current stage in a line, and the screens of its work beside it */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/70 pt-3">
            {nowStep && (
              <Tooltip label={t(nowStep.why)} delay={150} className="min-w-60 flex-1">
                <p tabIndex={0} className="line-clamp-1 text-sm text-fg-secondary">
                  <span className="mr-1.5 inline-flex items-center rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-fg-brand">{t('Now: {stage}', { stage: t(nowStep.label) })}</span>
                  {t(nowStep.why)}
                </p>
              </Tooltip>
            )}
            <div className="flex flex-wrap items-center gap-2" aria-label={t('Work of this stage:')}>
              {stageScreens.map((sc, i) => {
                const c = stageCounts[sc.to]
                return (
                  <Tooltip key={sc.to} label={c?.title ? `${t(sc.why)} · ${c.title}` : t(sc.why)} delay={150} side="bottom">
                    <Link
                      to={sc.to}
                      className="group flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium whitespace-nowrap text-fg transition-colors hover:border-primary hover:bg-primary-subtle/30 hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <span className="flex size-4.5 items-center justify-center rounded-md bg-subtle text-[11px] font-bold text-fg-secondary tabular transition-colors group-hover:bg-primary group-hover:text-fg-on-brand">
                        {i + 1}
                      </span>
                      <span>{t(sc.label)}</span>
                      {c && <span className={cx('rounded-full px-1.5 text-[10px] font-bold tabular', badgeTone[c.tone ?? 'neutral'])}>{c.label}</span>}
                    </Link>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Row 3: 4 Core KPI Tiles (Equal Height Row) */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {/* 1. Occupancy */}
        <KpiTile
          icon={Bed}
          label={t('Occupancy')}
          value={k ? formatPercent(k.beds ? Math.floor((k.allocated / k.beds) * 100) / 100 : null, 0) : '—'}
          note={k ? t('{n}/{total} beds', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null}
          noteClassName="text-xs"
        />

        {/* 2. Collected */}
        <KpiTile
          icon={Banknote}
          label={t('Collected')}
          tip={
            <span className="flex flex-col gap-1">
              <span>{t(COLLECTED_RULE)}</span>
              {k && (
                <span className="font-semibold tabular text-white/95">
                  {t('{col} collected of {inv} invoiced', {
                    col: formatVnd(k.collected),
                    inv: formatVnd(k.invoiced),
                  })}
                </span>
              )}
            </span>
          }
          value={k?.collectionRate != null ? floorPercent(k.collectionRate) : '—'}
          note={
            k
              ? k.outstanding > 0
                ? t('Collected {col} · Outstanding {out}', { col: formatCompactVnd(k.collected), out: formatCompactVnd(k.outstanding) })
                : t('Collected {col}', { col: formatCompactVnd(k.collected) })
              : null
          }
          noteClassName="text-xs"
        />

        {/* 3. Overdue requests (Link to /manager/escalations) */}
        <Link
          to="/manager/maintenance?view=overdue"
          className="flex min-w-0 flex-1 flex-col justify-between rounded-lg border border-line bg-surface p-4 transition-colors hover:border-error/40 hover:bg-error-bg/10 focus-visible:ring-2 focus-visible:ring-focus"
        >
          <div className="flex items-center gap-2 text-fg-tertiary">
            <TriangleAlert size={16} className={(k?.escalationsWaiting ?? 0) > 0 ? 'text-error-fg' : undefined} aria-hidden="true" />
            <p className="truncate text-sm font-medium">{t('Overdue requests')}</p>
          </div>
          <p className={cx('text-kpi font-semibold tabular whitespace-nowrap', (k?.escalationsWaiting ?? 0) > 0 ? 'text-error-fg' : 'text-fg')}>
            {formatNumber(k?.escalationsWaiting ?? 0)}
          </p>
          <p className="flex items-center gap-1 truncate text-xs font-medium text-fg-link">
            {(k?.escalationsWaiting ?? 0) > 0 ? t('Reassign them in Maintenance') : t('Nothing past its time limit')}
            {(k?.escalationsWaiting ?? 0) > 0 && <ChevronRight size={13} aria-hidden="true" />}
          </p>
        </Link>

        {/* 4. Maintenance SLA */}
        <KpiTile
          icon={Wrench}
          label={t('Maintenance SLA')}
          tip={
            k
              ? t('Rate of maintenance requests resolved on time (≤ {n} hours) in the last 30 days. Does not include open overdue requests.', {
                  n: k.slaHours ?? 24,
                })
              : null
          }
          value={k?.slaRate != null ? formatPercent(k.slaRate, 0) : '—'}
          valueTone={k?.slaRate != null && k.slaRate >= k.slaTarget ? 'success' : k?.slaRate != null ? 'warning' : undefined}
          note={k ? t('Resolved in last 30 days · target {p}', { p: formatPercent(k.slaTarget, 0) }) : null}
          noteClassName="text-xs"
        />
      </div>

      {/* Row 4: Main Balanced 2-Column Bento Grid (Left 7/12, Right 5/12) */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12 xl:gap-5">
        {/* Left Column: Action Required */}
        <div className="flex h-full flex-col xl:col-span-7">
          <Panel
            title={t('Action required')}
            badge={
              items.length > 0 ? (
                <Tag tone="warning" dot={true}>
                  {items.length}
                </Tag>
              ) : null
            }
            className="h-full shadow-xs"
            bodyClassName="flex-1 overflow-y-auto pr-1"
          >
            <QueryState query={query} compact isEmpty={() => false}>
              {() => (
                <WorkList
                  items={items}
                  empty={
                    <EmptyBlock title={t('Nothing needs handling')}>
                      {t('New transfers, applications, proposals and requests appear here.')}
                    </EmptyBlock>
                  }
                />
              )}
            </QueryState>
          </Panel>
        </div>

        {/* Right Column: Operations Card with Tabs [Blocks | Staff] */}
        <div className="flex h-full flex-col xl:col-span-5">
          <section className="flex h-full flex-col rounded-lg border border-line bg-surface shadow-xs">
            {/* Tab Navigation Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 pt-3 pb-2.5">
              <div className="flex items-center gap-1 rounded-lg bg-subtle p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'blocks'}
                  onClick={() => setActiveTab('blocks')}
                  className={cx(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    activeTab === 'blocks' ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg',
                  )}
                >
                  <Building size={14} aria-hidden="true" />
                  <span>{t('Blocks')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'staff'}
                  onClick={() => setActiveTab('staff')}
                  className={cx(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    activeTab === 'staff' ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg',
                  )}
                >
                  <Users size={14} aria-hidden="true" />
                  <span>{t('Staff')}</span>
                  {s && (
                    <span className={cx('rounded-full px-1.5 py-0.2 text-[10px] font-bold', s.onDuty > 0 ? 'bg-success/15 text-success' : 'bg-subtle text-fg-secondary')}>
                      {s.onDuty}/{s.total}
                    </span>
                  )}
                </button>
              </div>

              {activeTab === 'staff' && (
                <Button variant="text" size="sm" icon={Users} iconSize={14} to="/manager/staff">
                  {t('View workload')}
                </Button>
              )}
            </div>

            {/* Tab 1: Blocks */}
            {activeTab === 'blocks' && (
              <div className="flex flex-1 flex-col gap-3 p-4">
                <p className="shrink-0 text-xs text-fg-tertiary">
                  {t('Allocated and proposed beds against capacity')}
                </p>
                <QueryState query={query} compact isEmpty={(x) => !x.bedsByBlock?.length}>
                  {(data) => (
                    <ul className="flex max-h-80 xl:max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                      {data.bedsByBlock.map((b) => {
                        const free = Math.max(0, b.capacity - b.proposed)
                        const pct = b.capacity ? Math.round((b.proposed / b.capacity) * 100) : 0
                        const meterTone = pct > HIGH_OCCUPANCY ? 'error' : pct < LOW_OCCUPANCY ? 'warning' : 'accent'
                        return (
                          <li key={b.block} className="flex items-center gap-3 rounded-lg border border-line bg-subtle/30 px-3 py-2 text-xs transition-colors hover:bg-subtle/60">
                            <span className="w-16 shrink-0 font-medium text-fg">
                              {t('Block {code}', { code: b.block })}
                            </span>
                            <Tooltip
                              label={t('{used} of {total} allocated or proposed', { used: formatNumber(b.proposed), total: formatNumber(b.capacity) })}
                              delay={150}
                              className="min-w-0 flex-1"
                            >
                              <div className="flex w-full items-center gap-2">
                                <Meter value={b.proposed} max={b.capacity} tone={meterTone} className="h-2 min-w-0 flex-1" />
                                <span className="w-10 shrink-0 text-right text-xs font-semibold text-fg tabular">
                                  {pct}%
                                </span>
                              </div>
                            </Tooltip>
                            <span className="w-20 shrink-0 text-right text-xs text-fg-secondary tabular">
                              {free === 0 ? t('Full') : t('{n} free', { n: formatNumber(free) })}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </QueryState>
                {d?.floorNote && (
                  <p className="mt-auto shrink-0 border-t border-line pt-2 text-xs text-fg-tertiary">
                    {tr(d.floorNote)}
                  </p>
                )}
              </div>
            )}

            {/* Tab 2: Staff */}
            {activeTab === 'staff' && (
              <div className="flex flex-1 flex-col gap-3 p-4">
                {/* On-duty summary & Block coverage alert */}
                <div className="flex shrink-0 flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-fg-secondary">
                    <span>{s ? t('{n} of {total} on duty · new requests go to them', { n: s.onDuty, total: s.total }) : null}</span>
                  </div>
                  {blocksWithoutDutyStaff.length > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-bg px-3 py-1.5 text-xs font-medium text-warning-fg">
                      <TriangleAlert size={14} className="shrink-0" />
                      <span>{t('Blocks without on-duty staff: {list}', { list: blocksWithoutDutyStaff.map((b) => t('Block {code}', { code: b })).join(', ') })}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-bg px-3 py-1.5 text-xs font-medium text-success-fg">
                      <Check size={14} className="shrink-0" />
                      <span>{t('All blocks have staff on duty')}</span>
                    </div>
                  )}
                </div>

                {/* Staff member list */}
                <QueryState query={staff} compact isEmpty={(x) => !x.items?.length}>
                  {() => (
                    <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1 sm:max-h-80 xl:max-h-96">
                      {sortedStaff.map((p) => (
                        <li
                          key={p.id}
                          className={cx(
                            'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                            p.onDuty ? 'bg-subtle/70 hover:bg-subtle' : 'bg-subtle/30 opacity-75 hover:bg-subtle/50',
                          )}
                        >
                          <Avatar name={p.name} size={28} />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-xs font-semibold text-fg">{p.name}</span>
                            <span className="truncate text-[11px] text-fg-secondary">
                              {p.handles.map((h) => tr(h)).join(', ') || tr(p.title)}
                            </span>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-secondary tabular">
                            {t('{n} open requests', { n: p.open })}
                          </span>
                          <span title={t(p.onDuty ? 'On duty' : 'Off duty')} className="flex shrink-0 items-center">
                            <span
                              aria-hidden="true"
                              className={cx(
                                'size-2 rounded-full',
                                p.onDuty ? 'bg-success ring-3 ring-emerald-500/15' : 'border border-line-strong bg-surface',
                              )}
                            />
                            <span className="sr-only">{t(p.onDuty ? 'On duty' : 'Off duty')}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryState>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
