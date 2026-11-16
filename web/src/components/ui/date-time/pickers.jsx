import { useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { Calendar, QuickDays } from './Calendar'
import { PickerField, usePicker } from './PickerField'
import { PickerPopover, useIsMobile } from './PickerPopover'
import { TimeGrid } from './TimeGrid'
import {
  dayAllowed,
  nowTime,
  readTypedDay,
  readTypedTime,
  readValue,
  showDay,
  timeSlots,
  toMinutes,
  today,
  writeValue,
} from './values'

/** The times offered: the slots, plus a time the form already holds off the grid ("09:10"), kept until changed. */
const withCurrent = (slots, time) => (time && !slots.includes(time) ? [...slots, time].sort() : slots)

/** "(2 giờ)" / "(1 hour)" / "(1,5 giờ)". */
const duration = (start, end) => {
  const minutes = toMinutes(end) - toMinutes(start)
  if (!(minutes > 0)) return ''
  return `(${t('{n} hours', { n: formatNumber(minutes / 60, { decimals: minutes % 60 ? 1 : 0 }) })})`
}

function PanelTitle({ children, aside }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-base font-semibold text-fg">{children}</p>
      {aside}
    </div>
  )
}

function TextLink({ onClick, muted, children }) {
  return (
    <button type="button" tabIndex={-1} onClick={onClick} className={cx('text-base hover:underline', muted ? 'text-fg-secondary' : 'font-medium text-fg-brand')}>
      {children}
    </button>
  )
}

/**
 * A day. value/onChange in `valueFormat` (default "YYYY-MM-DD"); onChange('') when cleared. minDate and maxDate are
 * days ("2026-11-16", a longer string starting with a day is read by its day); disabledDates(day) → true greys a day
 * out. The field shows "16/11/2026" and takes it typed; the panel has the quick choices, the month and a "Today" link.
 */
export function DatePicker({
  id,
  name,
  value,
  onChange,
  valueFormat = 'YYYY-MM-DD',
  placeholder = 'dd/mm/yyyy',
  disabled,
  error,
  required,
  minDate,
  maxDate,
  disabledDates,
  clearable = false,
  size = 'md',
}) {
  const picker = usePicker()
  const { day } = readValue(value, valueFormat)
  const rules = { minDate, maxDate, disabledDates }
  const emit = (d) => onChange?.(d ? writeValue({ day: d }, valueFormat) : '')
  const pick = (d) => {
    emit(d)
    picker.close('pick')
  }
  const now = today()
  return (
    <>
      <PickerField
        picker={picker}
        id={id}
        name={name}
        formValue={value}
        kind="date"
        text={showDay(day)}
        placeholder={placeholder}
        icon={CalendarDays}
        iconLabel="Choose a day"
        clearable={clearable}
        disabled={disabled}
        error={error}
        required={required}
        size={size}
        onClear={() => emit('')}
        onCommit={(text) => {
          const d = readTypedDay(text)
          if (!d || !dayAllowed(d, rules)) return false
          emit(d)
          return true
        }}
      />
      {picker.open && (
        <PickerPopover picker={picker} width={320} label="Choose a day">
          <div className="flex flex-col gap-3 p-4">
            <QuickDays value={day} rules={rules} onPick={pick} />
            <Calendar value={day} rules={rules} onPick={pick} />
            <div className="flex items-center justify-between border-t border-line pt-2">
              {dayAllowed(now, rules) ? <TextLink onClick={() => pick(now)}>{t('Today')}</TextLink> : <span />}
              {clearable && day && (
                <TextLink muted onClick={() => pick('')}>
                  {t('Clear')}
                </TextLink>
              )}
            </div>
          </div>
        </PickerPopover>
      )}
    </>
  )
}

/**
 * A time, chosen in a grid of 4 columns from minTime to maxTime every stepMinutes (one click chooses and closes).
 * value/onChange in `valueFormat` (default "HH:mm"); disabledTimes(time) → true greys a time out.
 */
export function TimePicker({
  id,
  name,
  value,
  onChange,
  valueFormat = 'HH:mm',
  placeholder = '--:--',
  disabled,
  error,
  required,
  minTime = '06:00',
  maxTime = '22:00',
  stepMinutes = 60,
  disabledTimes,
  clearable = false,
  size = 'md',
}) {
  const picker = usePicker()
  const { time } = readValue(value, valueFormat)
  const slots = withCurrent(timeSlots(minTime, maxTime, stepMinutes), time)
  const allowed = (s) => slots.includes(s) && (s === time || !disabledTimes?.(s))
  const emit = (s) => onChange?.(s ? writeValue({ time: s }, valueFormat) : '')
  return (
    <>
      <PickerField
        picker={picker}
        id={id}
        name={name}
        formValue={value}
        kind="time"
        text={time}
        placeholder={placeholder}
        icon={Clock}
        iconLabel="Choose a time"
        clearable={clearable}
        disabled={disabled}
        error={error}
        required={required}
        size={size}
        onClear={() => emit('')}
        onCommit={(text) => {
          const s = readTypedTime(text)
          if (!s || !allowed(s)) return false
          emit(s)
          return true
        }}
      />
      {picker.open && (
        <PickerPopover picker={picker} width={300} label="Choose a time">
          <div className="flex flex-col gap-3 p-4">
            <PanelTitle>{t('Choose a time')}</PanelTitle>
            <TimeGrid
              slots={slots}
              value={time}
              label={t('Choose a time')}
              isDisabled={(s) => s !== time && !!disabledTimes?.(s)}
              onPick={(s) => {
                emit(s)
                picker.close('pick')
              }}
            />
          </div>
        </PickerPopover>
      )}
    </>
  )
}

/**
 * A day and a time, chosen in one panel: the quick choices and the month on the left, the "Hour" column on the right
 * (it scrolls to the chosen hour, or the one nearest now), then "Confirm" (once both are chosen) and "Cancel".
 * Cancel, Esc and a click outside leave the value as it was. value/onChange in `valueFormat`: default
 * "YYYY-MM-DDTHH:mm" (campus wall time, as <input type="datetime-local">), or "iso" for a UTC instant.
 * disabledTimes(time, day) greys out a time of a day. disablePastTimes greys out the hours already gone when the day
 * chosen is today; by default it is on when minDate is today or later (the field already refuses the past).
 */
export function DateTimePicker({
  id,
  name,
  value,
  onChange,
  valueFormat = 'YYYY-MM-DDTHH:mm',
  placeholder = 'dd/mm/yyyy · --:--',
  disabled,
  error,
  required,
  minDate,
  maxDate,
  disabledDates,
  minTime = '06:00',
  maxTime = '22:00',
  stepMinutes = 60,
  disabledTimes,
  disablePastTimes,
  clearable = false,
  size = 'md',
}) {
  const picker = usePicker()
  const mobile = useIsMobile()
  const current = readValue(value, valueFormat)
  const [draft, setDraft] = useState(current)
  const rules = { minDate, maxDate, disabledDates }
  const blockPast = disablePastTimes ?? (!!minDate && String(minDate).slice(0, 10) >= today())
  const slots = withCurrent(timeSlots(minTime, maxTime, stepMinutes), current.time)
  const timeOff = (s, d) => {
    if (d === current.day && s === current.time) return false
    if (!slots.includes(s)) return true
    if (blockPast && d === today() && s < nowTime()) return true
    return !!disabledTimes?.(s, d)
  }
  const emit = (v) => onChange?.(v.day && v.time ? writeValue(v, valueFormat) : '')
  const text = current.day && current.time ? `${showDay(current.day)} · ${current.time}` : current.day ? showDay(current.day) : ''

  const openWith = (o) => {
    if (o) setDraft(current)
    picker.setOpen(o)
  }
  const setDay = (d) => setDraft((x) => ({ day: d, time: x.time && !timeOff(x.time, d) ? x.time : '' }))
  const ready = !!draft.day && !!draft.time && dayAllowed(draft.day, rules) && !timeOff(draft.time, draft.day)

  return (
    <>
      <PickerField
        picker={{ ...picker, setOpen: (o) => openWith(typeof o === 'function' ? o(picker.open) : o) }}
        id={id}
        name={name}
        formValue={value}
        kind="datetime"
        text={text}
        placeholder={placeholder}
        icon={CalendarDays}
        iconLabel="Choose a day and time"
        clearable={clearable}
        disabled={disabled}
        error={error}
        required={required}
        size={size}
        onClear={() => emit({ day: '', time: '' })}
        onCommit={(typed) => {
          const [dayText, timeText = ''] = typed.split(' · ')
          const d = readTypedDay(dayText)
          const s = readTypedTime(timeText)
          if (!d || !s || !dayAllowed(d, rules) || timeOff(s, d)) return false
          emit({ day: d, time: s })
          return true
        }}
      />
      {picker.open && (
        <PickerPopover picker={picker} width={460} label="Choose a day and time">
          <div className={cx('flex gap-4 p-4', mobile && 'flex-col')}>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <PanelTitle>{t('Choose a day and time')}</PanelTitle>
              <QuickDays value={draft.day} rules={rules} onPick={setDay} />
              <Calendar value={draft.day} rules={rules} onPick={setDay} />
            </div>
            <div className={cx('flex shrink-0 flex-col gap-2', mobile ? 'border-t border-line pt-3' : 'w-24 border-l border-line pl-3')}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-fg-tertiary">{t('Hour')}</span>
                {!draft.day && <span className="text-sm text-fg-tertiary">{t('Choose a day first')}</span>}
              </div>
              <TimeGrid
                key={draft.day || 'none'}
                slots={slots}
                value={draft.time}
                label={t('Hour')}
                columns={mobile ? 4 : 1}
                dimmed={!draft.day}
                isDisabled={(s) => timeOff(s, draft.day)}
                onPick={(s) => setDraft((x) => ({ ...x, time: s }))}
                className={mobile ? undefined : 'max-h-72 pr-1'}
              />
            </div>
          </div>
          <div className="sticky bottom-0 flex flex-col gap-1 border-t border-line bg-surface p-3">
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                emit(draft)
                picker.close('pick')
              }}
              className="w-full rounded-lg bg-primary py-2 text-base font-semibold text-fg-on-brand hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('Confirm')}
            </button>
            <button type="button" onClick={() => picker.close('cancel')} className="py-1 text-base text-fg-secondary hover:underline">
              {t('Cancel')}
            </button>
          </div>
        </PickerPopover>
      )}
    </>
  )
}

/**
 * A start and an end time of a day, in one panel with a "From" grid and a "To" grid: choosing the start moves on to
 * the end, and an end at or before the start cannot be chosen; choosing the end sets both and closes. The field shows
 * "08:00 – 10:00 (2 giờ)". value { start, end } and onChange({ start, end }), each time in `valueFormat` ("HH:mm").
 */
export function TimeRangePicker({
  id,
  name,
  value,
  onChange,
  valueFormat = 'HH:mm',
  placeholder = '--:-- – --:--',
  disabled,
  error,
  required,
  minTime = '06:00',
  maxTime = '22:00',
  stepMinutes = 60,
  disabledTimes,
  clearable = false,
  size = 'md',
}) {
  const picker = usePicker()
  const mobile = useIsMobile()
  const start = readValue(value?.start, valueFormat).time
  const end = readValue(value?.end, valueFormat).time
  const [draft, setDraft] = useState({ start, end })
  const slots = withCurrent(withCurrent(timeSlots(minTime, maxTime, stepMinutes), start), end)
  const last = slots[slots.length - 1]
  const startOff = (s) => s === last || (s !== start && !!disabledTimes?.(s))
  const endOff = (s, from) => !from || s <= from || (s !== end && !!disabledTimes?.(s))
  const emit = (a, b) => onChange?.({ start: a ? writeValue({ time: a }, valueFormat) : '', end: b ? writeValue({ time: b }, valueFormat) : '' })
  const text = start && end ? `${start} – ${end}` : start ? `${start} – ` : ''

  const openWith = (o) => {
    if (o) setDraft({ start, end })
    picker.setOpen(o)
  }

  return (
    <>
      <PickerField
        picker={{ ...picker, setOpen: (o) => openWith(typeof o === 'function' ? o(picker.open) : o) }}
        id={id}
        name={name}
        formValue={start && end ? `${start}-${end}` : ''}
        kind="range"
        text={text}
        suffix={duration(start, end)}
        placeholder={placeholder}
        icon={Clock}
        iconLabel="Choose the hours"
        clearable={clearable}
        disabled={disabled}
        error={error}
        required={required}
        size={size}
        onClear={() => emit('', '')}
        onCommit={(typed) => {
          const [a, b = ''] = typed.split(' – ')
          const s = readTypedTime(a)
          const e = readTypedTime(b)
          if (!s || !e || !slots.includes(s) || !slots.includes(e) || startOff(s) || endOff(e, s)) return false
          emit(s, e)
          return true
        }}
      />
      {picker.open && (
        <PickerPopover picker={picker} width={500} label="Choose the hours">
          <div className="flex flex-col gap-3 p-4">
            <PanelTitle aside={<span className="text-base font-medium text-fg-brand tabular">{draft.start ? `${draft.start} – ${draft.end || '--:--'}` : ''}</span>}>
              {t('Choose the hours')}
            </PanelTitle>
            <div className={cx('grid gap-4', !mobile && 'grid-cols-2')}>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-fg-tertiary">{t('From')}</span>
                <TimeGrid
                  slots={slots}
                  value={draft.start}
                  label={t('From')}
                  isDisabled={startOff}
                  onPick={(s) => {
                    setDraft((x) => ({ start: s, end: x.end && x.end > s ? x.end : '' }))
                    setTimeout(() => document.getElementById(picker.panelId)?.querySelector('[data-range-end] [tabindex="0"]')?.focus(), 0)
                  }}
                />
              </div>
              <div data-range-end className={cx('flex flex-col gap-2', !mobile && 'border-l border-line pl-4')}>
                <span className="text-sm font-semibold text-fg-tertiary">{t('To')}</span>
                <TimeGrid
                  key={draft.start || 'none'}
                  slots={slots}
                  value={draft.end}
                  label={t('To')}
                  dimmed={!draft.start}
                  isDisabled={(s) => endOff(s, draft.start)}
                  onPick={(s) => {
                    emit(draft.start, s)
                    picker.close('pick')
                  }}
                />
              </div>
            </div>
          </div>
        </PickerPopover>
      )}
    </>
  )
}
