import { Link } from 'react-router'
import { cx } from '@/lib/cx'

/**
 * Underline tabs (Requests, Approvals…): 2 px action/primary underline on the active tab,
 * Label/Base text, border/default baseline. Items: { key, label, count?, to? }.
 */
export function Tabs({ items, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex items-start gap-6 border-b border-line', className)}>
      {items.map((item) => {
        const active = item.key === value
        const label = item.count != null ? `${item.label} · ${item.count}` : item.label
        const classes = cx(
          '-mb-px flex items-center border-b-2 py-2.5 text-base font-medium whitespace-nowrap transition-colors',
          active ? 'border-primary text-fg-brand' : 'border-transparent text-fg-secondary hover:text-fg',
        )
        return item.to ? (
          <Link key={item.key} to={item.to} role="tab" aria-selected={active} className={classes}>
            {label}
          </Link>
        ) : (
          <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => onChange?.(item.key)} className={classes}>
            {label}
          </button>
        )
      })}
    </div>
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
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
