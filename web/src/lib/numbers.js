/**
 * Reads a number typed in Vietnamese ("1.360,5", "12,5") or English ("1,360.5", "12.5") style.
 * Rule: when both "," and "." appear, the last one is the decimal separator; a lone "," or "." is the decimal
 * separator, except when exactly three digits follow it ("1.360" is ambiguous: NaN). Returns null for an empty field
 * and NaN for anything that is not a number (the form shows an error).
 */
export function parseDecimal(text) {
  if (typeof text === 'number') return text
  const s = String(text ?? '').trim().replace(/\s/g, '')
  if (!s) return null
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  // One separator then exactly three digits ("1.360", "1,360") reads as thousands in one language and as a decimal in
  // the other: refuse it rather than guess (M1). "0,125" cannot be thousands, so it stays a decimal.
  if ((comma < 0) !== (dot < 0) && /^-?\d+[.,]\d{3}$/.test(s) && !/^-?0[.,]/.test(s)) return NaN
  const decimal = comma > dot ? ',' : '.'
  const thousands = decimal === ',' ? '.' : ','
  const normal = (comma >= 0 && dot >= 0 ? s.replaceAll(thousands, '') : s).replace(decimal, '.')
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN
}

/**
 * A meter reading typed by a person (check-in, check-out, meter rows and drawer, handover review): the same rules as
 * parseDecimal, and a reading is never negative. null for an empty field, NaN for anything else that is not a reading,
 * so every meter input shows the same error instead of sending null (WEB-OPS-17, WEB-OPS-14).
 */
export function parseReading(text) {
  const n = parseDecimal(text)
  return n != null && n < 0 ? NaN : n
}

/** A size in bytes as { value, unit } in B, KB, MB or GB (1024 steps), for "12,3 MB" (Admin › System health). */
export function byteSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, Number(bytes) || 0)
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return { value, unit: units[i] }
}
