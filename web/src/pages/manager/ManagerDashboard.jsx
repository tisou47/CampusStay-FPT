import { ArrowRight, ArrowRightLeft, Banknote, Bed, CalendarClock, Check, CreditCard, Download, FileText, Gauge, Layers, Repeat2, Route, TriangleAlert, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { MANAGER_STAGES } from '@/app/managerFlow'
import { useScopeQuery, useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { stageSteps } from '@/components/layout/FlowTrail'
import { WorkInboxPanel } from '@/components/layout/WorkInbox'
import { Button } from '@/components/ui/Button'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { stageTiming } from '@/components/ui/SemesterProgress'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { Tooltip } from '@/components/ui/Tooltip'
import { WorkList } from '@/components/ui/Work'
import { cx } from '@/lib/cx'
import { formatCompactVnd, formatNumber, formatPercent, formatVnd } from '@/lib/format'
import { attentionText } from '@/lib/attention'
import { COLLECTED_RULE, floorPercent } from '@/lib/money'
import { t, tr } from '@/i18n'

// SCR-HOME-03 Manager overview (Change Spec v2 §11.2). One screen, no page scrolling:
//   1. the Term: its name, the stage it is in with its dates, the days left and the screens that stage asks for
//      (no stage trail: removed with the page subtitles, 24/11/2026);
//   2. four headline tiles, each with its gauge (occupancy, collected, overdue requests, maintenance on time);
//   3. three cards side by side: what needs a Manager (most urgent first), Beds by Block (bar chart) and the Staff on
//      duty (donut, Blocks with nobody on duty, who carries the most open work).
// Only the "Action required" list scrolls inside its card when it is long.

const waitingIcon = {
  refund: CreditCard,
  escalation: TriangleAlert,
  routing: Route,
  'check-out': CalendarClock,
  'meter-period': Gauge,
}

const badgeTone = {
  error: 'bg-error-bg text-error-fg',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info-fg',
  neutral: 'bg-subtle text-fg-secondary',
}

const TONE_RANK = { error: 0, warning: 1, info: 2, neutral: 3 }

/** A card with a title row (title, optional badge, optional link on the right) and a body that fills the rest. */
function DashCard({ title, badge, action, className, bodyClassName, children }) {
  return (
    <Card className={cx('flex min-h-0 min-w-0 flex-col gap-3', className)}>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-h3 font-semibold text-fg">
          <span className="truncate">{title}</span>
          {badge}
        </h2>
        {action}
      </div>
      <div className={cx('flex min-h-0 flex-1 flex-col', bodyClassName)}>{children}</div>
    </Card>
  )
}

/** The Term in one card: the stage trail, where it stands now and the screens of that stage with their counts. */
function TermCard({ term, journey, counts }) {
  const now = journey.find((x) => x.state === 'current')
  const stage = MANAGER_STAGES.find((s) => s.key === now?.key) ?? MANAGER_STAGES[MANAGER_STAGES.length - 1]
  const timing = now ? stageTiming(now) : null
  return (
    <section aria-label={t('Term {name}', { name: term.name })} className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {now && (
          <p className="min-w-0 truncate text-base text-fg-secondary">
            <span className="font-semibold text-fg">{term.name}</span>
            <span className="font-medium text-fg-brand"> · {t(now.label)}</span>
            {now.date && <span> · {now.date}</span>}
          </p>
        )}
        {timing && !timing.before && !timing.after && (
          <div className="flex shrink-0 items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-subtle" title={t('Day {d} of {n}', { d: timing.day, n: timing.total })}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${timing.pct}%` }} />
            </div>
            <span className="text-sm font-medium text-fg-brand tabular">{t('{n} days left', { n: formatNumber(timing.left) })}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label={t('Work of this stage:')}>
        {stage.screens.map((sc, i) => {
          const c = counts[sc.to]
          return (
            <Tooltip key={sc.to} label={t(sc.why)} delay={150} side="bottom">
              <Link
                to={sc.to}
                className="group flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium whitespace-nowrap text-fg transition-colors hover:border-primary hover:bg-primary-subtle hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="flex size-5 items-center justify-center rounded bg-subtle text-xs font-semibold text-fg-secondary tabular group-hover:bg-primary group-hover:text-fg-on-brand">{i + 1}</span>
                {t(sc.label)}
                {c && <span className={cx('rounded-full px-1.5 text-xs font-semibold tabular', badgeTone[c.tone ?? 'neutral'])}>{c.label}</span>}
              </Link>
            </Tooltip>
          )
        })}
      </div>
    </section>
  )
}

/** Beds by Block as horizontal bars: allocated or proposed against capacity, the share and the places left. */
function BlockBars({ blocks }) {
  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-around gap-1.5">
      {[...blocks]
        .sort((a, b) => a.block.localeCompare(b.block))
        .map((b) => {
          const free = Math.max(0, b.capacity - b.proposed)
          const rate = b.capacity ? b.proposed / b.capacity : 0
          return (
            <li
              key={b.block}
              title={t('{used} of {total} allocated or proposed', { used: formatNumber(b.proposed), total: formatNumber(b.capacity) })}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.75rem_4.75rem] items-center gap-2 text-sm"
            >
              <span className="font-medium text-fg">{t('Block {code}', { code: b.block })}</span>
              <Meter value={b.proposed} max={b.capacity} tone={rate >= 0.95 ? 'warning' : 'accent'} label={t('Block {code}', { code: b.block })} className="h-2.5 w-full" />
              <span className="text-right font-semibold text-fg tabular">{floorPercent(rate)}</span>
              <span className={cx('text-right tabular', free === 0 ? 'font-medium text-warning-fg' : 'text-fg-tertiary')}>{free === 0 ? t('Full') : t('{n} free', { n: formatNumber(free) })}</span>
            </li>
          )
        })}
    </ul>
  )
}

/** Staff on duty: a donut of on-duty against all, the Blocks nobody covers and who carries the most open work. */
function StaffCard({ staff, blocks }) {
  const people = staff.data?.items ?? []
  const total = staff.data?.summary?.total ?? people.length
  const onDuty = staff.data?.summary?.onDuty ?? people.filter((p) => p.onDuty).length
  const covered = new Set(people.filter((p) => p.onDuty).flatMap((p) => p.blocks ?? []))
  const uncovered = blocks.filter((b) => !covered.has(b))
  const busiest = [...people].sort((x, y) => y.open - x.open).filter((p) => p.open > 0).slice(0, 4)
  const size = 96
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const share = total ? onDuty / total : 0
  return (
    <DashCard title={t('Staff on duty')} className="xl:col-span-3">
      <QueryState query={staff} compact isEmpty={(x) => !x.items?.length}>
        {() => (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center gap-4">
              <div className="relative shrink-0" style={{ width: size, height: size }}>
                <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" role="img" aria-label={t('{n} of {total} on duty', { n: onDuty, total })}>
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-subtle, #f5f0eb)" strokeWidth={stroke} />
                  {share > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-success)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} />}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-h2 font-semibold text-fg tabular">{formatNumber(onDuty)}</span>
                  <span className="text-xs text-fg-tertiary tabular">/ {formatNumber(total)}</span>
                </div>
              </div>
              <p className="text-sm text-fg-secondary">{t('On duty now; new requests go to them.')}</p>
            </div>
            {uncovered.length > 0 ? (
              <div className="flex shrink-0 items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{t('Nobody on duty in Blocks {list}', { list: uncovered.join(', ') })}</span>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2 rounded-md border border-success/30 bg-success-bg px-3 py-2 text-sm text-success-fg">
                <Check size={16} className="shrink-0" aria-hidden="true" />
                <span>{t('All blocks have staff on duty')}</span>
              </div>
            )}
            {busiest.length > 0 && (
              <div className="flex min-h-0 flex-col gap-1.5">
                <span className="text-xs font-medium text-fg-tertiary">{t('Most open work')}</span>
                <ul className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
                  {busiest.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', p.onDuty ? 'bg-success' : 'border border-line-strong')} />
                      <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
                      <span className="shrink-0 text-fg-secondary tabular">{t('{n} open', { n: formatNumber(p.open) })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link to="/manager/staff" className="mt-auto flex shrink-0 items-center gap-1 self-start text-sm font-medium text-fg-brand hover:underline">
              {t('View workload')}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}
      </QueryState>
    </DashCard>
  )
}

export default function ManagerDashboard() {
  const { term, block } = useSession()
  const scope = useScopeQuery()
  const query = useQuery(['dashboard', 'manager', scope], ({ signal }) => api.dashboards.manager(scope, { signal }))
  const approvals = useQuery(['dashboard', 'approvals', scope], ({ signal }) => api.approvals.summary(scope, { signal }))
  const round2 = useQuery(['round2', term?.id], ({ signal }) => api.assignment.round2(term?.id, { signal }), { enabled: Boolean(term) })
  const claims = useQuery(['dashboard', 'claims', scope], ({ signal }) => api.paymentClaims.list({ block: scope.block, pageSize: 1 }, { signal }))
  const staff = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))

  const d = query.data
  const k = d?.kpis
  const w = d?.work
  const a = approvals.data
  const r2 = round2.data
  const claim = claims.data?.summary
  const proposal = w?.proposal
  const routingGaps = (d?.waiting ?? []).filter((x) => x.kind === 'routing')
  const gapBlocks = [...new Set(routingGaps.map((x) => x.values?.block ?? /Block (\w+)/.exec(x.title)?.[1]).filter(Boolean))]

  const items = [
    routingGaps.length > 0 && {
      id: 'routing-gaps',
      icon: Route,
      tone: 'error',
      title: t('No routing rules for Blocks {list}', { list: gapBlocks.join(', ') }),
      meta: t('{n} routing rules missing; new requests stay unassigned until set up', { n: routingGaps.length }),
      action: { label: t('Add rule'), to: '/manager/routing-rules', primary: true, className: 'min-w-24 justify-center' },
    },
    claim?.count > 0 && {
      id: 'claims',
      icon: Banknote,
      tone: 'warning',
      title: t('{n} transfers to confirm', { n: formatNumber(claim.count) }),
      meta: t('{amount} that students say they transferred; their deadlines are paused until you decide', { amount: formatCompactVnd(claim.amount) }),
      action: { label: t('Confirm'), to: '/manager/payment-claims', primary: true, className: 'min-w-24 justify-center' },
    },
    w?.toReview > 0 && {
      id: 'applications',
      icon: FileText,
      tone: 'info',
      title: t('{n} applications to review', { n: formatNumber(w.toReview) }),
      meta: t('{s} Submitted · {u} Under Review', { s: w.submitted, u: w.underReview }),
      action: { label: t('Review'), to: '/manager/applications', className: 'min-w-24 justify-center' },
    },
    proposal && proposal.committedBlocks < proposal.totalBlocks && {
      id: 'proposal',
      icon: Layers,
      tone: proposal.conflicts ? 'warning' : 'info',
      title: t('{run}: {c} of {n} blocks committed', { run: proposal.runId, c: proposal.committedBlocks, n: proposal.totalBlocks }),
      meta: proposal.conflicts ? t('{n} conflicts to resolve before committing', { n: proposal.conflicts }) : t('{n} students proposed; commit each block to allocate them', { n: proposal.proposed }),
      action: { label: proposal.conflicts ? t('Resolve') : t('Commit'), to: `/manager/assignment/${proposal.runId}`, className: 'min-w-24 justify-center' },
    },
    r2?.waitlisted > 0 && {
      id: 'round2',
      icon: Repeat2,
      tone: 'info',
      title: t('{n} waitlisted students without a Round 2 offer', { n: formatNumber(r2.waitlisted) }),
      meta: r2.freeBeds ? t('{n} free beds can be offered', { n: formatNumber(r2.freeBeds) }) : t('No free bed yet: they get one when a bed frees up'),
      action: { label: t('Round 2'), to: '/manager/assignment?tab=round2', className: 'min-w-24 justify-center' },
    },
    r2?.openOffers > 0 && {
      id: 'round2-open',
      icon: Repeat2,
      tone: 'info',
      title: t('{n} Round 2 offers waiting for an answer', { n: formatNumber(r2.openOffers) }),
      meta: t('Their beds are held until each offer expires'),
      action: { label: t('See who'), to: '/manager/assignment?tab=round2', className: 'min-w-24 justify-center' },
    },
    a?.lateCheckIn > 0 && {
      id: 'late',
      icon: CalendarClock,
      tone: 'warning',
      title: t('{n} late check-ins to decide', { n: formatNumber(a.lateCheckIn) }),
      meta: t('Students asked to move in after the check-in window'),
      action: { label: t('Decide'), to: '/manager/approvals', className: 'min-w-24 justify-center' },
    },
    a?.swaps > 0 && {
      id: 'swaps',
      icon: ArrowRightLeft,
      tone: 'info',
      title: t('{n} swaps waiting for a manager', { n: formatNumber(a.swaps) }),
      meta: t('Both students agreed; the swap needs your decision'),
      action: { label: t('Decide'), to: '/manager/approvals?tab=swaps', className: 'min-w-24 justify-center' },
    },
    k?.escalationsWaiting > 0 && {
      id: 'escalations',
      icon: TriangleAlert,
      tone: 'error',
      title: t('{n} overdue requests', { n: formatNumber(k.escalationsWaiting) }),
      meta: t('Past their time limit: reassign them or offer a temporary bed'),
      action: { label: t('Handle'), to: '/manager/maintenance?tab=overdue', primary: true, className: 'min-w-24 justify-center' },
    },
    k?.refundsWaiting > 0 && {
      id: 'refunds',
      icon: CreditCard,
      tone: 'warning',
      title: t('{n} refunds to decide', { n: formatNumber(k.refundsWaiting) }),
      meta: t('Cancelled applications, ended stays and terminations'),
      action: { label: t('Decide'), to: '/manager/finance', className: 'min-w-24 justify-center' },
    },
    ...(d?.waiting ?? [])
      .filter((x) => x.kind === 'check-out' || x.kind === 'meter-period')
      .map((x) => ({
        id: x.id,
        icon: waitingIcon[x.kind] ?? TriangleAlert,
        tone: x.severity === 'error' ? 'error' : x.severity === 'warning' ? 'warning' : 'info',
        title: attentionText(x).title,
        meta: attentionText(x).body,
        action: x.link ? { label: x.cta ?? t('Open'), to: x.link, className: 'min-w-24 justify-center' } : null,
      })),
  ]
    .filter(Boolean)
    .sort((x, y) => (TONE_RANK[x.tone] ?? 2) - (TONE_RANK[y.tone] ?? 2))

  const journey = stageSteps(MANAGER_STAGES, term, undefined, {
    assignment: w?.toReview
      ? t('{n} applications to review', { n: w.toReview })
      : proposal && proposal.committedBlocks < proposal.totalBlocks
        ? t('{run} in review', { run: proposal.runId })
        : undefined,
    payment: claim?.count ? t('{n} transfers to confirm', { n: claim.count }) : undefined,
  })

  const stageCounts = {
    '/manager/applications': w?.toReview ? { label: formatNumber(w.toReview), tone: 'info' } : undefined,
    '/manager/assignment': proposal && proposal.committedBlocks < proposal.totalBlocks ? { label: `${proposal.committedBlocks}/${proposal.totalBlocks}`, tone: proposal.conflicts ? 'warning' : 'info' } : undefined,
    '/manager/payment-claims': claim?.count ? { label: formatNumber(claim.count), tone: 'warning' } : undefined,
    '/manager/finance': k?.refundsWaiting ? { label: formatNumber(k.refundsWaiting), tone: 'warning' } : undefined,
    '/manager/approvals': a?.lateCheckIn ? { label: formatNumber(a.lateCheckIn), tone: 'warning' } : undefined,
    '/manager/room-changes': a?.swaps ? { label: formatNumber(a.swaps), tone: 'info' } : undefined,
  }

  const blocks = d?.bedsByBlock ?? []
  const held = blocks.reduce((s, b) => s + b.proposed, 0)
  const capacity = blocks.reduce((s, b) => s + b.capacity, 0)
  const occupancy = k?.beds ? Math.floor((k.allocated / k.beds) * 100) / 100 : null
  const overdue = k?.escalationsWaiting ?? 0
  const slaOk = k?.slaRate != null && k.slaRate >= k.slaTarget

  return (
    <>
      <PageHeader
        title={d?.block ? t('Block {code} overview', { code: d.block }) : t('Dormitory overview')}
        actions={
          <Button icon={Download} to="/manager/reports">
            {t('Reports')}
          </Button>
        }
      />
      <StaleNotice query={query} />

      {term && <TermCard term={term} journey={journey} counts={stageCounts} />}

      <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile icon={Bed} label="Occupancy" value={occupancy != null ? formatPercent(occupancy, 0) : '—'} note={k ? t('{n}/{total} beds', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null}>
          {k && <Meter value={k.allocated} max={k.beds} label={t('Occupancy')} className="mt-1 h-1.5" />}
        </KpiTile>
        <KpiTile
          icon={Banknote}
          label="Collected"
          tip={
            <span className="flex flex-col gap-1">
              <span>{t(COLLECTED_RULE)}</span>
              {k && <span className="font-semibold tabular">{t('{col} collected of {inv} invoiced', { col: formatVnd(k.collected), inv: formatVnd(k.invoiced) })}</span>}
            </span>
          }
          value={k?.collectionRate != null ? floorPercent(k.collectionRate) : '—'}
          note={k ? (k.outstanding > 0 ? t('{amount} still owed', { amount: formatCompactVnd(k.outstanding) }) : t('Nothing unpaid')) : null}
          noteTone={k?.outstanding > 0 ? 'warning' : 'secondary'}
        >
          {k && <Meter value={k.collected} max={k.invoiced || 1} tone="success" label={t('Collected')} className="mt-1 h-1.5" />}
        </KpiTile>
        <Link
          to="/manager/maintenance?tab=overdue"
          className={cx(
            'flex min-w-0 flex-col gap-1 rounded-lg border bg-surface px-4 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-focus',
            overdue > 0 ? 'border-error/40 hover:bg-error-bg' : 'border-line hover:bg-subtle',
          )}
        >
          <div className="flex items-center gap-2 text-fg-tertiary">
            <TriangleAlert size={16} className={overdue > 0 ? 'text-error-fg' : undefined} aria-hidden="true" />
            <p className="truncate text-sm font-medium">{t('Overdue requests')}</p>
          </div>
          <p className={cx('text-kpi font-semibold tabular', overdue > 0 ? 'text-error-fg' : 'text-fg')}>{formatNumber(overdue)}</p>
          <p className="flex items-center gap-1 text-sm text-fg-secondary">
            {overdue > 0 ? t('Reassign or offer a temporary bed') : t('Nothing past its time limit')}
            <ArrowRight size={14} aria-hidden="true" />
          </p>
        </Link>
        <KpiTile
          icon={Wrench}
          label="Maintenance on time"
          tip={k ? t('Rate of maintenance requests resolved on time (≤ {n} hours) in the last 30 days. Does not include open overdue requests.', { n: k.slaHours ?? 24 }) : null}
          value={k?.slaRate != null ? formatPercent(k.slaRate, 0) : '—'}
          valueTone={k?.slaRate != null ? (slaOk ? 'success' : 'warning') : undefined}
          note={k ? t('Last 30 days · target {p}', { p: formatPercent(k.slaTarget, 0) }) : null}
        >
          {k?.slaRate != null && (
            <div className="relative mt-1">
              <Meter value={k.slaRate * 100} max={100} tone={slaOk ? 'success' : 'warning'} label={t('Maintenance on time')} className="h-1.5" />
              <span aria-hidden="true" className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-fg-secondary" style={{ left: `${k.slaTarget * 100}%` }} title={t('Target')} />
            </div>
          )}
        </KpiTile>
      </div>

      {/* Work inbox (#69): check-out charges to decide and requests nobody has taken */}
      <WorkInboxPanel className="shrink-0" />

      <div className="grid shrink-0 grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-12 xl:grid-rows-[minmax(0,1fr)]">
        <DashCard title={t('Action required')} badge={items.length > 0 ? <Tag tone="warning">{items.length}</Tag> : null} className="xl:col-span-5" bodyClassName="-mr-2 overflow-y-auto pr-2">
          <QueryState query={query} compact isEmpty={() => false}>
            {() => <WorkList items={items} empty={<EmptyBlock icon={Check} title={t('Nothing needs handling')}>{t('New transfers, applications, proposals and requests appear here.')}</EmptyBlock>} />}
          </QueryState>
        </DashCard>

        <DashCard
          title={t('Beds by block')}
          className="xl:col-span-4"
          action={capacity > 0 ? <span className="shrink-0 text-sm text-fg-tertiary tabular">{t('{n} free of {total}', { n: formatNumber(Math.max(0, capacity - held)), total: formatNumber(capacity) })}</span> : null}
        >
          <QueryState query={query} compact isEmpty={(x) => !x.bedsByBlock?.length}>
            {(data) => <BlockBars blocks={data.bedsByBlock} />}
          </QueryState>
          {d?.floorNote && <p className="mt-2 shrink-0 text-xs text-fg-tertiary">{tr(d.floorNote)}</p>}
        </DashCard>

        <StaffCard staff={staff} blocks={blocks.map((b) => b.block)} />
      </div>
    </>
  )
}
