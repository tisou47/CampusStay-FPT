/**
 * Reads a number typed in Vietnamese ("1.360,5", "12,5") or English ("1,360.5", "12.5") style.
 * Rule: when both "," and "." appear, the last one is the decimal separator; a lone "," or "." is the decimal
 * separator. Returns null for an empty field and NaN for anything that is not a number (the form shows an error).
 */
export function parseDecimal(text) {
  if (typeof text === 'number') return text
  const s = String(text ?? '').trim().replace(/\s/g, '')
  if (!s) return null
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  const decimal = comma > dot ? ',' : '.'
  const thousands = decimal === ',' ? '.' : ','
  const normal = (comma >= 0 && dot >= 0 ? s.replaceAll(thousands, '') : s).replace(decimal, '.')
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN
}
