import { getLang, t } from '@/i18n'

// Numbers, money and dates in the language in use (ADR-25): Vietnamese "1.200.000 ₫" and "20/01/2027",
// English "1,200,000 VND" and "20 Jan 2027".
const numberLocale = () => (getLang() === 'vi' ? 'vi-VN' : 'en-US')

/** 7200000 → "7.200.000 ₫" (Vietnamese) or "7,200,000 VND" (English). */
export function formatVnd(amount, { unit = true } = {}) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  const value = Math.round(amount).toLocaleString(numberLocale())
  if (!unit) return value
  return getLang() === 'vi' ? `${value} ₫` : `${value} VND`
}

/** 1234 → "1.234" / "1,234"; null → "—". */
export function formatNumber(value, { decimals = 0 } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString(numberLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** 1530000000 → "1,53 tỷ ₫" / "1.53 bn VND" for dashboard tiles; below a million, the full amount. */
export function formatCompactVnd(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  const vi = getLang() === 'vi'
  if (amount >= 1e9) return `${formatNumber(amount / 1e9, { decimals: 2 })} ${vi ? 'tỷ ₫' : 'bn VND'}`
  if (amount >= 1e6) return `${formatNumber(amount / 1e6, { decimals: 1 })} ${vi ? 'triệu ₫' : 'm VND'}`
  return formatVnd(amount)
}

/** 0.297 → "29,7%" / "29.7%". */
export function formatPercent(ratio, decimals = 1) {
  if (ratio == null || Number.isNaN(Number(ratio))) return '—'
  return `${formatNumber(ratio * 100, { decimals })}%`
}

/** Returns initials from a Vietnamese full name: "Nguyễn Văn An" → "NA" (family + given name). */
export function initials(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const pad = (n) => String(n).padStart(2, '0')
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A calendar day ("2027-01-20", contract C-02) is read as that day in the local calendar, never as
// midnight UTC, so it shows the same day in every time zone. Instants ("…At") are parsed as ISO.
const toDate = (value) => {
  if (value instanceof Date) return value
  if (!value) return null
  const day = typeof value === 'string' && DATE_ONLY.exec(value)
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value)
}
const valid = (d) => d && !Number.isNaN(d.getTime())

/** ISO date → "20/01/2027" (Vietnamese) or "20 Jan 2027" (English). */
export function formatDate(value) {
  const d = toDate(value)
  if (!valid(d)) return '—'
  return getLang() === 'vi'
    ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
    : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** ISO date-time → "20/01/2027 09:10" or "20 Jan 2027, 09:10". */
export function formatDateTime(value) {
  const d = toDate(value)
  if (!valid(d)) return '—'
  return getLang() === 'vi' ? `${formatDate(d)} ${formatTime(d)}` : `${formatDate(d)}, ${formatTime(d)}`
}

/** ISO date-time → "09:10". */
export function formatTime(value) {
  const d = toDate(value)
  return valid(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'
}

/** ISO date-time → "5 min ago", "2 h ago", "Yesterday", or the date. */
export function formatRelative(value, now = new Date()) {
  const d = toDate(value)
  if (!valid(d)) return '—'
  const minutes = Math.round((now - d) / 60000)
  if (minutes < 1) return t('Just now')
  if (minutes < 60) return t('{n} min ago', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('{n} h ago', { n: hours })
  const days = Math.round(hours / 24)
  if (days === 1) return t('Yesterday')
  if (days < 7) return t('{n} days ago', { n: days })
  return formatDate(d)
}

/** "2027-01-20" style value for <input type="date">. */
export function toDateInput(value) {
  const d = toDate(value)
  return valid(d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''
}

/** "2027-01-20T09:10" style value for <input type="datetime-local">. */
export function toDateTimeInput(value) {
  const d = toDate(value)
  return valid(d) ? `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}
