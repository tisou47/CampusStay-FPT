import { useState } from 'react'
import { Clock } from 'lucide-react'
import { t } from '@/i18n'
import { addMinutes, parseTime, rangeInput, splitRange } from '@/lib/datetime'
import { campusToday } from '@/lib/format'
import { PickerPopover } from './PickerPopover'
import { PanelFooter, PickerInput, usePicker } from './parts'
import { TimeGrid } from './TimeGrid'
import { timeRule } from './TimePicker'

const EMPTY = { start: '', end: '' }

/** The draft after a new start: the end follows (start + duration) unless it is still after the start. */
export const withStart = (draft, start, duration, maxTime) => ({
  start,
  end: draft.end && draft.end > start ? draft.end : [addMinutes(start, duration), maxTime].sort()[0],
})

/**
 * A start and an end time of one day. value / onChange: { start, end } as "HH:mm", end > start. The panel has a
 * "From" and a "To" column; choosing a start proposes an end `duration` minutes later (120). Typed as
 * "08:00 – 10:00" ("08001000" is masked to it).
 */
export function TimeRangePicker({
  id,
  value = EMPTY,
  onChange,
  day,
  disablePast,
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
  placeholder = 'HH:mm – HH:mm',
  label,
  size,
}) {
  const picker = usePicker()
  const [draft, setDraft] = useState(EMPTY)
  const startRule = timeRule({ day: day ?? campusToday(), disablePast, minTime, maxTime })
  const endRule = timeRule({ day: day ?? campusToday(), disablePast, minTime, maxTime, after: draft.start })
  const grid = { minuteStep, minTime, maxTime, columns: 1, typeable: true }

  return (
    <>
      <PickerInput
        picker={{
          ...picker,
          setOpen: (v) => {
            setDraft({ start: value?.start ?? '', end: value?.end ?? '' })
            picker.setOpen(typeof v === 'function' ? v(picker.open) : v)
          },
        }}
        id={id}
        kind="timeRange"
        text={rangeInput(value?.start ?? '', value?.end ?? '')}
        icon={Clock}
        iconLabel="Open the time list"
        placeholder={placeholder}
        clearable={clearable && !required}
        onClear={() => onChange?.(EMPTY)}
        onCommit={(text) => {
          const ends = splitRange(text)
          const [a, b] = ends ? ends.map(parseTime) : []
          if (!a || !b) return t('Enter the times as HH:mm – HH:mm')
          if (b <= a) return t('The end time must be after the start time')
          if (startRule(a) || startRule(b)) return t('Choose times from {from} to {to}', { from: minTime, to: maxTime })
          onChange?.({ start: a, end: b })
          return null
        }}
        {...{ disabled, disabledReason, required, error, invalid, label, size }}
      />
      {picker.open && (
        <PickerPopover anchor={picker.anchor} onClose={picker.close} width={300} label="Choose a start and an end time">
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-fg-tertiary">{t('From')}</span>
              <TimeGrid {...grid} label="From" value={draft.start} isDisabled={startRule} onPick={(s) => setDraft((d) => withStart(d, s, duration, maxTime))} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-fg-tertiary">{t('To')}</span>
              <TimeGrid
                {...grid}
                label="To"
                value={draft.end}
                isDisabled={endRule}
                blockedHint={draft.start ? undefined : 'Choose a start first'}
                onPick={(e) => setDraft((d) => ({ ...d, end: e }))}
              />
            </div>
          </div>
          <PanelFooter
            summary={draft.start && draft.end ? rangeInput(draft.start, draft.end) : ''}
            ready={!!draft.start && !!draft.end && draft.end > draft.start}
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
