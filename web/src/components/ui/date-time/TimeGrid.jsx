import { useEffect, useRef, useState } from 'react'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { mask, nowLocal, parseTime, timeSlots, timeToMinutes } from '@/lib/datetime'

/**
 * The time buttons of the Family Day form: every `minuteStep` minutes (15, 30 or 60) from minTime to maxTime,
 * as a grid (columns 4) or a column (columns 1). Opens scrolled to the chosen time, else to the time nearest now.
 * isDisabled(time) fades a time (past hours today, an end before its start). With `typeable` a box above the
 * buttons takes a typed time ("830" → 08:30) on Enter or blur. `blockedHint` greys the whole grid and says why in
 * it ("Choose a day first").
 */
export function TimeGrid({
  value,
  onPick,
  minuteStep = 30,
  minTime = '06:00',
  maxTime = '22:00',
  isDisabled = () => false,
  columns = 4,
  typeable = false,
  blockedHint,
  label = 'Time',
  className,
}) {
  const list = useRef(null)
  const times = timeSlots(minTime, maxTime, minuteStep)
  if (value && !times.includes(value)) times.push(value) // a typed 08:10 or "now" stays visible and chosen
  times.sort()

  useEffect(() => {
    const box = list.current
    if (!box || blockedHint) return
    const target = value || nowLocal().slice(11, 16)
    let best = null
    for (const el of box.querySelectorAll('[data-time]')) {
      const d = Math.abs(timeToMinutes(el.dataset.time) - timeToMinutes(target))
      if (!best || d < best.d) best = { el, d }
    }
    if (best) box.scrollTop = best.el.offsetTop - box.clientHeight / 2 + best.el.offsetHeight / 2
  }, [blockedHint]) // eslint-disable-line react-hooks/exhaustive-deps -- once when the grid becomes usable

  const onKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key]
    if (!step) return
    const buttons = [...list.current.querySelectorAll('[data-time]:not([disabled])')]
    const at = buttons.indexOf(document.activeElement)
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, at + step))]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  return (
    <div className={cx('flex min-h-0 flex-col gap-2', className)}>
      {typeable && <TypedTime value={value} disabled={!!blockedHint} isDisabled={isDisabled} onPick={onPick} label={label} />}
      <div className="relative min-h-0">
        <div
          ref={list}
          role="listbox"
          aria-label={t(label)}
          aria-disabled={!!blockedHint || undefined}
          onKeyDown={onKeyDown}
          className={cx('grid max-h-64 gap-1.5 overflow-y-auto p-0.5', columns === 1 ? 'grid-cols-1' : 'grid-cols-4', blockedHint && 'pointer-events-none opacity-30')}
        >
          {times.map((time) => {
            const off = !!blockedHint || isDisabled(time)
            const chosen = time === value
            return (
              <button
                key={time}
                type="button"
                role="option"
                data-time={time}
                data-autofocus={chosen ? '' : undefined}
                aria-selected={chosen}
                disabled={off}
                tabIndex={blockedHint ? -1 : undefined}
                onClick={() => onPick(time)}
                className={cx(
                  'shrink-0 rounded-lg border py-1.5 text-sm tabular transition-colors',
                  chosen ? 'border-primary bg-primary font-semibold text-fg-on-brand' : 'border-line text-fg enabled:hover:border-primary enabled:hover:bg-primary-subtle',
                  off && 'cursor-not-allowed opacity-30',
                )}
              >
                {time}
              </button>
            )
          })}
        </div>
        {blockedHint && (
          <p className="absolute inset-x-0 top-6 mx-auto w-fit max-w-full rounded-md bg-surface px-2 py-1 text-center text-xs font-medium text-fg-secondary shadow-dropdown">
            {t(blockedHint)}
          </p>
        )}
      </div>
    </div>
  )
}

/** The typed half of a time picker: "830" → 08:30, checked on Enter or blur. */
function TypedTime({ value, disabled, isDisabled, onPick, label }) {
  const [text, setText] = useState(value ?? '')
  const [error, setError] = useState('')
  useEffect(() => setText(value ?? ''), [value])
  const commit = () => {
    if (!text || text === value) return setError('')
    const time = parseTime(text)
    if (!time) return setError(t('Enter a time as HH:mm'))
    if (isDisabled(time)) return setError(t('This time cannot be chosen'))
    setError('')
    onPick(time)
  }
  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:mm"
        aria-label={t(label)}
        aria-invalid={!!error || undefined}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(mask('time', e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          commit()
        }}
        className={cx(
          'h-8 w-full rounded-md border bg-surface px-2 text-center text-sm tabular outline-none focus:border-focus focus:shadow-focus disabled:bg-subtle disabled:text-fg-disabled',
          error ? 'border-error' : 'border-line-strong',
        )}
      />
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  )
}
