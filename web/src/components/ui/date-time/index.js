/*
 * The date and time pickers of the whole app. All four share one field (PickerField: the look of the other inputs,
 * typed text masked to dd/mm/yyyy and HH:mm, red when it cannot be read) and one panel (PickerPopover: a portal that
 * flips and shifts at the window's edges, a bottom sheet under 640 px). Demo of every state: /dev/pickers
 * (development builds).
 *
 *   picker            value (valueFormat default)          panel
 *   DatePicker        "YYYY-MM-DD"                         quick days, month, "Today"; a choice closes it
 *   TimePicker        "HH:mm"                              grid of times; a choice closes it
 *   DateTimePicker    "YYYY-MM-DDTHH:mm" (or "iso")        month + "Hour" column, Confirm / Cancel
 *   TimeRangePicker   { start, end } "HH:mm"               "From" and "To" grids; choosing the end closes it
 *
 * Shared props: id, name, value, onChange(value), valueFormat, placeholder, disabled, error, required, minDate,
 * maxDate, disabledDates(day), minTime ("06:00"), maxTime ("22:00"), stepMinutes (60), disabledTimes(time, day),
 * clearable, size ("md" | "sm").
 */
export { DatePicker, DateTimePicker, TimePicker, TimeRangePicker } from './pickers'
