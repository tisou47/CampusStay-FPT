import { Clock } from 'lucide-react'
import { t } from '@/i18n'
import { nowLocal, parseTime } from '@/lib/datetime'
import { campusToday } from '@/lib/format'
import { PickerPopover } from './PickerPopover'
import { PickerInput, usePicker } from './parts'
import { TimeGrid } from './TimeGrid'

/**
 * Which times of `day` cannot be chosen: outside minTime–maxTime, at or before `after` (an end after its start),
 * before now today (disablePast), after now today (disableFuture), outside the instants minLocal–maxLocal.
 */
export function timeRule({ day, after, minTime, maxTime, disablePast, disableFuture, minLocal, maxLocal }) {
  const now = nowLocal()
  const today = now.slice(0, 10)
  return (time) =>
    (minTime && time < minTime) ||
    (maxTime && time > maxTime) ||
    (after && time <= after) ||
    (disablePast && day === today && time < now.slice(11, 16)) ||
    (disableFuture && day === today && time > now.slice(11, 16)) ||
    (minLocal && day && `${day}T${time}` < minLocal) ||
    (maxLocal && day && `${day}T${time}` > maxLocal) ||
    false
}

/**
 * A time of day. value / onChange: "HH:mm" ('' when cleared). The grid steps by minuteStep (30; 15 or 60) from
 * minTime to maxTime (06:00–22:00); any minute can be typed ("830" → 08:30). `day` (default today) is the day the
 * time belongs to, for disablePast / disableFuture; `after` keeps an end after its start. showNow adds "Now"
 * (the current minute) and forbids later times today.
 */
export function TimePicker({
  id,
  value,
  onChange,
  day,
  after,
  disablePast,
  disableFuture,
  showNow,
  minuteStep = 30,
  minTime = '06:00',
  maxTime = '22:00',
  clearable = true,
  disabled,
  disabledReason,
  required,
  error,
  invalid,
  placeholder = 'HH:mm',
  label,
  size,
}) {
  const picker = usePicker()
  const rule = timeRule({ day: day ?? campusToday(), after, disablePast, disableFuture: disableFuture || showNow })
  const outside = (time) => time < minTime || time > maxTime
  const pick = (time) => {
    onChange?.(time)
    picker.close('picked')
  }

  return (
    <>
      <PickerInput
        picker={picker}
        id={id}
        kind="time"
        text={value ?? ''}
        icon={Clock}
        iconLabel="Open the time list"
        placeholder={placeholder}
        clearable={clearable && !required}
        onClear={() => onChange?.('')}
        nowLabel="Now"
        onNow={showNow ? () => onChange?.(nowLocal().slice(11, 16)) : undefined}
        onCommit={(text) => {
          const time = parseTime(text)
          if (!time) return t('Enter a time as HH:mm')
          if (after && time <= after) return t('Choose a time after {time}', { time: after })
          if (outside(time)) return t('Choose a time from {from} to {to}', { from: minTime, to: maxTime })
          if (rule(time)) return t('This time cannot be chosen')
          onChange?.(time)
          return null
        }}
        {...{ disabled, disabledReason, required, error, invalid, label, size }}
      />
      {picker.open && (
        <PickerPopover anchor={picker.anchor} onClose={picker.close} width={300} label="Choose a time">
          <div className="flex flex-col gap-3 p-4">
            <p className="text-base font-semibold text-fg">{t('Choose a time')}</p>
            <TimeGrid value={value} onPick={pick} minuteStep={minuteStep} minTime={minTime} maxTime={maxTime} isDisabled={rule} />
          </div>
        </PickerPopover>
      )}
    </>
  )
}
