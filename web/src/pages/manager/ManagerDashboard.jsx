import { Banknote, Bed, CreditCard, Download, TriangleAlert, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatPercent, formatVnd } from '@/lib/format'

// SCR-HOME-03 Manager Dashboard (Figma 61:249)
// GET /dashboards/manager?termId&block → { block,
//   kpis: { allocated, beds, collected, collectionRate, slaRate, slaTarget, slaHours, refundsWaiting, escalationsWaiting },
//   floors: [{ floor, allocated, beds }], floorNote,
//   waiting: [{ id, kind: 'refund'|'escalation'|'routing', severity, title, body, link, cta }] }

const kindIcon = { refund: CreditCard, escalation: TriangleAlert, routing: Wrench }
const severityTone = { warning: 'text-warning', error: 'text-error', info: 'text-info', neutral: 'text-fg-secondary' }

/** 1,530,000,000 → "1.53 bn VND". */
function compactVnd(n) {
  if (n == null) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} bn VND`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} m VND`
  return formatVnd(n)
}

export default function ManagerDashboard() {
  const { term, user } = useSession()
  const scope = useScopeQuery()
  const query = useQuery(['dashboard', 'manager', scope], ({ signal }) => api.dashboards.manager(scope, { signal }))
  const d = query.data
  const k = d?.kpis
  const waitingCount = k ? k.refundsWaiting + k.escalationsWaiting : null
  const top = Math.max(0, ...(d?.floors ?? []).map((f) => f.allocated))

  return (
    <>
      <PageHeader
        title={d?.block ? `Block ${d.block} overview` : 'Block overview'}
        description={[formatDate(new Date()), term?.name, user?.name && `Manager ${user.name}`].filter(Boolean).join(' · ')}
        actions={
          <Button icon={Download} to="/manager/reports">
            Block report
          </Button>
        }
      />

      <StaleNotice query={query} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Bed} label="Occupancy" value={k ? formatPercent(k.beds ? k.allocated / k.beds : null, 0) : '—'} note={k ? `${formatNumber(k.allocated)} of ${formatNumber(k.beds)} Beds` : null} />
        <KpiTile icon={Banknote} label={`Collected${term ? ` · ${term.name}` : ''}`} value={compactVnd(k?.collected)} note={k ? `${formatPercent(k.collectionRate, 0)} of invoiced` : null} />
        <KpiTile
          icon={Wrench}
          label="Maintenance SLA"
          value={k ? formatPercent(k.slaRate, 0) : '—'}
          valueTone={k && k.slaRate >= k.slaTarget ? 'success' : k ? 'warning' : undefined}
          note={k ? `Resolved within ${k.slaHours} h · target ${formatPercent(k.slaTarget, 0)}` : null}
        />
        <KpiTile
          icon={TriangleAlert}
          label="Waiting for you"
          value={formatNumber(waitingCount)}
          valueTone={waitingCount ? 'warning' : undefined}
          note={k ? `${k.refundsWaiting} refunds · ${k.escalationsWaiting} escalations` : null}
        />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-start justify-between">
            <h2 className="text-h3 font-semibold text-fg">Allocated Beds by Floor</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.floors?.length}>
              {(data) => (
                <ul className="flex flex-col gap-2">
                  {data.floors.map((f) => (
                    <li key={f.floor} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-sm text-fg-secondary">Floor {f.floor}</span>
                      <Meter value={f.allocated} max={f.beds} tone={f.allocated === top ? 'accent' : 'accent-soft'} label={`Floor ${f.floor} allocated Beds`} className="min-w-0 flex-1" />
                      <span className="w-20 shrink-0 text-right text-sm font-medium text-fg tabular">
                        {formatNumber(f.allocated)} / {formatNumber(f.beds)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </div>
          {d?.floorNote && <p className="shrink-0 text-sm text-fg-tertiary">{d.floorNote}</p>}
        </Card>

        <Card className="flex min-h-0 w-110 shrink-0 flex-col">
          <h2 className="mb-2 shrink-0 text-h3 font-semibold text-fg">Waiting for you</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.waiting?.length} empty={<EmptyBlock title="Nothing is waiting for you" />}>
              {(data) => (
                <ul className="flex flex-col">
                  {data.waiting.map((item) => {
                    const Glyph = kindIcon[item.kind] ?? TriangleAlert
                    return (
                      <li key={item.id} className="flex items-center gap-3 border-b border-line py-2.5">
                        <Glyph size={20} aria-hidden="true" className={cx('shrink-0', severityTone[item.severity] ?? 'text-warning')} />
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
      </div>
    </>
  )
}
