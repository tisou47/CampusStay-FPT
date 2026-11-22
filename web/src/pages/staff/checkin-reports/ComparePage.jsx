import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowRight, CalendarClock, Check, CircleCheck, Images, RotateCcw } from 'lucide-react'
import { useFocusMode } from '@/app/focus'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { ErrorState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { StatusBadge } from './components/Badges'
import { FocusTopBar, useReportActions } from './components/ReportUI'
import { differences, itemLabel, signedDelta, usePhotoCaptureConfig, useQueuePosition, useReport, useReportsBase, useShortcuts } from './checkinReports'

// Staff › Check-in inventories › one student › the three reports compared, in focus mode.
// Each difference takes a conclusion: keep the record, accept the student's, or check the Room. The conclusions are a
// draft in this browser (TODO(api): no endpoint keeps them); they decide the final button:
//   every difference accepted as the student's → Confirm (POST /handovers/:id/confirm, the student's answers);
//   any "keep the record" or "check the Room" → set a Room visit (the record is kept by what Staff find there),
//   and once visiting, they prefill "Record what I found".
// Keys: 1 / 2 / 3 open a report, Esc back to the student. ?onlyDiff=1 keeps the differences only.

function Stop({ label, when, value, unit, warn, missing }) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border px-3 py-2',
        missing ? 'border-dashed border-line-strong bg-subtle/30' : warn ? 'border-amber-500/40 bg-warning-bg' : 'border-line bg-surface',
      )}
    >
      <span className="text-xs text-fg-secondary">
        {tx(label)}
        {when ? ` · ${when}` : ''}
      </span>
      <span className="text-base font-semibold text-fg tabular-nums">{value == null ? '—' : `${formatNumber(value, { decimals: Number.isInteger(value) ? 0 : 2 })} ${unit}`}</span>
    </div>
  )
}

/** A meter across the three reports: Record → Student → Final, with the change or "Matched". */
function MeterTrail({ meter, studentAt, finalAt }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">{t(meter.label)}</h3>
        {meter.isDiff ? <Tag tone="warning">{signedDelta(meter.delta, meter.unit)}</Tag> : <Tag tone="success">Matched</Tag>}
      </div>
      <div className="flex items-stretch gap-2">
        <Stop label="1 · Record" when={meter.baseAt ? formatDate(meter.baseAt) : null} value={meter.base} unit={meter.unit} />
        <ArrowRight size={16} aria-hidden="true" className="shrink-0 self-center text-fg-tertiary" />
        <Stop label="2 · Student" when={studentAt ? formatDate(studentAt) : null} value={meter.student} unit={meter.unit} warn={meter.isDiff} />
        <ArrowRight size={16} aria-hidden="true" className="shrink-0 self-center text-fg-tertiary" />
        <Stop label="3 · Final" when={finalAt ? formatDate(finalAt) : null} value={meter.final} unit={meter.unit} missing={meter.final == null} />
      </div>
      {meter.isDiff && meter.note && <p className="text-xs text-fg-secondary">{tx(meter.note)}</p>}
    </section>
  )
}

const RESOLUTIONS = [
  { value: 'base', label: 'Keep the record' },
  { value: 'student', label: "Accept the student's" },
  { value: 'visit', label: 'Check the Room' },
]

/** One conclusion for a difference: keep the record, accept the student's answer, or check the Room. */
function ResolutionChips({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {RESOLUTIONS.map((r) => {
        const active = value === r.value
        return (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? null : r.value)}
            className={cx(
              'min-h-7 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              active ? 'border-fg bg-fg text-surface' : 'border-line-strong bg-surface text-fg-secondary hover:border-fg hover:text-fg',
            )}
          >
            {t(r.label)}
          </button>
        )
      })}
    </div>
  )
}

const GRID = 'grid grid-cols-[minmax(12rem,1.3fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(17rem,1.4fr)]'

function Head({ label, by, at, bar }) {
  return (
    <div className="flex flex-col gap-0.5 border-t-4 px-3 py-2.5" style={{ borderTopColor: bar }}>
      <span className="text-sm font-semibold text-fg">{tx(label)}</span>
      <span className="text-xs text-fg-secondary">{[tx(by), at ? formatDateTime(at) : null].filter(Boolean).join(' · ')}</span>
    </div>
  )
}

const meterValue = (v, unit) => (v == null ? <span className="text-fg-tertiary">—</span> : <span className="tabular-nums">{`${formatNumber(v, { decimals: Number.isInteger(v) ? 0 : 2 })} ${unit}`}</span>)

function Row({ label, sub, base, student, final, diff, photosTo, resolution, onResolve }) {
  return (
    <div role="row" className={cx(GRID, 'items-center border-b border-line text-sm', diff && 'border-l-2 border-l-amber-500 bg-warning-bg/50')}>
      <div role="rowheader" className="flex min-w-0 flex-col px-3 py-2.5">
        <span className="truncate font-medium text-fg">{label}</span>
        {sub && <span className="text-xs text-fg-secondary">{sub}</span>}
      </div>
      <div role="cell" className="px-3 py-2.5">{base}</div>
      <div role="cell" className={cx('flex flex-col items-start gap-1 px-3 py-2.5', diff && 'bg-warning-bg')}>
        {student}
        {photosTo && (
          <Link to={photosTo} className="inline-flex items-center gap-1 text-xs font-medium text-fg-link hover:underline">
            <Images size={12} aria-hidden="true" />
            {t("See the student's photos")}
          </Link>
        )}
      </div>
      <div role="cell" className="px-3 py-2.5">{final}</div>
      <div role="cell" className="px-3 py-2.5">
        {diff ? (
          <ResolutionChips value={resolution} onChange={onResolve} label={t('Conclusion for {item}', { item: label })} />
        ) : (
          <span className="inline-flex items-center gap-1 text-success-fg">
            <Check size={14} aria-hidden="true" />
            {t('Matched')}
          </span>
        )}
      </div>
    </div>
  )
}

function Group({ children }) {
  return (
    <div role="row" className="border-b border-line bg-subtle/60 px-3 py-1.5 text-xs font-semibold tracking-wide text-fg-secondary uppercase">
      <span role="cell">{children}</span>
    </div>
  )
}

/**
 * The three reports item by item: Item | 1 · Record | 2 · Student | 3 · Final | Conclusion, grouped into meters and
 * the furniture of each Bed (shared items last). onlyDiff keeps the differences only.
 */
function CompareMatrix({ diff, detail, onlyDiff, resolutions, onResolve, photosFor }) {
  const meters = diff.meters.filter((m) => !onlyDiff || m.isDiff)
  const items = diff.items.filter((i) => !onlyDiff || i.isDiff)
  const groups = new Map()
  for (const i of items) {
    const key = i.raw.bed ? t('Furniture · Bed {bed}', { bed: i.raw.bed }) : t('Shared furniture')
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  const finalAt = detail.finalizedAt ?? null
  return (
    <div className="min-h-0 overflow-x-auto rounded-lg border border-line bg-surface">
      <div role="table" aria-label={t('Comparison of the three reports')} className="min-w-[1000px]">
        <div role="row" className={cx(GRID, 'border-b border-line bg-subtle/40')}>
          <div role="columnheader" className="flex items-end px-3 py-2.5 text-sm font-semibold text-fg">
            {t('Item')}
            <span className="ml-1 font-normal text-fg-secondary">· {diff.meters.length + diff.items.length}</span>
          </div>
          <div role="columnheader"><Head label="1 · Record" by="Staff, before arrival" at={detail.electricity?.baselineAt} bar="var(--color-neutral)" /></div>
          <div role="columnheader"><Head label="2 · Student" by="Student, on the app" at={detail.row.submittedAt} bar="var(--color-primary)" /></div>
          <div role="columnheader"><Head label="3 · Final" by={diff.final ? 'Staff, in the Room' : 'Not checked in the Room'} at={finalAt} bar="var(--color-success)" /></div>
          <div role="columnheader" className="flex items-end px-3 py-2.5 text-sm font-semibold text-fg">{t('Conclusion')}</div>
        </div>
        {meters.length > 0 && <Group>{t('Meters')}</Group>}
        {meters.map((m) => (
          <Row
            key={m.key}
            label={t(m.label)}
            sub={m.isDiff ? signedDelta(m.delta, m.unit) : null}
            base={meterValue(m.base, m.unit)}
            student={meterValue(m.student, m.unit)}
            final={meterValue(m.final, m.unit)}
            diff={m.isDiff}
            photosTo={m.isDiff ? photosFor?.(m.key, true) : null}
            resolution={resolutions[m.key]}
            onResolve={(v) => onResolve(m.key, v)}
          />
        ))}
        {[...groups.entries()].map(([group, rows]) => (
          <div key={group} role="rowgroup">
            <Group>{group}</Group>
            {rows.map((i) => (
              <Row
                key={i.key}
                label={itemLabel(i.raw)}
                sub={i.raw.assetCode}
                base={<StatusBadge value={i.base} />}
                student={<StatusBadge value={i.student} />}
                final={diff.final ? <StatusBadge value={i.final} /> : <span className="text-fg-tertiary">—</span>}
                diff={i.isDiff}
                photosTo={i.isDiff && (i.raw.photos?.length ?? 0) > 0 ? photosFor?.(i.key) : null}
                resolution={resolutions[i.key]}
                onResolve={(v) => onResolve(i.key, v)}
              />
            ))}
          </div>
        ))}
        {!meters.length && !items.length && <p className="px-4 py-8 text-center text-sm text-fg-secondary">{t('Nothing differs from the record.')}</p>}
      </div>
    </div>
  )
}

const draftKey = (id) => `campusstay-handover-conclusions-${id}`

function loadDraft(id) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

function saveDraft(id, value) {
  try {
    if (Object.keys(value).length) localStorage.setItem(draftKey(id), JSON.stringify(value))
    else localStorage.removeItem(draftKey(id))
  } catch {
    // Private window or blocked storage: the conclusions stay for this visit only.
  }
}

export default function ComparePage() {
  useFocusMode()
  const { id } = useParams()
  const base = useReportsBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const onlyDiff = params.get('onlyDiff') === '1'
  const position = useQueuePosition(id)
  const { query, detail, diff } = useReport(id)
  const photos = usePhotoCaptureConfig(detail)
  const [resolutions, setResolutions] = useState(() => loadDraft(id))
  useEffect(() => saveDraft(id, resolutions), [id, resolutions])

  const here = `${base}/${id}`
  const from = `?from=${position.from}`
  const actions = useReportActions(detail, {
    prefill: resolutions,
    onDone: () => {
      saveDraft(id, {})
      navigate(position.afterDone && position.afterDone !== id ? `${base}/${position.afterDone}${from}` : `${base}?tab=${position.from}`)
    },
  })

  useShortcuts({
    1: () => navigate(`${here}/report/1${from}`),
    2: () => navigate(`${here}/report/2${from}`),
    3: () => navigate(`${here}/report/3${from}`),
    Escape: () => navigate(`${here}${from}`),
  })

  const list = useMemo(() => (diff ? differences(diff) : []), [diff])
  if (query.loading && !detail) return <div aria-busy="true" className="h-full min-h-96 animate-pulse rounded-lg bg-subtle" />
  if (query.error && !detail) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail || !diff) return null

  const resolved = list.filter((x) => resolutions[x.key]).length
  const complete = resolved === list.length
  const needsRoom = list.some((x) => resolutions[x.key] === 'visit' || resolutions[x.key] === 'base')
  const status = detail.row.status
  const setOnly = (on) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (on) next.set('onlyDiff', '1')
      else next.delete('onlyDiff')
      return next
    })
  const photosFor = photos.enabled ? (key, meter) => `${here}/evidence${from}&item=${meter ? 'meters' : key}` : null

  let primary = null
  if (status === 'Verifying') {
    primary = (
      <Button variant="primary" onClick={() => actions.open('verify')}>
        {detail.sentToStudent ? 'Change what I found' : 'Record what I found'}
      </Button>
    )
  } else if (status === 'Submitted') {
    primary =
      needsRoom || !actions.can.confirm ? (
        <Button variant="primary" icon={CalendarClock} disabled={!complete || !actions.can.visit} onClick={() => actions.open('visit')} tip={!complete ? t('Give every difference a conclusion first.') : undefined}>
          Check the Room with the student
        </Button>
      ) : (
        <Button variant="primary" icon={CircleCheck} disabled={!complete || actions.pending} onClick={() => actions.run.confirm()} tip={!complete ? t('Give every difference a conclusion first.') : undefined}>
          Finalize the inventory
        </Button>
      )
  }

  return (
    <>
      <FocusTopBar back={`${here}${from}`} detail={detail} current={null} reportTo={(k) => `${here}/report/${k}${from}`}>
        <Switch checked={onlyDiff} onChange={setOnly} label={t('Only differences')} />
      </FocusTopBar>

      <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {diff.meters.map((m) => (
          <MeterTrail key={m.key} meter={m} studentAt={detail.row.submittedAt} finalAt={diff.final ? detail.finalizedAt ?? detail.row.visitAt : null} />
        ))}
      </div>

      <CompareMatrix
        diff={diff}
        detail={detail}
        onlyDiff={onlyDiff}
        resolutions={resolutions}
        onResolve={(key, value) => setResolutions((r) => {
          const next = { ...r }
          if (value) next[key] = value
          else delete next[key]
          return next
        })}
        photosFor={photosFor}
      />

      <section aria-label={t('Decision')} className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex flex-col">
          <span className="text-base font-semibold text-fg tabular-nums">
            {t('{n} / {total} differences have a conclusion', { n: resolved, total: list.length })}
          </span>
          <span className="text-sm text-fg-secondary">
            {!list.length
              ? t('Nothing differs: confirm the inventory as filed.')
              : needsRoom
                ? t('Keeping the record or checking the Room is done in the Room: set a visit, then record what you find.')
                : actions.major
                  ? t('A major difference cannot be confirmed from the desk: check the Room with the student.')
                  : t("Accepting the student's answers makes them the Final record.")}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.can.refile && (
            <Button icon={RotateCcw} onClick={() => actions.open('refile')}>
              Ask the student to file again
            </Button>
          )}
          {primary}
        </div>
      </section>
      {actions.dialogs}
    </>
  )
}
