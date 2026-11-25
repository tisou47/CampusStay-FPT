import { Link } from 'react-router'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * Underline tabs (Requests, Approvals…): 2 px action/primary underline on the active tab,
 * Label/Base text, border/default baseline. Items: { key, label, count?, to? }.
 */
export function Tabs({ items, value, onChange, className }) {
  // Tabs that are links go to other pages: they are navigation (the active one is the current page), not a tablist.
  const isNav = items.some((item) => item.to)
  const Box = isNav ? 'nav' : 'div'
  const onKeyDown = (e) => {
    const keys = items.map((item) => item.key)
    const i = keys.indexOf(value)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 }[e.key]
    if (next == null || !keys.length) return
    e.preventDefault()
    const key = keys[(next + keys.length) % keys.length]
    onChange?.(key)
    e.currentTarget.querySelector(`[data-tab-key="${CSS.escape(String(key))}"]`)?.focus()
  }
  return (
    <Box role={isNav ? undefined : 'tablist'} onKeyDown={isNav ? undefined : onKeyDown} className={cx('flex items-start gap-6 border-b border-line', className)}>
      {items.map((item) => {
        const active = item.key === value
        const label = item.count != null ? `${tx(item.label)} · ${item.count}` : tx(item.label)
        const classes = cx(
          '-mb-px flex items-center border-b-2 py-2.5 text-base font-medium whitespace-nowrap transition-colors',
          active ? 'border-primary text-fg-brand' : 'border-transparent text-fg-secondary hover:text-fg',
        )
        return item.to ? (
          <Link key={item.key} to={item.to} aria-current={active ? 'page' : undefined} className={classes}>
            {label}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            role={isNav ? undefined : 'tab'}
            data-tab-key={item.key}
            tabIndex={isNav || active || !items.some((x) => x.key === value) ? undefined : -1}
            aria-selected={isNav ? undefined : active}
            aria-current={isNav && active ? 'true' : undefined}
            onClick={() => onChange?.(item.key)} className={classes}>
            {label}
          </button>
        )
      })}
    </Box>
  )
}

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
