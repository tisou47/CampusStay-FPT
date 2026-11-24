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
import { stripRefs } from '../pipeline/refs.mjs'

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

/**
 * The controller a test step ("POST /invoices/INV-1/claim", "GET /invoices/{…}") calls: the endpoint of that method whose
 * segments match best (equal text 2 points, a placeholder on either side 1); a trailing {…} of the step stands for the
 * rest of the path. Null when no endpoint matches.
 */
export function controllerOf(step, endpoints) {
  const [method, p] = step.split(' ')
  const s = p.replace(/\/$/, '').split('/').slice(1)
  const open = s.at(-1) === '{…}'
  let best = null
  for (const e of endpoints.filter((x) => x.method === method)) {
    const t = e.path.split('/').slice(1)
    if (open ? t.length < s.length : t.length !== s.length) continue
    let score = 0
    let ok = true
    for (let i = 0; i < s.length && ok; i++) {
      if (open && i === s.length - 1) break
      if (s[i] === t[i]) score += 2
      else if (/^\{.*\}$/.test(s[i]) || /^\{.*\}$/.test(t[i])) score += 1
      else ok = false
    }
    if (ok && (!best || score > best.score)) best = { score, controller: e.controller }
  }
  return best?.controller ?? null
}

// The "what if…" questions every main flow must answer (mentor's handbook §3.2), each recognised in a test's comment.
const WHAT_IF = [
  ['Invalid or out-of-range input', /\b(invalid|negative|missing|wrong|malformed|too (long|many|large|big)|above|below|empty|out of (order|range)|format|blank|exceed|limit)/i],
  ['Two users act at once, or the same action twice', /\b(twice|concurren|same time|race|duplicate|second|already|double|again|only once)/i],
  ['A cancellation or a change after approval', /\b(cancel|withdraw|after (the )?(approval|results?|publish|commit)|declin|revok|void)/i],
  ['A payment, deadline or outside service fails', /\b(expire|deadline|overdue|forfeit|unavailable|offline|timeout|fail|retry|not paid|unpaid|late)/i],
  ['A role does another role\'s work', /\b(403|401|forbidden|permission|another (block|student)|other block|cannot|only (a |the )?(manager|staff|admin|student)|scope|someone else|not their)/i],
]

/** For each main flow, each "what if" with the flow's test cases that answer it (at most two), the first category matching a test's comment. */
export function exceptionRows(flows, cases) {
  return flows.flatMap((f) => {
    const mine = cases.filter((c) => f.classes.includes(c.class))
    const filed = new Map(WHAT_IF.map(([name]) => [name, []]))
    for (const c of mine) {
      const hit = WHAT_IF.find(([, re]) => re.test(c.title))
      if (hit) filed.get(hit[0]).push(c)
    }
    return WHAT_IF.map(([name]) => ({ flow: f, category: name, tests: filed.get(name).slice(0, 2) }))
  })
}

/** What a test checks: the HTTP statuses it expects and how many assertions it makes. */
export function expectations(body) {
  const statuses = [...new Set([...body.matchAll(/status\(\)\.is(\w+)\(\)|status\(\)\.is\((\d+)\)/g).map((m) => m[2] ?? STATUS[m[1]] ?? m[1])])]
  const checks = (body.match(/\b(assert\w*|andExpect|verify)\(/g) ?? []).length
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
        return { id: c.id, description: stripRefs(c.title), procedure, expected: `The test's checks hold: ${expectations(body)}`, pre, result: RESULT[c.result] ?? 'Pending', level: c.level }
      }) }
  }).filter((g) => g.rows.length)
  groups.push({ sheet: 'Web', name: 'Web application logic (node:test)', req: 'Pure functions of web/src/lib: number and date formats, CSV export, photo rules',
    rows: t.web.map((w, i) => ({ id: `TC-WEB-${String(i + 1).padStart(3, '0')}`, description: w.method, procedure: 'Automated: npm test in web/ (node --test src/lib)', expected: 'The test\'s assertions hold', pre: 'Node.js 22', result: RESULT[w.result] ?? 'Pending', level: 'web' })) })
  groups.push({ sheet: 'Mobile', name: 'Mobile application (Flutter test)', req: 'Widgets and logic of the Android app',
    rows: t.mobile.map((m, i) => ({ id: `TC-MOB-${String(i + 1).padStart(3, '0')}`, description: m.name, procedure: `Automated: flutter test test/${m.file}`, expected: 'The test\'s expectations hold', pre: 'Flutter SDK; widgets pumped in the test', result: RESULT[m.result] ?? 'Pending', level: 'mobile' })) })
  // System tests: run by the team on the deployed system with the demo data (systemtests.json); Pending until run with evidence.
  const st = JSON.parse(fs.readFileSync(path.join(here, 'systemtests.json'), 'utf8'))
  groups.push({ sheet: 'System tests', name: 'System tests on the deployed system (manual)', req: 'The main and an exception scenario of each main flow, through the web and Android screens',
    rows: st.map((s) => ({ id: s.id, description: `[${s.flow} ${s.type}] ${s.title}`, procedure: s.steps.map((x, i) => `${i + 1}. ${x}`).join('\n'), expected: s.expected, pre: s.pre, result: 'Pending', level: 'system' })) })

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
        return { name: r.method, what: stripRefs(doc) || base.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase(), expect: expectations(body),
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
  // Requirement → test traceability: each functional requirement of Report 3 §3 is a controller; a test case traces to
  // it when its test code calls one of the controller's endpoints.
  const endpoints = data('endpoints.json')
  const testSrc = new Map()
  const tcByController = new Map()
  for (const c of data('tests.json').cases) {
    const file = walk(path.join(root, 'backend/src/test/java')).find((f) => path.basename(f, '.java') === c.class)
    if (!testSrc.has(c.class)) testSrc.set(c.class, file ? fs.readFileSync(file, 'utf8') : '')
    for (const step of httpSteps(methodBody(testSrc.get(c.class), c.method))) {
      const ctl = controllerOf(step, endpoints)
      if (ctl) tcByController.set(ctl, new Set([...(tcByController.get(ctl) ?? []), c.id]))
    }
  }
  const hum = (s) => s.replace(/Controller$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const featureName = Object.fromEntries(FEATURES.map((f) => [f[2], `${f[1]} (${f[0]})`]))
  const controllers = [...new Map(endpoints.map((e) => [e.controller, e])).values()]
  const traced = controllers.filter((e) => tcByController.has(e.controller)).length
  parts.trace = `Each functional requirement of Report 3 section 3 is one controller (the functions of a screen or a group of screens). A test case traces to a requirement when its test code calls one of the requirement's endpoints. ${traced} of the ${controllers.length} requirements are reached by at least one test case; the others are listed with "—" and are covered only through other features' flows or by the system tests at the end of section 4.\n\n` +
    'Table: Requirement to test case traceability\n' +
    table(['Feature', 'Requirement (Report 3 §3)', 'Endpoints', 'Test cases'], controllers.map((e) => {
      const ids = [...(tcByController.get(e.controller) ?? [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      return [featureName[e.feature] ?? e.feature, hum(e.controller), endpoints.filter((x) => x.controller === e.controller).length,
        ids.length ? `${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ` (+${ids.length - 6})` : ''}` : '—']
    }))
  // Exception Scenario Matrix: the main flows of Report 6 §3 and their test classes.
  const FLOWS = [
    { id: 'MF-01', name: 'Registration, payment and assignment', classes: ['ApplicationsIT', 'PaymentClaimIT', 'PaymentsIT', 'PaymentDeskIT', 'AssignmentIT', 'Round2IT', 'AssignmentEngineTest', 'AssignmentRegressionIT', 'BillingRegressionIT'] },
    { id: 'MF-02', name: 'Opening a Term', classes: ['TermRequestIT', 'TermWizardIT', 'AdminConfigIT', 'RegistrationPeriodIT'] },
    { id: 'MF-03', name: 'Term transition', classes: ['RenewalIT', 'NextTermRequestIT', 'RoomChangeIT', 'SwapIT', 'ReconciliationIT', 'OperationalMoveIT', 'RequestsRegressionIT'] },
    { id: 'MF-04', name: 'Maintenance', classes: ['MaintenanceIT', 'EscalationIT', 'RoutingIT', 'InspectionIT'] },
    { id: 'MF-05', name: 'Utility billing', classes: ['MeterIT', 'UtilityDebtIT', 'MeterRemindersIT', 'UtilitySplitTest'] },
    { id: 'MF-06', name: 'Check-in and check-out', classes: ['HandoverIT', 'DeskIT', 'LateCheckInIT', 'TerminationIT', 'DoorCodeIT', 'HandoverComparisonTest', 'DeskRegressionIT'] },
    { id: 'MF-07', name: 'Family Day', classes: ['FamilyDayIT'] },
    { id: 'MF-08', name: 'The Staff week', classes: ['WeekScheduleIT', 'ShiftGateIT', 'StaffWorkloadIT', 'BlockStaffIT'] },
  ]
  const ex = exceptionRows(FLOWS, data('tests.json').cases.map((c) => ({ ...c, title: stripRefs(c.title) })))
  const answered = ex.filter((r) => r.tests.length).length
  parts.exceptions = `For each main flow (Report 6 section 3), the five "what if" situations a reviewer asks about, with the automated test cases that check what the system does. ${answered} of the ${ex.length} situations have a test; a "—" marks a situation with no test, a gap to close or to explain at the defense.\n\n` +
    'Table: Exception Scenario Matrix\n' +
    table(['Main flow', 'What if…', 'Test case', 'What the system does (from the test)', 'Result'], ex.flatMap((r) => (r.tests.length
      ? r.tests.map((t) => [`${r.flow.id} ${r.flow.name}`, r.category, t.id, t.title, t.result])
      : [[`${r.flow.id} ${r.flow.name}`, r.category, '—', 'No automated test', '']])))
  const j = jacoco()
  parts.coverage = j
    ? `Coverage of the unit and integration tests together, measured by JaCoCo in the same run (\`backend/target/site/jacoco\`): **${j.total[0]} of the instructions** and **${j.total[1]} of the branches**.\n\n` + table(['Package', 'Instructions', 'Branches'], j.rows)
    : 'JaCoCo did not write its report in this run (`backend/target/site/jacoco` is missing), so no coverage figure is given.'
  for (const [name, md] of Object.entries(parts)) fs.writeFileSync(path.join(here, `_r5-${name}.md`), md.trim() + '\n')
  return { parts: Object.keys(parts), cases: all.length, units: unitCases.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('report5', JSON.stringify(writeAll()))
