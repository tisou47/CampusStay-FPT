import { getLang, t } from '@/i18n'

/*
 * The one place that formats numbers, money, dates and times (ADR-25). Components never call toLocale*,
 * Intl.DateTimeFormat or write a date pattern themselves: they call the presets below.
 *
 *   preset          Vietnamese (vi-VN)              English (en-GB)
 *   date            15/11/2026                      15 Nov 2026
 *   dateTime        15/11/2026, 08:00               15 Nov 2026, 08:00
 *   time            08:00                           08:00
 *   weekdayDate     Thứ Hai, 16/11/2026             Mon, 16 Nov 2026
 *   dateShort       15/11                           15 Nov
 *   monthYear       Tháng 11/2026                   November 2026
 *   dateRange       26/06 – 11/07/2026              26 Jun – 11 Jul 2026
 *   dateTimeRange   16/11/2026, 08:00 – 10:00       16 Nov 2026, 08:00 – 10:00
 *   relative        Hôm nay 08:00 · 3 ngày trước    Today 08:00 · 3 days ago
 *   timeLeft        Còn 30 ngày · Quá hạn 2 ngày 3 giờ   30 days left · 2d 3h overdue
 *   period          Kỳ 11/2026                      Period 11/2026
 *   currency        2.588.000 ₫                     2,588,000 ₫
 *
 * Always 24-hour, a spaced en dash between the ends of a range, weeks start on Monday, and every instant is
 * shown on the campus clock (Asia/Ho_Chi_Minh) whatever the device's time zone. The API sends instants in UTC
 * (ISO-8601 with "Z") and calendar days as "2027-01-20" (contract C-02); a calendar day is never shifted.
 */

export const CAMPUS_TIME_ZONE = 'Asia/Ho_Chi_Minh'
const vi = () => getLang() === 'vi'
const numberLocale = () => (vi() ? 'vi-VN' : 'en-GB')

// ------------------------------------------------------------------------------------------------- numbers

const numberFormats = new Map()
function numberFormat(decimals) {
  const key = `${numberLocale()}:${decimals}`
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }))
  }
  return numberFormats.get(key)
}
const isNumber = (value) => value != null && value !== '' && !Number.isNaN(Number(value))

/** 1234 → "1.234" / "1,234"; null → "—". */
export function formatNumber(value, { decimals = 0 } = {}) {
  return isNumber(value) ? numberFormat(decimals).format(Number(value)) : '—'
}

/** 2588000 → "2.588.000 ₫" (Vietnamese) or "2,588,000 ₫" (English): the same symbol, only the separators change. */
export function formatCurrency(amount, { unit = true } = {}) {
  if (!isNumber(amount)) return '—'
  const value = formatNumber(Math.round(Number(amount)))
  return unit ? `${value} ₫` : value
}

/** The dormitory's money is VND: the same as formatCurrency. */
export const formatVnd = formatCurrency

/** 1530000000 → "1,53 tỷ ₫" / "1.53 bn ₫" for dashboard tiles; below a million, the full amount. */
export function formatCompactVnd(amount) {
  if (!isNumber(amount)) return '—'
  if (amount >= 1e9) return `${formatNumber(amount / 1e9, { decimals: 2 })} ${vi() ? 'tỷ ₫' : 'bn ₫'}`
  if (amount >= 1e6) return `${formatNumber(amount / 1e6, { decimals: 1 })} ${vi() ? 'triệu ₫' : 'm ₫'}`
  return formatCurrency(amount)
}

/** 0.297 → "29,7%" / "29.7%". */
export function formatPercent(ratio, decimals = 1) {
  return isNumber(ratio) ? `${formatNumber(ratio * 100, { decimals })}%` : '—'
}

/** Returns initials from a Vietnamese full name: "Nguyễn Văn An" → "NA" (family + given name). */
export function initials(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ------------------------------------------------------------------------------------- dates on the campus clock

const pad = (n) => String(n).padStart(2, '0')
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']
const DAY_MS = 86_400_000

let campusParts = null
function campusFormat() {
  campusParts ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TIME_ZONE,
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  })
  return campusParts
}

/**
 * The value on the campus clock: { y, m (1–12), d, h, min, dow (0 = Monday), day (whole days since 1970 of that
 * calendar day) }. A calendar day ("2027-01-20") is that day at 00:00; an instant is converted to UTC+7.
 */
export function campusClock(value) {
  if (value == null || value === '') return null
  let y, m, d, h = 0, min = 0
  const day = typeof value === 'string' && DATE_ONLY.exec(value)
  if (day) {
    ;[y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])]
  } else {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return null
    const parts = Object.fromEntries(campusFormat().formatToParts(date).map((p) => [p.type, p.value]))
    ;[y, m, d, h, min] = [Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour) % 24, Number(parts.minute)]
  }
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
  return { y, m, d, h, min, dow: (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7, day: dayNumber }
}

const dayText = (c) => (vi() ? `${pad(c.d)}/${pad(c.m)}/${c.y}` : `${c.d} ${MONTHS[c.m - 1]} ${c.y}`)
const shortText = (c) => (vi() ? `${pad(c.d)}/${pad(c.m)}` : `${c.d} ${MONTHS[c.m - 1]}`)
const timeText = (c) => `${pad(c.h)}:${pad(c.min)}`

/** "15/11/2026" / "15 Nov 2026". */
export function formatDate(value) {
  const c = campusClock(value)
  return c ? dayText(c) : '—'
}

/** "15/11/2026, 08:00" / "15 Nov 2026, 08:00". */
export function formatDateTime(value) {
  const c = campusClock(value)
  return c ? `${dayText(c)}, ${timeText(c)}` : '—'
}

/** "08:00". */
export function formatTime(value) {
  const c = campusClock(value)
  return c ? timeText(c) : '—'
}

/** "Thứ Hai, 16/11/2026" / "Mon, 16 Nov 2026". */
export function formatWeekdayDate(value) {
  const c = campusClock(value)
  return c ? `${(vi() ? WEEKDAYS_VI : WEEKDAYS_EN)[c.dow]}, ${dayText(c)}` : '—'
}

/** "Tháng 11/2026" / "November 2026". */
export function formatMonthYear(value) {
  const c = campusClock(value)
  return c ? (vi() ? `Tháng ${c.m}/${c.y}` : `${MONTHS_LONG[c.m - 1]} ${c.y}`) : '—'
}

/** "T11" / "Nov": a month on a timeline's axis. */
export function formatMonthShort(value) {
  const c = campusClock(value)
  return c ? (vi() ? `T${c.m}` : MONTHS[c.m - 1]) : '—'
}

/** Two days: "26/06 – 11/07/2026" / "26 Jun – 11 Jul 2026" within a year, both full dates otherwise. */
export function formatDateRange(from, to) {
  const a = campusClock(from)
  const b = campusClock(to)
  if (!a || !b) return a ? dayText(a) : b ? dayText(b) : '—'
  if (a.day === b.day) return dayText(a)
  return a.y === b.y ? `${shortText(a)} – ${dayText(b)}` : `${dayText(a)} – ${dayText(b)}`
}

/** Two instants: "16/11/2026, 08:00 – 10:00" on one day, "16/11/2026, 08:00 – 17/11/2026, 10:00" otherwise. */
export function formatDateTimeRange(from, to) {
  const a = campusClock(from)
  const b = campusClock(to)
  if (!a || !b) return a ? formatDateTime(from) : b ? formatDateTime(to) : '—'
  return a.day === b.day ? `${dayText(a)}, ${timeText(a)} – ${timeText(b)}` : `${formatDateTime(from)} – ${formatDateTime(to)}`
}

/** 00:00 of a calendar day ("2027-01-20") on the campus clock, as a Date; an instant is returned as it is. */
export function campusDayStart(value) {
  if (value == null || value === '') return null
  const day = typeof value === 'string' && DATE_ONLY.exec(value.slice(0, 10))
  if (!day || value.length > 10) return new Date(value)
  return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])) - 7 * 3_600_000)
}

/** The first moment of the month that follows `value`'s month on the campus clock, as a Date. */
export function campusNextMonth(value) {
  const c = campusClock(value)
  return c ? new Date(Date.UTC(c.y, c.m, 1) - 7 * 3_600_000) : null
}

/** Today on the campus clock, as "2027-01-20". */
export function campusToday(now = new Date()) {
  const c = campusClock(now)
  return `${c.y}-${pad(c.m)}-${pad(c.d)}`
}

/** Whole calendar days from today to `value` on the campus clock: 0 today, 1 tomorrow, -1 yesterday. */
export function daysFromToday(value, now = new Date()) {
  const c = campusClock(value)
  return c ? c.day - campusClock(now).day : null
}

/** "Just now", "5 min ago", "Today 08:00", "Yesterday 14:30", "3 days ago", then the date. */
export function formatRelative(value, now = new Date()) {
  const c = campusClock(value)
  if (!c) return '—'
  const minutes = Math.round((new Date(now).getTime() - new Date(value).getTime()) / 60000)
  if (minutes >= 0 && minutes < 1) return t('Just now')
  if (minutes >= 1 && minutes < 60) return t('{n} min ago', { n: minutes })
  const days = campusClock(now).day - c.day
  if (days === 0) return t('Today {time}', { time: timeText(c) })
  if (days === 1) return t('Yesterday {time}', { time: timeText(c) })
  if (days > 1 && days < 7) return t('{n} days ago', { n: days })
  return dayText(c)
}

/** The parts of a length of time: { d, h, m }. */
function split(ms) {
  const minutes = Math.floor(Math.abs(ms) / 60000)
  return { d: Math.floor(minutes / 1440), h: Math.floor((minutes % 1440) / 60), m: minutes % 60 }
}

/** "2 ngày 3 giờ" / "2d 3h": a length of time, the two largest units. */
export function formatDuration(ms) {
  const { d, h, m } = split(ms)
  const units = vi() ? { d: ' ngày', h: ' giờ', m: ' phút' } : { d: 'd', h: 'h', m: ' min' }
  if (d > 0) return h > 0 ? `${d}${units.d} ${h}${units.h}` : `${d}${units.d}`
  if (h > 0) return m > 0 && h < 6 ? `${h}${units.h} ${m}${units.m}` : `${h}${units.h}`
  return `${m}${units.m}`
}

/**
 * Time to a deadline: "Còn 30 ngày" / "30 days left" two days ahead or more, "Còn 1 ngày 5 giờ" / "1d 5h left"
 * closer, and "Quá hạn 2 ngày 3 giờ" / "2d 3h overdue" once past.
 */
export function formatTimeLeft(dueAt, now = new Date()) {
  const due = new Date(dueAt).getTime()
  if (dueAt == null || Number.isNaN(due)) return '—'
  const ms = due - new Date(now).getTime()
  if (ms < 0) return t('{time} overdue', { time: formatDuration(ms) })
  const days = Math.floor(ms / DAY_MS)
  if (days >= 2) return t('{n} days left', { n: days })
  return t('{time} left', { time: formatDuration(ms) })
}

/** The greeting for the hour on the campus clock: morning 05:00–11:59, afternoon 12:00–17:59, evening otherwise. */
export function greeting(now = new Date()) {
  const { h } = campusClock(now)
  if (h >= 5 && h < 12) return t('Good morning')
  if (h >= 12 && h < 18) return t('Good afternoon')
  return t('Good evening')
}

// ------------------------------------------------------------------------------------------ form inputs

/** "2027-01-20" for <input type="date">: the campus calendar day of the value. */
export function toDateInput(value) {
  const c = campusClock(value)
  return c ? `${c.y}-${pad(c.m)}-${pad(c.d)}` : ''
}

/** "2027-01-20T09:10" for <input type="datetime-local">, on the campus clock. */
export function toDateTimeInput(value) {
  const c = campusClock(value)
  return c ? `${c.y}-${pad(c.m)}-${pad(c.d)}T${pad(c.h)}:${pad(c.min)}` : ''
}

/** "2027-01-20T09:10" typed on the campus clock → the UTC instant "2027-01-20T02:10:00.000Z" the API stores. */
export function fromDateTimeInput(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local ?? ''))
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 7, Number(m[5]))).toISOString()
}
