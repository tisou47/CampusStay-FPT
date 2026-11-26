import { useId, useLayoutEffect, useRef, useState } from 'react'
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
 * StaffDashboard gives them; the data and the actions stay there. Type, weights and cards follow the other
 * back-office pages (text-h1 / text-h3 / text-kpi, font-semibold, rounded-lg cards with a hairline).
 */

/** A card of this page, as on the other back-office pages. */
export const CARD = 'rounded-lg border border-line bg-surface'

/** Orange focus ring of the page's own controls (buttons from the UI kit keep theirs). */
export const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** A grey block standing in for a value while it loads (still with prefers-reduced-motion). */
export function Skeleton({ className }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-md bg-subtle motion-reduce:animate-none', className)} />
}

function Loading({ rows = 3 }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">{t('Loading…')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

/**
 * A card section: its h2 (with a subtitle and a link on the right) stays put, the body scrolls when `scroll` is set
 * (the page fills one screen; long lists scroll inside their card).
 */
export function Section({ title, subtitle, aside, link, className, bodyClassName, scroll = false, children }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cx(CARD, 'flex min-h-0 min-w-0 flex-col', className)}>
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2 id={id} className="text-h3 font-semibold text-fg">
            {tx(title)}
          </h2>
          {subtitle && <p className="text-sm text-fg-tertiary">{subtitle}</p>}
        </div>
        {aside}
        {link && (
          <Link to={link.to} className={cx('shrink-0 rounded-sm text-sm font-medium whitespace-nowrap text-fg-brand hover:underline', FOCUS)}>
            {tx(link.label)}
          </Link>
        )}
      </div>
      <div className={cx('flex min-h-0 flex-col gap-3 px-4 pb-3', scroll && 'flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
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
    <span title={title} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap', pillTone[tone])}>
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
    <section aria-label={summary} className={cx(CARD, 'flex shrink-0 flex-col gap-3 px-4 py-2')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Glyph size={16} aria-hidden="true" className={cx('shrink-0', done ? 'text-success' : 'text-fg-brand')} />
        <p className="min-w-0 flex-1 text-base text-fg">
          <span className="font-medium">{summary}</span>
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
          className={cx('inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium whitespace-nowrap text-fg-brand transition-colors duration-150 hover:bg-primary-subtle', FOCUS)}
        >
          {t(open ? 'Hide the stages' : 'Show the stages')}
          <ChevronDown size={14} aria-hidden="true" className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      </div>
      <div id={panel} hidden={!open} className="flex flex-col gap-3 border-t border-line pt-3 pb-1">
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {steps.map((s) => (
            <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined} className="flex min-w-0 flex-col gap-1">
              <span aria-hidden="true" className={cx('h-1 rounded-full', s.state === 'done' ? 'bg-success' : s.state === 'current' ? 'bg-primary' : 'bg-line-strong')} />
              <span className="sr-only">{t(s.state === 'done' ? 'Done' : s.state === 'current' ? 'Current step' : 'Not started')}. </span>
              <span className={cx('truncate text-sm', s.state === 'current' ? 'font-semibold text-fg' : s.state === 'done' ? 'text-fg' : 'text-fg-secondary')}>{t(s.label)}</span>
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
  error: { num: 'text-error', icon: 'bg-error-bg text-error' },
  brand: { num: 'text-fg-brand', icon: 'bg-primary-subtle text-fg-brand' },
  plain: { num: 'text-fg', icon: 'bg-subtle text-fg-secondary' },
}

/**
 * One "to handle" tile on one line (icon, label, number): a toggle that filters the queue. tone colours the icon
 * and the number (error: overdue, brand: urgent); a zero is grey.
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
        'flex min-w-0 items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none',
        pressed ? 'border-primary bg-primary-subtle ring-2 ring-primary/15' : 'border-line hover:border-line-strong hover:bg-gray-25',
        FOCUS,
      )}
    >
      <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-md', look.icon)}>
        <Glyph size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug font-medium text-balance text-fg-secondary">{tx(label)}</span>
      {loading ? <Skeleton className="h-7 w-8" /> : <span className={cx('text-kpi font-semibold tabular', zero ? 'text-fg-tertiary' : look.num)}>{formatNumber(value ?? 0)}</span>}
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
    <span title={title} className={cx('inline-flex h-5 items-center rounded-full px-2 text-sm font-medium whitespace-nowrap', chipTone[tone])}>
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
      className={cx('inline-flex h-6 items-center gap-1 rounded-full bg-primary-subtle pr-1.5 pl-2.5 text-sm font-medium whitespace-nowrap text-primary-hover hover:bg-primary/15', FOCUS)}
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
      <Link to={item.to} className={cx('rounded-sm text-base leading-snug font-medium break-words text-fg hover:text-fg-brand hover:underline', FOCUS)}>
        {tx(item.title)}
      </Link>
    </Tooltip>
  ) : (
    <p className="text-base leading-snug font-medium break-words text-fg">{tx(item.title)}</p>
  )
  return (
    <li className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5', item.fresh && 'animate-row-in')}>
      <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-md', rowIcon[item.tone] ?? rowIcon.neutral)}>
        <Glyph size={16} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        {title}
        {item.meta && <p className="text-sm text-fg-secondary">{tx(item.meta)}</p>}
        {item.progress && item.progress.max > 0 && (
          <div className="flex items-center gap-2 pt-0.5">
            <Meter value={item.progress.value} max={item.progress.max} label={item.progress.label} className="h-1.5 w-32 max-w-full shrink" />
            <span className="text-sm font-medium whitespace-nowrap text-fg-secondary tabular">
              {formatNumber(item.progress.value)}/{formatNumber(item.progress.max)}
            </span>
          </div>
        )}
        {item.extra && (
          <button type="button" onClick={item.extra.onClick} className={cx('w-fit rounded-sm text-sm font-medium text-fg-link hover:underline', FOCUS)}>
            {tx(item.extra.label)}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 max-[719px]:w-full max-[719px]:justify-between max-[719px]:pl-11">
        {item.chips?.length > 0 && (
          <span className="flex flex-wrap justify-end gap-1">
            {item.chips.map((c) => (
              <Chip key={c.label} tone={c.tone} title={c.title}>
                {c.label}
              </Chip>
            ))}
          </span>
        )}
        {item.action && (
          <Button variant={item.primary ? 'primary' : 'default'} to={item.action.to} onClick={item.action.onClick} disabled={item.action.disabled} className={cx('min-w-24', FOCUS)}>
            {item.action.label}
          </Button>
        )}
      </div>
    </li>
  )
}

const groupDot = { overdue: 'bg-error', today: 'bg-primary', upcoming: 'bg-fg-tertiary' }

/** The queue in its three groups; a group with nothing in it is left out. Group headings stick while it scrolls. */
export function Queue({ groups, empty }) {
  const shown = groups.filter((g) => g.items.length)
  if (!shown.length) return empty
  return (
    <div className="flex flex-col gap-2">
      {shown.map((g) => (
        <section key={g.key} aria-label={`${tx(g.label)} · ${t('{n} tasks', { n: g.items.length })}`} className="flex flex-col">
          <h3 className="sticky top-0 z-10 flex items-center gap-2 bg-surface py-1.5 text-sm font-semibold text-fg">
            <span aria-hidden="true" className={cx('size-2 rounded-full', groupDot[g.key])} />
            {tx(g.label)}
            <span className="font-normal text-fg-tertiary">{t('{n} tasks', { n: g.items.length })}</span>
          </h3>
          <ul className="flex flex-col divide-y divide-line">
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
  // The card opens scrolled to "Now" (centred in the card's scroll area, the page itself does not move); after that
  // the person's own scrolling is left alone.
  const nowRef = useRef(null)
  const scrolled = useRef(false)
  const hasNow = entries.some((e) => e.now)
  useLayoutEffect(() => {
    const item = nowRef.current
    if (scrolled.current || !item) return
    let box = item.parentElement
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
    if (!box) return
    const top = item.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    box.scrollTop = Math.max(0, top - (box.clientHeight - item.offsetHeight) / 2)
    scrolled.current = true
  }, [hasNow, entries.length])
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => {
        const last = i === entries.length - 1
        return (
          <li key={e.id} ref={e.now ? nowRef : undefined} aria-current={e.now ? 'time' : undefined} className="grid grid-cols-[44px_12px_minmax(0,1fr)] gap-x-2.5">
            <span className={cx('text-sm whitespace-nowrap tabular', e.now ? 'font-semibold text-error' : e.past ? 'text-fg-tertiary' : 'font-medium text-fg-secondary')}>{e.time}</span>
            <span aria-hidden="true" className="relative flex justify-center">
              <span className={cx('relative z-10 mt-1.5 size-2 rounded-full', e.now ? 'bg-error ring-3 ring-error/15' : e.past ? 'bg-line-strong' : 'border-2 border-primary bg-surface')} />
              {!last && <span className="absolute top-4 bottom-0 w-px bg-line" />}
            </span>
            <div className={cx('flex min-w-0 flex-col', last ? 'pb-0' : 'pb-3')}>
              <span className={cx('text-base break-words', e.now ? 'font-semibold text-error' : e.past ? 'text-fg-tertiary' : 'font-medium text-fg')}>{e.title}</span>
              {e.meta && <span className={cx('text-sm', e.past ? 'text-fg-tertiary' : 'text-fg-secondary')}>{e.meta}</span>}
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
    <ul className="flex flex-col">
      {floors.map((f) => (
        <li key={f.floor}>
          <Link
            to={f.to}
            aria-label={t('Floor {n}: {pct}% of beds given out ({used} of {total}). Open Rooms and beds', { n: f.floor, pct: f.pct, used: formatNumber(f.used), total: formatNumber(f.total) })}
            className={cx('grid grid-cols-[52px_minmax(0,1fr)_36px] items-center gap-2.5 rounded-md px-1.5 py-0.5 transition-colors duration-150 hover:bg-primary-subtle', FOCUS)}
          >
            <span className="text-sm whitespace-nowrap text-fg-secondary">{t('Floor {n}', { n: f.floor })}</span>
            <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${f.pct}%` }} />
            </span>
            <span className="text-right text-sm font-medium text-fg tabular">{f.pct}%</span>
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
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <dt className="text-sm text-fg-secondary">{tx(label)}</dt>
      <dd className="flex items-baseline gap-2">
        {missing ? (
          <span className="text-sm font-medium text-fg-tertiary">—</span>
        ) : (
          <span className={cx('text-h3 font-semibold tabular', tone === 'success' ? 'text-success-fg' : 'text-fg')}>{value}</span>
        )}
        {children}
      </dd>
    </div>
  )
}
