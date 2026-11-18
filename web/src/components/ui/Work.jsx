import { useCallback, useRef } from 'react'
import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { Button } from './Button'
import { InfoTip, Tooltip, Truncate, isTruncated } from './Tooltip'
import { Meter } from './Charts'
import { EmptyBlock } from './States'
import { StatusBadge } from './StatusBadge'
import { Tag } from './Tag'

/*
 * Building blocks of the back-office home pages: what is waiting with the action next to it (WorkList), where the
 * Term is (Journey) and how full each Block is (CapacityRows). Every row says what, why and what to do, so a person
 * can act without opening a menu first.
 */

const iconTone = { error: 'bg-error-bg text-error', warning: 'bg-warning-bg text-warning', info: 'bg-info-bg text-info', success: 'bg-success-bg text-success' }

function RowIcon({ icon: Glyph, tone }) {
  if (!Glyph) return null
  return (
    <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-md', iconTone[tone] ?? 'bg-subtle text-fg-secondary')}>
      <Glyph size={16} aria-hidden="true" />
    </span>
  )
}

/**
 * The whole of a record for a row's tooltip: a bold first line, then label / value pairs.
 * rows: [{ label, value }]; empty values are left out.
 */
export function DetailTip({ title, rows }) {
  return (
    <span className="flex min-w-56 flex-col gap-1.5 py-0.5">
      <span className="font-semibold">{tx(title)}</span>
      <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-normal">
        {rows
          .filter((r) => r.value != null && r.value !== '')
          .map((r) => (
            <span key={r.label} className="contents">
              <span className="text-white/65">{tx(r.label)}</span>
              <span className="text-white">{tx(r.value)}</span>
            </span>
          ))}
      </span>
    </span>
  )
}

/**
 * A row that is a link as a whole (a request, a ticket): no "Open" button, the row opens it. Hover tints it and
 * shows an arrow; Tab reaches it with a focus ring and Enter opens it. Its title wraps over two lines at most, its
 * meta stays on one, and each is cut with "…"; when they are, hovering (300 ms), focusing or tapping the row shows `details` (or the full
 * text). A tap on a phone then shows the details first, with an "Open details" button.
 * `action` is a button of its own beside the link (e.g. "Take it"), never a part of it.
 */
function LinkRow({ item }) {
  const titleRef = useRef(null)
  const metaRef = useRef(null)
  const cut = useCallback(() => isTruncated(titleRef.current) || isTruncated(metaRef.current), [])
  const tip = item.details ?? <DetailTip title={item.title} rows={item.meta ? [{ label: '', value: item.meta }] : []} />
  const hasBadges = Boolean(item.status || (item.flags && item.flags.length > 0))
  return (
    <li className={cx('group/row -mx-2 flex items-center gap-2 rounded-md px-2 transition-colors hover:bg-primary-subtle/70', item.fresh && 'animate-row-in')}>
      <Tooltip label={tip} when={cut} delay={300} touch action={{ to: item.to, label: t('Open details') }} align="start" block className="min-w-0 flex-1">
        {({ describedBy }) => (
          <Link
            to={item.to}
            aria-describedby={describedBy}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
          >
            <RowIcon icon={item.icon} tone={item.tone} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span ref={titleRef} className="line-clamp-2 text-base leading-snug font-medium break-words text-fg decoration-1 underline-offset-2 group-hover/row:text-fg-brand group-hover/row:underline">
                {tx(item.title)}
              </span>
              {item.meta && (
                <span ref={metaRef} className="truncate text-sm text-fg-secondary">
                  {tx(item.meta)}
                </span>
              )}
            </span>
            {hasBadges && (
              <span className="flex shrink-0 flex-col items-end justify-center gap-1 pl-2">
                {item.status && <StatusBadge status={item.status} variant={item.statusVariant}>{item.statusLabel}</StatusBadge>}
                {item.flags?.map((f) => (
                  <StatusBadge key={f.label} variant={f.variant} dot={false} title={f.title}>
                    {f.label}
                  </StatusBadge>
                ))}
              </span>
            )}
          </Link>
        )}
      </Tooltip>
      {item.action && (
        <Button
          variant={item.action.primary ? 'primary' : 'default'}
          size="sm"
          to={item.action.to}
          disabled={item.action.disabled}
          className={cx('min-w-24 justify-center', item.action.className)}
          onClick={(e) => {
            e.stopPropagation()
            if (!item.action.to) e.preventDefault()
            item.action.onClick?.(e)
          }}
        >
          {item.action.label}
        </Button>
      )}
    </li>
  )
}

/** A row with its own buttons (a task to do: "Set codes", "Open desk"); its texts are cut with a tooltip. */
function ActionRow({ item }) {
  return (
    <li className={cx('flex items-center gap-3 py-2.5', item.fresh && 'animate-row-in')}>
      <RowIcon icon={item.icon} tone={item.tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <Truncate as="p" lines={2} className="text-base leading-snug font-medium text-fg">
            {item.title}
          </Truncate>
          {item.badge && (
            <Tag tone={item.badge.tone} dot={false}>
              {item.badge.label}
            </Tag>
          )}
        </div>
        {item.meta && (
          <Truncate as="p" className="text-sm text-fg-secondary">
            {item.meta}
          </Truncate>
        )}
        {item.progress && item.progress.max > 0 && (
          <div className="flex items-center gap-2 pt-0.5">
            <Meter value={item.progress.value} max={item.progress.max} label={item.progress.label} className="h-1.5 w-32 shrink-0" />
            <span className="text-sm font-medium text-fg-secondary tabular">
              {formatNumber(item.progress.value)}/{formatNumber(item.progress.max)}
            </span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.secondary && (
          <Button variant="text" size="sm" to={item.secondary.to} onClick={item.secondary.onClick}>
            {item.secondary.label}
          </Button>
        )}
        {item.action && (
          <Button
            variant={item.action.primary ? 'primary' : 'default'}
            size="sm"
            to={item.action.to}
            onClick={item.action.onClick}
            disabled={item.action.disabled}
            className={cx('min-w-24 justify-center', item.action.className)}
          >
            {item.action.label}
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * A list of things to do. Item: { id, icon, tone, title, meta, badge: { label, tone }, progress: { value, max, label }
 * (a mini bar under the meta), action: { label, to | onClick, primary }, secondary: { label, to | onClick } }. `tone` colours the icon (error, warning, info, success).
 * A record (request, ticket) passes `to` instead: the row is then a link (see LinkRow) with `status` (StatusBadge),
 * `flags` ([{ label, variant }] after the meta, e.g. "2d overdue") and `details` (its tooltip); `fresh` animates a
 * row that just arrived.
 */
export function WorkList({ items, empty, className }) {
  if (!items.length) return empty ?? <EmptyBlock title="Nothing to do" />
  return (
    <ul className={cx('flex flex-col divide-y divide-line', className)}>
      {items.map((item) => (item.to ? <LinkRow key={item.id} item={item} /> : <ActionRow key={item.id} item={item} />))}
    </ul>
  )
}


/**
 * Where a process stands, left to right. Step: { label, date, state: 'done' | 'current' | 'todo', note }. The
 * current step says what it waits for (`note`), so the line reads as "done → now → next".
 */
export function Journey({ steps, className }) {
  return (
    <ol className={cx('flex gap-2', className)}>
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === 'current' ? 'step' : undefined} className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                s.state === 'done' && 'border-success bg-success text-fg-on-brand',
                s.state === 'current' && 'border-primary bg-primary-subtle text-fg-brand',
                s.state === 'todo' && 'border-line-strong bg-surface text-fg-tertiary',
              )}
            >
              {s.state === 'done' ? <Check size={14} /> : i + 1}
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" className={cx('h-0.5 min-w-2 flex-1 rounded-full', s.state === 'done' ? 'bg-success' : 'bg-line')} />}
          </div>
          <div className="flex min-w-0 flex-col pr-2">
            <span className="sr-only">{t(s.state === 'done' ? 'Done' : s.state === 'current' ? 'Current step' : 'Not started')}. </span>
            <span className={cx('truncate text-base', s.state === 'current' ? 'font-semibold text-fg' : 'text-fg')}>{tx(s.label)}</span>
            {s.date && <span className="truncate text-sm text-fg-tertiary">{s.date}</span>}
            {s.note && <span className={cx('truncate text-sm', s.state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-secondary')}>{tx(s.note)}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Fill level of a share: the label and colour say it, not the colour alone. */
function level(pct, free) {
  if (free === 0) return { label: 'Full', tone: 'error', bar: 'error' }
  if (pct >= 95) return { label: 'Nearly full', tone: 'error', bar: 'error' }
  if (pct >= 85) return { label: 'Filling up', tone: 'warning', bar: 'warning' }
  return { label: 'Space left', tone: 'success', bar: 'success' }
}

/** Rows of used / total with a unified status tag and a detail line. Row: { name, note, used, total, detail, to }. */
export function CapacityRows({ rows, className }) {
  return (
    <ul className={cx('flex flex-col gap-3.5', className)}>
      {rows.map((r) => {
        const free = Math.max(0, r.total - r.used)
        const pct = r.total ? (r.used / r.total) * 100 : 0
        const l = level(pct, free)
        return (
          <li key={r.name} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-base font-medium text-fg">
                {tx(r.name)}
                {r.note && <span className="font-normal text-fg-secondary"> · {tx(r.note)}</span>}
              </span>
              {r.total > 0 && (
                <Tag tone={l.tone} dot={true}>
                  {free === 0 ? t('Full') : t('{n} free', { n: formatNumber(free) })}
                </Tag>
              )}
            </div>
            <Tooltip label={t('{used} taken · {free} free · {total} capacity', { used: formatNumber(r.used), free: formatNumber(free), total: formatNumber(r.total) })} delay={150} block>
              <div tabIndex={0} className="flex w-full items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus">
                <Meter value={r.used} max={r.total} tone={l.bar} label={t('{name}: {used} of {total} beds taken', { name: tx(r.name), used: r.used, total: r.total })} className="min-w-0 flex-1" />
                {r.total > 0 && <span className="shrink-0 text-sm font-semibold text-fg tabular">{Math.round(pct)}%</span>}
              </div>
            </Tooltip>
            <span className="text-sm text-fg-tertiary">
              {t('{used} of {total} beds taken', { used: formatNumber(r.used), total: formatNumber(r.total) })}
              {r.detail ? ` · ${tx(r.detail)}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** A card section with a title (and an optional badge beside it), a one-line subtitle and an action on the right. */
export function Panel({ title, tip, badge, subtitle, action, className, bodyClassName, children }) {
  return (
    <section className={cx('flex min-h-0 flex-col rounded-lg border border-line bg-surface', className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-1.5 text-h3 font-semibold text-fg">
            {tx(title)}
            {tip && <InfoTip label={tip} />}
            {badge}
          </h2>
          {subtitle && (
            <Truncate as="p" className="text-sm text-fg-tertiary">
              {subtitle}
            </Truncate>
          )}
        </div>
        {action}
      </div>
      <div className={cx('min-h-0 flex-1 px-5 pb-4', bodyClassName ?? 'overflow-y-auto')}>{children}</div>
    </section>
  )
}
