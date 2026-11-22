import { Banknote, Bed, Calendar, ChevronRight, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Card } from '@/components/ui/Display'
import { QueryState, StaleNotice } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatCompactVnd, formatDate, formatNumber, formatPercent } from '@/lib/format'
import { COLLECTED_RULE, collectedNote } from '@/lib/money'
import { t, tr } from '@/i18n'

// SCR-HOME-04 Admin Dashboard
// GET /dashboards/admin?termId → { term: { name, statusLabel, endsAt }, kpis: { residents, beds, allocated, collected,
//   invoiced, collectionRate, activeUsers, students, staff, managers }, funnel: [{ label, value }],
//   funnelOutside: { continuing, waitlisted, rejected, expired } }
// The page shows the Term at a glance (four tiles) and how its Applications moved through registration.

/** Who the funnel leaves out, each with a line saying why. */
const OUTSIDE = [
  { key: 'continuing', label: 'Continuing residents', note: 'Kept their Bed from last Term, no new Application' },
  { key: 'waitlisted', label: 'Waitlisted', note: 'Waiting for a free Bed' },
  { key: 'rejected', label: 'Rejected', note: 'Not approved by a Manager' },
  { key: 'expired', label: 'Deposits expired', note: 'Deposit not paid in time' },
]

/** The registration steps side by side: count, share of the step before and how many did not reach it. */
function Funnel({ steps }) {
  const top = steps[0]?.value || 1
  return (
    <ol className="grid grid-cols-5 gap-3" aria-label={t('Application funnel')}>
      {steps.map((f, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        const rate = prev ? f.value / prev : null
        const lost = prev != null ? prev - f.value : 0
        const last = i === steps.length - 1
        return (
          <li
            key={f.label}
            className={cx('relative flex min-w-0 flex-col gap-2 rounded-md p-4', last ? 'bg-primary-subtle ring-1 ring-primary' : 'bg-canvas')}
            title={`${tr(f.label)}: ${formatNumber(f.value)}${rate != null ? ` (${t('{p} of previous stage', { p: formatPercent(rate, 0) })})` : ''}`}
          >
            {i > 0 && (
              <span aria-hidden="true" className="absolute top-1/2 -left-3 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-fg-tertiary">
                <ChevronRight size={14} />
              </span>
            )}
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular',
                  last ? 'bg-primary text-fg-on-brand' : 'bg-subtle text-fg-secondary ring-1 ring-line-strong',
                )}
              >
                {i + 1}
              </span>
              <span className={cx('truncate text-sm font-medium', last ? 'text-fg-brand' : 'text-fg-secondary')}>{tr(f.label)}</span>
            </div>
            <p className="text-h1 font-semibold text-fg tabular">{formatNumber(f.value)}</p>
            <Meter value={f.value} max={top} tone={last ? 'accent' : 'accent-soft'} label={f.label} className="h-1.5" />
            <p className="text-sm text-fg-secondary">{rate != null ? t('{p} of previous stage', { p: formatPercent(rate, 0) }) : t('Starting point')}</p>
            <p className={cx('text-sm', lost > 0 ? 'text-warning-fg' : 'text-fg-tertiary')}>
              {lost > 0 ? t('{n} did not reach this step', { n: formatNumber(lost) }) : i > 0 ? t('Nobody dropped out') : ' '}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function Outside({ counts }) {
  return (
    <section aria-labelledby="funnel-outside" className="flex flex-col gap-2">
      <h3 id="funnel-outside" className="text-base font-semibold text-fg">{t('Not in the funnel')}</h3>
      <ul className="grid grid-cols-4 gap-3">
        {OUTSIDE.map((o) => (
          <li key={o.key} className="flex min-w-0 flex-col gap-0.5 rounded-md border border-line px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-fg-secondary">{t(o.label)}</span>
              <span className="text-h3 font-semibold text-fg tabular">{formatNumber(counts?.[o.key] ?? 0)}</span>
            </div>
            <span className="text-sm text-fg-tertiary">{t(o.note)}</span>
          </li>
        ))}
      </ul>
    </section>
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

  return (
    <>
      <PageHeader title="System overview" />
      <StaleNotice query={query} />

      <div className="flex shrink-0 gap-4">
        <KpiTile icon={Calendar} label="Current term" value={<span className="text-h1">{d?.term?.name ?? '—'}</span>} note={d?.term?.endsAt ? t('Ends {date}', { date: formatDate(d.term.endsAt) }) : null}>
          {d?.term?.statusLabel && <span className="mt-1 w-fit rounded-full bg-primary-subtle px-2 py-0.5 text-sm font-medium text-fg-brand">{tr(d.term.statusLabel)}</span>}
        </KpiTile>
        <KpiTile icon={Bed} label="Living in" value={<span className="text-h1">{formatNumber(k?.residents)}</span>} note={k ? t('{n} beds held of {total}', { n: formatNumber(k.allocated), total: formatNumber(k.beds) }) : null}>
          {k && <Meter value={k.allocated} max={k.beds} label="Beds held" className="mt-1 h-1.5" />}
        </KpiTile>
        <KpiTile icon={Banknote} label="Collected this term" tip={t(COLLECTED_RULE)} value={<span className="text-h1">{formatCompactVnd(k?.collected)}</span>} note={k ? collectedNote(k) : null}>
          {k && <Meter value={k.collected} max={k.invoiced} tone="success" label="Collection rate" className="mt-1 h-1.5" />}
        </KpiTile>
        <KpiTile
          icon={Users}
          label="Active users"
          value={<span className="text-h1">{formatNumber(k?.activeUsers)}</span>}
          note={k ? t('{s} students · {st} staff · {m} managers', { s: formatNumber(k.students), st: formatNumber(k.staff), m: formatNumber(k.managers) }) : null}
        />
      </div>

      <Card className="flex shrink-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-h3 font-semibold text-fg">{d?.term ? t('{term} application funnel', { term: d.term.name }) : t('Application funnel')}</h2>
            <p className="text-sm text-fg-tertiary">{t('Each step counts the Applications of the Term that reached it, in every Block.')}</p>
          </div>
          {first > 0 && end != null && (
            <p className="shrink-0 rounded-md bg-canvas px-3 py-2 text-sm text-fg-secondary">
              {t('{p} of applicants have moved in', { p: formatPercent(end / first, 0) })}
            </p>
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
    </>
  )
}
