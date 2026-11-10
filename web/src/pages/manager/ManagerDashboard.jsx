import { ArrowRightLeft, Banknote, Bed, CalendarClock, CreditCard, Download, FileText, Gauge, Layers, Repeat2, Route, TriangleAlert, Users, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { StageNow } from '@/components/layout/FlowTrail'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Avatar } from '@/components/ui/Display'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { CapacityRows, Journey, Panel, WorkList } from '@/components/ui/Work'
import { cx } from '@/lib/cx'
import { formatCompactVnd, formatDate, formatNumber, formatPercent } from '@/lib/format'
import { attentionText } from '@/lib/attention'
import { COLLECTED_RULE, collectedNote } from '@/lib/money'
import { termJourney } from '@/lib/termJourney'
import { t, tr } from '@/i18n'

// SCR-HOME-03 Manager overview (Change Spec v2 §11.2), rebuilt as one inbox: every decision waiting for a Manager
// with its count and the button that does it, the Term's stages, Beds by Block and who is on duty.
// Reads GET /dashboards/manager (KPIs, refunds, overdue requests, routing gaps), /dashboards/staff (Applications to
// review, transfers to confirm, the proposal, Beds by Block), /approvals/summary, /round2, /payment-claims (summary),
// /block-staff (duty).

const waitingIcon = { refund: CreditCard, escalation: TriangleAlert, routing: Route, 'check-out': CalendarClock, 'meter-period': Gauge }

export default function ManagerDashboard() {
  const { term, user, block } = useSession()
  const scope = useScopeQuery()
  const query = useQuery(['dashboard', 'manager', scope], ({ signal }) => api.dashboards.manager(scope, { signal }))
  const approvals = useQuery(['dashboard', 'approvals', scope], ({ signal }) => api.approvals.summary(scope, { signal }))
  const round2 = useQuery(['round2', term?.id], ({ signal }) => api.assignment.round2(term?.id, { signal }), { enabled: Boolean(term) })
  const claims = useQuery(['dashboard', 'claims', scope], ({ signal }) => api.paymentClaims.list({ ...scope, pageSize: 1 }, { signal }))
  const staff = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))

  const d = query.data
  const k = d?.kpis
  const w = d?.work
  const a = approvals.data
  const r2 = round2.data
  const claim = claims.data?.summary
  const proposal = w?.proposal
  // One line for every missing routing rule (a Block and a request type each), not one line per rule.
  const routingGaps = (d?.waiting ?? []).filter((x) => x.kind === 'routing')
  const gapBlocks = [...new Set(routingGaps.map((x) => x.values?.block ?? /Block (\w+)/.exec(x.title)?.[1]).filter(Boolean))]

  const items = [
    claim?.count > 0 && {
      id: 'claims',
      icon: Banknote,
      tone: 'warning',
      title: t('{n} transfers to confirm', { n: formatNumber(claim.count) }),
      meta: t('{amount} that students say they transferred; their deadlines are paused until you decide', { amount: formatCompactVnd(claim.amount) }),
      action: { label: 'Confirm', to: '/manager/payment-claims', primary: true },
    },
    w?.toReview > 0 && {
      id: 'applications',
      icon: FileText,
      tone: 'info',
      title: t('{n} Applications to review', { n: formatNumber(w.toReview) }),
      meta: t('{s} Submitted · {u} Under Review', { s: w.submitted, u: w.underReview }),
      action: { label: 'Review', to: '/manager/applications' },
    },
    proposal && proposal.committedBlocks < proposal.totalBlocks && {
      id: 'proposal',
      icon: Layers,
      tone: proposal.conflicts ? 'warning' : 'info',
      title: t('{run}: {c} of {n} Blocks committed', { run: proposal.runId, c: proposal.committedBlocks, n: proposal.totalBlocks }),
      meta: proposal.conflicts ? t('{n} conflicts to resolve before committing', { n: proposal.conflicts }) : t('{n} students proposed; commit each Block to allocate them', { n: proposal.proposed }),
      action: { label: proposal.conflicts ? 'Resolve' : 'Commit', to: `/manager/assignment/${proposal.runId}` },
    },
    r2?.waitlisted > 0 && {
      id: 'round2',
      icon: Repeat2,
      tone: 'info',
      title: t('{n} waitlisted students without a Round 2 offer', { n: formatNumber(r2.waitlisted) }),
      meta: r2.freeBeds ? t('{n} free Beds can be offered', { n: formatNumber(r2.freeBeds) }) : t('No free Bed yet: they get one when a Bed frees up'),
      action: { label: 'Round 2', to: '/manager/assignment?tab=round2' },
    },
    r2?.openOffers > 0 && {
      id: 'round2-open',
      icon: Repeat2,
      title: t('{n} Round 2 offers waiting for an answer', { n: formatNumber(r2.openOffers) }),
      meta: 'Their Beds are held until each offer expires',
      action: { label: 'See who', to: '/manager/assignment?tab=round2' },
    },
    a?.lateCheckIn > 0 && {
      id: 'late',
      icon: CalendarClock,
      tone: 'warning',
      title: t('{n} late check-ins to decide', { n: formatNumber(a.lateCheckIn) }),
      meta: 'Students asked to move in after the check-in window',
      action: { label: 'Decide', to: '/manager/approvals' },
    },
    a?.swaps > 0 && {
      id: 'swaps',
      icon: ArrowRightLeft,
      title: t('{n} swaps waiting for a Manager', { n: formatNumber(a.swaps) }),
      meta: 'Both students agreed; the swap needs your decision',
      action: { label: 'Decide', to: '/manager/room-changes/swaps' },
    },
    k?.escalationsWaiting > 0 && {
      id: 'escalations',
      icon: TriangleAlert,
      tone: 'error',
      title: t('{n} overdue requests', { n: formatNumber(k.escalationsWaiting) }),
      meta: 'Past their time limit: reassign them or offer a temporary Bed',
      action: { label: 'Handle', to: '/manager/escalations', primary: true },
    },
    k?.refundsWaiting > 0 && {
      id: 'refunds',
      icon: CreditCard,
      tone: 'warning',
      title: t('{n} refunds to decide', { n: formatNumber(k.refundsWaiting) }),
      meta: 'Cancelled Applications, ended stays and terminations',
      action: { label: 'Decide', to: '/manager/finance' },
    },
    ...(d?.waiting ?? [])
      .filter((x) => x.kind === 'check-out' || x.kind === 'meter-period')
      .map((x) => ({
        id: x.id,
        icon: waitingIcon[x.kind] ?? TriangleAlert,
        tone: x.severity === 'error' ? 'error' : x.severity === 'warning' ? 'warning' : 'info',
        title: attentionText(x).title,
        meta: attentionText(x).body,
        action: x.link ? { label: x.cta ?? 'Open', to: x.link } : null,
      })),
  ].filter(Boolean)

  const journey = termJourney(term, {
    assignment: w?.toReview ? t('{n} Applications to review', { n: w.toReview }) : proposal && proposal.committedBlocks < proposal.totalBlocks ? t('{run} in review', { run: proposal.runId }) : undefined,
    payment: claim?.count ? t('{n} transfers to confirm', { n: claim.count }) : undefined,
  })
  const people = staff.data?.items ?? []
  const s = staff.data?.summary
  const loading = query.loading && !d

  return (
    <>
      <PageHeader
        title={d?.block ? t('Block {code} overview', { code: d.block }) : 'Dormitory overview'}
        description={[formatDate(new Date()), term?.name, user?.name].filter(Boolean).join(' · ')}
        actions={
          <Button icon={Download} to="/manager/reports">
            Reports
          </Button>
        }
      />

      <StaleNotice query={query} />

      {term && (
        <Panel title={t('Term {name}', { name: term.name })} subtitle="The highlighted stage is now; under it, what waits for a Manager" className="shrink-0" bodyClassName="overflow-visible pt-1">
          <Journey steps={journey} />
          <StageNow role="manager" term={term} />
        </Panel>
      )}

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Bed} label="Occupancy" value={k ? formatPercent(k.beds ? Math.floor((k.allocated / k.beds) * 100) / 100 : null, 0) : '—'} note={k ? t('{n} Beds held of {total} · {r} living in', { n: formatNumber(k.allocated), total: formatNumber(k.beds), r: formatNumber(k.residents) }) : null} />
        <KpiTile icon={Banknote} label="Collected this Term" value={<span title={t(COLLECTED_RULE)}>{formatCompactVnd(k?.collected)}</span>} note={k ? collectedNote(k) : null} />
        <KpiTile
          icon={Wrench}
          label="Maintenance SLA"
          value={k ? formatPercent(k.slaRate, 0) : '—'}
          valueTone={k && k.slaRate >= k.slaTarget ? 'success' : k ? 'warning' : undefined}
          note={k ? t('Resolved within {h} h · target {p}', { h: k.slaHours, p: formatPercent(k.slaTarget, 0) }) : null}
        />
        <KpiTile icon={TriangleAlert} label="Waiting for you" value={loading ? '—' : formatNumber(items.length)} valueTone={items.length ? 'warning' : undefined} note="Decisions in the list below" />
      </div>

      <div className="grid min-h-80 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-4">
        <Panel title="Waiting for you" subtitle="Every decision that needs a Manager, the most urgent first">
          <QueryState query={query} compact isEmpty={() => false}>
            {() => <WorkList items={items} empty={<EmptyBlock title="Nothing is waiting for you">New transfers, Applications, proposals and requests appear here.</EmptyBlock>} />}
          </QueryState>
          {routingGaps.length > 0 && (
            <p className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-sm text-fg-secondary">
              <Route size={14} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
              <span className="min-w-0 flex-1">
                {t('Set-up: {n} routing rules missing (Blocks {list}); those requests wait until someone takes them.', { n: routingGaps.length, list: gapBlocks.join(', ') })}
              </span>
              <Link to="/manager/routing-rules" className="shrink-0 font-medium text-fg-link hover:underline">
                {t('Add rules')}
              </Link>
            </p>
          )}
        </Panel>

        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="Beds by Block" subtitle="Allocated and proposed Beds against capacity" className="min-h-0 flex-1">
            <QueryState query={query} compact isEmpty={(x) => !x.bedsByBlock?.length}>
              {(data) => <CapacityRows rows={data.bedsByBlock.map((b) => ({ name: t('Block {code}', { code: b.block }), used: b.proposed, total: b.capacity }))} />}
            </QueryState>
            {d?.floorNote && <p className="pt-2 text-sm text-fg-tertiary">{tr(d.floorNote)}</p>}
          </Panel>

          <Panel
            title="Staff on duty"
            subtitle={s ? t('{n} of {total} on duty · new requests go to them', { n: s.onDuty, total: s.total }) : null}
            action={
              <Button variant="text" size="sm" icon={Users} iconSize={16} to="/manager/staff">
                Workload
              </Button>
            }
            className="min-h-0 flex-1"
          >
            <QueryState query={staff} compact isEmpty={(x) => !x.items?.length}>
              {() => (
                <ul className="flex flex-col divide-y divide-line">
                  {[...people]
                    .sort((x, y) => Number(y.onDuty) - Number(x.onDuty) || y.open - x.open)
                    .map((p) => (
                      <li key={p.id} className="flex items-center gap-2.5 py-2">
                        <Avatar name={p.name} size={28} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base text-fg">{p.name}</span>
                          <span className="truncate text-sm text-fg-tertiary">{p.handles.map((h) => tr(h)).join(', ') || tr(p.title)}</span>
                        </div>
                        <span className="shrink-0 text-sm text-fg-secondary tabular">{t('{n} open', { n: p.open })}</span>
                        <span title={t(p.onDuty ? 'On duty' : 'Off duty')} className={cx('size-2 shrink-0 rounded-full', p.onDuty ? 'bg-success' : 'bg-gray-300')} />
                      </li>
                    ))}
                </ul>
              )}
            </QueryState>
          </Panel>
        </div>
      </div>
    </>
  )
}
