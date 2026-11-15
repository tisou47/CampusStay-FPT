import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { t } from '@/i18n'
import { FUTURE_DAYS, inRange, localInput, localToIso, mask, parseDate, parseTime, rangeInput, toLocal } from '@/lib/datetime'
import { campusToday, formatWeekdayDate } from '@/lib/format'
import { Calendar } from './Calendar'
import { instantBounds, instantRangeError } from './DateTimePicker'
import { PickerPopover } from './PickerPopover'
import { PanelFooter, PickerInput, QuickOptions, resolveOptions, usePicker } from './parts'
import { TimeGrid } from './TimeGrid'
import { timeRule } from './TimePicker'
import { withStart } from './TimeRangePicker'

const EMPTY = { start: '', end: '' }

/** "16/11/2026, 08:00 – 10:00" → { day, start, end }, or an error text. */
function parseSlot(text) {
  const m = /^(.+?)(?:\s*,\s*|\s+)(\S+)\s*[–—-]\s*(\S+)$/.exec(String(text).trim())
  const day = m && parseDate(m[1])
  const [start, end] = m ? [parseTime(m[2]), parseTime(m[3])] : []
  if (!day || !start || !end) return { error: t('Enter the slot as dd/mm/yyyy, HH:mm – HH:mm') }
  if (end <= start) return { error: t('The end time must be after the start time') }
  return { day, start, end }
}

/**
 * A time slot: one day with a start and an end time (a Family Day slot, a repair visit). value / onChange:
 * { start, end } as instants (ISO, Date or campus wall time in; UTC ISO out), on the same campus day, end after
 * start. The panel is the date-time panel with a "From" and a "To" column; a start proposes an end `duration`
 * minutes later. Typed as "16/11/2026, 08:00 – 10:00". Slots of a list that must not overlap are checked by the
 * form with slotErrors (lib/datetime).
 */
export function DateTimeRangePicker({
  id,
  value = EMPTY,
  onChange,
  min,
  max,
  disablePast,
  quickOptions,
  minuteStep = 30,
  minTime = '06:00',
  maxTime = '22:00',
  duration = 120,
  clearable = true,
  disabled,
  disabledReason,
  required,
  error,
  invalid,
  placeholder = 'dd/mm/yyyy, HH:mm – HH:mm',
  label,
  size,
  showWeekNumbers,
}) {
  const picker = usePicker()
  const today = campusToday()
  const bounds = instantBounds({ min, max, disablePast })
  const dayMin = bounds.min.slice(0, 10)
  const dayMax = bounds.max.slice(0, 10)
  const options = resolveOptions(quickOptions, FUTURE_DAYS, today)
  const start = toLocal(value?.start)
  const end = toLocal(value?.end)
  const [day, setDay] = useState('')
  const [draft, setDraft] = useState(EMPTY)
  const [shown, setShown] = useState(0)
  const startRule = timeRule({ day, minLocal: bounds.min, maxLocal: bounds.max })
  const endRule = timeRule({ day, minLocal: bounds.min, maxLocal: bounds.max, after: draft.start })
  const emit = (d, s, e) => onChange?.(d ? { start: localToIso(`${d}T${s}`), end: localToIso(`${d}T${e}`) } : EMPTY)
  const grid = { minuteStep, minTime, maxTime, columns: 1, typeable: true }

  const chooseDay = (d) => {
    setDay(d)
    const rule = timeRule({ day: d, minLocal: bounds.min, maxLocal: bounds.max })
    if (draft.start && rule(draft.start)) setDraft(EMPTY)
  }

  return (
    <>
      <PickerInput
        picker={{
          ...picker,
          setOpen: (v) => {
            setDay(start.slice(0, 10))
            setDraft({ start: start.slice(11, 16), end: end.slice(11, 16) })
            picker.setOpen(typeof v === 'function' ? v(picker.open) : v)
          },
        }}
        id={id}
        kind="dateTimeRange"
        text={start ? rangeInput(localInput(start), end.slice(11, 16)) : ''}
        icon={CalendarClock}
        iconLabel="Open the calendar"
        placeholder={placeholder}
        clearable={clearable && !required}
        onClear={() => emit('')}
        onCommit={(text) => {
          const slot = parseSlot(mask('dateTimeRange', text) || text)
          if (slot.error) return slot.error
          const problem = instantRangeError(`${slot.day}T${slot.start}`, bounds) ?? instantRangeError(`${slot.day}T${slot.end}`, bounds)
          if (!problem) emit(slot.day, slot.start, slot.end)
          return problem
        }}
        {...{ disabled, disabledReason, required, error, invalid, label, size }}
      />
      {picker.open && (
        <PickerPopover anchor={picker.anchor} onClose={picker.close} width={560} label="Choose a day and a time slot">
          <p className="px-4 pt-4 text-base font-semibold text-fg">{t('Choose a day and a time slot')}</p>
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <QuickOptions
                options={options}
                isActive={(v) => v === day}
                isAllowed={(v) => inRange(v, dayMin, dayMax)}
                onPick={(d) => {
                  chooseDay(d)
                  setShown((k) => k + 1)
                }}
              />
              <Calendar key={shown} value={day} min={dayMin} max={dayMax} onPick={chooseDay} showWeekNumbers={showWeekNumbers} />
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-line sm:w-44 sm:border-l sm:pl-3">
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-xs font-semibold text-fg-tertiary">{t('From')}</span>
                <TimeGrid
                  {...grid}
                  label="From"
                  value={draft.start}
                  isDisabled={startRule}
                  blockedHint={day ? undefined : 'Choose a day first'}
                  onPick={(s) => setDraft((d) => withStart(d, s, duration, maxTime))}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-xs font-semibold text-fg-tertiary">{t('To')}</span>
                <TimeGrid
                  {...grid}
                  label="To"
                  value={draft.end}
                  isDisabled={endRule}
                  blockedHint={!day ? 'Choose a day first' : draft.start ? undefined : 'Choose a start first'}
                  onPick={(e) => setDraft((d) => ({ ...d, end: e }))}
                />
              </div>
            </div>
          </div>
          <PanelFooter
            summary={day ? `${formatWeekdayDate(day)}${draft.start ? `, ${rangeInput(draft.start, draft.end)}` : ''}` : ''}
            ready={!!day && !!draft.start && !!draft.end && draft.end > draft.start && !startRule(draft.start) && !endRule(draft.end)}
            onCancel={() => picker.close('cancel')}
            onConfirm={() => {
              emit(day, draft.start, draft.end)
              picker.close('picked')
            }}
          />
        </PickerPopover>
      )}
    </>
  )
}
