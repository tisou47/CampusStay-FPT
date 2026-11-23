import { Link } from 'react-router'
import { ArrowRight, Bed, Building, Calendar, ClipboardList, FileText, ScrollText, SlidersHorizontal, User } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { QueryState, StaleNotice } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { daysFromToday, formatDate, formatNumber } from '@/lib/format'
import { floorPercent } from '@/lib/money'
import { t, tr } from '@/i18n'

// SCR-HOME-04 Admin Dashboard
// GET /dashboards/admin?termId → { term: { name, statusLabel, endsAt }, kpis: { residents, beds, allocated, collected,
//   invoiced, collectionRate, outstanding, outstandingInvoices, activeUsers, students, staff, managers },
//   funnel: [{ label, value }], blocks: [{ block, gender, allocated, beds }] }
// One screen, no scrolling: three headline tiles, then one chart per question — how Applications moved through
// registration (columns), how many Beds are held (donut), who the accounts are (part-to-whole bar) — and the screens
// an Admin opens most. Money is left to the Managers' finance screens.

/** Screens an Admin opens most. */
const SHORTCUTS = [
  { to: '/admin/terms', icon: Calendar, label: 'Terms' },
  { to: '/admin/term-requests', icon: ClipboardList, label: 'Requests' },
  { to: '/admin/buildings', icon: Building, label: 'Buildings and rooms' },
  { to: '/admin/users', icon: User, label: 'Users and roles' },
  { to: '/admin/audit-log', icon: ScrollText, label: 'Audit log' },
  { to: '/admin/system-parameters', icon: SlidersHorizontal, label: 'System parameters' },
]

/** Account groups in a fixed order with fixed hues (checked for colour-blind separation); labels sit beside them. */
const ACCOUNT_GROUPS = [
  { key: 'students', label: 'Students', color: 'var(--color-info)' },
  { key: 'staff', label: 'Staff', color: '#0d9488' },
  { key: 'managers', label: 'Managers', color: 'var(--color-accent)' },
]

/** A card holding one chart: title, optional headline on the right, the chart filling the rest. */
function ChartCard({ title, aside, className, children }) {
  return (
    <Card className={cx('flex min-h-0 min-w-0 flex-col gap-3', className)}>
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="text-h3 font-semibold text-fg">{title}</h2>
        {aside}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </Card>
  )
}

/** Registration as columns: each step's count, its height against the first step and the share kept from the step before. */
function FunnelColumns({ steps }) {
  const top = Math.max(steps[0]?.value || 0, 1)
  return (
    <ol className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={t('Application funnel')}>
      {steps.map((s, i) => {
        const prev = steps[i - 1]?.value
        const kept = i > 0 && prev > 0 ? s.value / prev : null
        const last = i === steps.length - 1
        return (
          <li key={s.label} className="flex min-h-0 min-w-0 flex-col gap-2">
            <div className="flex min-h-0 flex-1 flex-col justify-end rounded-md bg-subtle/60 px-[18%] pt-2">
              <span className="mb-1 text-center text-h3 font-semibold text-fg tabular">{formatNumber(s.value)}</span>
              <div
                title={`${tr(s.label)}: ${formatNumber(s.value)}`}
                className={cx('rounded-t-[4px] transition-[height]', last ? 'bg-primary' : 'bg-accent')}
                style={{ height: s.value > 0 ? `max(${(s.value / top) * 100}%, 4px)` : 0 }}
              />
            </div>
            <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
              <span className={cx('w-full truncate text-sm font-medium', last ? 'text-fg-brand' : 'text-fg-secondary')} title={tr(s.label)}>
                {tr(s.label)}
              </span>
              <span className="text-xs text-fg-tertiary tabular">{kept == null ? t('Start') : t('{p} of the step before', { p: floorPercent(kept) })}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Donut of parts that make a whole, 2 px gaps between the parts, the headline in the hole. */
function Donut({ parts, size = 148, thickness = 18, label, children }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 2 : 0
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-subtle, #f5f0eb)" strokeWidth={thickness} />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c
            const seg = (
              <circle
                key={p.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
                strokeDashoffset={-offset}
              >
                <title>{`${tr(p.label)}: ${formatNumber(p.value)}`}</title>
              </circle>
            )
            offset += len
            return seg
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/** A part's share of the whole; a part that is there but under 1% reads <1%, never 0%. */
const share = (part, total) => (!total ? null : part > 0 && part / total < 0.01 ? '<1%' : floorPercent(part / total))

/** Legend row: colour swatch, label, value (text in text colours; the swatch carries identity). */
function LegendRow({ color, label, value, note }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-fg-secondary">{label}</span>
      <span className="font-medium text-fg tabular">{value}</span>
      {note && <span className="w-10 text-right text-fg-tertiary tabular">{note}</span>}
    </li>
  )
}

function BedsCard({ k }) {
  const free = Math.max(k.beds - k.allocated, 0)
  const notIn = Math.max(k.allocated - k.residents, 0)
  const parts = [
    { label: t('Living in'), value: Math.min(k.residents, k.allocated), color: 'var(--color-primary)' },
    { label: t('Held, not moved in yet'), value: notIn, color: 'var(--color-orange-300, #fdaa74)' },
    { label: t('Still free'), value: free, color: 'var(--color-gray-300, #d9cec4)' },
  ]
  return (
    <ChartCard title={t('Beds this term')} className="col-span-4">
      <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-x-5 gap-y-3">
        <Donut parts={parts} label={t('{n} beds held of {total}', { n: formatNumber(k.allocated), total: formatNumber(k.beds) })}>
          <span className="text-h1 font-semibold text-fg tabular">{floorPercent(k.beds ? k.allocated / k.beds : 0)}</span>
          <span className="text-xs text-fg-tertiary">{t('of beds held')}</span>
        </Donut>
        <ul className="flex min-w-44 flex-1 flex-col gap-2.5">
          {parts.map((p) => (
            <LegendRow key={p.label} color={p.color} label={p.label} value={formatNumber(p.value)} />
          ))}
          <li className="mt-1 border-t border-line pt-2 text-sm text-fg-tertiary">{t('{n} beds in service', { n: formatNumber(k.beds) })}</li>
        </ul>
      </div>
    </ChartCard>
  )
}

function AccountsCard({ k }) {
  const total = k.students + k.staff + k.managers
  return (
    <ChartCard title={t('Accounts')} aside={<span className="text-h3 font-semibold text-fg tabular">{formatNumber(total)}</span>} className="col-span-5">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
        <div className="flex h-4 w-full shrink-0 gap-0.5 overflow-hidden rounded-[4px]" role="img" aria-label={t('{s} students · {st} staff · {m} managers', { s: formatNumber(k.students), st: formatNumber(k.staff), m: formatNumber(k.managers) })}>
          {ACCOUNT_GROUPS.filter((g) => k[g.key] > 0).map((g) => (
            <div key={g.key} title={`${t(g.label)}: ${formatNumber(k[g.key])}`} style={{ flexGrow: k[g.key], flexBasis: 0, minWidth: 4, background: g.color }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-5">
          <ul className="flex min-w-0 flex-col gap-2">
            {ACCOUNT_GROUPS.map((g) => (
              <LegendRow key={g.key} color={g.color} label={t(g.label)} value={formatNumber(k[g.key])} note={share(k[g.key], total)} />
            ))}
          </ul>
          <div className="flex min-w-0 flex-col justify-center gap-2 border-l border-line pl-5">
            <span className="text-sm text-fg-secondary">{t('Signed in during the last 30 days')}</span>
            <span className="text-h2 font-semibold text-fg tabular">
              {formatNumber(k.activeUsers)} <span className="text-base font-normal text-fg-tertiary">/ {formatNumber(total)}</span>
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-info" style={{ width: `${total ? Math.min(100, (k.activeUsers / total) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      </div>
    </ChartCard>
  )
}

function Shortcuts() {
  return (
    <ChartCard title={t('Shortcuts')} className="col-span-7">
      <ul className="grid min-h-0 flex-1 grid-cols-2 content-center gap-2">
        {SHORTCUTS.map(({ to, icon: Glyph, label }) => (
          <li key={to} className="min-w-0">
            <Link to={to} className="group flex items-center gap-3 rounded-lg border border-line px-3 py-2 transition-colors hover:border-primary hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-primary">
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-subtle text-fg-secondary group-hover:bg-surface group-hover:text-fg-brand">
                <Glyph size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-base font-medium text-fg">{t(label)}</span>
              <ArrowRight aria-hidden="true" size={16} className="text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-brand" />
            </Link>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

export default function AdminDashboard() {
  const { term } = useSession()
  const query = useQuery(['dashboard', 'admin', term?.id], ({ signal }) => api.dashboards.admin({ termId: term?.id }, { signal }))
  const d = query.data
  const k = d?.kpis
  const funnel = d?.funnel ?? []
  const first = funnel[0]?.value
  const end = funnel[funnel.length - 1]?.value
  const daysLeft = d?.term?.endsAt ? daysFromToday(d.term.endsAt) : null

  return (
    <>
      <PageHeader title="System overview" />
      <StaleNotice query={query} />

      <div className="grid shrink-0 grid-cols-3 gap-4">
        <KpiTile
          icon={Calendar}
          label="Current term"
          value={<span className="text-h1">{d?.term?.name ?? '—'}</span>}
          note={d?.term?.endsAt ? [d.term.statusLabel && tr(d.term.statusLabel), daysLeft != null && daysLeft >= 0 ? t('{n} days left', { n: formatNumber(daysLeft) }) : t('Ends {date}', { date: formatDate(d.term.endsAt) })].filter(Boolean).join(' · ') : null}
        />
        <KpiTile icon={FileText} label="Applications" value={<span className="text-h1">{formatNumber(first)}</span>} note={first > 0 && end != null ? t('{p} have moved in', { p: floorPercent(end / first) }) : null} />
        <KpiTile icon={Bed} label="Living in" value={<span className="text-h1">{formatNumber(k?.residents)}</span>} note={k ? t('{n} beds held of {total}', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[minmax(0,1.45fr)_minmax(0,1fr)] gap-4">
        <ChartCard
          title={d?.term ? t('{term} application funnel', { term: d.term.name }) : t('Application funnel')}
          className="col-span-8"
        >
          <QueryState query={query} compact isEmpty={(x) => !x.funnel?.length}>
            {(data) => <FunnelColumns steps={data.funnel} />}
          </QueryState>
        </ChartCard>
        {k ? <BedsCard k={k} /> : <Card className="col-span-4" />}
        {k ? <AccountsCard k={k} /> : <Card className="col-span-5" />}
        <Shortcuts />
      </div>
    </>
  )
}
