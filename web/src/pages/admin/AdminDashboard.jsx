import { Link } from 'react-router'
import {
  ArrowRight,
  Banknote,
  Bed,
  Building,
  Calendar,
  ChevronRight,
  ClipboardList,
  ScrollText,
  User,
  Users,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card, CardHeader } from '@/components/ui/Display'
import { QueryState, StaleNotice } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { daysFromToday, formatCompactVnd, formatDate, formatNumber, formatPercent } from '@/lib/format'
import { COLLECTED_RULE, floorPercent } from '@/lib/money'
import { t, tr } from '@/i18n'

// SCR-HOME-04 Admin Dashboard
// GET /dashboards/admin?termId → { term: { name, statusLabel, endsAt }, kpis: { residents, beds, allocated, collected,
//   invoiced, collectionRate, outstanding, outstandingInvoices, activeUsers, students, staff, managers },
//   funnel: [{ label, value }], blocks: [{ block, gender, allocated, beds }] }
// The page shows the Term at a glance (four tiles), how its Applications moved through registration, how full
// each Block is and the screens an Admin opens most.

/** Screens an Admin opens most, with what each is for. */
const SHORTCUTS = [
  { to: '/admin/terms', icon: Calendar, label: 'Terms', note: 'Build, publish and follow each Term' },
  { to: '/admin/term-requests', icon: ClipboardList, label: 'Requests', note: "Managers' requests for a new Term" },
  { to: '/admin/buildings', icon: Building, label: 'Buildings and rooms', note: 'Blocks, floors, Rooms and Beds' },
  { to: '/admin/users', icon: User, label: 'Users and roles', note: 'Manager and Staff accounts' },
  { to: '/admin/audit-log', icon: ScrollText, label: 'Audit log', note: 'Who changed what, and when' },
]

/** The registration steps in a row: count, a bar against the first step and the share kept from the step before. */
function Funnel({ steps }) {
  const top = steps[0]?.value || 1
  return (
    <ol className="grid grid-cols-5 gap-x-6" aria-label={t('Application funnel')}>
      {steps.map((f, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        const rate = prev ? f.value / prev : null
        const lost = prev != null ? Math.max(prev - f.value, 0) : 0
        const last = i === steps.length - 1
        return (
          <li key={f.label} className="relative flex min-w-0">
            {i > 0 && (
              <ChevronRight aria-hidden="true" size={16} className="absolute top-1/2 -left-5 -translate-y-1/2 text-fg-tertiary" />
            )}
            <div
              className={cx('flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-4', last ? 'border-primary bg-primary-subtle' : 'border-line bg-canvas')}
              title={`${tr(f.label)}: ${formatNumber(f.value)}${rate != null ? ` (${t('{p} of previous stage', { p: formatPercent(rate, 0) })})` : ''}`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular',
                    last ? 'bg-primary text-fg-on-brand' : 'bg-surface text-fg-secondary ring-1 ring-line-strong',
                  )}
                >
                  {i + 1}
                </span>
                <span className={cx('truncate text-sm font-medium', last ? 'text-fg-brand' : 'text-fg-secondary')}>{tr(f.label)}</span>
              </div>
              <p className="text-h1 font-semibold text-fg tabular">{formatNumber(f.value)}</p>
              <Meter value={f.value} max={top} tone={last ? 'accent' : 'accent-soft'} label={f.label} className="h-1.5" />
              <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                <span className="text-fg-tertiary">{rate != null ? t('{p} of previous stage', { p: formatPercent(rate, 0) }) : t('Starting point')}</span>
                {lost > 0 && (
                  <span className="rounded-full bg-warning-bg px-2 py-0.5 font-medium whitespace-nowrap text-warning-fg tabular" title={t('{n} did not reach this step', { n: formatNumber(lost) })}>
                    −{formatNumber(lost)}
                  </span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** One tile per Block: Beds held of the Beds in service, the share and the Beds still free. */
function BlockOccupancy({ blocks }) {
  const held = blocks.reduce((s, b) => s + b.allocated, 0)
  const beds = blocks.reduce((s, b) => s + b.beds, 0)
  return (
    <Card className="flex shrink-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <CardHeader title="Occupancy by Block" description="Beds held this Term out of the Beds in service, per Block." />
        {beds > 0 && (
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-h2 font-semibold text-fg tabular">{floorPercent(held / beds)}</span>
            <span className="text-sm text-fg-tertiary">{t('{n} beds held of {total}', { n: formatNumber(held), total: formatNumber(beds) })}</span>
          </div>
        )}
      </div>
      <ul className="grid grid-cols-4 gap-3">
        {[...blocks]
          .sort((a, b) => a.block.localeCompare(b.block))
          .map((b) => {
            const free = Math.max(b.beds - b.allocated, 0)
            const rate = b.beds ? b.allocated / b.beds : 0
            return (
              <li key={b.block} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-fg">{t('Block {code}', { code: b.block })}</span>
                  {b.gender && (
                    <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', b.gender === 'Female' ? 'bg-error-bg text-error-fg' : 'bg-info-bg text-info-fg')}>{tr(b.gender)}</span>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-h2 font-semibold text-fg tabular">{floorPercent(rate)}</span>
                  <span className="text-sm text-fg-secondary tabular">
                    {formatNumber(b.allocated)}/{formatNumber(b.beds)}
                  </span>
                </div>
                <Meter value={b.allocated} max={b.beds} tone={rate >= 0.95 ? 'warning' : 'accent'} label={t('Block {code} allocated Beds', { code: b.block })} className="h-1.5" />
                <span className={cx('text-sm', free === 0 ? 'font-medium text-warning-fg' : 'text-fg-tertiary')}>{free === 0 ? t('Full') : t('{n} free', { n: formatNumber(free) })}</span>
              </li>
            )
          })}
      </ul>
    </Card>
  )
}

function Shortcuts() {
  return (
    <Card className="flex shrink-0 flex-col gap-4">
      <CardHeader title="Shortcuts" description="The screens you open most." />
      <ul className="grid grid-cols-5 gap-3">
        {SHORTCUTS.map(({ to, icon: Glyph, label, note }) => (
          <li key={to} className="flex">
            <Link
              to={to}
              className="group flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-line p-4 transition-colors hover:border-primary hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-md bg-subtle text-fg-secondary group-hover:bg-surface group-hover:text-fg-brand">
                  <Glyph size={18} />
                </span>
                <ArrowRight aria-hidden="true" size={16} className="text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-brand" />
              </div>
              <span className="text-base font-medium text-fg">{t(label)}</span>
              <span className="text-sm text-fg-tertiary">{t(note)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
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
  const accounts = k ? k.students + k.staff + k.managers : null

  return (
    <>
      <PageHeader title="System overview" />
      <StaleNotice query={query} />

      <div className="grid shrink-0 grid-cols-4 gap-4">
        <KpiTile icon={Calendar} label="Current term" value={<span className="text-h1">{d?.term?.name ?? '—'}</span>} note={d?.term?.endsAt ? t('Ends {date}', { date: formatDate(d.term.endsAt) }) : null}>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {d?.term?.statusLabel && <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-sm font-medium text-fg-brand">{tr(d.term.statusLabel)}</span>}
            {daysLeft != null && daysLeft >= 0 && <span className="text-sm text-fg-tertiary">{t('{n} days left', { n: formatNumber(daysLeft) })}</span>}
          </div>
        </KpiTile>

        <KpiTile icon={Bed} label="Living in" value={<span className="text-h1">{formatNumber(k?.residents)}</span>} note={k ? t('{n} beds held of {total}', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null}>
          {k && (
            <div className="mt-auto flex items-center gap-2 pt-1">
              <Meter value={k.allocated} max={k.beds} label="Beds held" className="h-1.5 flex-1" />
              <span className="text-sm font-medium text-fg-secondary tabular">{floorPercent(k.beds ? k.allocated / k.beds : 0)}</span>
            </div>
          )}
        </KpiTile>

        <KpiTile
          icon={Banknote}
          label="Collected this term"
          tip={t(COLLECTED_RULE)}
          value={<span className="text-h1">{formatCompactVnd(k?.collected)}</span>}
          note={k ? (k.outstanding > 0 ? t('{amount} unpaid · {n} invoices', { amount: formatCompactVnd(k.outstanding), n: formatNumber(k.outstandingInvoices) }) : t('Nothing unpaid')) : null}
          noteTone={k?.outstanding > 0 ? 'warning' : 'secondary'}
        >
          {k && (
            <div className="mt-auto flex items-center gap-2 pt-1">
              <Meter value={k.collected} max={k.invoiced} tone="success" label="Collection rate" className="h-1.5 flex-1" />
              <span className="text-sm font-medium text-fg-secondary tabular">{floorPercent(k.collectionRate)}</span>
            </div>
          )}
        </KpiTile>

        <KpiTile icon={Users} label="Active users" tip={t('Accounts that signed in during the last 30 days')} value={<span className="text-h1">{formatNumber(k?.activeUsers)}</span>} note={accounts != null ? t('of {n} accounts', { n: formatNumber(accounts) }) : null}>
          {k && (
            <p className="mt-auto pt-1 text-sm text-fg-tertiary">
              {t('{s} students · {st} staff · {m} managers', { s: formatNumber(k.students), st: formatNumber(k.staff), m: formatNumber(k.managers) })}
            </p>
          )}
        </KpiTile>
      </div>

      <Card className="flex shrink-0 flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-h3 font-semibold text-fg">{d?.term ? t('{term} application funnel', { term: d.term.name }) : t('Application funnel')}</h2>
            <p className="text-sm text-fg-tertiary">{t('Each step counts the Applications of the Term that reached it, in every Block.')}</p>
          </div>
          {first > 0 && end != null && (
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-h2 font-semibold text-fg-brand tabular">{floorPercent(end / first)}</span>
              <span className="text-sm text-fg-tertiary">{t('of applicants have moved in')}</span>
            </div>
          )}
        </div>
        <QueryState query={query} compact isEmpty={(x) => !x.funnel?.length}>
          {(data) => <Funnel steps={data.funnel} />}
        </QueryState>
      </Card>

      {d?.blocks?.length > 0 && <BlockOccupancy blocks={d.blocks} />}

      <Shortcuts />
    </>
  )
}
