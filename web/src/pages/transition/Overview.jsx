import { Link } from 'react-router'
import { ArrowLeftRight, BedDouble, CalendarPlus, Check, CheckCircle2, ChevronRight, ClipboardList, CreditCard, FileCheck, Repeat, UserCheck, UserMinus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { Alert, Card, CardHeader, ProgressBar } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber, formatTime, formatTimeLeft } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// Term transition › Overview. GET /renewals/overview?termId → { term, previousTerm, opened, filing, feesIssued,
//   milestones: [{ key, label, at, state (Done, Upcoming) }], counts: { continuing, awaitingExtension, feesIssued,
//   feesPaid, ending: { label: n } }, requests: { roomChanges, swaps, extensions },
//   reconciliation: { runs, openItems }, newStudentBeds: { total, heldByContinuing, free, reservedPercent, reserved } }
// UI only: a status line with the milestones as a stepper, the KPI tiles, then the Beds, the open requests and the
// residents not continuing side by side. Every number comes from the same response.

const kinds = [
  ['roomChanges', 'Room changes', ArrowLeftRight, 'requests'],
  ['swaps', 'Swaps', Repeat, 'requests'],
  ['extensions', 'Extensions', CalendarPlus, 'extensions'],
]

// Endings Staff still act on (remind the student to pay) are shown in the warning tone.
const WARN_ENDINGS = ['Next-Term fee not paid', 'Next-term fee not paid']

/** "Requests window opens (M2)" → { name: "Requests window opens", code: "M2" } in the language in use. */
function splitMilestone(label) {
  const text = tr(label)
  const m = /^(.*?)\s*\((M\d+)\)\s*$/.exec(text)
  return m ? { name: m[1], code: m[2] } : { name: text, code: null }
}

function Milestones({ milestones }) {
  const next = milestones.findIndex((m) => m.state !== 'Done')
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(var(--n),minmax(0,1fr))] lg:gap-0" style={{ '--n': milestones.length }}>
      {milestones.map((m, i) => {
        const done = m.state === 'Done'
        const current = i === next
        const { name, code } = splitMilestone(m.label)
        return (
          <li key={m.key} className="relative flex gap-3 lg:flex-col lg:gap-2 lg:pr-3">
            {/* Connector to the next step (wide screens only). */}
            {i < milestones.length - 1 && (
              <span aria-hidden="true" className={cx('absolute top-3 left-7 hidden h-0.5 right-0 lg:block', done ? 'bg-success' : 'bg-line')} />
            )}
            <span
              className={cx(
                'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                done ? 'border-success bg-success text-white' : current ? 'border-warning bg-surface text-warning-fg' : 'border-line bg-surface text-fg-tertiary',
              )}
            >
              {done ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-tertiary">
                {code}
                {current && <Tag tone="warning">{t('Next up')}</Tag>}
              </span>
              <span className="text-sm font-medium text-fg" title={name}>
                {name}
              </span>
              <span className="text-sm whitespace-nowrap text-fg-secondary tabular" title={formatDateTime(m.at)}>
                {formatDate(m.at)}
                <span className="text-fg-tertiary"> · {formatTime(m.at)}</span>
              </span>
              {current && <span className="text-xs font-medium text-warning-fg">{formatTimeLeft(m.at)}</span>}
              <span className="sr-only">{done ? t('Milestone done') : t('Upcoming')}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StatusLine({ o, open }) {
  const done = o.milestones.filter((m) => m.state === 'Done').length
  const all = o.milestones.length
  const next = o.milestones.find((m) => m.state !== 'Done')
  const settled = o.opened && !o.filing && open === 0
  const parts = [
    !o.opened ? t('The requests window has not opened yet') : o.filing ? t('Students can still file') : t('Filing closed'),
    t('{done}/{all} milestones done', { done, all }),
    open ? t('{n} requests still open', { n: formatNumber(open) }) : t('No open requests'),
  ]
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="flex items-center gap-2 text-base font-medium text-fg">
        {settled ? (
          <CheckCircle2 size={18} className="shrink-0 text-success-fg" aria-hidden="true" />
        ) : (
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-warning" />
        )}
        {parts.join(' · ')}
      </p>
      {next && (
        <p className="text-sm text-fg-secondary">
          {t('Next: {milestone}', { milestone: splitMilestone(next.label).name })}
          {' · '}
          <span className="tabular">{formatDateTime(next.at)}</span>
        </p>
      )}
    </div>
  )
}

function BedsCard({ beds }) {
  const { total, heldByContinuing: held, free, reserved, reservedPercent } = beds
  const otherTaken = Math.max(0, total - free - held)
  const pct = (n) => (total > 0 ? (n / total) * 100 : 0)
  const segments = [
    { key: 'held', label: 'Kept for continuing residents', value: held, fill: 'bg-info' },
    { key: 'taken', label: 'Given to new students', value: otherTaken, fill: 'bg-accent' },
    { key: 'free', label: 'Still free', value: free, fill: 'bg-subtle' },
  ]
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <CardHeader title="Beds next term" description={t('{n} assignable beds', { n: formatNumber(total) })} />
      <div className="flex flex-col gap-2">
        <div className="relative flex h-3 overflow-hidden rounded-full bg-subtle" role="img" aria-label={segments.map((s) => `${t(s.label)}: ${formatNumber(s.value)}`).join(', ')}>
          {segments.map((s) =>
            s.value > 0 ? <span key={s.key} className={cx('h-full', s.fill)} style={{ width: `${pct(s.value)}%` }} title={`${t(s.label)}: ${formatNumber(s.value)}`} /> : null,
          )}
        </div>
        {reserved > 0 && (
          <p className="text-sm text-fg-tertiary">{t('{pct}% kept for new students: {n} beds', { pct: reservedPercent, n: formatNumber(reserved) })}</p>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2 text-fg-secondary">
              <span aria-hidden="true" className={cx('size-2.5 shrink-0 rounded-sm', s.fill, s.key === 'free' && 'border border-line-strong')} />
              {t(s.label)}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-semibold text-fg tabular">{formatNumber(s.value)}</span>
              <span className="w-12 text-right text-sm text-fg-tertiary tabular">{Math.round(pct(s.value))}%</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function RequestsCard({ o, open, base, termId }) {
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <CardHeader
        title="Open next-term requests"
        description={o.filing ? 'Students can still file' : 'Filing closed'}
        actions={open > 0 ? <Tag tone="warning">{formatNumber(open)}</Tag> : <Tag tone="success">{t('All decided')}</Tag>}
      />
      <ul className="-mx-2 flex flex-col">
        {kinds.map(([key, label, Glyph, tab]) => {
          const n = o.requests?.[key] ?? 0
          return (
            <li key={key}>
              <Link
                to={`${base}/next-term/${tab}?termId=${termId}`}
                className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 text-base hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="flex items-center gap-2.5 text-fg-secondary">
                  <Glyph size={16} className="text-fg-tertiary" aria-hidden="true" />
                  {t(label)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cx('font-semibold tabular', n ? 'text-warning-fg' : 'text-fg-tertiary')}>{formatNumber(n)}</span>
                  <ChevronRight size={16} className="text-fg-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Button variant={open ? 'primary' : undefined} className="mt-auto" to={`${base}/next-term/requests?termId=${termId}`}>
        Decide open requests
      </Button>
    </Card>
  )
}

function EndingCard({ ending }) {
  const rows = Object.entries(ending ?? {}).sort((a, b) => b[1] - a[1])
  const sum = rows.reduce((a, [, n]) => a + n, 0)
  const top = rows[0]?.[1] ?? 0
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <CardHeader title="Not continuing" description={t('{n} students leave after this term', { n: formatNumber(sum) })} />
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 text-base text-fg-secondary">
          <CheckCircle2 size={16} className="text-success-fg" aria-hidden="true" />
          {t('Nobody is leaving yet')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(([label, n]) => {
            const warn = WARN_ENDINGS.includes(label)
            return (
              <li key={label} className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between gap-3 text-base">
                  <span className={warn ? 'font-medium text-warning-fg' : 'text-fg-secondary'}>{tr(label)}</span>
                  <span className="font-semibold text-fg tabular">{formatNumber(n)}</span>
                </span>
                <Meter value={n} max={top} tone={warn ? 'warning' : 'neutral'} label={tr(label)} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export default function Overview({ termId }) {
  const base = useRoleBase()
  const manager = base === '/manager'
  const query = useQuery(['renewal-overview', termId], ({ signal }) => api.renewals.overview({ termId }, { signal }))
  return (
    <QueryState query={query}>
      {(o) => {
        const open = Object.values(o.requests ?? {}).reduce((a, b) => a + b, 0)
        const { feesPaid, feesIssued } = o.counts
        const feePct = feesIssued > 0 ? Math.round((feesPaid / feesIssued) * 100) : 0
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
            {!o.opened && (
              <Alert type="info" title="The requests window has not opened yet">
                {t('At M2 every resident of {previous} gets a bed kept for {term}: continuing, or awaiting extension in the last term of their stay.', { previous: o.previousTerm.name, term: o.term.name })}
              </Alert>
            )}

            <Card padding="lg" className="flex shrink-0 flex-col gap-5">
              <StatusLine o={o} open={open} />
              <div className="border-t border-line pt-5">
                <h2 className="sr-only">{t('Milestones')}</h2>
                <Milestones milestones={o.milestones} />
              </div>
            </Card>

            <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
              <KpiTile size="md" icon={UserCheck} label="Continuing" value={formatNumber(o.counts.continuing)} note="Bed kept for the next term" />
              <KpiTile
                size="md"
                icon={UserMinus}
                label="Awaiting extension"
                value={formatNumber(o.counts.awaitingExtension)}
                note="Last term of the stay"
                valueTone={o.counts.awaitingExtension ? 'warning' : undefined}
              />
              <KpiTile
                size="md"
                icon={ClipboardList}
                label="Open requests"
                value={formatNumber(open)}
                note={o.filing ? 'Students can still file' : 'Filing closed'}
                valueTone={open ? 'warning' : 'tertiary'}
              />
              <KpiTile size="md" icon={CreditCard} label="Next-term fees" value={`${formatNumber(feesPaid)} / ${formatNumber(feesIssued)}`} note="Paid / issued">
                {feesIssued > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <ProgressBar value={feesPaid} max={feesIssued} tone={feePct >= 100 ? 'success' : 'accent'} className="flex-1" />
                    <span className="text-sm font-medium text-fg-secondary tabular">{feePct}%</span>
                  </div>
                )}
              </KpiTile>
              {manager && (
                <KpiTile
                  size="md"
                  icon={FileCheck}
                  label="Reconciliation"
                  value={formatNumber(o.reconciliation.openItems)}
                  note={o.reconciliation.runs ? t('Open items · {n} files', { n: o.reconciliation.runs }) : 'No enrolled list yet'}
                  valueTone={!o.reconciliation.runs || o.reconciliation.openItems ? 'warning' : undefined}
                />
              )}
              <KpiTile
                size="md"
                icon={BedDouble}
                label="Beds for new students"
                value={formatNumber(o.newStudentBeds.free)}
                note={t('of {total} beds', { total: formatNumber(o.newStudentBeds.total) })}
              />
            </div>

            <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-3">
              <BedsCard beds={o.newStudentBeds} />
              <RequestsCard o={o} open={open} base={base} termId={termId} />
              <EndingCard ending={o.counts.ending} />
            </div>
          </div>
        )
      }}
    </QueryState>
  )
}
