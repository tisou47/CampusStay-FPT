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
import { formatCompactVnd, formatDate, formatNumber, formatPercent } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-HOME-03 Manager Dashboard (Figma 61:249)
// GET /dashboards/manager?termId&block → { block,
//   kpis: { allocated, beds, collected, collectionRate, slaRate, slaTarget, slaHours, refundsWaiting, escalationsWaiting },
//   floors: [{ floor, allocated, beds }], floorNote,
//   waiting: [{ id, kind: 'refund'|'escalation'|'routing', severity, title, body, link, cta }] }

const kindIcon = { refund: CreditCard, escalation: TriangleAlert, routing: Wrench }
const severityTone = { warning: 'text-warning', error: 'text-error', info: 'text-info', neutral: 'text-fg-secondary' }

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
        title={d?.block ? t('Block {code} overview', { code: d.block }) : 'Dormitory overview'}
        description={[formatDate(new Date()), term?.name, user?.name].filter(Boolean).join(' · ')}
        actions={
          <Button icon={Download} to="/manager/reports">
            Reports
          </Button>
        }
      />

      <StaleNotice query={query} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Bed} label="Occupancy" value={k ? formatPercent(k.beds ? k.allocated / k.beds : null, 0) : '—'} note={k ? t('{n} of {total} Beds', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null} />
        <KpiTile icon={Banknote} label={`${t('Collected')}${term ? ` · ${term.name}` : ''}`} value={formatCompactVnd(k?.collected)} note={k ? t('{p} of invoiced', { p: formatPercent(k.collectionRate, 0) }) : null} />
        <KpiTile
          icon={Wrench}
          label="Maintenance SLA"
          value={k ? formatPercent(k.slaRate, 0) : '—'}
          valueTone={k && k.slaRate >= k.slaTarget ? 'success' : k ? 'warning' : undefined}
          note={k ? t('Resolved within {h} h · target {p}', { h: k.slaHours, p: formatPercent(k.slaTarget, 0) }) : null}
        />
        <KpiTile
          icon={TriangleAlert}
          label="Waiting for you"
          value={formatNumber(waitingCount)}
          valueTone={waitingCount ? 'warning' : undefined}
          note={k ? t('{r} refunds · {e} overdue requests', { r: k.refundsWaiting, e: k.escalationsWaiting }) : null}
        />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-start justify-between">
            <h2 className="text-h3 font-semibold text-fg">{t('Allocated Beds by Floor')}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.floors?.length}>
              {(data) => (
                <ul className="flex flex-col gap-2">
                  {data.floors.map((f) => (
                    <li key={f.floor} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-sm text-fg-secondary">{t('Floor {n}', { n: f.floor })}</span>
                      <Meter value={f.allocated} max={f.beds} tone={f.allocated === top ? 'accent' : 'accent-soft'} label={t('Floor {n} allocated Beds', { n: f.floor })} className="min-w-0 flex-1" />
                      <span className="w-20 shrink-0 text-right text-sm font-medium text-fg tabular">
                        {formatNumber(f.allocated)} / {formatNumber(f.beds)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </div>
          {d?.floorNote && <p className="shrink-0 text-sm text-fg-tertiary">{tr(d.floorNote)}</p>}
        </Card>

        <Card className="flex min-h-0 w-110 shrink-0 flex-col">
          <h2 className="mb-2 shrink-0 text-h3 font-semibold text-fg">{t('Waiting for you')}</h2>
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
                          <p className="truncate text-base font-medium text-fg">{tr(item.title)}</p>
                          {item.body && <p className="truncate text-sm text-fg-secondary">{tr(item.body)}</p>}
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
