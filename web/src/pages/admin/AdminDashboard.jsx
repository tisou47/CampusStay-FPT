import { Link } from 'react-router'
import {
  ArrowRight,
  Banknote,
  Bed,
  Building,
  Calendar,
  ChevronRight,
  CircleX,
  ClipboardList,
  Hourglass,
  RefreshCw,
  ScrollText,
  TimerOff,
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
//   funnel: [{ label, value }], funnelOutside: { continuing, waitlisted, rejected, expired } }
// The page shows the Term at a glance (four tiles), how its Applications moved through registration and the
// screens an Admin opens most.

/** Who the funnel leaves out, each with a line saying why. */
const OUTSIDE = [
  { key: 'continuing', icon: RefreshCw, label: 'Continuing residents', note: 'Kept their Bed from last Term, no new Application' },
  { key: 'waitlisted', icon: Hourglass, label: 'Waitlisted', note: 'Waiting for a free Bed' },
  { key: 'rejected', icon: CircleX, label: 'Rejected', note: 'Not approved by a Manager' },
  { key: 'expired', icon: TimerOff, label: 'Deposits expired', note: 'Deposit not paid in time' },
]

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

function Outside({ counts }) {
  return (
    <section aria-labelledby="funnel-outside" className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="funnel-outside" className="text-base font-semibold text-fg">{t('Not in the funnel')}</h3>
        <p className="text-sm text-fg-tertiary">{t('Students of this Term the steps above do not count.')}</p>
      </div>
      <ul className="grid grid-cols-4 gap-3">
        {OUTSIDE.map(({ key, icon: Glyph, label, note }) => {
          const n = counts?.[key] ?? 0
          return (
            <li key={key} className="flex min-w-0 items-start gap-3 rounded-lg border border-line px-4 py-3">
              <span aria-hidden="true" className={cx('flex size-9 shrink-0 items-center justify-center rounded-md', n > 0 ? 'bg-primary-subtle text-fg-brand' : 'bg-subtle text-fg-tertiary')}>
                <Glyph size={18} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className={cx('text-h3 font-semibold tabular', n > 0 ? 'text-fg' : 'text-fg-tertiary')}>{formatNumber(n)}</p>
                <p className="text-sm font-medium text-fg-secondary">{t(label)}</p>
                <p className="text-sm text-fg-tertiary">{t(note)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
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
          {(data) => (
            <>
              <Funnel steps={data.funnel} />
              <Outside counts={data.funnelOutside} />
            </>
          )}
        </QueryState>
      </Card>

      <Shortcuts />
    </>
  )
}
