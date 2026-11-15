/*
 * The date and time pickers of the whole app; native <input type="date|time|datetime-local"> is not used
 * (npm run lint stops it). Every picker shares PickerPopover (portal, flips at the window's edge, bottom sheet
 * under 640 px), Calendar (Monday first), TimeGrid and the input rules of lib/datetime; display text comes from
 * lib/format. Demo of every variant: /dev/pickers (development builds).
 *
 *   picker               value                          for
 *   DatePicker           "YYYY-MM-DD"                   a day (birth date, deadline day, arrival day)
 *   DateRangePicker      { start, end } days            a span of days (a stay, a report period)
 *   TimePicker           "HH:mm"                        a time of day
 *   TimeRangePicker      { start, end } "HH:mm"         opening hours of a day
 *   DateTimePicker       ISO instant (UTC)              a moment (a deadline, "now" for a past event)
 *   DateTimeRangePicker  { start, end } ISO instants    a time slot on one day (Family Day, a repair visit)
 *
 * Shared props: value, onChange, min, max, disablePast, disableFuture, showNow, quickOptions, minuteStep, minTime,
 * maxTime, clearable, disabled, disabledReason, required, error, invalid, placeholder, label, id, size.
 */
export { Calendar } from './Calendar'
export { DatePicker } from './DatePicker'
export { DateRangePicker } from './DateRangePicker'
export { DateTimePicker } from './DateTimePicker'
export { DateTimeRangePicker } from './DateTimeRangePicker'
export { PickerPopover } from './PickerPopover'
export { TimeGrid } from './TimeGrid'
export { TimePicker } from './TimePicker'
export { TimeRangePicker } from './TimeRangePicker'
