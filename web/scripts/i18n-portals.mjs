/*
 * Which portal each source file belongs to, for the Vietnamese texts split per portal (WEB-ADM-32).
 *
 *  - pages/student/** start as 'student'; pages/staff, manager, admin, transition, registration start as 'office'.
 *  - A file imported by a portal's file belongs to that portal too (pages/student/refundAccount.jsx is also used by
 *    the office's Profile), so imports are followed until nothing changes.
 *  - Shared code (components, app, lib, api, pages/common, pages/auth) is reached by both portals or by none.
 *
 * portalsOf(file) is a Set of 'student' | 'office'; a text used by one portal's files only lives in that portal's
 * file (src/i18n/vi-student.js or vi-office.js), anything else in src/i18n/vi-pages.js, which every screen loads.
 */
import fs from 'node:fs'
import path from 'node:path'

const SEEDS = [
  [/[\\/]pages[\\/]student[\\/]/, 'student'],
  [/[\\/]pages[\\/](staff|manager|admin|transition|registration)[\\/]/, 'office'],
]
const SHARED = /[\\/](components|app|lib|api|pages[\\/]common|pages[\\/]auth)[\\/]|[\\/]src[\\/][^\\/]+$/

export function filePortals(src, files) {
  const read = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))
  const resolve = (from, spec) => {
    const base = spec.startsWith('@/') ? path.join(src, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
    if (!base) return null
    return [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')].find((p) => read.has(p)) ?? null
  }
  const imports = new Map(
    files.map((f) => [f, [...read.get(f).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => resolve(f, m[1])).filter(Boolean)]),
  )
  const portals = new Map(files.map((f) => [f, new Set(SEEDS.filter(([re]) => re.test(f)).map(([, p]) => p))]))
  for (let changed = true; changed; ) {
    changed = false
    for (const f of files) {
      for (const dep of imports.get(f)) {
        for (const p of portals.get(f)) {
          if (!portals.get(dep).has(p)) {
            portals.get(dep).add(p)
            changed = true
          }
        }
      }
    }
  }
  // Shared code serves every screen: its texts stay in the file both portals load.
  for (const f of files) if (SHARED.test(f) && !SEEDS.some(([re]) => re.test(f))) portals.set(f, new Set(['student', 'office']))
  return { portals, read }
}

/** Does `code` show `key`? The same rule as i18n:check: the whole text, with \' escapes, or a long fixed part of it. */
export function shows(code, key) {
  if (code.includes(key) || code.includes(key.replaceAll("'", "\\'"))) return true
  return key
    .split(/\{\w+\}/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 14)
    .some((x) => code.includes(x))
}

/** 'student', 'office' or 'common': the file a text belongs in, from the files that show it and the API's sources. */
export function placeOf(key, filesWithPortals, api = '') {
  // A text the API sends may be shown by any portal through tr(): it stays common.
  if (api && shows(api, key)) return 'common'
  const where = new Set()
  for (const [code, portals] of filesWithPortals) if (shows(code, key)) portals.forEach((p) => where.add(p))
  return where.size === 1 ? [...where][0] : 'common'
}
