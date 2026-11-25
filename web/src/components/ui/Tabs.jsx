import { Link } from 'react-router'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { Tooltip } from './Tooltip'

/**
 * Underline tabs (Requests, Approvals, Inventories, Check-out, Inspections…):
 * 2 px primary underline on the active tab, optional count pill badge, and optional hint tooltip.
 * Items: { key, label, count?, hint?, to? }.
 */
export function Tabs({ items, value, onChange, label, className }) {
  // Tabs that are links go to other pages: they are navigation (the active one is the current page), not a tablist.
  const isNav = items.some((item) => item.to)
  const Box = isNav ? 'nav' : 'div'

  const move = (e, index) => {
    if (isNav || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange?.(next.key)
  }

  return (
    <Box
      role={isNav ? undefined : 'tablist'}
      aria-label={label}
      className={cx('flex shrink-0 items-center gap-6 overflow-x-auto border-b border-line scrollbar-none', className)}
    >
      {items.map((item, index) => {
        const active = item.key === value
        const hasCount = item.count !== undefined
        const classes = cx(
          'relative -mb-px flex cursor-pointer items-center gap-2 border-b-2 pt-1 pb-3 text-base font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus',
          active ? 'border-primary text-fg-brand' : 'border-transparent text-fg-secondary hover:text-fg',
        )
        const content = (
          <>
            <span>{tx(item.label)}</span>
            {hasCount && (
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 text-xs tabular-nums',
                  active ? 'bg-primary-subtle font-semibold text-fg-brand' : 'bg-subtle font-medium text-fg-secondary',
                )}
              >
                {item.count == null ? '—' : formatNumber(item.count)}
              </span>
            )}
          </>
        )
        const node = item.to ? (
          <Link key={item.key} to={item.to} aria-current={active ? 'page' : undefined} className={classes}>
            {content}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-description={item.hint ? tx(item.hint) : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange?.(item.key)}
            onKeyDown={(e) => move(e, index)}
            className={classes}
          >
            {content}
          </button>
        )
        return item.hint ? (
          <Tooltip key={item.key} label={tx(item.hint)}>
            {node}
          </Tooltip>
        ) : (
          node
        )
      })}
    </Box>
  )
}

export const UnderlineTabs = Tabs

/** Segmented control (pill group) for compact filters. */
export function Segmented({ options, value, onChange, className }) {
  return (
    <div role="radiogroup" className={cx('inline-flex rounded-md border border-line-strong bg-surface p-0.5', className)}>
      {options.map((opt) => {
        const o = typeof opt === 'string' ? { value: opt, label: opt } : opt
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx('h-7 rounded px-3 text-base whitespace-nowrap transition-colors', active ? 'bg-primary-subtle font-medium text-fg-brand' : 'text-fg-secondary hover:text-fg')}
          >
            {tx(o.label)}
          </button>
        )
      })}
    </div>
  )
}
