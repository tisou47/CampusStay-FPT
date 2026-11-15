import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { t } from '@/i18n'
import { FUTURE_DAYS, inRange, isDay, localInput, localToIso, nowLocal, PAST_DAYS, parseDateTime, toLocal } from '@/lib/datetime'
import { campusToday, formatDateTime, formatWeekdayDate } from '@/lib/format'
import { Calendar } from './Calendar'
import { PickerPopover } from './PickerPopover'
import { earlier, later, NowChip, PanelFooter, PickerInput, QuickOptions, resolveOptions, usePicker } from './parts'
import { TimeGrid } from './TimeGrid'
import { timeRule } from './TimePicker'

/**
 * Bounds of a date-time picker as campus wall times ("2026-11-16T08:00"). min/max may be instants or days (a max
 * day includes the whole day); disablePast / disableFuture / showNow bound them by the current minute.
 */
export function instantBounds({ min, max, disablePast, disableFuture, showNow }) {
  const now = nowLocal()
  const lo = min ? (isDay(min) ? `${min}T00:00` : toLocal(min)) : ''
  const hi = max ? (isDay(max) ? `${max}T23:59` : toLocal(max)) : ''
  return { min: later(lo, disablePast ? now : ''), max: earlier(hi, disableFuture || showNow ? now : '') }
}

export function instantRangeError(local, { min, max }) {
  if ((!min || local >= min) && (!max || local <= max)) return null
  const show = (l) => formatDateTime(localToIso(l))
  if (min && max) return t('Choose a time from {min} to {max}', { min: show(min), max: show(max) })
  return min ? t('Choose a time from {min}', { min: show(min) }) : t('Choose a time up to {max}', { max: show(max) })
}

/**
 * A day and a time, the Family Day panel: chips and the month on the left, the time column on the right, which
 * stays faded ("Choose a day first") until a day is chosen. The choice is summed up above Confirm ("Thứ Hai,
 * 16/11/2026, 08:00"), which only works once both are chosen. Typed as "16/11/2026, 08:30".
 *
 * value: an ISO instant, a Date, or campus wall time "2026-11-16T08:30"; onChange gets the UTC ISO string ('' when
 * cleared). Shown on the campus clock (Asia/Ho_Chi_Minh) whatever the device's zone.
 * showNow (for a moment that already happened: a repair finished, a meter read, a payment made) adds "Now", the
 * current minute, and forbids the future.
 */
export function DateTimePicker({
  id,
  value,
  onChange,
  min,
  max,
  disablePast,
  disableFuture,
  showNow,
  quickOptions,
  minuteStep = 30,
  minTime = '06:00',
  maxTime = '22:00',
  clearable = true,
  disabled,
  disabledReason,
  required,
  error,
  invalid,
  placeholder = 'dd/mm/yyyy, HH:mm',
  label,
  size,
  showWeekNumbers,
}) {
  const picker = usePicker()
  const today = campusToday()
  const local = toLocal(value)
  const bounds = instantBounds({ min, max, disablePast, disableFuture, showNow })
  const dayMin = bounds.min.slice(0, 10)
  const dayMax = bounds.max.slice(0, 10)
  const options = resolveOptions(quickOptions, disableFuture || showNow ? PAST_DAYS : FUTURE_DAYS, today)
  const [day, setDay] = useState('')
  const [time, setTime] = useState('')
  const [shown, setShown] = useState(0)
  const rule = timeRule({ day, minLocal: bounds.min, maxLocal: bounds.max })
  const emit = (l) => onChange?.(l ? localToIso(l) : '')
  const now = () => nowLocal()

  const chooseDay = (d) => {
    setDay(d)
    if (time && timeRule({ day: d, minLocal: bounds.min, maxLocal: bounds.max })(time)) setTime('')
  }

  return (
    <>
      <PickerInput
        picker={{
          ...picker,
          setOpen: (v) => {
            setDay(local.slice(0, 10))
            setTime(local.slice(11, 16))
            picker.setOpen(typeof v === 'function' ? v(picker.open) : v)
          },
        }}
        id={id}
        kind="dateTime"
        text={localInput(local)}
        icon={CalendarClock}
        iconLabel="Open the calendar"
        placeholder={placeholder}
        clearable={clearable && !required}
        onClear={() => emit('')}
        nowLabel="Now"
        onNow={showNow ? () => emit(now()) : undefined}
        onCommit={(text) => {
          const l = parseDateTime(text)
          if (!l) return t('Enter a date and time as dd/mm/yyyy, HH:mm')
          const problem = instantRangeError(l, bounds)
          if (!problem) emit(l)
          return problem
        }}
        {...{ disabled, disabledReason, required, error, invalid, label, size }}
      />
      {picker.open && (
        <PickerPopover anchor={picker.anchor} onClose={picker.close} width={480} label="Choose a day and time">
          <p className="px-4 pt-4 text-base font-semibold text-fg">{t('Choose a day and time')}</p>
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <QuickOptions
                options={options}
                extra={
                  showNow && (
                    <NowChip
                      onClick={() => {
                        const n = now()
                        setDay(n.slice(0, 10))
                        setTime(n.slice(11, 16))
                        setShown((k) => k + 1)
                      }}
                    />
                  )
                }
                isActive={(v) => v === day}
                isAllowed={(v) => inRange(v, dayMin, dayMax)}
                onPick={(d) => {
                  chooseDay(d)
                  setShown((k) => k + 1)
                }}
              />
              <Calendar key={shown} value={day} min={dayMin} max={dayMax} onPick={chooseDay} showWeekNumbers={showWeekNumbers} />
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-line sm:w-24 sm:border-l sm:pl-3">
              <span className="text-xs font-semibold text-fg-tertiary">{t('Time')}</span>
              <TimeGrid
                value={time}
                onPick={setTime}
                minuteStep={minuteStep}
                minTime={minTime}
                maxTime={maxTime}
                isDisabled={rule}
                columns={1}
                typeable
                blockedHint={day ? undefined : 'Choose a day first'}
                className="max-sm:[&_[role=listbox]]:grid-cols-4"
              />
            </div>
          </div>
          <PanelFooter
            summary={day ? `${formatWeekdayDate(day)}${time ? `, ${time}` : ''}` : ''}
            ready={!!day && !!time && !rule(time)}
            onCancel={() => picker.close('cancel')}
            onConfirm={() => {
              emit(`${day}T${time}`)
              picker.close('picked')
            }}
          />
        </PickerPopover>
      )}
    </>
  )
}
