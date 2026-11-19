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
export const CONDITIONS = ['Good', 'Worn', 'Damaged', 'Missing']
export const conditionTone = { Good: 'success', Worn: 'info', Damaged: 'error', Missing: 'warning' }

/**
 * Resolves a handover condition label ('Good' | 'Worn' | 'Damaged' | 'Missing') using Admin › Furniture types levels
 * when provided, falling back to the standard Vietnamese/English labels.
 */
export const conditionName = (value, levels) => {
  if (!value) return ''
  const match = Array.isArray(levels) ? levels.find((l) => l.handoverKey === value) : null
  if (match) {
    const label = getLang() === 'vi' ? match.nameVi : match.name
    if (label) return label
  }
  return getLang() === 'vi' ? CONDITION_VI[value] ?? value : value
}

/** Select options of the four conditions, labelled in the language in use (from Admin levels when available). */
export const conditionOptions = (levels, { showLoss = false } = {}) =>
  CONDITIONS.map((value) => {
    const match = Array.isArray(levels) ? levels.find((l) => l.handoverKey === value) : null
    const name = conditionName(value, levels)
    return {
      value,
      label: showLoss && match ? `${name} (${match.lossPercent}%)` : name,
    }
  })

/** Loss % map ({ Good, Worn, Damaged, Missing }) from Admin condition levels with fallback rates. */
export const conditionLossRates = (levels, fallback = { Good: 0, Worn: 25, Damaged: 50, Missing: 100 }) => {
  const out = { ...fallback }
  if (Array.isArray(levels)) {
    for (const l of levels) {
      if (l.handoverKey && l.lossPercent != null) {
        out[l.handoverKey] = l.lossPercent
      }
    }
  }
  return out
}

/** "1 × Air conditioner" lines of a conformance list, joined. */
export const countLines = (lines) => (lines ?? []).map((l) => `${l.quantity} × ${typeName(l)}`).join(' · ')
