import { useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import { nowTime, toMinutes } from './values'

/**
 * Times as rounded cells: a grid of `columns` (TimePicker, TimeRangePicker) or one scrolling column (columns=1,
 * DateTimePicker). The chosen time is filled orange, times that cannot be chosen are grey; on opening, the list
 * scrolls to the chosen time, or else the time nearest now. Keyboard: arrows move (↑↓ by a row), Home/End go to the
 * ends, Enter or Space chooses. `dimmed` fades the whole list (no day chosen yet) and makes it inert.
 */
export function TimeGrid({ slots, value, isDisabled, onPick, columns = 4, dimmed = false, label, className }) {
  const box = useRef(null)
  const near = () => {
    if (value && slots.includes(value)) return value
    const now = toMinutes(nowTime())
    const open = slots.filter((s) => !isDisabled?.(s))
    const list = open.length ? open : slots
    return list.reduce((best, s) => (Math.abs(toMinutes(s) - now) < Math.abs(toMinutes(best) - now) ? s : best), list[0])
  }
  const [focus, setFocus] = useState(near)

  useEffect(() => {
    const el = box.current?.querySelector(`[data-time="${focus}"]`)
    if (el && box.current.scrollHeight > box.current.clientHeight) {
      box.current.scrollTop = el.offsetTop - box.current.clientHeight / 2 + el.offsetHeight / 2
    }
    // Only when the list first shows.
  }, [])

  const moveTo = (i) => {
    const s = slots[Math.max(0, Math.min(slots.length - 1, i))]
    setFocus(s)
    box.current?.querySelector(`[data-time="${s}"]`)?.focus()
  }
  const onKeyDown = (e) => {
    const i = slots.indexOf(focus)
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
    if (moves[e.key] != null) {
      e.preventDefault()
      moveTo(i + moves[e.key])
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      moveTo(e.key === 'Home' ? 0 : slots.length - 1)
    }
  }

  return (
    <div
      ref={box}
      role="listbox"
      aria-label={label}
      aria-disabled={dimmed || undefined}
      onKeyDown={onKeyDown}
      style={columns > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      className={cx(columns > 1 ? 'grid gap-1.5' : 'relative flex flex-col gap-1 overflow-y-auto', dimmed && 'pointer-events-none opacity-40', className)}
    >
      {slots.map((s) => {
        const off = dimmed || !!isDisabled?.(s)
        const chosen = s === value
        return (
          <button
            key={s}
            type="button"
            role="option"
            data-time={s}
            data-autofocus={(!dimmed && s === focus) || undefined}
            tabIndex={!dimmed && s === focus ? 0 : -1}
            aria-selected={chosen}
            aria-disabled={off || undefined}
            onFocus={() => setFocus(s)}
            onClick={() => !off && onPick(s)}
            className={cx(
              'shrink-0 rounded-lg py-1.5 text-base tabular transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              columns > 1 && 'border',
              chosen
                ? 'border-primary bg-primary font-semibold text-fg-on-brand'
                : off
                  ? 'cursor-not-allowed border-line text-fg-disabled opacity-60'
                  : 'border-line text-fg hover:bg-primary-subtle',
            )}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}
