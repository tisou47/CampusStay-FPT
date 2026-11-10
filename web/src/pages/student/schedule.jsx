import { cx } from '@/lib/cx'
import { formatDate, formatDateTime } from '@/lib/format'
import { getLang, t } from '@/i18n'

// The Term schedule graph (R-10): one row per milestone or window on a shared date axis, windows as bars and moments
// as diamonds, "today" marked on every row. Rows keep their text (label and dates) so the graph itself is decoration.
// Reads the `timeline` of GET /registration-periods/:termId: [{ key, label, at, date, until, done }].

const DAY = 86_400_000
const day = (iso) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).getTime()

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
      text: m.at ? formatDateTime(m.at) : m.until ? `${formatDate(m.date)} – ${formatDate(m.until)}` : formatDate(m.date),
    })
  }
  return rows
}

function monthTicks(from, to) {
  const ticks = []
  const d = new Date(from)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + 1)
  // "T11" in Vietnamese ("Tháng 11" crowds a phone), "Nov" in English.
  const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short' })
  const label = (date) => (getLang() === 'vi' ? `T${date.getMonth() + 1}` : fmt.format(date))
  for (; d.getTime() < to; d.setMonth(d.getMonth() + 1)) ticks.push({ at: d.getTime(), label: label(d) })
  // Every other month when they would crowd a phone.
  return ticks.length > 7 ? ticks.filter((_, i) => i % 2 === 0) : ticks
}

/** The graph; `timeline` as the API sends it, `now` for tests. */
export function TermSchedule({ timeline, now = Date.now(), className }) {
  const rows = scheduleRows(timeline)
  if (rows.length === 0) return <p className="text-base text-fg-tertiary">{t('The dates of this Term are not published yet.')}</p>
  const first = Math.min(...rows.map((r) => r.start))
  const last = Math.max(...rows.map((r) => r.end ?? r.start))
  const pad = Math.max((last - first) * 0.03, DAY)
  const from = first - pad
  const to = last + pad
  const pct = (ms) => ((ms - from) / (to - from)) * 100
  const pos = (ms) => `${pct(ms).toFixed(2)}%`
  const todayIn = now >= from && now <= to
  const ticks = monthTicks(from, to)
  // The first row not over yet is the one to watch.
  const current = rows.findIndex((r) => (r.end ?? r.start) > now)

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div aria-hidden="true" className="grid grid-cols-1 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-x-4">
        <span className="hidden lg:block" />
        <div className="relative h-5 text-xs text-fg-tertiary">
          {/* A month's label starts at its first day; one too close to the end would leave the card. */}
          {ticks
            .filter((tick) => pct(tick.at) < 90)
            .map((tick) => (
              <span key={tick.at} className="absolute top-0 pl-1 whitespace-nowrap" style={{ left: pos(tick.at) }}>
                {tick.label}
              </span>
            ))}
        </div>
      </div>
      <ol className="flex flex-col gap-3 lg:gap-2.5">
        {rows.map((r, i) => {
          const state = i === current ? 'current' : (r.end ?? r.start) <= now ? 'done' : 'upcoming'
          const tone = state === 'current' ? 'bg-primary' : state === 'done' ? 'bg-success' : 'bg-line-strong'
          return (
            <li key={r.key} className="grid grid-cols-1 gap-1 lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-center lg:gap-x-4">
              <div className="flex items-baseline justify-between gap-3 lg:flex-col lg:items-start lg:gap-0">
                <span className={cx('text-sm', state === 'current' ? 'font-medium text-fg' : state === 'done' ? 'text-fg-secondary' : 'text-fg')}>{t(r.label)}</span>
                <span className={cx('text-sm whitespace-nowrap', state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-tertiary')}>{r.text}</span>
              </div>
              <div aria-hidden="true" className="relative h-3 rounded-full bg-subtle">
                {ticks.map((tick) => (
                  <span key={tick.at} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(tick.at) }} />
                ))}
                {r.end ? (
                  <span
                    className={cx('absolute inset-y-0 min-w-1.5 rounded-full', tone)}
                    style={{ left: pos(r.start), width: `calc(${pos(r.end)} - ${pos(r.start)})` }}
                  />
                ) : (
                  <span className={cx('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]', tone)} style={{ left: pos(r.start) }} />
                )}
                {todayIn && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: pos(now) }} />}
              </div>
            </li>
          )
        })}
      </ol>
      {todayIn && (
        <p className="flex items-center gap-2 text-xs text-fg-tertiary">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-fg" />
          {t('Today, {date}', { date: formatDate(new Date(now).toISOString()) })}
        </p>
      )}
    </div>
  )
}
