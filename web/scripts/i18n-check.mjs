#!/usr/bin/env node
/*
 * Checks the web's translations (ADR-25): npm run i18n:check  (--all lists every entry)
 *
 *  - missing   an English text the code shows (t('…'), tx, a label/title/… prop) with no Vietnamese in
 *              src/i18n/vi.js, vi-pages.js, vi-student.js or vi-office.js: it would show in English on a Vietnamese screen.
 *  - unused    a Vietnamese entry whose key the code no longer has and the API does not send (backend sources).
 *  - conflicts a key in two locale files with two different translations.
 *  - wrong file a text a portal's screen shows that sits only in the other portal's file (vi-student.js / vi-office.js
 *              load with their portal, WEB-ADM-32): the screen would show it in English. See scripts/i18n-portals.mjs.
 *  - plurals   a key of src/i18n/en-plurals.js that the code no longer has.
 *  - hard-coded Vietnamese written in a component instead of in the locale files.
 *  - raw dates and numbers: toLocale*, Intl.DateTimeFormat or Intl.NumberFormat outside src/lib/format.js.
 *
 * Exits with 1 when something is missing, conflicting or formatted by hand, so CI can run it.
 * The development screen index (src/dev, src/app/screens.js) is English only and not checked.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(web, 'src')
const backend = path.resolve(web, '../backend/src/main')
const ALL = process.argv.includes('--all')

const walk = (dir, test) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        return e.isDirectory() ? walk(p, test) : test(p) ? [p] : []
      })
    : []

const shell = (await import(pathToFileURL(path.join(src, 'i18n/vi.js')))).default
const common = (await import(pathToFileURL(path.join(src, 'i18n/vi-pages.js')))).default
const student = (await import(pathToFileURL(path.join(src, 'i18n/vi-student.js')))).default
const office = (await import(pathToFileURL(path.join(src, 'i18n/vi-office.js')))).default
const pages = { ...common, ...student, ...office }
const plurals = (await import(pathToFileURL(path.join(src, 'i18n/en-plurals.js')))).default
const vi = { ...shell, ...pages }

const skipped = /[\\/](i18n|dev)[\\/]|[\\/]app[\\/]screens\.js$/
const codeFiles = walk(src, (p) => /\.(jsx?|mjs)$/.test(p) && !skipped.test(p))
const code = codeFiles.map((f) => [path.relative(web, f), fs.readFileSync(f, 'utf8')])
const allCode = code.map(([, s]) => s).join('\n')
const api = walk(backend, (p) => /\.(java|sql|txt|html)$/.test(p)).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const isFormatLib = (file) => file.endsWith(path.join('lib', 'format.js'))

const unescape = (s) => s.replace(/\\(.)/g, '$1')
const STR = String.raw`(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")`
const PROPS = 'label|title|description|placeholder|helper|emptyTitle|emptyText|note|message|heading|confirmLabel|aria-label|tooltip|hint|caption'
const patterns = [
  new RegExp(String.raw`\b(?:t|tx|tr)\(\s*${STR}`, 'g'),
  new RegExp(String.raw`\b(?:${PROPS})\s*=\s*${STR}`, 'g'),
  new RegExp(String.raw`\b(?:${PROPS})\s*:\s*${STR}`, 'g'),
]
// Texts that read the same in both languages.
const SAME = /^(?:[\s\d{}()[\]·•–—\-+/%:.,#×→←›…?!|]*|[A-Z0-9_-]{1,6}|https?:.*|\{\w+\}[^a-z]*|.*@.*\..*|CampusStay.*|FPT.*|VietQR|QR|ID|PDF|CSV|XLSX|Email|OK)$/

const missing = new Map()
for (const [file, s] of code) {
  for (const re of patterns) {
    for (const m of s.matchAll(re)) {
      const text = unescape(m[1] ?? m[2] ?? '')
      if (!text || SAME.test(text) || !/[a-z]{2}/.test(text.replace(/\{\w+\}/g, '')) || vi[text] != null) continue
      if (/^[a-z][\w.-]*$/.test(text) || /^[\w-]+(\s[\w-]+:[\w-]+)+$/.test(text)) continue // ids, class names
      if (!missing.has(text)) missing.set(text, `${file}:${s.slice(0, m.index).split('\n').length}`)
    }
  }
}

const fragmentUsed = (key) =>
  key.split(/\{\w+\}/).map((x) => x.trim()).filter((x) => x.length >= 14).some((x) => allCode.includes(x) || api.includes(x))
const used = (key) => allCode.includes(key) || api.includes(key) || fragmentUsed(key)
const unused = Object.keys(vi).filter((k) => !used(k))
const locales = [shell, common, student, office]
const conflicts = Object.keys(vi).filter((k) => new Set(locales.filter((l) => k in l).map((l) => l[k])).size > 1)

// A text shown by a portal's file must be in vi.js, vi-pages.js or that portal's own file.
const { filePortals } = await import(pathToFileURL(path.join(web, 'scripts/i18n-portals.mjs')))
const { portals } = filePortals(src, codeFiles)
const ownFile = { student, office }
const wrongFile = new Map()
for (const file of codeFiles) {
  const s = fs.readFileSync(file, 'utf8')
  for (const re of patterns) {
    for (const m of s.matchAll(re)) {
      const text = unescape(m[1] ?? m[2] ?? '')
      if (!text || text in shell || text in common || !(text in pages)) continue
      for (const portal of portals.get(file)) {
        if (!(text in ownFile[portal]) && !wrongFile.has(text)) wrongFile.set(text, `${path.relative(web, file)}:${s.slice(0, m.index).split('\n').length} (${portal}: move it to vi-pages.js or add it to vi-${portal}.js)`)
      }
    }
  }
}
const stalePlurals = Object.keys(plurals).filter((k) => !allCode.includes(k) && !fragmentUsed(k))

const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
const T_CALL = /\bt\(\s*(['"])(?:\\.|(?!\1).)*\1/g
const hardCoded = []
const rawFormat = []
for (const [file, s] of code) {
  s.split('\n').forEach((line, i) => {
    const text = line.replace(/\/\/.*$|^\s*\*.*$|^\s*\/\*.*$/, '')
    const shown = text.replace(T_CALL, '')
    if (!isFormatLib(file) && VI_LETTERS.test(shown) && !/Tiếng Việt|Tân Uyên/.test(shown)) hardCoded.push(`${file}:${i + 1}`)
    if (!isFormatLib(file) && /\.toLocale(?:Date|Time)?String\(|new Intl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)/.test(text)) rawFormat.push(`${file}:${i + 1}`)
  })
}

const section = (title, list, show = 40) => {
  console.log(`\n${title}: ${list.length}`)
  list.slice(0, ALL ? Infinity : show).forEach((x) => console.log(`  ${x}`))
  if (!ALL && list.length > show) console.log(`  … and ${list.length - show} more (--all lists them)`)
}
console.log(`Vietnamese entries: ${Object.keys(vi).length} (shell ${Object.keys(shell).length}, screens ${Object.keys(pages).length}); English singular forms: ${Object.keys(plurals).length}`)
section('Missing a Vietnamese text', [...missing].map(([k, at]) => `${JSON.stringify(k)}  (${at})`))
section('Conflicting translations (two locale files)', conflicts)
section('In the other portal\'s file', [...wrongFile].map(([k, at]) => `${JSON.stringify(k)}  ${at}`))
section('Raw date/number formatting outside lib/format.js', rawFormat)
section('Vietnamese written in components', hardCoded)
section('Unused Vietnamese entries', unused, 20)
section('Unused English singular forms', stalePlurals)
process.exitCode = missing.size || conflicts.length || wrongFile.size || rawFormat.length ? 1 : 0
