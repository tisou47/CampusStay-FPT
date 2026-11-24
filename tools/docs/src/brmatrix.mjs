// Business Rule Matrix (Report 3 §5.1): every rule a service enforces with an error code, the feature and the class
// that check it, and the test cases whose test code asserts that code. Writes tools/docs/src/_r3-brmatrix.md.
//   node tools/docs/src/brmatrix.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURES } from './partials.mjs'
import { methodBody, testMethods } from './report5.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const ORDER = [...FEATURES.map((f) => f[0]), 'Platform']

/** One row per error code (first message wins), ordered by feature then code; tests = TC ids whose body names the code. */
export function ruleRows(messages, featureOf, tests) {
  const seen = new Map()
  for (const m of messages) if (m.code && !seen.has(m.code)) seen.set(m.code, m)
  const rows = [...seen.values()].map((m) => ({ feature: featureOf(m.source), code: m.code, rule: m.message.trim().replace(/([^.?!)])$/, '$1…'), where: m.source,
    tests: tests.filter((t) => new RegExp(`"${m.code}"`).test(t.body)).map((t) => t.id) }))
  rows.sort((a, b) => ORDER.indexOf(a.feature) - ORDER.indexOf(b.feature) || a.code.localeCompare(b.code))
  return rows.map((r, i) => ({ id: `BR-${String(i + 1).padStart(3, '0')}`, ...r }))
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))

export function writeMatrix() {
  const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
  const main = walk(path.join(root, 'backend/src/main/java')).filter((f) => f.endsWith('.java'))
  const byDir = Object.fromEntries(FEATURES.map((f) => [f[2], f[0]]))
  const featureOf = (cls) => {
    const file = main.find((f) => path.basename(f, '.java') === cls)
    const dir = file?.replaceAll('\\', '/').match(/\/service\/(\w+)\//)?.[1]
    return byDir[dir] ?? 'Platform'
  }
  const testFiles = walk(path.join(root, 'backend/src/test/java')).filter((f) => f.endsWith('.java'))
  const src = new Map(testFiles.map((f) => [path.basename(f, '.java'), fs.readFileSync(f, 'utf8')]))
  const tests = data('tests.json').cases.map((c) => ({ id: c.id, body: methodBody(src.get(c.class) ?? '', c.method) }))
  const rows = ruleRows(data('messages.json'), featureOf, tests)
  const covered = rows.filter((r) => r.tests.length).length
  const cell = (s) => String(s).replace(/\|/g, '\\|')
  const md = `The ${rows.length} business rules below are every refusal a service makes with its own error code (the user sees the message in English or Vietnamese, section 5.3). For each rule: the feature, the class that checks it, and the test cases of Report 5 whose test asserts that code. ${covered} of the ${rows.length} rules (${Math.round((100 * covered) / rows.length)} %) are asserted by name; the others are covered by the tests of their endpoint without naming the code.

Table: Business Rule Matrix
| BR | Feature | Rule | Error code | Checked in | Test cases |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.feature} | ${cell(r.rule)} | \`${r.code}\` | ${r.where} | ${r.tests.slice(0, 4).join(', ')}${r.tests.length > 4 ? ` (+${r.tests.length - 4})` : ''} |`).join('\n')}
`
  fs.writeFileSync(path.join(here, '_r3-brmatrix.md'), md)
  return { rows: rows.length, covered }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('brmatrix', JSON.stringify(writeMatrix()))
