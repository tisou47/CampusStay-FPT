import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

const KEYS = { ArrowRight: 1, ArrowLeft: -1 }

/**
 * Underline tabs with the WAI-ARIA tab pattern: role tablist/tab, aria-selected, only the selected tab in the
 * Tab order, ←/→ (and Home/End) move to and select the neighbouring tab. Focus is moved through the DOM, so the
 * component keeps no state of its own. Items: { key, label, count?, controls? }.
 */
export function Tabs({ items, value, onChange, label, className }) {
  // On each tab (the focusable element): move to the neighbouring tab and select it.
  const onKeyDown = (e) => {
    const step = KEYS[e.key]
    if (step == null && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const tabs = [...e.currentTarget.parentElement.querySelectorAll('[role="tab"]')]
    const here = tabs.indexOf(e.currentTarget)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (here + step + tabs.length) % tabs.length
    tabs[next]?.focus()
    onChange?.(items[next].key)
  }
  return (
    <div role="tablist" aria-label={label ? tx(label) : undefined} className={cx('flex items-start gap-6 border-b border-border', className)}>
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={item.controls}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange?.(item.key)}
            onKeyDown={onKeyDown}
            className={cx(
              '-mb-px flex min-h-10 items-center border-b-2 text-body font-medium whitespace-nowrap',
              active ? 'border-primary text-fg-brand' : 'border-transparent text-text-secondary hover:text-text',
            )}
          >
            {tx(item.label)}
            {item.count != null && <span className="ml-1.5 text-text-muted num">· {item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
