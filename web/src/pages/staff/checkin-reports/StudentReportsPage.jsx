import { Link, useNavigate, useParams } from 'react-router'
import { ArrowRight, CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Columns3, Eye, FileText, ImageOff, Images, Lock } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Avatar } from '@/components/ui/Display'
import { ErrorState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { t, tr, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatDuration, formatNumber } from '@/lib/format'
import { SeverityBadge, StatusBadge } from './components/Badges'
import { useReportActions } from './components/ReportUI'
import { differences, itemLabel, photoCount, signedDelta, tabOf, usePhotoCaptureConfig, useQueuePosition, useReport, useReportsBase, useShortcuts } from './checkinReports'

// Staff › Check-in inventories › one student: the three reports side by side (GET /handovers/:id).
// Report 1 (Record): Staff before the student moved in, no photos. Report 2 (Student): filed on the app, photos when
// Admin turned them on. Report 3 (Final): Staff in the Room, no photos; it may not exist.
// Keys: J / K next and previous student of the queue, 1 / 2 / 3 open a report, C the comparison.
// LockedFinalCard is also used by ReportDetailPage (Report 3 before the Room visit).

/** Who the inventory is for, where, when it was filed and how long it has waited; the screen's actions at the right. */
function StudentHeaderCard({ detail, severity, actions, footer }) {
  const row = detail.row
  const since = row.submittedAt ?? row.openedAt
  const waiting = row.status === 'Submitted' && since ? formatDuration(Date.now() - new Date(since).getTime()) : null
  const metaParts = [
    row.studentCode,
    `${row.room} · ${t('Bed {bed}', { bed: row.bed })}`,
    tr(row.block),
    row.submittedAt ? t('Filed {date}', { date: formatDateTime(row.submittedAt) }) : null,
    waiting ? t('Waiting {time}', { time: waiting }) : null,
  ].filter(Boolean)
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={row.studentName} size={48} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h2 font-semibold text-fg">{row.studentName}</h1>
              <SeverityBadge severity={severity} />
              <Tag tone="neutral" dot={false}>
                {row.status}
              </Tag>
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-fg-secondary">
              {metaParts.map((part, idx) => (
                <span key={idx} className="whitespace-nowrap">
                  {idx > 0 ? `· ${part}` : part}
                </span>
              ))}
            </p>
            <p className="font-mono text-xs font-semibold text-fg tabular-nums">{row.id}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap lg:justify-end">{actions}</div>}
      </div>
      {footer}
    </section>
  )
}

/** "2 differences from the record" with one chip per difference and a link to the comparison. */
function DiffSummaryStrip({ diff, compareTo, hideMatch = false }) {
  const list = differences(diff)
  if (!list.length) {
    if (hideMatch) return null
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg-secondary">
        {t('Same as the record: nothing differs.')}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-brand-subtle px-4 py-3">
      <span className="text-sm font-semibold text-fg">{t(list.length === 1 ? '{n} difference from the record' : '{n} differences from the record', { n: list.length })}</span>
      {list.map((x) => (
        <span key={x.key} className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-fg">
          {x.unit ? (
            <>
              <span>{t(x.label)}</span>
              <span className="tabular-nums text-fg-secondary">
                {x.base != null ? formatNumber(x.base) : '—'} → {x.student != null ? formatNumber(x.student) : '—'} {x.unit}
              </span>
              <span className="font-semibold tabular-nums text-warning-fg">{signedDelta(x.delta, x.unit)}</span>
            </>
          ) : (
            <>
              <span>{itemLabel(x.raw)}</span>
              <StatusBadge value={x.base} />
              <ArrowRight size={12} aria-hidden="true" className="text-fg-tertiary" />
              <span className="sr-only">{t('to')}</span>
              <StatusBadge value={x.student} />
            </>
          )}
        </span>
      ))}
      {compareTo && (
        <Link to={compareTo} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-fg-link hover:underline">
          {t('See the comparison')}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

/** The Final report (Report 3) before Staff checked the Room: dashed, with what can be done instead. */
export function LockedFinalCard({ title = 'Report 3 · Final', text, actions, large = false, className }) {
  return (
    <section
      className={cx(
        'flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-subtle/40 p-6 text-center',
        large ? 'min-h-72' : 'min-h-64',
        className,
      )}
    >
      <span className="text-xs font-semibold text-fg-tertiary">{t(title)}</span>
      <Lock size={large ? 28 : 22} aria-hidden="true" className="text-fg-tertiary" />
      <p className="text-base font-medium text-fg">{t('Not checked in the Room')}</p>
      <p className="max-w-72 text-sm text-fg-secondary">{text}</p>
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </section>
  )
}

const ACCENT = {
  base: 'border-line',
  student: 'border-line-brand ring-2 ring-primary-subtle',
  final: 'border-line',
}
const KICKER = {
  base: 'bg-neutral-bg text-neutral-fg',
  student: 'bg-primary-subtle text-fg-brand',
  final: 'bg-success-bg text-success-fg',
}

function MeterBox({ label, unit, value, extra, warn }) {
  return (
    <div className={cx('flex min-h-[82px] flex-col justify-center gap-0.5 rounded-md px-3 py-2.5', warn ? 'bg-warning-bg/60' : 'bg-subtle/60')}>
      <span className="text-xs text-fg-secondary">{tx(label)}</span>
      <span className="text-base font-semibold text-fg tabular-nums">{value == null ? '—' : `${formatNumber(value, { decimals: Number.isInteger(value) ? 0 : 2 })} ${unit}`}</span>
      <span className={cx('min-h-4 text-xs', warn ? 'font-medium text-warning-fg' : 'text-fg-secondary')}>{extra ?? ''}</span>
    </div>
  )
}

/**
 * One report as a column: kicker (Report 1 · Record …), title, when, a link to read it alone, both meters, the
 * items with their condition (differences on an amber wash) and a footer about photos.
 * kind: 'base' | 'student' | 'final'; value(item) picks the item's condition in this report.
 */
function ReportColumnCard({ kind, kicker, title, meta, to, diff, value, footer, photosTo, photoTotal }) {
  const meter = (m) => {
    const v = kind === 'base' ? m.base : kind === 'student' ? m.student : m.final
    const extra =
      kind === 'student' && m.delta != null
        ? t('{delta} vs. the record', { delta: signedDelta(m.delta, m.unit) })
        : kind === 'base' && m.baseAt
          ? formatDate(m.baseAt)
          : null
    return <MeterBox key={m.key} label={m.label} unit={m.unit} value={v} extra={extra} warn={kind !== 'base' && m.isDiff} />
  }
  return (
    <section className={cx('flex h-full min-w-0 flex-col gap-3 rounded-lg border bg-surface p-4', ACCENT[kind])}>
      <header className="flex min-h-[72px] items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cx('w-fit rounded-full px-2 py-0.5 text-xs font-semibold', KICKER[kind])}>{tx(kicker)}</span>
          <h2 className="text-h3 font-semibold text-fg">{tx(title)}</h2>
          {meta && <p className="text-sm text-fg-secondary">{meta}</p>}
        </div>
        {to && (
          <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-fg-link hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus">
            <Eye size={14} aria-hidden="true" />
            {t('View')}
          </Link>
        )}
      </header>
      <div className="grid grid-cols-2 gap-2">{diff.meters.map(meter)}</div>
      <ul className="flex flex-col">
        {diff.items.map((i) => (
          <li
            key={i.key}
            className={cx(
              'flex items-center justify-between gap-2 border-b border-line py-2 last:border-b-0',
              kind !== 'base' && i.isDiff && '-mx-2 border-l-2 border-l-amber-500 bg-warning-bg/40 px-2',
            )}
          >
            <span className="min-w-0 truncate text-sm text-fg" title={itemLabel(i.raw)}>
              {itemLabel(i.raw)}
            </span>
            <StatusBadge value={value(i)} />
          </li>
        ))}
      </ul>
      <footer className="mt-auto flex items-center gap-1.5 border-t border-line pt-3 text-xs text-fg-secondary">
        {photosTo && photoTotal > 0 ? (
          <Link to={photosTo} className="inline-flex items-center gap-1.5 font-medium text-fg-link hover:underline">
            <Images size={14} aria-hidden="true" />
            {t(photoTotal === 1 ? '{n} photo by the student · see the evidence' : '{n} photos by the student · see the evidence', { n: photoTotal })}
          </Link>
        ) : (
          <>
            <ImageOff size={14} aria-hidden="true" />
            {tx(footer)}
          </>
        )}
      </footer>
    </section>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label={t('Loading…')} className="flex flex-col gap-4">
      <div className="h-24 animate-pulse rounded-lg bg-subtle" />
      <div className="h-12 animate-pulse rounded-lg bg-subtle" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-96 animate-pulse rounded-lg bg-subtle" />
        ))}
      </div>
    </div>
  )
}

function QueueNav({ base, position }) {
  const navigate = useNavigate()
  const go = (id) => id && navigate(`${base}/${id}?from=${position.from}`)
  return (
    <div className="flex items-center gap-2 text-sm text-fg-secondary">
      {position.index >= 0 && <span className="tabular-nums">{t('{n} / {total} in the queue', { n: position.index + 1, total: position.total })}</span>}
      <IconButton icon={ChevronLeft} variant="outline" aria-label={t('Previous student (K)')} tip={t('Previous student (K)')} disabled={!position.prev} onClick={() => go(position.prev)} />
      <IconButton icon={ChevronRight} variant="outline" aria-label={t('Next student (J)')} tip={t('Next student (J)')} disabled={!position.next} onClick={() => go(position.next)} />
    </div>
  )
}

export default function StudentReportsPage() {
  const { id } = useParams()
  const base = useReportsBase()
  const navigate = useNavigate()
  const position = useQueuePosition(id)
  const { query, detail, diff, severity } = useReport(id)
  const photos = usePhotoCaptureConfig(detail)
  const here = `${base}/${id}`
  const from = `?from=${position.from}`
  const actions = useReportActions(detail, {
    onDone: () => navigate(position.afterDone && position.afterDone !== id ? `${base}/${position.afterDone}${from}` : `${base}?tab=${position.from}`),
  })

  useShortcuts({
    j: () => position.next && navigate(`${base}/${position.next}/report/2${from}`),
    k: () => position.prev && navigate(`${base}/${position.prev}/report/2${from}`),
    1: () => navigate(`${here}/report/1${from}`),
    2: () => navigate(`${here}/report/2${from}`),
    3: () => navigate(`${here}/report/3${from}`),
  })

  const tabLabel = tabOf(position.from).label
  const breadcrumb = (
    <nav aria-label={t('Breadcrumb')} className="flex flex-wrap items-center gap-1.5 text-sm text-fg-secondary">
      <Link to={base} className="hover:text-fg-brand">
        {t('Check-in inventories')}
      </Link>
      <span aria-hidden="true">/</span>
      <Link to={`${base}?tab=${position.from}`} className="hover:text-fg-brand">
        {t(tabLabel)}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="text-fg">{detail?.row?.studentName ?? '…'}</span>
    </nav>
  )

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        {breadcrumb}
        <QueueNav base={base} position={position} />
      </div>
      {query.loading && !detail && <Skeleton />}
      {query.error && !detail && <ErrorState error={query.error} onRetry={query.reload} />}
      {detail && diff && (
        <>
          <StudentHeaderCard
            detail={detail}
            severity={severity}
            actions={
              <>
                {actions.can.visit && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="!bg-[#de601a] hover:!bg-primary"
                    icon={CalendarClock}
                    onClick={() => actions.open('visit')}
                    tip="Schedule a time to visit and inspect the Room on-site together with the student."
                  >
                    Check the Room with the student
                  </Button>
                )}
                {actions.can.confirm && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="!bg-[#de601a] hover:!bg-primary"
                    icon={CircleCheck}
                    onClick={() => actions.run.confirm()}
                    disabled={actions.pending}
                    tip="Confirm at the desk: the student's answers become the Final record."
                  >
                    Accept the student's report
                  </Button>
                )}
                {actions.can.verify && (
                  <Button size="sm" variant="primary" className="!bg-[#de601a] hover:!bg-primary" onClick={() => actions.open('verify')}>
                    {detail.sentToStudent ? 'Change what I found' : 'Record what I found'}
                  </Button>
                )}
                {actions.can.late && (
                  <Button size="sm" variant="primary" className="!bg-[#de601a] hover:!bg-primary" icon={FileText} onClick={() => actions.open('late')}>
                    Review the late report
                  </Button>
                )}
                {actions.can.cancel && (
                  <Button size="sm" variant="danger-text" onClick={() => actions.open('cancel')}>
                    Cancel inventory
                  </Button>
                )}
                {detail.row.status === 'Final' && (
                  <p className="max-w-sm text-sm text-fg-secondary sm:text-right">
                    {t('Final ({source}) on {at}; Utility counts from {from}.', {
                      source: t(detail.source),
                      at: formatDateTime(detail.finalizedAt),
                      from: formatDateTime(detail.utilityFrom),
                    })}
                  </p>
                )}
              </>
            }
            footer={
              detail.row.status === 'Submitted' && actions.major ? (
                <Alert type="error" title="A major difference is checked in the Room">
                  {t('An item reported Missing, too many items that differ or a meter beyond the limit cannot be confirmed from the desk. Set a time to check the Room with the student.')}
                </Alert>
              ) : detail.row.status === 'Verifying' && detail.row.visitAt ? (
                <Alert type="info" title={t('Room visit at {date}', { date: formatDateTime(detail.row.visitAt) })}>
                  {detail.sentToStudent ? t('Sent to the student: the inventory is final once they agree.') : t('In the Room, record what you find and send it to the student.')}
                </Alert>
              ) : null
            }
          />
          <DiffSummaryStrip diff={diff} hideMatch={detail.row.status === 'Final'} />
          {detail.lateNote && (
            <Alert type="info" title="Late report from the student">
              {detail.lateNote}
            </Alert>
          )}
          {detail.studentComment && (
            <Alert type="info" title="Student's comment">
              {detail.studentComment}
            </Alert>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-stretch gap-4">
            <ReportColumnCard
              kind="base"
              kicker="Report 1 · Record"
              title="The Room's record"
              meta={detail.electricity?.baselineAt ? t('Recorded {date}', { date: formatDateTime(detail.electricity.baselineAt) }) : t('Recorded before check-in')}
              to={`${here}/report/1${from}`}
              diff={diff}
              value={(i) => i.base}
              footer="Recorded as text · no photos"
            />
            <ReportColumnCard
              kind="student"
              kicker="Report 2 · Student"
              title="Filed by the student"
              meta={detail.row.submittedAt ? t('Submitted {date}', { date: formatDateTime(detail.row.submittedAt) }) : t('Not submitted yet.')}
              to={`${here}/report/2${from}`}
              diff={diff}
              value={(i) => i.student}
              footer={photos.enabled ? 'No photo from the student' : 'Photos are not asked for this Term'}
              photosTo={photos.enabled ? `${here}/evidence${from}` : null}
              photoTotal={photoCount(detail)}
            />
            {diff.final ? (
              <ReportColumnCard
                kind="final"
                kicker="Report 3 · Final"
                title="Checked in the Room"
                meta={detail.finalizedAt ? t('Signed {date}', { date: formatDateTime(detail.finalizedAt) }) : t('Checked in the Room')}
                to={`${here}/report/3${from}`}
                diff={diff}
                value={(i) => i.final}
                footer="Recorded in the Room · no photos"
              />
            ) : (
              <LockedFinalCard
                text={
                  detail.row.status === 'Final'
                    ? t('Confirmed without a Room visit: there is no Final report.')
                    : detail.row.status === 'Verifying'
                      ? t('Nothing recorded in the Room yet.')
                      : t('No Room visit: Staff confirm at the desk, or check a major difference in the Room.')
                }
              />
            )}
          </div>

          {actions.dialogs}
        </>
      )}
    </>
  )
}
