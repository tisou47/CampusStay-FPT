import { Building, Clock, CreditCard, FileText, Layers, LogIn, TriangleAlert, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { EmptyBlock, QueryState, StaleNotice } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import { t, tr, tx } from '@/i18n'

// SCR-HOME-02 Staff Dashboard (Figma 34:1147) — "Today" for a Block's Staff (Change Spec v2 §11.2): attention items about
// Rooms and maintenance, the check-in plan and Beds by Block. Applications, payments and the assignment are Managers' (ADR-19).
// GET /dashboards/staff?termId&block → {
//   kpis: { toReview, submitted, underReview, paymentsToConfirm, proposal: { runId, proposed, requested, conflicts, waitlisted, committedBlocks, totalBlocks } | null,
//           roomsOutOfService, firstOutOfService: { room, since } | null },
//   attention: [{ id, kind, severity, title, body, link, cta }],
//   applicationsByStatus: [{ status, count }], applicationsTotal,
//   checkInPlan: { start, end, days: [{ date, morning, afternoon }] } | null,
//   bedsByBlock: [{ block, proposed, capacity }] }

const kindIcon = { proposal: Layers, payments: CreditCard, room: Building, queue: FileText, expired: Clock, maintenance: Wrench }
const severityTone = { warning: 'text-warning', error: 'text-error', info: 'text-info', neutral: 'text-neutral' }
/** Attention items Staff act on; the others belong to Managers. */
const STAFF_KINDS = new Set(['room', 'maintenance'])

function greeting(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = name?.trim().split(/\s+/).at(-1)
  return first ? t(`${part}, {name}`, { name: first }) : t(part)
}

function CardHead({ title, note }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3">
      <h2 className="text-h3 font-semibold text-fg">{tx(title)}</h2>
      {note && <span className="text-sm text-fg-tertiary">{tx(note)}</span>}
    </div>
  )
}

export default function StaffDashboard() {
  const { user, term, block, blocks } = useSession()
  const scope = useScopeQuery()
  const query = useQuery(['dashboard', 'staff', scope], ({ signal }) => api.dashboards.staff(scope, { signal }))
  const d = query.data
  const k = d?.kpis
  const attention = (d?.attention ?? []).filter((item) => STAFF_KINDS.has(item.kind))
  const today = new Date().toDateString()
  const todayPlan = d?.checkInPlan?.days?.find((day) => new Date(day.date).toDateString() === today)
  const scopeLabel = block ? t('Block {code}', { code: block }) : blocks.length ? t('Blocks: {list}', { list: blocks.join(', ') }) : null

  return (
    <>
      <div className="flex shrink-0 items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-h1 font-semibold text-fg">{greeting(user?.name)}</h1>
          <p className="text-base text-fg-secondary">{[formatDate(new Date()), term?.name, scopeLabel].filter(Boolean).join(' · ')}</p>
        </div>
        <Button variant="primary" icon={LogIn} to="/staff/check-in">
          Check-in desk
        </Button>
      </div>

      <StaleNotice query={query} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={LogIn} label="Check-ins planned today" value={formatNumber(todayPlan ? todayPlan.morning + todayPlan.afternoon : 0)} note={todayPlan ? t('{m} morning · {a} afternoon', { m: formatNumber(todayPlan.morning), a: formatNumber(todayPlan.afternoon) }) : t('No check-ins planned today')} />
        <KpiTile icon={Wrench} label="Needs your attention" value={formatNumber(d ? attention.length : null)} note="Rooms and maintenance" noteTone={attention.length ? 'warning' : 'secondary'} />
        <KpiTile
          icon={Building}
          label="Rooms out of service"
          value={formatNumber(k?.roomsOutOfService)}
          note={k?.firstOutOfService ? t('{room} · since {date}', { room: k.firstOutOfService.room, date: formatDate(k.firstOutOfService.since) }) : k ? t('All Rooms in service') : null}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <Card className="flex min-h-0 flex-col gap-2 px-5 py-4">
          <CardHead title="Needs your attention" note={d ? t('{n} items', { n: attention.length }) : null} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={() => !attention.length} empty={<EmptyBlock icon={TriangleAlert} title="Nothing needs your attention" />}>
              {() => (
                <ul className="flex flex-col">
                  {attention.map((item, i) => {
                    const Glyph = kindIcon[item.kind] ?? TriangleAlert
                    return (
                      <li key={item.id ?? item.title} className={cx('flex items-center gap-3 py-1.5', i < attention.length - 1 && 'border-b border-line')}>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle">
                          <Glyph size={16} aria-hidden="true" className={severityTone[item.severity] ?? 'text-fg-secondary'} />
                        </span>
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

        <Card className="flex min-h-0 flex-col gap-2 px-5 py-4">
          <CardHead title={d?.checkInPlan ? t('Check-in plan · {start} – {end}', { start: formatDate(d.checkInPlan.start), end: formatDate(d.checkInPlan.end) }) : t('Check-in plan')} note="Proposed allocations" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.checkInPlan?.days?.length} empty={<EmptyBlock title="No check-in plan yet">It appears after the assignment proposal is ready.</EmptyBlock>}>
              {(data) => (
                <table className="w-full text-base">
                  <thead>
                    <tr className="bg-subtle text-sm font-medium text-fg-secondary">
                      <th scope="col" className="rounded-l-sm px-1 py-1.5 text-left font-medium">
                        {t('Day')}
                      </th>
                      <th scope="col" className="px-1 py-1.5 text-right font-medium">
                        {t('Morning')}
                      </th>
                      <th scope="col" className="px-1 py-1.5 text-right font-medium">
                        {t('Afternoon')}
                      </th>
                      <th scope="col" className="rounded-r-sm px-1 py-1.5 text-right font-medium">
                        {t('Total')}
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

        <Card className="row-span-2 flex min-h-0 flex-col gap-3.5 px-5 py-4">
          <CardHead title="Beds proposed by Block" />
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
            <QueryState query={query} compact isEmpty={(x) => !x.bedsByBlock?.length}>
              {(data) =>
                data.bedsByBlock.map((b) => (
                  <div key={b.block} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-base">
                      <span className="font-medium text-fg">{t('Block {code}', { code: b.block })}</span>
                      <span className="text-fg-secondary">
                        {t('{n} of {total}', { n: formatNumber(b.proposed), total: formatNumber(b.capacity) })} · {formatPercent(b.capacity ? b.proposed / b.capacity : null, 0)}
                      </span>
                    </div>
                    <Meter value={b.proposed} max={b.capacity} tone="accent" label={t('Block {code} Beds proposed', { code: b.block })} />
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
