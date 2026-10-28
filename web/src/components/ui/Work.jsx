import { Check } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { Button } from './Button'
import { Meter } from './Charts'
import { EmptyBlock } from './States'
import { Tag } from './Tag'

/*
 * Building blocks of the back-office home pages: what is waiting with the action next to it (WorkList), where the
 * Term is (Journey) and how full each Block is (CapacityRows). Every row says what, why and what to do, so a person
 * can act without opening a menu first.
 */

/**
 * A list of things to do. Item: { id, icon, tone, title, meta, badge: { label, tone }, action: { label, to | onClick,
 * primary }, secondary: { label, to | onClick } }. `tone` colours the icon (error, warning, info, success).
 */
export function WorkList({ items, empty, className }) {
  if (!items.length) return empty ?? <EmptyBlock title="Nothing to do" />
  const iconTone = { error: 'bg-error-bg text-error', warning: 'bg-warning-bg text-warning', info: 'bg-info-bg text-info', success: 'bg-success-bg text-success' }
  return (
    <ul className={cx('flex flex-col divide-y divide-line', className)}>
      {items.map((item) => {
        const Glyph = item.icon
        return (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            {Glyph && (
              <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-md', iconTone[item.tone] ?? 'bg-subtle text-fg-secondary')}>
                <Glyph size={16} aria-hidden="true" />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-base font-medium text-fg">{tx(item.title)}</p>
                {item.badge && (
                  <Tag tone={item.badge.tone} dot={false}>
                    {item.badge.label}
                  </Tag>
                )}
              </div>
              {item.meta && <p className="truncate text-sm text-fg-secondary">{tx(item.meta)}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {item.secondary && (
                <Button variant="text" size="sm" to={item.secondary.to} onClick={item.secondary.onClick}>
                  {item.secondary.label}
                </Button>
              )}
              {item.action && (
                <Button variant={item.action.primary ? 'primary' : 'default'} size="sm" to={item.action.to} onClick={item.action.onClick} disabled={item.action.disabled}>
                  {item.action.label}
                </Button>
              )}
            </div>
          </li>
        )
      })}
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
function level(pct) {
  if (pct >= 95) return { label: 'Nearly full', tone: 'error', bar: 'error' }
  if (pct >= 85) return { label: 'Filling up', tone: 'warning', bar: 'warning' }
  return { label: 'Space left', tone: 'success', bar: 'success' }
}

/** Rows of used / total with a level tag, the free count and a detail line. Row: { name, note, used, total, detail, to }. */
export function CapacityRows({ rows, className }) {
  return (
    <ul className={cx('flex flex-col gap-3.5', className)}>
      {rows.map((r) => {
        const pct = r.total ? (r.used / r.total) * 100 : 0
        const l = level(pct)
        return (
          <li key={r.name} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-base font-medium text-fg">
                {tx(r.name)}
                {r.note && <span className="font-normal text-fg-secondary"> · {tx(r.note)}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.total > 0 && (
                  <Tag tone={l.tone} dot={false}>
                    {l.label}
                  </Tag>
                )}
                <span className="text-base font-semibold text-fg tabular">{t('{n} free', { n: formatNumber(Math.max(0, r.total - r.used)) })}</span>
              </span>
            </div>
            <Meter value={r.used} max={r.total} tone={l.bar} label={t('{name}: {used} of {total} Beds taken', { name: tx(r.name), used: r.used, total: r.total })} />
            <span className="text-sm text-fg-tertiary">
              {t('{used} of {total} Beds taken', { used: formatNumber(r.used), total: formatNumber(r.total) })}
              {r.detail ? ` · ${tx(r.detail)}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** A card section with a title, a one-line subtitle and an action on the right. */
export function Panel({ title, subtitle, action, className, bodyClassName, children }) {
  return (
    <section className={cx('flex min-h-0 flex-col rounded-lg border border-line bg-surface', className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{tx(title)}</h2>
          {subtitle && <p className="truncate text-sm text-fg-tertiary">{tx(subtitle)}</p>}
        </div>
        {action}
      </div>
      <div className={cx('min-h-0 flex-1 overflow-y-auto px-5 pb-4', bodyClassName)}>{children}</div>
    </section>
  )
}
