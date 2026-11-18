/*
 * Values of the date and time pickers. Inside, a picker works with a calendar day "2026-11-16" and a time "08:00"
 * on the campus clock (Asia/Ho_Chi_Minh, UTC+7 all year). `valueFormat` says how a form keeps its value, so each
 * form gets back exactly the string it had before the pickers were shared:
 *
 *   a pattern of YYYY MM DD HH mm   "YYYY-MM-DD" (DatePicker), "HH:mm" (TimePicker), "YYYY-MM-DDTHH:mm" (DateTimePicker,
 *                                   the string <input type="datetime-local"> gave), or any other, e.g. "DD/MM/YYYY"
 *   "iso"                           DateTimePicker only: the UTC instant "2026-11-16T01:00:00.000Z"
 *
 * The field shows and reads typed text the same way in both languages: "16/11/2026", "08:00",
 * "16/11/2026 · 08:00", "08:00 – 10:00".
 */
import { campusToday, fromDateTimeInput, toDateTimeInput } from '@/lib/format'

export const pad = (n) => String(n).padStart(2, '0')

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2})$/

/** True when y-m-d is a real calendar day (no 31/02). */
export function realDay(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d))
  return y >= 1000 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// ------------------------------------------------------------------------------------------ valueFormat

const TOKENS = /YYYY|MM|DD|HH|mm/g
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** { day, time } → the form's string. Empty when a part the pattern needs is missing. */
export function writeValue({ day = '', time = '' }, format) {
  if (format === 'iso') return day && time ? (fromDateTimeInput(`${day}T${time}`) ?? '') : ''
  const [y, m, d] = day ? day.split('-') : []
  const [h, min] = time ? time.split(':') : []
  const parts = { YYYY: y, MM: m, DD: d, HH: h, mm: min }
  const needed = format.match(TOKENS) ?? []
  if (needed.some((tok) => !parts[tok])) return ''
  return format.replace(TOKENS, (tok) => parts[tok])
}

/** The form's string (or Date) → { day, time }; parts it does not hold are ''. Extra text after the pattern is ignored. */
export function readValue(value, format) {
  if (value == null || value === '') return { day: '', time: '' }
  if (format === 'iso' || value instanceof Date) {
    const local = toDateTimeInput(value)
    return { day: local.slice(0, 10), time: local.slice(11, 16) }
  }
  const order = []
  const re = new RegExp(
    '^' +
      escape(format).replace(TOKENS, (tok) => {
        order.push(tok)
        return tok === 'YYYY' ? '(\\d{4})' : '(\\d{2})'
      }),
  )
  const m = re.exec(String(value))
  if (!m) return { day: '', time: '' }
  const p = Object.fromEntries(order.map((tok, i) => [tok, m[i + 1]]))
  const day = p.YYYY && p.MM && p.DD && realDay(+p.YYYY, +p.MM, +p.DD) ? `${p.YYYY}-${p.MM}-${p.DD}` : ''
  const time = p.HH && p.mm ? `${p.HH}:${p.mm}` : ''
  return { day, time }
}

// ------------------------------------------------------------------------------------------ days

const dayMs = (day) => {
  const m = DAY.exec(day)
  return Date.UTC(+m[1], +m[2] - 1, +m[3])
}
const msDay = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const isDay = (s) => typeof s === 'string' && DAY.test(s)
export const isTime = (s) => typeof s === 'string' && TIME.test(s)
export const today = () => campusToday()
export const addDays = (day, n) => msDay(dayMs(day) + n * 86_400_000)
/** The first day of the month `n` months after `day`'s month. */
export const addMonths = (day, n) => {
  const [y, m] = day.split('-').map(Number)
  return msDay(Date.UTC(y, m - 1 + n, 1))
}
export const firstOfMonth = (day) => `${day.slice(0, 7)}-01`
/** 0 = Monday … 6 = Sunday. */
export const weekday = (day) => (new Date(dayMs(day)).getUTCDay() + 6) % 7

/** The 6 × 7 days shown for the month of `month` (Monday first), trimmed to 5 weeks when the 6th is all next month. */
export function monthGrid(month) {
  const first = addDays(month, -weekday(month))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  return cells[35].slice(0, 7) === month.slice(0, 7) ? cells : cells.slice(0, 35)
}

/** True when `day` may be chosen: inside [minDate, maxDate] (each a day or a longer string starting with one) and not disabled. */
export function dayAllowed(day, { minDate, maxDate, disabledDates } = {}) {
  if (!day) return false
  if (minDate && day < String(minDate).slice(0, 10)) return false
  if (maxDate && day > String(maxDate).slice(0, 10)) return false
  return !disabledDates?.(day)
}

// ------------------------------------------------------------------------------------------ times

export const toMinutes = (time) => (isTime(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null)
export const fromMinutes = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`

/** "06:00", "07:00" … "22:00": the times from minTime to maxTime every stepMinutes. */
export function timeSlots(minTime = '06:00', maxTime = '22:00', stepMinutes = 60) {
  const from = toMinutes(minTime) ?? 0
  const to = toMinutes(maxTime) ?? 23 * 60 + 59
  const step = Math.max(1, stepMinutes)
  const out = []
  for (let n = from; n <= to; n += step) out.push(fromMinutes(n))
  return out
}

/** The current time on the campus clock, "09:41". */
export const nowTime = () => toDateTimeInput(new Date()).slice(11, 16)

// ------------------------------------------------------------------------------------------ typing

/** Keeps the digits typed and puts the separators of `kind` back: "16112026" → "16/11/2026", "830" → "08:30" on blur. */
export function mask(kind, text) {
  const digits = String(text).replace(/\D/g, '')
  const groups = {
    date: [[2, '/'], [2, '/'], [4, '']],
    time: [[2, ':'], [2, '']],
    datetime: [[2, '/'], [2, '/'], [4, ' · '], [2, ':'], [2, '']],
    range: [[2, ':'], [2, ' – '], [2, ':'], [2, '']],
  }[kind]
  let out = ''
  let i = 0
  for (const [len, sep] of groups) {
    const part = digits.slice(i, i + len)
    if (!part) break
    out += part
    i += len
    if (part.length === len && sep && digits.length > i) out += sep
  }
  return out
}

/** "16/11/2026" → "2026-11-16", or null. */
export function readTypedDay(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim())
  return m && realDay(+m[3], +m[2], +m[1]) ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** "08:30" → "08:30" (hours 00–23, minutes 00–59), or null. */
export function readTypedTime(text) {
  const m = /^(\d{2}):(\d{2})$/.exec(text.trim())
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1]}:${m[2]}` : null
}

/** "2026-11-16" → "16/11/2026". */
export const showDay = (day) => (isDay(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '')
