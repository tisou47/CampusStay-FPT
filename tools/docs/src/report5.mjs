// Generates Report 5 (Test Documentation) from the test suites: the Markdown parts tools/docs/src/_r5-*.md and
// tools/docs/build/testcases.json, read by pipeline/build-test-workbooks.ps1 to fill the Test Report and Unit Test
// workbooks. Data: tools/docs/data/tests.json (gen/run.mjs tests, after mvn -B -o verify) and the test code itself.
//   node tools/docs/src/report5.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURES } from './partials.mjs'
import { AUTHORS } from '../gen/parse.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')
const clean = (doc) => doc.replace(/^\s*\*\s?/gm, ' ').replace(/\{@\w+\s+([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** The body of a method, from its opening brace to the matching one; braces in strings, text blocks and comments are skipped. */
export function methodBody(src, method) {
  const at = src.search(new RegExp(`void\\s+${method}\\s*\\(`))
  if (at < 0) return ''
  const start = src.indexOf('{', src.indexOf(')', at))
  let depth = 0
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (src.startsWith('"""', i)) { i = src.indexOf('"""', i + 3) + 2; continue }
    if (c === '"' || c === "'") { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue }
    if (src.startsWith('//', i)) { i = src.indexOf('\n', i); continue }
    if (src.startsWith('/*', i)) { i = src.indexOf('*/', i) + 1; continue }
    if (c === '{') depth++
    if (c === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  return src.slice(start)
}

/** The API calls a test makes, in order: "POST /payments/{…}" (a path built by concatenation ends in {…}). */
export function httpSteps(body) {
  const out = []
  for (const m of body.matchAll(/\b(get|post|put|patch|delete|multipart)(?:As)?\(\s*"(\/[^"]*)"(\s*\+)?/g)) {
    const step = `${m[1] === 'multipart' ? 'POST' : m[1].toUpperCase()} ${m[2]}${m[3] ? '{…}' : ''}`
    if (out.at(-1) !== step) out.push(step)
  }
  return out
}

const STATUS = { Ok: '200 OK', Created: '201 Created', Accepted: '202 Accepted', NoContent: '204 No Content', BadRequest: '400 Bad Request',
  Unauthorized: '401 Unauthorized', Forbidden: '403 Forbidden', NotFound: '404 Not Found', Conflict: '409 Conflict', Gone: '410 Gone',
  PayloadTooLarge: '413 Payload Too Large', UnsupportedMediaType: '415 Unsupported Media Type', UnprocessableEntity: '422 Unprocessable Entity',
  TooManyRequests: '429 Too Many Requests', InternalServerError: '500 Internal Server Error', ServiceUnavailable: '503 Service Unavailable',
  '2xxSuccessful': '2xx', '4xxClientError': '4xx' }

/** What a test checks: the HTTP statuses it expects and how many assertions it makes. */
export function expectations(body) {
  const statuses = [...new Set([...body.matchAll(/status\(\)\.is(\w+)\(\)|status\(\)\.is\((\d+)\)/g).map((m) => m[2] ?? STATUS[m[1]] ?? m[1])])]
  const checks = (body.match(/\b(assertThat\w*|andExpect|assertEquals|assertTrue|assertFalse|assertThrows|assertNull|assertNotNull|verify)\(/g) ?? []).length
  return [statuses.length ? `HTTP ${statuses.join(', ')}` : '', `${checks} check${checks === 1 ? '' : 's'}`].filter(Boolean).join('; ')
}

/** Unit test type of the school template: A (abnormal: a refusal or an error), B (boundary), N (normal). From the test's name and comment. */
export function caseType(method, doc) {
  const words = `${method.replace(/([a-z\d])([A-Z])/g, '$1 $2')} ${doc}`.toLowerCase()
  if (/\b(rejects?|refuses?|refused|invalid|fails?|throws?|denied|denies|forbidden|wrong|missing|unknown|blocked|cannot|not|never|without|bad|errors?|expired|duplicates?|negative)\b/.test(words)) return 'A'
  if (/\b(limits?|max|maximum|min|minimum|boundary|edge|exactly|zero|last|first|overflow|caps?|rounds?|rounding)\b/.test(words)) return 'B'
  return 'N'
}

/** The test methods of a class (@Test, @ParameterizedTest, @RepeatedTest) with their Javadoc. */
export function testMethods(src) {
  const out = []
  for (const m of src.matchAll(/(?:\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*)?((?:@\w+(?:\([^)]*\))?\s*)+)(?:public\s+)?void\s+(\w+)\s*\(/g)) {
    if (/@(Test|ParameterizedTest|RepeatedTest)\b/.test(m[2])) out.push({ method: m[3], doc: m[1] ? clean(m[1]) : '' })
  }
  return out
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
const RESULT = { Passed: 'Passed', Failed: 'Failed', 'Not run': 'Pending' }

function build() {
  const t = data('tests.json')
  const testFiles = walk(path.join(root, 'backend/src/test/java')).filter((f) => f.endsWith('.java'))
  const mainFiles = walk(path.join(root, 'backend/src/main/java')).filter((f) => f.endsWith('.java'))
  const srcOf = new Map()
  const read = (cls) => {
    if (!srcOf.has(cls)) { const f = testFiles.find((x) => path.basename(x, '.java') === cls); srcOf.set(cls, f ? fs.readFileSync(f, 'utf8') : '') }
    return srcOf.get(cls)
  }
  const author = (file) => {
    const a = execFileSync('git', ['log', '--reverse', '--format=%an', '--', file], { cwd: root, encoding: 'utf8' }).split('\n')[0]
    return AUTHORS[a] ?? a
  }
  const runDate = t.runDate

  const groups = FEATURES.map(([code, name, , , tc]) => {
    const cases = t.cases.filter((c) => c.id.split('-')[1] === tc).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    return { sheet: code, name: `${name} (${code})`, req: `${name}: ${cases.length} test cases, automated against the API`,
      rows: cases.map((c) => {
        const src = read(c.class)
        const body = methodBody(src, c.method)
        const steps = httpSteps(body)
        const before = [...src.matchAll(/@BeforeEach\s*(?:public\s+)?void\s+(\w+)/g)].map((m) => m[1])
        const pre = c.level === 'integration'
          ? `PostgreSQL 17 (Testcontainers) with the Flyway schema and the test seed${before.length ? `; before each test: ${before.join(', ')}` : ''}`
          : 'Objects built in the test; no database'
        const procedure = [`Automated: ${c.class}.${c.method}`, ...steps.slice(0, 8).map((s, i) => `${i + 1}. ${s}`), ...(steps.length > 8 ? [`… ${steps.length - 8} more calls`] : [])].join('\n')
        return { id: c.id, description: c.title, procedure, expected: `The test's checks hold: ${expectations(body)}`, pre, result: RESULT[c.result] ?? 'Pending', level: c.level }
      }) }
  }).filter((g) => g.rows.length)
  groups.push({ sheet: 'Web', name: 'Web application logic (node:test)', req: 'Pure functions of web/src/lib: number and date formats, CSV export, photo rules',
    rows: t.web.map((w, i) => ({ id: `TC-WEB-${String(i + 1).padStart(3, '0')}`, description: w.method, procedure: 'Automated: npm test in web/ (node --test src/lib)', expected: 'The test\'s assertions hold', pre: 'Node.js 22', result: RESULT[w.result] ?? 'Pending', level: 'web' })) })
  groups.push({ sheet: 'Mobile', name: 'Mobile application (Flutter test)', req: 'Widgets and logic of the Android app',
    rows: t.mobile.map((m, i) => ({ id: `TC-MOB-${String(i + 1).padStart(3, '0')}`, description: m.name, procedure: `Automated: flutter test test/${m.file}`, expected: 'The test\'s expectations hold', pre: 'Flutter SDK; widgets pumped in the test', result: RESULT[m.result] ?? 'Pending', level: 'mobile' })) })

  const unitRuns = t.backend.filter((r) => r.level === 'unit')
  const units = [...new Set(unitRuns.map((r) => r.class))].sort().map((testClass, k) => {
    const src = read(testClass)
    const file = testFiles.find((x) => path.basename(x, '.java') === testClass)
    const cls = testClass.replace(/Tests?$/, '')
    const main = mainFiles.find((x) => path.basename(x, '.java') === cls)
    const docs = new Map(testMethods(src).map((m) => [m.method, m.doc]))
    const classDoc = src.match(/\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+|final\s+)*class\s/)?.[1]
    return {
      code: `UT-${String(k + 1).padStart(2, '0')}`, testClass, cls: main ? cls : `${testClass} (rule over the code)`,
      owner: file ? author(path.relative(root, file)) : '', loc: main ? fs.readFileSync(main, 'utf8').split('\n').length : 0,
      requirement: classDoc ? clean(classDoc) : `Unit tests of ${cls}`,
      cases: unitRuns.filter((r) => r.class === testClass).map((r) => {
        const base = r.method.replace(/[([].*$/, '')
        const doc = (docs.get(base) ?? '').replace(/^TC-[A-Z]+-\d+:?\s*/, '')
        const body = methodBody(src, base)
        return { name: r.method, what: doc || base.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase(), expect: expectations(body),
          throws: /assertThatThrownBy|assertThrows|isThrownBy|assertThatExceptionOfType/.test(body), type: caseType(base, doc), result: r.result }
      }),
    }
  })
  return { runDate, runs: t.runs, groups, units }
}

const LEVEL = { unit: 'Unit (backend)', integration: 'Integration (backend, Testcontainers)', web: 'Web (node:test)', mobile: 'Mobile (Flutter test)' }

function jacoco() {
  const f = path.join(root, 'backend/target/site/jacoco/index.html')
  if (!fs.existsSync(f)) return null
  const html = fs.readFileSync(f, 'utf8')
  const pct = (s) => [...s.matchAll(/<td class="ctr2"[^>]*>([^<]+)<\/td>/g)].map((m) => m[1])
  const total = html.match(/<tfoot>([\s\S]*?)<\/tfoot>/)?.[1] ?? ''
  const rows = [...html.matchAll(/<tr><td id="a\d+"><a[^>]*>([^<]+)<\/a><\/td>([\s\S]*?)<\/tr>/g)].map((m) => [m[1], ...pct(m[2]).slice(0, 2)])
  return { total: pct(total).slice(0, 2), rows }
}

export function writeAll() {
  const d = build()
  fs.mkdirSync(path.join(root, 'tools/docs/build'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tools/docs/build/testcases.json'), JSON.stringify(d, null, 1))
  const all = d.groups.flatMap((g) => g.rows)
  const count = (rows, r) => rows.filter((x) => x.result === r).length
  const unitCases = d.units.flatMap((u) => u.cases)
  const parts = {
    scope: table(['Feature', 'Test cases', 'Test classes'], d.groups.map((g) => [g.name, g.rows.length,
      [...new Set(g.rows.map((r) => r.procedure.split('\n')[0].replace(/^Automated: /, '').split('.')[0]))].filter((c) => !/ /.test(c)).length || '—'])),
    levels: table(['Level', 'Tests', 'How they run'], [
      [LEVEL.unit, d.runs.backendUnit, 'mvn test: one class alone, fakes and stub HTTP servers, no database'],
      [LEVEL.integration, d.runs.backendIt, 'mvn verify: the whole Spring application against PostgreSQL 17 in a container, requests through MockMvc'],
      [LEVEL.web, d.runs.web, 'npm test in web/: the pure functions of src/lib'],
      [LEVEL.mobile, d.runs.mobile, 'flutter test in mobile/: widgets and logic'],
    ]),
    cases: d.groups.map((g, i) => `#### 4.${i + 1} ${g.name}\n\n` + table(['ID', 'Test case', 'Procedure', 'Expected result', 'Result'],
      g.rows.map((r) => [r.id, r.description, r.procedure, r.expected, r.result]))).join('\n\n'),
    results: table(['Feature', 'Test cases', 'Passed', 'Failed', 'Pending'], [
      ...d.groups.map((g) => [g.name, g.rows.length, count(g.rows, 'Passed'), count(g.rows, 'Failed'), count(g.rows, 'Pending')]),
      ['**Total**', all.length, count(all, 'Passed'), count(all, 'Failed'), count(all, 'Pending')],
    ]) + '\n\n' + table(['Level', 'Tests run', 'Failed'], [
      [LEVEL.unit, d.runs.backendUnit, d.units.flatMap((u) => u.cases).filter((c) => c.result === 'Failed').length],
      [LEVEL.integration, d.runs.backendIt, d.runs.backendFailed - unitCases.filter((c) => c.result === 'Failed').length],
      [LEVEL.web, d.runs.web, d.runs.webFailed],
      [LEVEL.mobile, d.runs.mobile, d.runs.mobileFailed],
      ['**Total**', d.runs.backendUnit + d.runs.backendIt + d.runs.web + d.runs.mobile, d.runs.backendFailed + d.runs.webFailed + d.runs.mobileFailed],
    ]),
    units: table(['Code', 'Class under test', 'Test class', 'Tests', 'N / A / B'], d.units.map((u) => [u.code, u.cls, u.testClass, u.cases.length,
      ['N', 'A', 'B'].map((k) => u.cases.filter((c) => c.type === k).length).join(' / ')])),
  }
  const j = jacoco()
  parts.coverage = j
    ? `Coverage of the unit and integration tests together, measured by JaCoCo in the same run (\`backend/target/site/jacoco\`): **${j.total[0]} of the instructions** and **${j.total[1]} of the branches**.\n\n` + table(['Package', 'Instructions', 'Branches'], j.rows)
    : 'JaCoCo did not write its report in this run (`backend/target/site/jacoco` is missing), so no coverage figure is given.'
  for (const [name, md] of Object.entries(parts)) fs.writeFileSync(path.join(here, `_r5-${name}.md`), md.trim() + '\n')
  return { parts: Object.keys(parts), cases: all.length, units: unitCases.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('report5', JSON.stringify(writeAll()))
