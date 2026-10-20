/** 7200000 → "7,200,000 VND" (the format used across the designs). */
export function formatVnd(amount, { unit = true } = {}) {
  if (amount == null || Number.isNaN(Number(amount))) return '—'
  const value = Math.round(amount).toLocaleString('en-US')
  return unit ? `${value} VND` : value
}

/** 1234 → "1,234"; null → "—". */
export function formatNumber(value, { decimals = 0 } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** 0.297 → "29.7%". */
export function formatPercent(ratio, decimals = 1) {
  if (ratio == null || Number.isNaN(Number(ratio))) return '—'
  return `${(ratio * 100).toFixed(decimals)}%`
}

/** Returns initials from a Vietnamese full name: "Nguyễn Văn An" → "NA" (family + given name). */
export function initials(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const pad = (n) => String(n).padStart(2, '0')
const toDate = (value) => (value instanceof Date ? value : value ? new Date(value) : null)
const valid = (d) => d && !Number.isNaN(d.getTime())

/** ISO date → "20/01/2027". */
export function formatDate(value) {
  const d = toDate(value)
  return valid(d) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'
}

/** ISO date-time → "20/01/2027 09:10". */
export function formatDateTime(value) {
  const d = toDate(value)
  return valid(d) ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'
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
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
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
