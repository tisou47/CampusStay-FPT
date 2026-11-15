/*
 * The maths and the typing rules behind the date and time pickers (components/ui/date-time). No imports, so it is
 * tested with `node --test`. Display text ("Thứ Hai, 16/11/2026", "Tháng 11/2026") and "today" come from
 * lib/format.js, the one place that formats dates; this file only knows:
 *
 *   values   a calendar day "2026-11-16" (never shifted by a time zone), a time "08:30", and an instant, which the
 *            pickers read as an ISO string, a Date, or campus wall time "2026-11-16T08:30", and emit as UTC ISO.
 *   grid     days of a month, Monday first, ISO week numbers, quick options ("Tomorrow", "Next week").
 *   typing   the input format, the same in both languages: "dd/mm/yyyy", "HH:mm", "dd/mm/yyyy, HH:mm", ranges
 *            joined by " – ". Digits are masked as they are typed ("16112026" → "16/11/2026", "830" → "08:30")
 *            and parsed on blur or Enter.
 *   rules    min/max, a range's end after its start, time slots of one day that do not overlap.
 *
 * Campus time is Asia/Ho_Chi_Minh: UTC+7 all year (Vietnam has no daylight saving time).
 */

const OFFSET_MS = 7 * 60 * 60_000
const DAY_MS = 86_400_000
const pad = (n) => String(n).padStart(2, '0')

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TIME = /^(\d{2}):(\d{2})$/

// ----------------------------------------------------------------------------------------------------- values

export const isDay = (s) => typeof s === 'string' && DAY.test(s)
export const isTime = (s) => typeof s === 'string' && TIME.test(s)
export const isLocal = (s) => typeof s === 'string' && LOCAL.test(s)

/** True when y-m-d is a real calendar day (no 31/02). */
export function realDay(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d))
  return y >= 1000 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** An instant (ISO string, Date) or campus wall time → campus wall time "2026-11-16T08:30"; '' when empty or invalid. */
export function toLocal(value) {
  if (value == null || value === '') return ''
  if (isLocal(value)) return value
  if (isDay(value)) return `${value}T00:00`
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const s = new Date(date.getTime() + OFFSET_MS)
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}T${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`
}

/** Campus wall time "2026-11-16T08:30" → the UTC instant "2026-11-16T01:30:00.000Z"; '' when not a wall time. */
export function localToIso(local) {
  const m = LOCAL.exec(local ?? '')
  if (!m) return ''
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - OFFSET_MS).toISOString()
}

/** The campus day of a value: "2026-11-16". */
export const toDay = (value) => (isDay(value) ? value : toLocal(value).slice(0, 10))

/** Campus wall time of now, rounded down to the minute. */
export const nowLocal = (now = new Date()) => toLocal(now)

// ------------------------------------------------------------------------------------------------------- grid

const dayMs = (day) => {
  const m = DAY.exec(day)
  return Date.UTC(+m[1], +m[2] - 1, +m[3])
}
const msDay = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const addDays = (day, n) => msDay(dayMs(day) + n * DAY_MS)

/** The same day n months later, kept inside the month (31/01 + 1 month → 28/02). */
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return msDay(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)))
}

/** 0 = Monday … 6 = Sunday. */
export const weekday = (day) => (new Date(dayMs(day)).getUTCDay() + 6) % 7
export const startOfWeek = (day) => addDays(day, -weekday(day))
export const startOfMonth = (day) => `${day.slice(0, 8)}01`
export const endOfMonth = (day) => addDays(addMonths(startOfMonth(day), 1), -1)
export const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7)

/** ISO 8601 week number: the week holding the year's first Thursday is week 1. */
export function isoWeek(day) {
  const thursday = addDays(day, 3 - weekday(day))
  const jan1 = `${thursday.slice(0, 4)}-01-01`
  return Math.floor((dayMs(thursday) - dayMs(jan1)) / DAY_MS / 7) + 1
}

/** The weeks shown for a month: Monday first, 5 or 6 rows of 7 days. */
export function monthWeeks(month) {
  const first = startOfWeek(startOfMonth(month))
  const weeks = []
  for (let start = first; weeks.length < 6; start = addDays(start, 7)) {
    if (weeks.length >= 4 && !sameMonth(start, month)) break
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
  }
  return weeks
}

/** Inside [min, max] (either may be empty). Days compare as text. */
export const inRange = (x, min, max) => (!min || x >= min) && (!max || x <= max)

/** "08:00", "08:30" … from minTime to maxTime, every `step` minutes. */
export function timeSlots(minTime = '06:00', maxTime = '22:00', step = 30) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const out = []
  for (let m = toMin(minTime); m <= toMin(maxTime); m += step) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  return out
}

/** Minutes after midnight → "HH:mm", capped at 23:59. */
export const minutesToTime = (m) => `${pad(Math.min(23, Math.floor(m / 60)))}:${pad(m >= 24 * 60 ? 59 : m % 60)}`
export const timeToMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const addMinutes = (t, n) => minutesToTime(Math.max(0, timeToMinutes(t) + n))

// ------------------------------------------------------------------------------------------- quick options

/** Days ahead: Today, Tomorrow, In 1 week, In 2 weeks. Labels are English keys for t(). */
export const FUTURE_DAYS = (today) => [
  { label: 'Today', value: today },
  { label: 'Tomorrow', value: addDays(today, 1) },
  { label: 'In 1 week', value: addDays(today, 7) },
  { label: 'In 2 weeks', value: addDays(today, 14) },
]

/** Days behind, for a past event. */
export const PAST_DAYS = (today) => [
  { label: 'Today', value: today },
  { label: 'Yesterday', value: addDays(today, -1) },
  { label: '1 week ago', value: addDays(today, -7) },
]

/** Ranges: This week, Next week, This month. */
export const RANGES = (today) => {
  const monday = startOfWeek(today)
  return [
    { label: 'This week', value: { start: monday, end: addDays(monday, 6) } },
    { label: 'Next week', value: { start: addDays(monday, 7), end: addDays(monday, 13) } },
    { label: 'This month', value: { start: startOfMonth(today), end: endOfMonth(today) } },
  ]
}

// ---------------------------------------------------------------------------------------------- typing

const RANGE_SEP = ' – '

function takeDate(digits) {
  const s = digits.slice(0, 8)
  let text = s.slice(0, 2)
  if (s.length > 2) text += `/${s.slice(2, 4)}`
  if (s.length > 4) text += `/${s.slice(4)}`
  return { text, used: s.length, complete: s.length === 8 }
}

// A first digit 3–9, or two digits over 23, is a one-digit hour: "830" → 08:30, "25" → 02:5.
function takeTime(digits) {
  let hour
  let used
  if (digits[0] > '2') [hour, used] = [`0${digits[0]}`, 1]
  else if (digits.length < 2) return { text: digits, used: digits.length, complete: false }
  else if (Number(digits.slice(0, 2)) > 23) [hour, used] = [`0${digits[0]}`, 1]
  else [hour, used] = [digits.slice(0, 2), 2]
  const minutes = digits.slice(used, used + 2)
  return { text: minutes ? `${hour}:${minutes}` : hour, used: used + minutes.length, complete: minutes.length === 2 }
}

const KINDS = {
  date: [['date'], []],
  time: [['time'], []],
  dateTime: [['date', 'time'], [', ']],
  dateRange: [['date', 'date'], [RANGE_SEP]],
  timeRange: [['time', 'time'], [RANGE_SEP]],
  dateTimeRange: [['date', 'time', 'time'], [', ', RANGE_SEP]],
}

/** Masks typed digits into the input format of `kind` (see KINDS): "16112026" → "16/11/2026". */
export function mask(kind, text) {
  const [parts, seps] = KINDS[kind]
  let digits = String(text ?? '').replace(/\D/g, '')
  let out = ''
  for (let i = 0; i < parts.length && digits; i++) {
    if (i > 0) out += seps[i - 1]
    const part = parts[i] === 'date' ? takeDate(digits) : takeTime(digits)
    out += part.text
    digits = digits.slice(part.used)
    if (!part.complete) break
  }
  return out
}

/** "16/11/2026", "16/11/26", "16112026", "16-11-2026" → "2026-11-16"; null when it is not a real day. */
export function parseDate(text) {
  const s = String(text ?? '').trim()
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s)
  if (!m && /^\d{8}$/.test(s)) m = [s, s.slice(0, 2), s.slice(2, 4), s.slice(4)]
  if (!m) return null
  const [d, mo] = [Number(m[1]), Number(m[2])]
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return realDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
}

/** "08:30", "8:30", "8h30", "830", "0830", "8" → "08:30" / "08:00"; null when out of 00:00–23:59. */
export function parseTime(text) {
  const s = String(text ?? '').trim().toLowerCase()
  let h
  let m
  const sep = /^(\d{1,2})\s*[:h.]\s*(\d{1,2})?$/.exec(s)
  if (sep) [h, m] = [Number(sep[1]), Number(sep[2] ?? 0)]
  else if (/^\d{1,2}$/.test(s)) [h, m] = [Number(s), 0]
  else if (/^\d{3,4}$/.test(s)) [h, m] = [Number(s.slice(0, s.length - 2)), Number(s.slice(-2))]
  else return null
  return h < 24 && m < 60 ? `${pad(h)}:${pad(m)}` : null
}

/** "16/11/2026, 08:30" (comma or space) → campus wall time "2026-11-16T08:30"; null when either half is wrong. */
export function parseDateTime(text) {
  const m = /^(.+?)(?:\s*,\s*|\s+)(\S+)$/.exec(String(text ?? '').trim())
  if (!m) return null
  const day = parseDate(m[1])
  const time = parseTime(m[2])
  return day && time ? `${day}T${time}` : null
}

/** Splits "a – b" (en dash, em dash or hyphen) into its two ends. */
export function splitRange(text) {
  const parts = String(text ?? '').split(/\s*[–—]\s*|\s+-\s+|(?<=\d{2}:\d{2})\s*-\s*/)
  return parts.length === 2 ? parts.map((p) => p.trim()) : null
}

// ------------------------------------------------------------------------------------------ input text

/** "2026-11-16" → "16/11/2026" (the input format, the same in both languages). */
export const dayInput = (day) => (isDay(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '')
/** Campus wall time → "16/11/2026, 08:30". */
export const localInput = (local) => (isLocal(local) ? `${dayInput(local.slice(0, 10))}, ${local.slice(11, 16)}` : '')
export const rangeInput = (a, b) => (a || b ? `${a}${RANGE_SEP}${b}` : '')

// ---------------------------------------------------------------------------------------------- rules

/**
 * Errors of a list of time slots ({ start, end } as campus wall times or instants): per index, null or
 * { code: 'incomplete' | 'end-before-start' | 'overlap', with } — `with` is the other slot's index for an overlap.
 * Slots touching end to start (08:00–10:00 and 10:00–12:00) do not overlap.
 */
export function slotErrors(slots) {
  const list = slots.map((s) => ({ start: toLocal(s.start), end: toLocal(s.end) }))
  return list.map((s, i) => {
    if (!s.start || !s.end) return { code: 'incomplete' }
    if (s.end <= s.start) return { code: 'end-before-start' }
    const other = list.findIndex((o, j) => j !== i && o.start && o.end && o.end > o.start && s.start < o.end && o.start < s.end)
    return other >= 0 ? { code: 'overlap', with: other } : null
  })
}
