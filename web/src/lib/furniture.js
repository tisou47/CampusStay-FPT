import { getLang } from '@/i18n'

/**
 * A furniture type's name in the language in use. Types are Admin data named in both languages, so the API
 * sends both: `type` / `typeVi` on items and conformance lines, `name` / `nameVi` on types.
 */
export function typeName(o) {
  if (!o) return ''
  const vi = o.typeVi ?? o.nameVi
  const en = o.type ?? o.name
  return (getLang() === 'vi' ? vi : en) || en || vi || ''
}

/**
 * The condition of a furniture item (inspections, check-in inventories, check-outs) in the language in use. Its own
 * words, not the shared dictionary: there "Missing" means "not there yet" (Chưa có), here an item that is gone (Thiếu).
 */
const CONDITION_VI = { Good: 'Tốt', Worn: 'Hao mòn', Damaged: 'Hư hỏng', Missing: 'Thiếu' }
export const conditionName = (value) => (value ? (getLang() === 'vi' ? CONDITION_VI[value] ?? value : value) : '')
export const CONDITIONS = ['Good', 'Worn', 'Damaged', 'Missing']
/** Select options of the four conditions, labelled in the language in use. */
export const conditionOptions = () => CONDITIONS.map((value) => ({ value, label: conditionName(value) }))
export const conditionTone = { Good: 'success', Worn: 'info', Damaged: 'error', Missing: 'warning' }

/** "1 × Air conditioner" lines of a conformance list, joined. */
export const countLines = (lines) => (lines ?? []).map((l) => `${l.quantity} × ${typeName(l)}`).join(' · ')
