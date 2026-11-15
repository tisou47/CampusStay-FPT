import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { t } from '@/i18n'
import { dayInput, inRange, parseDate, RANGES, rangeInput, splitRange, toDay } from '@/lib/datetime'
import { campusToday, formatDateRange } from '@/lib/format'
import { Calendar } from './Calendar'
import { dayBounds, dayRangeError } from './DatePicker'
import { PickerPopover } from './PickerPopover'
import { PanelFooter, PickerInput, QuickOptions, resolveOptions, usePicker } from './parts'

const EMPTY = { start: '', end: '' }

/**
 * A range of calendar days. value / onChange: { start, end } as "YYYY-MM-DD" (end ≥ start; one day is a range
 * of one). In the panel the first click is the start, the second the end (a click before the start starts again);
 * Confirm keeps it. Typed as "16/11/2026 – 20/11/2026". Chips: This week, Next week, This month.
 */
export function DateRangePicker({
  id,
  value = EMPTY,
  onChange,
  min,
  max,
  disablePast,
  disableFuture,
  quickOptions,
  clearable = true,
  disabled,
  disabledReason,
  required,
  error,
  invalid,
  placeholder = 'dd/mm/yyyy – dd/mm/yyyy',
  label,
  size,
  showWeekNumbers,
}) {
  const picker = usePicker()
  const today = campusToday()
  const bounds = dayBounds({ min, max, disablePast, disableFuture }, today)
  const options = resolveOptions(quickOptions, RANGES, today)
  const start = value?.start ? toDay(value.start) : ''
  const end = value?.end ? toDay(value.end) : ''
  const [draft, setDraft] = useState(EMPTY)
  const [shown, setShown] = useState(0) // a chip moves the calendar to its month

  const open = () => {
    setDraft({ start, end })
    picker.setOpen(true)
  }
  const pickDay = (day) =>
    setDraft((d) => (!d.start || d.end || day < d.start ? { start: day, end: '' } : { start: d.start, end: day }))
  const allowed = (r) => inRange(r.start, bounds.min, bounds.max) && inRange(r.end, bounds.min, bounds.max)

  return (
    <>
      <PickerInput
        picker={{ ...picker, setOpen: (v) => ((typeof v === 'function' ? v(picker.open) : v) ? open() : picker.setOpen(false)) }}
        id={id}
        kind="dateRange"
        text={rangeInput(dayInput(start), dayInput(end))}
        icon={CalendarRange}
        iconLabel="Open the calendar"
        placeholder={placeholder}
        clearable={clearable && !required}
        onClear={() => onChange?.(EMPTY)}
        onCommit={(text) => {
          const ends = splitRange(text)
          const [a, b] = ends ? ends.map(parseDate) : []
          if (!a || !b) return t('Enter the range as dd/mm/yyyy – dd/mm/yyyy')
          if (b < a) return t('The end day must be on or after the start day')
          const problem = dayRangeError(a, bounds) ?? dayRangeError(b, bounds)
          if (!problem) onChange?.({ start: a, end: b })
          return problem
        }}
        {...{ disabled, disabledReason, required, error, invalid, label, size }}
      />
      {picker.open && (
        <PickerPopover anchor={picker.anchor} onClose={picker.close} width={340} label="Choose a range of days">
          <div className="flex flex-col gap-3 p-4">
            <QuickOptions
              options={options}
              isActive={(r) => r.start === draft.start && r.end === draft.end}
              isAllowed={allowed}
              onPick={(r) => {
                setDraft(r)
                setShown((n) => n + 1)
              }}
            />
            <Calendar
              key={shown}
              rangeStart={draft.start}
              rangeEnd={draft.end}
              min={bounds.min}
              max={bounds.max}
              onPick={pickDay}
              showWeekNumbers={showWeekNumbers}
            />
            <p className="text-xs text-fg-tertiary">{draft.start && !draft.end ? t('Now choose the last day') : t('Choose the first day, then the last day')}</p>
          </div>
          <PanelFooter
            summary={draft.start ? formatDateRange(draft.start, draft.end || draft.start) : ''}
            ready={!!draft.start && !!draft.end}
            onCancel={() => picker.close('cancel')}
            onConfirm={() => {
              onChange?.(draft)
              picker.close('picked')
            }}
          />
        </PickerPopover>
      )}
    </>
  )
}
