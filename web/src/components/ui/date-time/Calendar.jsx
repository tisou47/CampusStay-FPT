import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { addDays, addMonths, inRange, isoWeek, monthWeeks, sameMonth, startOfMonth, weekday } from '@/lib/datetime'
import { campusToday, formatMonthYear, formatWeekdayDate } from '@/lib/format'

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const KEYS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

function NavButton({ label, icon: Icon, onClick }) {
  return (
    <button type="button" aria-label={t(label)} onClick={onClick} className="rounded-lg border border-line p-1.5 text-fg-secondary hover:bg-subtle">
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}

/**
 * A month: Monday first, round day buttons, today outlined, the chosen day filled with the primary colour, days
 * outside [min, max] faded and not clickable. A range (rangeStart/rangeEnd, the hovered day while the end is being
 * chosen) is shaded between its ends. Keys: arrows move a day or a week, PageUp/PageDown a month (with Shift a
 * year), Home/End the week's ends, Enter or Space picks. Week numbers only with showWeekNumbers.
 */
export function Calendar({ value, rangeStart, rangeEnd, min, max, onPick, showWeekNumbers = false }) {
  const today = campusToday()
  const anchorDay = value || rangeStart || (min && min > today ? min : max && max < today ? max : today)
  const [month, setMonth] = useState(() => startOfMonth(anchorDay))
  const [focus, setFocus] = useState(anchorDay)
  const [hover, setHover] = useState('')
  const grid = useRef(null)
  const moved = useRef(false)

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector(`[data-day="${focus}"]`)?.focus({ preventScroll: true })
  }, [focus, month])

  const go = (day) => {
    moved.current = true
    setFocus(day)
    if (!sameMonth(day, month)) setMonth(startOfMonth(day))
  }
  const step = (n) => {
    const next = addMonths(month, n)
    setMonth(next)
    setFocus(addMonths(focus, n))
  }

  const onKeyDown = (e) => {
    let next = null
    if (KEYS[e.key]) next = addDays(focus, KEYS[e.key])
    else if (e.key === 'PageUp' || e.key === 'PageDown') next = addMonths(focus, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1))
    else if (e.key === 'Home') next = addDays(focus, -weekday(focus))
    else if (e.key === 'End') next = addDays(focus, 6 - weekday(focus))
    if (!next) return
    e.preventDefault()
    go(next)
  }

  const end = rangeEnd || (rangeStart && hover && hover >= rangeStart ? hover : '')
  const weeks = monthWeeks(month)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <span className="flex gap-1">
          <NavButton label="Previous year" icon={ChevronsLeft} onClick={() => step(-12)} />
          <NavButton label="Previous month" icon={ChevronLeft} onClick={() => step(-1)} />
        </span>
        <span className="text-base font-semibold text-fg" aria-live="polite">
          {formatMonthYear(month)}
        </span>
        <span className="flex gap-1">
          <NavButton label="Next month" icon={ChevronRight} onClick={() => step(1)} />
          <NavButton label="Next year" icon={ChevronsRight} onClick={() => step(12)} />
        </span>
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label={formatMonthYear(month)}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover('')}
        className={cx('grid gap-y-1 text-center text-sm', showWeekNumbers ? 'grid-cols-8' : 'grid-cols-7')}
      >
        {showWeekNumbers && <span className="py-1 text-xs font-semibold text-fg-tertiary">{t('Week')}</span>}
        {DAYS.map((d) => (
          <span key={d} role="columnheader" className="py-1 text-xs font-semibold text-fg-tertiary">
            {t(d)}
          </span>
        ))}
        {weeks.map((days) => [
          showWeekNumbers && (
            <span key={`w${days[0]}`} className="flex items-center justify-center text-xs text-fg-tertiary tabular">
              {isoWeek(days[0])}
            </span>
          ),
          ...days.map((day) => {
            const allowed = inRange(day, min, max)
            const outside = !sameMonth(day, month)
            const chosen = day === value || day === rangeStart || day === rangeEnd
            const between = rangeStart && end && day > rangeStart && day < end
            return (
              <span key={day} role="gridcell" className={cx('flex justify-center', between && 'bg-primary-subtle')}>
                <button
                  type="button"
                  data-day={day}
                  data-autofocus={day === focus ? '' : undefined}
                  tabIndex={day === focus ? 0 : -1}
                  disabled={!allowed}
                  aria-pressed={chosen}
                  aria-current={day === today ? 'date' : undefined}
                  aria-label={formatWeekdayDate(day)}
                  onMouseEnter={() => setHover(day)}
                  onFocus={() => setFocus(day)}
                  onClick={() => {
                    if (outside) setMonth(startOfMonth(day))
                    onPick(day)
                  }}
                  className={cx(
                    'size-9 rounded-full tabular transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                    outside && !chosen && 'text-fg-tertiary',
                    day === today && !chosen && 'font-semibold text-fg-brand ring-1 ring-primary',
                    chosen ? 'bg-primary font-semibold text-fg-on-brand' : allowed && 'hover:bg-primary-subtle',
                    !allowed && 'cursor-not-allowed opacity-30',
                  )}
                >
                  {Number(day.slice(8, 10))}
                </button>
              </span>
            )
          }),
        ])}
      </div>
    </div>
  )
}
