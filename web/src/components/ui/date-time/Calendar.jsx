import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatMonthYear, formatWeekdayDate } from '@/lib/format'
import { addDays, addMonths, dayAllowed, firstOfMonth, monthGrid, today as campusToday } from './values'

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] // T2 … CN

/** Quick choices above the calendar; a choice that falls on a day that cannot be chosen is hidden. */
export function QuickDays({ value, rules, onPick }) {
  const now = campusToday()
  const chips = [
    { label: 'Today', day: now },
    { label: 'Tomorrow', day: addDays(now, 1) },
    { label: 'In a week', day: addDays(now, 7) },
    { label: 'In two weeks', day: addDays(now, 14) },
  ].filter((c) => dayAllowed(c.day, rules))
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          tabIndex={-1}
          onClick={() => onPick(c.day)}
          className={cx(
            'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            c.day === value ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line text-fg-secondary hover:border-primary hover:bg-primary-subtle',
          )}
        >
          {t(c.label)}
        </button>
      ))}
    </div>
  )
}

/**
 * A month: ‹ "Tháng 11/2026" ›, then the days Monday first (T2 … CN), no week numbers. Today has an orange ring, the
 * chosen day is filled orange; days that cannot be chosen and days of the next or previous month are greyed and
 * cannot be clicked. Keyboard: arrows move a day or a week, Home/End go to the week's ends, PageUp/PageDown change
 * month (with Shift: year), Enter or Space chooses. `rules`: { minDate, maxDate, disabledDates }.
 */
export function Calendar({ value, rules, onPick }) {
  const now = campusToday()
  const start = value || (dayAllowed(now, rules) ? now : rules?.minDate && now < rules.minDate.slice(0, 10) ? rules.minDate.slice(0, 10) : now)
  const [month, setMonth] = useState(() => firstOfMonth(start))
  const [focus, setFocus] = useState(start)
  const grid = useRef(null)

  const days = monthGrid(month)
  // After a key moved the focus (perhaps to another month), focus the new day once it is drawn.
  const pendingFocus = useRef(false)
  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    grid.current?.querySelector(`[data-day="${focus}"]`)?.focus({ preventScroll: true })
  }, [focus, month])
  const moveTo = (day) => {
    pendingFocus.current = true
    setFocus(day)
    if (firstOfMonth(day) !== month) setMonth(firstOfMonth(day))
  }
  const stepMonth = (n) => {
    const next = addMonths(month, n)
    setMonth(next)
    const [, , d] = focus.split('-').map(Number)
    const last = Number(addDays(addMonths(next, 1), -1).slice(8))
    setFocus(`${next.slice(0, 8)}${String(Math.min(d, last)).padStart(2, '0')}`)
  }

  const onKeyDown = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (moves[e.key] != null) {
      e.preventDefault()
      moveTo(addDays(focus, moves[e.key]))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const offset = days.indexOf(focus) % 7
      moveTo(addDays(focus, e.key === 'Home' ? -offset : 6 - offset))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const n = (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1)
      const target = addMonths(focus, n)
      const d = Number(focus.slice(8))
      const last = Number(addDays(addMonths(target, 1), -1).slice(8))
      moveTo(`${target.slice(0, 8)}${String(Math.min(d, last)).padStart(2, '0')}`)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" tabIndex={-1} aria-label={t('Previous month')} onClick={() => stepMonth(-1)} className="rounded-lg p-1.5 text-fg-secondary hover:bg-subtle hover:text-fg">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="text-base font-semibold text-fg" aria-live="polite">
          {formatMonthYear(month)}
        </span>
        <button type="button" tabIndex={-1} aria-label={t('Next month')} onClick={() => stepMonth(1)} className="rounded-lg p-1.5 text-fg-secondary hover:bg-subtle hover:text-fg">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={formatMonthYear(month)} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-1 text-center text-base">
        {DAYS.map((d) => (
          <span key={d} role="columnheader" className="py-1 text-sm font-semibold text-fg-tertiary">
            {t(d)}
          </span>
        ))}
        {days.map((day) => {
          const other = day.slice(0, 7) !== month.slice(0, 7)
          const ok = !other && dayAllowed(day, rules)
          const chosen = day === value
          return (
            <span key={day} role="gridcell" className="flex justify-center">
              <button
                type="button"
                data-day={day}
                data-autofocus={day === focus || undefined}
                tabIndex={day === focus ? 0 : -1}
                aria-disabled={!ok || undefined}
                aria-selected={chosen}
                aria-current={day === now ? 'date' : undefined}
                aria-label={formatWeekdayDate(day)}
                onFocus={() => setFocus(day)}
                onClick={() => ok && onPick(day)}
                className={cx(
                  'size-9 rounded-full tabular transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                  chosen
                    ? 'bg-primary font-semibold text-fg-on-brand'
                    : day === now && !other
                      ? 'font-semibold text-fg-brand ring-1 ring-primary ring-inset'
                      : 'text-fg',
                  ok ? !chosen && 'hover:bg-primary-subtle' : 'cursor-not-allowed text-fg-disabled! opacity-60',
                )}
              >
                {Number(day.slice(8))}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}
