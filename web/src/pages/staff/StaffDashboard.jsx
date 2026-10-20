import { Building, Clock, CreditCard, FileText, Layers, TriangleAlert, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { KpiTile, Meter, MeterRows } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'

// SCR-HOME-02 Staff Dashboard (Figma 34:1147)
// GET /dashboards/staff?termId&block → {
//   kpis: { toReview, submitted, underReview, paymentsToConfirm, proposal: { runId, proposed, requested, conflicts, waitlisted, committedBlocks, totalBlocks } | null,
//           roomsOutOfService, firstOutOfService: { room, since } | null },
//   attention: [{ id, kind, severity, title, body, link, cta }],
//   applicationsByStatus: [{ status, count }], applicationsTotal,
//   checkInPlan: { start, end, days: [{ date, morning, afternoon }] } | null,
//   bedsByBlock: [{ block, proposed, capacity }] }

const kindIcon = { proposal: Layers, payments: CreditCard, room: Building, queue: FileText, expired: Clock, maintenance: Wrench }
const severityTone = { warning: 'text-warning', error: 'text-error', info: 'text-info', neutral: 'text-neutral' }
const statusTone = { Submitted: 'info', 'Under Review': 'info', Approved: 'success', Waitlisted: 'warning', Rejected: 'error', Expired: 'neutral' }

function greeting(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = name?.trim().split(/\s+/).at(-1)
  return first ? `${part}, ${first}` : part
}

function CardHead({ title, note }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3">
      <h2 className="text-h3 font-semibold text-fg">{title}</h2>
      {note && <span className="text-sm text-fg-tertiary">{note}</span>}
    </div>
  )
}

export default function StaffDashboard() {
  const { user, term, block, blocks } = useSession()
  const scope = useScopeQuery()
  const query = useQuery(['dashboard', 'staff', scope], ({ signal }) => api.dashboards.staff(scope, { signal }))
  const d = query.data
  const k = d?.kpis
  const p = k?.proposal
  const scopeLabel = block ? `Block ${block}` : blocks.length ? `Blocks ${blocks.join(', ')}` : null

  return (
    <>
      <div className="flex shrink-0 items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-h1 font-semibold text-fg">{greeting(user?.name)}</h1>
          <p className="text-base text-fg-secondary">{[formatDate(new Date()), term?.name, scopeLabel].filter(Boolean).join(' · ')}</p>
        </div>
        <Button variant="primary" icon={Layers} to={p?.runId ? `/staff/assignment/${p.runId}` : '/staff/assignment'}>
          {p?.runId ? 'Open assignment proposal' : 'Assignment runs'}
        </Button>
      </div>

      <StaleNotice query={query} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={FileText} label="Applications to review" value={formatNumber(k?.toReview)} note={k ? `${formatNumber(k.submitted)} Submitted · ${formatNumber(k.underReview)} Under Review` : null} />
        <KpiTile icon={CreditCard} label="Payments to confirm" value={formatNumber(k?.paymentsToConfirm)} note="Manual transfers" noteTone={k?.paymentsToConfirm ? 'warning' : 'secondary'} />
        <KpiTile
          icon={Layers}
          label="Allocation proposal"
          value={p ? `${formatNumber(p.proposed)} / ${formatNumber(p.requested)}` : '—'}
          note={p ? (p.committedBlocks ? `${p.committedBlocks} of ${p.totalBlocks} Blocks committed` : `${p.conflicts} conflicts · ${p.waitlisted} waitlisted`) : 'No run this Term'}
          noteTone={p && !p.committedBlocks && p.conflicts ? 'warning' : p?.committedBlocks ? 'success' : 'secondary'}
        />
        <KpiTile
          icon={Building}
          label="Rooms out of service"
          value={formatNumber(k?.roomsOutOfService)}
          note={k?.firstOutOfService ? `${k.firstOutOfService.room} · since ${formatDate(k.firstOutOfService.since)}` : k ? 'All Rooms in service' : null}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px] grid-rows-2 gap-4">
        <Card className="flex min-h-0 flex-col gap-2 px-5 py-4">
          <CardHead title="Needs your attention" note={d?.attention ? `${d.attention.length} items` : null} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.attention?.length} empty={<EmptyBlock icon={TriangleAlert} title="Nothing needs your attention" />}>
              {(data) => (
                <ul className="flex flex-col">
                  {data.attention.map((item, i) => {
                    const Glyph = kindIcon[item.kind] ?? TriangleAlert
                    return (
                      <li key={item.id ?? item.title} className={cx('flex items-center gap-3 py-1.5', i < data.attention.length - 1 && 'border-b border-line')}>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle">
                          <Glyph size={16} aria-hidden="true" className={severityTone[item.severity] ?? 'text-fg-secondary'} />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <p className="truncate text-base font-medium text-fg">{item.title}</p>
                          {item.body && <p className="truncate text-sm text-fg-secondary">{item.body}</p>}
                        </div>
                        {item.link && (
                          <Button variant="text" to={item.link}>
                            {item.cta ?? 'Open'}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </QueryState>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col gap-3 px-5 py-4">
          <CardHead title="Applications by status" note={d ? [term?.name, `${formatNumber(d.applicationsTotal)} total`].filter(Boolean).join(' · ') : null} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.applicationsByStatus?.length}>
              {(data) => <MeterRows rows={data.applicationsByStatus.map((r) => ({ label: r.status, value: r.count, tone: statusTone[r.status] ?? 'neutral' }))} />}
            </QueryState>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col gap-2 px-5 py-4">
          <CardHead title={d?.checkInPlan ? `Check-in plan · ${formatDate(d.checkInPlan.start)} – ${formatDate(d.checkInPlan.end)}` : 'Check-in plan'} note="Proposed allocations" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.checkInPlan?.days?.length} empty={<EmptyBlock title="No check-in plan yet">It appears after the assignment proposal is ready.</EmptyBlock>}>
              {(data) => (
                <table className="w-full text-base">
                  <thead>
                    <tr className="bg-subtle text-sm font-medium text-fg-secondary">
                      <th scope="col" className="rounded-l-sm px-1 py-1.5 text-left font-medium">
                        Day
                      </th>
                      <th scope="col" className="px-1 py-1.5 text-right font-medium">
                        Morning
                      </th>
                      <th scope="col" className="px-1 py-1.5 text-right font-medium">
                        Afternoon
                      </th>
                      <th scope="col" className="rounded-r-sm px-1 py-1.5 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.checkInPlan.days.map((day) => (
                      <tr key={day.date} className="border-b border-line">
                        <td className="px-1 py-1.75 text-fg">{formatDate(day.date)}</td>
                        <td className="px-1 py-1.75 text-right tabular">{formatNumber(day.morning)}</td>
                        <td className="px-1 py-1.75 text-right tabular">{formatNumber(day.afternoon)}</td>
                        <td className="px-1 py-1.75 text-right font-medium tabular">{formatNumber(day.morning + day.afternoon)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </QueryState>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col gap-3.5 px-5 py-4">
          <CardHead title="Beds proposed by Block" />
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.bedsByBlock?.length}>
              {(data) =>
                data.bedsByBlock.map((b) => (
                  <div key={b.block} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-base">
                      <span className="font-medium text-fg">Block {b.block}</span>
                      <span className="text-fg-secondary">
                        {formatNumber(b.proposed)} of {formatNumber(b.capacity)} · {formatPercent(b.capacity ? b.proposed / b.capacity : null, 0)}
                      </span>
                    </div>
                    <Meter value={b.proposed} max={b.capacity} tone="accent" label={`Block ${b.block} Beds proposed`} />
                  </div>
                ))
              }
            </QueryState>
          </div>
        </Card>
      </div>
    </>
  )
}
