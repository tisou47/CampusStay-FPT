import { CalendarDays } from 'lucide-react'
import { t } from '@/i18n'
import { dayInput, FUTURE_DAYS, inRange, PAST_DAYS, parseDate, toDay } from '@/lib/datetime'
import { campusToday, formatDate } from '@/lib/format'
import { Calendar } from './Calendar'
import { PickerPopover } from './PickerPopover'
import { earlier, later, PickerInput, QuickOptions, resolveOptions, usePicker } from './parts'

/** min/max of a day picker after disablePast / disableFuture (showNow implies disableFuture). */
export function dayBounds({ min, max, disablePast, disableFuture, showNow }, today) {
  return {
    min: later(min ? toDay(min) : '', disablePast ? today : ''),
    max: earlier(max ? toDay(max) : '', disableFuture || showNow ? today : ''),
  }
}

/** The error text of a day outside [min, max]. */
export function dayRangeError(day, { min, max }) {
  if (inRange(day, min, max)) return null
  if (min && max) return t('Choose a day from {min} to {max}', { min: formatDate(min), max: formatDate(max) })
  return min ? t('Choose a day from {min}', { min: formatDate(min) }) : t('Choose a day up to {max}', { max: formatDate(max) })
}

/**
 * One calendar day. value / onChange: "YYYY-MM-DD" ('' when cleared), never shifted by a time zone.
 * Picking a day (a chip, a click, Enter) sets it and closes; typing "16112026" gives 16/11/2026.
 * showNow adds "Today" and forbids later days (a day something happened).
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  disablePast,
  disableFuture,
  showNow,
  quickOptions,
  clearable = true,
  disabled,
  disabledReason,
  required,
  error,
  invalid,
  placeholder = 'dd/mm/yyyy',
  label,
  size,
  showWeekNumbers,
}) {
  const picker = usePicker()
  const today = campusToday()
  const bounds = dayBounds({ min, max, disablePast, disableFuture, showNow }, today)
  const options = resolveOptions(quickOptions, disableFuture || showNow ? PAST_DAYS : FUTURE_DAYS, today)
  const day = value ? toDay(value) : ''
  const pick = (d) => {
    onChange?.(d)
    picker.close('picked')
  }

  return (
    <>
      <PickerInput
        picker={picker}
        id={id}
        kind="date"
        text={dayInput(day)}
        icon={CalendarDays}
        iconLabel="Open the calendar"
        placeholder={placeholder}
        clearable={clearable && !required}
        onClear={() => onChange?.('')}
        nowLabel="Today"
        onNow={showNow ? () => onChange?.(today) : undefined}
        onCommit={(text) => {
          const d = parseDate(text)
          if (!d) return t('Enter a date as dd/mm/yyyy')
          const problem = dayRangeError(d, bounds)
          if (!problem) onChange?.(d)
          return problem
        }}
        {...{ disabled, disabledReason, required, error, invalid, label, size }}
      />
      {picker.open && (
        <PickerPopover anchor={picker.anchor} onClose={picker.close} width={320} label="Choose a day">
          <div className="flex flex-col gap-3 p-4">
            <QuickOptions options={options} isActive={(v) => v === day} isAllowed={(v) => inRange(v, bounds.min, bounds.max)} onPick={pick} />
            <Calendar value={day} min={bounds.min} max={bounds.max} onPick={pick} showWeekNumbers={showWeekNumbers} />
          </div>
        </PickerPopover>
      )}
    </>
  )
}
