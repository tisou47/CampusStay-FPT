import { useId, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, CircleCheck, CalendarDays, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Meter } from '@/components/ui/Charts'
import { ErrorState } from '@/components/ui/States'
import { Tooltip } from '@/components/ui/Tooltip'
import { formatNumber } from '@/lib/format'
import { cx } from '@/lib/cx'
import { t, tx } from '@/i18n'

/*
 * The pieces of Staff › Today (SCR-HOME-02): the shift pill, the Term on one line, the five "to handle" tiles, the
 * one work queue, today's timeline, the Block's floors and the person's last seven days. They only draw what
 * StaffDashboard gives them; the data and the actions stay there.
 */

/** White card of this page: large radius, a hairline and the lightest shadow. */
export const CARD = 'rounded-[20px] border border-line bg-surface shadow-card'

/** Orange focus ring of the page's own controls (buttons from the UI kit keep theirs). */
export const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** A grey block standing in for a value while it loads (still with prefers-reduced-motion). */
export function Skeleton({ className }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-md bg-subtle motion-reduce:animate-none', className)} />
}

/** "Loading…" for screen readers next to skeletons. */
function Loading({ rows = 3, className }) {
  return (
    <div role="status" className={cx('flex flex-col gap-3', className)}>
      <span className="sr-only">{t('Loading…')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

/** A card section with its h2 and a link on the right. */
export function Section({ title, subtitle, link, className, children, labelledBy }) {
  const id = useId()
  return (
    <section aria-labelledby={labelledBy ?? id} className={cx(CARD, 'flex min-w-0 flex-col gap-4 p-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2 id={id} className="text-lg font-bold text-fg">
            {tx(title)}
          </h2>
          {subtitle && <p className="text-sm text-fg-tertiary">{subtitle}</p>}
        </div>
        {link && (
          <Link to={link.to} className={cx('shrink-0 rounded-sm text-sm font-semibold whitespace-nowrap text-fg-brand hover:underline', FOCUS)}>
            {tx(link.label)}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** Loading → skeleton, failed → message with Retry, otherwise the children. */
export function Block({ query, rows, children }) {
  if (query.data === undefined && query.error) return <ErrorState error={query.error} onRetry={query.reload} compact />
  if (query.data === undefined && query.loading) return <Loading rows={rows} />
  return children
}

// ------------------------------------------------------------------ shift pill

const pillTone = {
  success: 'bg-success-bg text-success-fg',
  neutral: 'bg-subtle text-fg-secondary',
}

/** The shift right now: green with a dot while on shift, grey otherwise. */
export function ShiftPill({ tone, children, title }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap', pillTone[tone])}>
      <span aria-hidden="true" className={cx('size-1.5 rounded-full', tone === 'success' ? 'bg-success' : 'bg-fg-tertiary')} />
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ term line

/**
 * The Term in one line, with its stages behind "Show the stages". steps: from stageSteps (label, date, state).
 * `below` is drawn under the stages when they are open (the current stage's screens).
 */
export function TermLine({ done, summary, next, steps, below }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  const Glyph = done ? CircleCheck : CalendarDays
  return (
    <section aria-label={summary} className={cx(CARD, 'flex flex-col gap-3 px-4.5 py-3')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Glyph size={18} aria-hidden="true" className={cx('shrink-0', done ? 'text-success' : 'text-fg-brand')} />
        <p className="min-w-0 flex-1 text-base text-fg">
          <span className="font-semibold">{summary}</span>
          {next && (
            <>
              <span aria-hidden="true" className="px-2 text-fg-tertiary">
                →
              </span>
              <span className="text-fg-secondary">{next}</span>
            </>
          )}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((o) => !o)}
          className={cx(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold whitespace-nowrap text-fg transition-colors duration-150 hover:border-primary hover:text-fg-brand',
            FOCUS,
          )}
        >
          {t(open ? 'Hide the stages' : 'Show the stages')}
          <ChevronDown size={16} aria-hidden="true" className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      </div>
      <div id={panel} hidden={!open} className="flex flex-col gap-3 border-t border-line pt-3">
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {steps.map((s) => (
            <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined} className="flex min-w-0 flex-col gap-1.5">
              <span aria-hidden="true" className={cx('h-1 rounded-full', s.state === 'done' ? 'bg-success' : s.state === 'current' ? 'bg-primary' : 'bg-line-strong')} />
              <span className="sr-only">{t(s.state === 'done' ? 'Done' : s.state === 'current' ? 'Current step' : 'Not started')}. </span>
              <span className={cx('truncate text-base', s.state === 'current' ? 'font-semibold text-fg' : s.state === 'done' ? 'text-fg' : 'text-fg-secondary')}>{t(s.label)}</span>
              {s.date && <span className="truncate text-sm text-fg-tertiary tabular">{s.date}</span>}
            </li>
          ))}
        </ol>
        {below}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ tiles

const tileTone = {
  error: { box: 'border-error/25 bg-error-bg', num: 'text-error-fg', icon: 'bg-error/10 text-error' },
  brand: { box: 'border-primary/25 bg-primary-subtle', num: 'text-primary-hover', icon: 'bg-primary/10 text-fg-brand' },
  plain: { box: 'border-line bg-surface', num: 'text-fg', icon: 'bg-subtle text-fg-secondary' },
}

/**
 * One "to handle" tile: a toggle that filters the queue. tone: error (overdue), brand (urgent) or plain; a zero is
 * always plain with a grey number.
 */
export function Tile({ icon: Glyph, label, value, tone = 'plain', pressed, onToggle, loading }) {
  const zero = !loading && !value
  const look = tileTone[zero ? 'plain' : tone]
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-[18px] border p-4 text-left transition-[box-shadow,border-color,background-color] duration-150 motion-reduce:transition-none hover:border-line-strong hover:shadow-dropdown',
        look.box,
        pressed && 'border-primary! shadow-none! ring-4 ring-primary/15 outline-2 -outline-offset-2 outline-primary',
        FOCUS,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-[10px]', look.icon)}>
          <Glyph size={20} aria-hidden="true" />
        </span>
        {loading ? (
          <Skeleton className="h-9 w-10" />
        ) : (
          <span className={cx('text-[34px] leading-none font-extrabold tabular', zero ? 'text-fg-tertiary' : look.num)}>{formatNumber(value ?? 0)}</span>
        )}
      </span>
      <span className="text-base leading-snug font-medium text-balance text-fg">{tx(label)}</span>
    </button>
  )
}

// ------------------------------------------------------------------ queue

const rowIcon = {
  error: 'bg-error-bg text-error',
  brand: 'bg-primary-subtle text-fg-brand',
  info: 'bg-info-bg text-info',
  neutral: 'bg-subtle text-fg-secondary',
}
const chipTone = {
  error: 'bg-error-bg text-error-fg',
  brand: 'bg-primary-subtle text-primary-hover',
  info: 'bg-info-bg text-info-fg',
  neutral: 'bg-subtle text-fg-secondary',
}

export function Chip({ tone = 'neutral', title, children }) {
  return (
    <span title={title} className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-sm font-semibold whitespace-nowrap', chipTone[tone])}>
      {children}
    </span>
  )
}

/** The filter in use, with ✕ to clear it. */
export function FilterChip({ label, onClear }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={cx('inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-subtle pr-2 pl-3 text-sm font-semibold whitespace-nowrap text-primary-hover hover:bg-primary/15', FOCUS)}
    >
      {t('Filter: {name}', { name: tx(label) })}
      <X size={14} aria-hidden="true" />
      <span className="sr-only">{t('Clear the filter')}</span>
    </button>
  )
}

/**
 * One line of the queue. item: { icon, tone, title, to (the record), details (its tooltip), meta, progress: { value,
 * max, label }, chips: [{ label, tone, title }], action: { label, to | onClick, disabled }, primary, extra (a link
 * under the meta), fresh }.
 */
function QueueRow({ item }) {
  const Glyph = item.icon
  const title = item.to ? (
    <Tooltip label={item.details ?? null} delay={300} align="start">
      <Link to={item.to} className={cx('rounded-sm text-lg leading-snug font-bold break-words text-fg hover:text-fg-brand hover:underline', FOCUS)}>
        {tx(item.title)}
      </Link>
    </Tooltip>
  ) : (
    <p className="text-lg leading-snug font-bold break-words text-fg">{tx(item.title)}</p>
  )
  return (
    <li
      className={cx(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-line/70 bg-gray-25 p-3.5 transition-colors duration-150 motion-reduce:transition-none hover:border-line-strong',
        item.fresh && 'animate-row-in',
      )}
    >
      <span className={cx('flex size-10.5 shrink-0 items-center justify-center rounded-xl', rowIcon[item.tone] ?? rowIcon.neutral)}>
        <Glyph size={20} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        {title}
        {item.meta && <p className="text-[13px] leading-5 text-fg-secondary">{tx(item.meta)}</p>}
        {item.progress && item.progress.max > 0 && (
          <div className="flex items-center gap-2">
            <Meter value={item.progress.value} max={item.progress.max} label={item.progress.label} className="h-1.5 w-40 max-w-full shrink" />
            <span className="text-sm font-semibold whitespace-nowrap text-fg-secondary tabular">
              {formatNumber(item.progress.value)}/{formatNumber(item.progress.max)}
            </span>
          </div>
        )}
        {item.extra && (
          <button type="button" onClick={item.extra.onClick} className={cx('w-fit rounded-sm text-sm font-semibold text-fg-link hover:underline', FOCUS)}>
            {tx(item.extra.label)}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 max-[719px]:w-full max-[719px]:justify-between">
        {item.chips?.length > 0 && (
          <span className="flex flex-wrap justify-end gap-1.5">
            {item.chips.map((c) => (
              <Chip key={c.label} tone={c.tone} title={c.title}>
                {c.label}
              </Chip>
            ))}
          </span>
        )}
        {item.action && (
          <Button
            variant={item.primary ? 'primary' : 'default'}
            size="lg"
            to={item.action.to}
            onClick={item.action.onClick}
            disabled={item.action.disabled}
            className={cx('min-w-28', FOCUS)}
          >
            {item.action.label}
          </Button>
        )}
      </div>
    </li>
  )
}

const groupDot = { overdue: 'bg-error', today: 'bg-primary', upcoming: 'bg-fg-tertiary' }

/** The queue in its three groups; a group with nothing in it is left out. */
export function Queue({ groups, empty }) {
  const shown = groups.filter((g) => g.items.length)
  if (!shown.length) return empty
  return (
    <div className="flex flex-col gap-5">
      {shown.map((g) => (
        <section key={g.key} aria-label={`${tx(g.label)} · ${t('{n} tasks', { n: g.items.length })}`} className="flex flex-col gap-2.5">
          <h3 className="flex items-center gap-2 text-base font-bold text-fg">
            <span aria-hidden="true" className={cx('size-2 rounded-full', groupDot[g.key])} />
            {tx(g.label)}
            <span className="text-sm font-medium text-fg-tertiary">{t('{n} tasks', { n: g.items.length })}</span>
          </h3>
          <ul className="flex flex-col gap-2.5">
            {g.items.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ timeline

/**
 * Today on a vertical time axis. entry: { id, time (label), title, meta, past, now }. The "Now" line is red; past
 * entries are grey.
 */
export function Timeline({ entries }) {
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => {
        const last = i === entries.length - 1
        return (
          <li key={e.id} aria-current={e.now ? 'time' : undefined} className="grid grid-cols-[44px_14px_minmax(0,1fr)] gap-x-3">
            <span className={cx('pt-0.5 text-[13px] leading-5 whitespace-nowrap tabular', e.now ? 'font-bold text-error' : e.past ? 'text-fg-tertiary' : 'font-semibold text-fg-secondary')}>
              {e.time}
            </span>
            <span aria-hidden="true" className="relative flex justify-center">
              <span
                className={cx(
                  'relative z-10 mt-1.5 size-2.5 rounded-full border-2',
                  e.now ? 'border-error bg-error ring-4 ring-error/15' : e.past ? 'border-line-strong bg-surface' : 'border-primary bg-surface',
                )}
              />
              {!last && <span className="absolute top-4 bottom-0 w-px bg-line" />}
            </span>
            <div className={cx('flex min-w-0 flex-col', last ? 'pb-0' : 'pb-4')}>
              <span className={cx('text-[15px] leading-6 break-words', e.now ? 'font-bold text-error' : e.past ? 'text-fg-tertiary' : 'font-semibold text-fg')}>{e.title}</span>
              {e.meta && <span className={cx('text-[13px] leading-5', e.past ? 'text-fg-tertiary' : 'text-fg-secondary')}>{e.meta}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ------------------------------------------------------------------ floors

/** Beds given out per floor, top floor first; each row opens Rooms and beds on that floor. */
export function FloorBars({ floors }) {
  return (
    <ul className="flex flex-col gap-1">
      {floors.map((f) => (
        <li key={f.floor}>
          <Link
            to={f.to}
            aria-label={t('Floor {n}: {pct}% of beds given out ({used} of {total}). Open Rooms and beds', { n: f.floor, pct: f.pct, used: formatNumber(f.used), total: formatNumber(f.total) })}
            className={cx('grid grid-cols-[64px_minmax(0,1fr)_40px] items-center gap-3 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-primary-subtle', FOCUS)}
          >
            <span className="text-sm whitespace-nowrap text-fg-secondary">{t('Floor {n}', { n: f.floor })}</span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${f.pct}%` }} />
            </span>
            <span className="text-right text-sm font-semibold text-fg tabular">{f.pct}%</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------------ stats strip

/** One figure of the strip; `missing` shows "No data yet" instead of a number. */
export function Stat({ label, value, tone, missing, children }) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-1">
      <dt className="text-sm text-fg-secondary">{tx(label)}</dt>
      <dd className="flex items-end gap-3">
        {missing ? (
          <span className="text-sm text-fg-tertiary">{t('No data yet')}</span>
        ) : (
          <span className={cx('text-[26px] leading-8 font-extrabold tabular', tone === 'success' ? 'text-success-fg' : 'text-fg')}>{value}</span>
        )}
        {children}
      </dd>
    </div>
  )
}
