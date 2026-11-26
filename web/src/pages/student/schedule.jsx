import { Check } from 'lucide-react'
import { cx } from '@/lib/cx'
import { campusDayStart, campusNextMonth, formatDate, formatDateRange, formatDateTime, formatMonthShort } from '@/lib/format'
import { t } from '@/i18n'

// The Term schedule graph (R-10): combines a numbered step-by-step milestone list on the left with a visual
// shared-axis timeline on the right, marking windows as bars, single moments as diamonds, and "today" across all rows.
// Reads the `timeline` of GET /registration-periods/:termId: [{ key, label, at, date, until, done }].

const DAY = 86_400_000
const day = (iso) => campusDayStart(iso).getTime()

/** Rows of the graph: the registration opening and closing become one window. */
export function scheduleRows(timeline = []) {
  const opens = timeline.find((m) => m.key === 'registrationOpensAt')
  const closes = timeline.find((m) => m.key === 'registrationClosesAt')
  const rows = []
  if (opens || closes) {
    const start = (opens ?? closes).at
    rows.push({
      key: 'registration',
      label: 'Registration',
      start: day(start),
      end: closes ? day(closes.at) : null,
      text: closes && opens ? `${formatDate(opens.at)} – ${formatDateTime(closes.at)}` : formatDateTime(start),
    })
  }
  for (const m of timeline) {
    if (m === opens || m === closes) continue
    const start = m.at ?? m.date
    if (!start) continue
    rows.push({
      key: m.key,
      label: m.label,
      start: day(start),
      // A range of days ends at the end of its last day.
      end: m.until ? day(m.until) + DAY : null,
      text: m.at ? formatDateTime(m.at) : m.until ? formatDateRange(m.date, m.until) : formatDate(m.date),
    })
  }
  return rows
}

function monthTicks(from, to) {
  const ticks = []
  // "T11" in Vietnamese ("Tháng 11" crowds a phone), "Nov" in English.
  for (let d = campusNextMonth(new Date(from)); d.getTime() < to; d = campusNextMonth(d)) ticks.push({ at: d.getTime(), label: formatMonthShort(d) })
  // Every other month when they would crowd a phone.
  return ticks.length > 7 ? ticks.filter((_, i) => i % 2 === 0) : ticks
}

/** The graph; `timeline` as the API sends it, `now` for tests. */
export function TermSchedule({ timeline, now = Date.now(), className }) {
  const rows = scheduleRows(timeline)
  if (rows.length === 0) return <p className="text-base text-fg-tertiary">{t('The dates of this term are not published yet.')}</p>
  const first = Math.min(...rows.map((r) => r.start))
  const last = Math.max(...rows.map((r) => r.end ?? r.start))
  const pad = Math.max((last - first) * 0.04, DAY * 2)
  const from = first - pad
  const to = last + pad
  const pct = (ms) => ((ms - from) / (to - from)) * 100
  const pos = (ms) => `${pct(ms).toFixed(2)}%`
  const todayIn = now >= from && now <= to
  const ticks = monthTicks(from, to)
  // The first row not over yet is the one to watch.
  const current = rows.findIndex((r) => (r.end ?? r.start) > now)

  return (
    <div className={cx('flex flex-col gap-2.5', className)}>
      {/* Month Axis Header */}
      <div aria-hidden="true" className="hidden lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-x-5 lg:px-3">
        <span className="text-xs font-medium text-fg-tertiary">{t('Timeline')}</span>
        <div className="relative h-5 text-xs font-medium text-fg-tertiary">
          {ticks
            .filter((tick) => pct(tick.at) < 92)
            .map((tick) => (
              <span key={tick.at} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: pos(tick.at) }}>
                {tick.label}
              </span>
            ))}
        </div>
      </div>

      {/* Step-by-step Milestone Rows + Shared Gantt Track */}
      <ol className="flex flex-col gap-1.5">
        {rows.map((r, i) => {
          const state = i === current ? 'current' : (r.end ?? r.start) <= now ? 'done' : 'upcoming'
          const tone = state === 'current' ? 'bg-primary' : state === 'done' ? 'bg-success' : 'bg-fg-tertiary/45'
          return (
            <li
              key={r.key}
              className={cx(
                'grid grid-cols-1 gap-2 rounded-xl px-3 py-2.5 transition-colors lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-center lg:gap-x-5',
                state === 'current' ? 'bg-brand-subtle/55' : 'hover:bg-subtle/60',
              )}
            >
              {/* Left: Step Badge + Label + Exact Date */}
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    state === 'done' && 'bg-success text-white',
                    state === 'current' && 'border-2 border-primary bg-surface text-fg-brand ring-3 ring-orange-500/15',
                    state === 'upcoming' && 'bg-subtle text-fg-tertiary',
                  )}
                >
                  {state === 'done' ? <Check size={13} strokeWidth={2.5} /> : i + 1}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        'text-sm',
                        state === 'current' ? 'font-semibold text-fg' : state === 'done' ? 'font-medium text-fg' : 'font-medium text-fg-secondary',
                      )}
                    >
                      {t(r.label)}
                    </span>
                    {state === 'current' && (
                      <span className="rounded-full bg-primary px-2 py-0.2 text-[11px] font-semibold text-white">
                        {t('In progress')}
                      </span>
                    )}
                  </div>
                  <span className={cx('text-xs tabular', state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-tertiary')}>
                    {r.text}
                  </span>
                </div>
              </div>

              {/* Right: Visual Date Track */}
              <div aria-hidden="true" className="relative h-3.5 rounded-full bg-subtle">
                {ticks.map((tick) => (
                  <span key={tick.at} className="absolute inset-y-0 w-px bg-line/80" style={{ left: pos(tick.at) }} />
                ))}
                {r.end ? (
                  <span
                    className={cx('absolute inset-y-0.5 min-w-2 rounded-full', tone)}
                    style={{ left: pos(r.start), width: `calc(${pos(r.end)} - ${pos(r.start)})` }}
                  />
                ) : (
                  <span
                    className={cx(
                      'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-surface',
                      tone,
                    )}
                    style={{ left: pos(r.start) }}
                  />
                )}
                {todayIn && (
                  <span
                    className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg"
                    style={{ left: pos(now) }}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Clear Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-2.5 px-1 text-xs text-fg-tertiary">
        <div className="flex flex-wrap items-center gap-4">
          {todayIn && (
            <span className="inline-flex items-center gap-1.5 font-medium text-fg-secondary">
              <span aria-hidden="true" className="h-3.5 w-0.5 rounded-full bg-fg" />
              {t('Today, {date}', { date: formatDate(new Date(now)) })}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-5 rounded-full bg-primary" />
            {t('In progress')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-5 rounded-full bg-fg-tertiary/45" />
            {t('Window')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rotate-45 rounded-[2px] bg-fg-tertiary/45" />
            {t('Deadline / milestone')}
          </span>
        </div>
      </div>
    </div>
  )
}
