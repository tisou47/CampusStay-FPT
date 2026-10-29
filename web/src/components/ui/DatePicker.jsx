import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { controlClasses } from './Field'
import { Popover } from './Popover'

// Date and date-time fields (replace <input type="date"> and <input type="datetime-local">). The calendar works by
// week, like the FAP timetable: ISO week numbers on the left, Monday first, the selected week highlighted, and a
// "This week" shortcut. Times are whole hours: deadlines and visits in the dormitory fall on the hour. A value that
// already has minutes is shown as it is until a new hour is chosen. Both call onChange({ target: { value } }) with
// the same strings the native inputs gave ("2027-01-20", "2027-01-20T09:00"), so they drop into existing forms.

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
const show = (s) => {
  const d = parse(s)
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''
}
const mondayOf = (d) => {
  const m = new Date(d)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}
/** ISO 8601 week number (the week with the year's first Thursday is week 1). */
const weekOf = (d) => {
  const th = new Date(d)
  th.setDate(th.getDate() + 3 - ((th.getDay() + 6) % 7))
  const first = new Date(th.getFullYear(), 0, 4)
  return 1 + Math.round(((th - first) / 86_400_000 - 3 + ((first.getDay() + 6) % 7)) / 7)
}
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function Calendar({ value, min, max, onPick }) {
  const selected = parse(value)
  const [month, setMonth] = useState(() => {
    const d = selected ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const today = iso(new Date())
  const allowed = (d) => (!min || iso(d) >= min.slice(0, 10)) && (!max || iso(d) <= max.slice(0, 10))
  const weeks = []
  for (let start = mondayOf(month); start.getMonth() === month.getMonth() || start < month; start.setDate(start.getDate() + 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  }
  const selectedWeek = selected ? iso(mondayOf(selected)) : null
  const step = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const label = month.toLocaleDateString(document.documentElement.lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric' })
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-fg capitalize">{label}</span>
        <span className="flex gap-1">
          <button type="button" aria-label={t('Previous month')} onClick={() => step(-1)} className="rounded-md p-1 text-fg-secondary hover:bg-subtle">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label={t('Next month')} onClick={() => step(1)} className="rounded-md p-1 text-fg-secondary hover:bg-subtle">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </span>
      </div>
      <table className="border-separate border-spacing-y-0.5 text-sm">
        <thead>
          <tr className="text-fg-tertiary">
            <th className="w-9 border-r border-line pr-1 text-left font-medium">{t('Week')}</th>
            {DAYS.map((d) => (
              <th key={d} className="w-9 font-medium">
                {t(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((days) => {
            const week = iso(days[0])
            return (
              <tr key={week} className={cx(week === selectedWeek && '[&>td]:bg-subtle')}>
                <td className="border-r border-line pr-1 text-fg-secondary">{weekOf(days[0])}</td>
                {days.map((d) => {
                  const day = iso(d)
                  const ok = allowed(d)
                  return (
                    <td key={day} className="p-0 text-center">
                      <button
                        type="button"
                        disabled={!ok}
                        aria-pressed={day === value?.slice(0, 10)}
                        aria-label={show(day)}
                        onClick={() => onPick(day)}
                        className={cx(
                          'size-8 rounded-md tabular',
                          d.getMonth() !== month.getMonth() && 'text-fg-tertiary',
                          day === today && 'font-semibold text-fg-brand',
                          day === value?.slice(0, 10) ? 'bg-primary font-semibold text-fg-on-brand' : ok && 'hover:bg-primary-subtle',
                          !ok && 'cursor-not-allowed opacity-35',
                        )}
                      >
                        {d.getDate()}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex justify-between text-sm">
        <button
          type="button"
          className="font-medium text-fg-brand hover:underline"
          onClick={() => {
            const now = new Date()
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
            if (allowed(now)) onPick(iso(now))
          }}
        >
          {t('This week')}
        </button>
        {value && (
          <button type="button" className="text-fg-secondary hover:underline" onClick={() => onPick('')}>
            {t('Clear')}
          </button>
        )}
      </div>
    </div>
  )
}

function Trigger({ id, text, placeholder, disabled, invalid, size, toggle, props }) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={toggle}
      aria-invalid={invalid || undefined}
      className={cx(controlClasses({ size, invalid }), 'flex items-center justify-between gap-2 text-left', !text && 'text-fg-tertiary')}
      {...props}
    >
      <span className="truncate tabular">{text || tx(placeholder ?? 'dd/mm/yyyy')}</span>
      <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
    </button>
  )
}

/** A day: value "YYYY-MM-DD". */
export function DateInput({ id, value, onChange, min, max, disabled, invalid, size = 'md', placeholder, align = 'start' }) {
  const emit = (v) => onChange?.({ target: { value: v } })
  return (
    <Popover
      align={align}
      width={320}
      trigger={({ toggle, props }) => (
        <Trigger id={id} text={show(value)} placeholder={placeholder} disabled={disabled} invalid={invalid} size={size} toggle={toggle} props={props} />
      )}
    >
      {({ close }) => (
        <Calendar
          value={value}
          min={min}
          max={max}
          onPick={(day) => {
            emit(day)
            close()
          }}
        />
      )}
    </Popover>
  )
}

/** Whole hours of a day, as "HH:00"; a time with minutes already set stays offered until it is changed. */
export function HourSelect({ id, value, onChange, disabled, invalid, size = 'md', from = 0, to = 23 }) {
  const hours = Array.from({ length: to - from + 1 }, (_, i) => `${pad(from + i)}:00`)
  const options = value && !hours.includes(value) ? [value, ...hours] : hours
  return (
    <span className="relative flex min-w-0">
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange?.(e.target.value)}
        className={cx(controlClasses({ size, invalid }), 'appearance-none pr-8 tabular')}
      >
        {!value && <option value="">--:--</option>}
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-tertiary" />
    </span>
  )
}

/** A day and a whole hour: value "YYYY-MM-DDTHH:mm" (minutes 00 when chosen here). */
export function DateTimeInput({ id, value, onChange, min, max, disabled, invalid, size = 'md' }) {
  const day = value?.slice(0, 10) ?? ''
  const time = value?.slice(11, 16) ?? ''
  const emit = (d, h) => onChange?.({ target: { value: d ? `${d}T${h || '00:00'}` : '' } })
  return (
    <span className="flex min-w-0 gap-2">
      <span className="min-w-0 flex-1">
        <DateInput id={id} value={day} min={min} max={max} disabled={disabled} invalid={invalid} size={size} onChange={(e) => emit(e.target.value, time)} />
      </span>
      <span className="w-24 shrink-0">
        <HourSelect value={time} disabled={disabled || !day} invalid={invalid} size={size} onChange={(h) => emit(day, h)} />
      </span>
    </span>
  )
}
