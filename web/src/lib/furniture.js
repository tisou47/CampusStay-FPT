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

/** "1 × Air conditioner" lines of a conformance list, joined. */
export const countLines = (lines) => (lines ?? []).map((l) => `${l.quantity} × ${typeName(l)}`).join(' · ')
