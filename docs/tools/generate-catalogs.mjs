// Regenerates the two catalogs that are read from the code, so they cannot drift from it:
//   docs/backend/04_Test_Catalog.md  ← the Javadoc of every @Test in backend/src/test/java (TC ids, Report 5)
//   docs/web/01_Screen_Map.md        ← web/src/app/router.jsx, web/src/app/screens.js and each page's header comment
// Run from the repository root:  node docs/tools/generate-catalogs.mjs
// Commit the regenerated files together with the code change that alters a test or a screen.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, sep, dirname } from 'node:path'

const root = process.cwd()
const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
const rel = (p) => relative(root, p).split(sep).join('/')
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()

function walk(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : []
  })
}

function write(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text.replace(/\r\n/g, '\n'))
  console.log(`wrote ${rel(file)}`)
}

/* ------------------------------------------------------------------ Test catalog */

const FEATURES = [
  ['AUTH', 'Sign-in, sessions, users, roles, Block scope, Audit Log', 'auth'],
  ['CFG', 'Settings: Terms, Room Types and Classes, fees, eligibility, matching, parameters, Block settings', 'setting'],
  ['INV', 'Buildings, Floors, Rooms, Beds, inventory', 'inventory'],
  ['APP', 'Applications, roommate invitations, Round 2', 'application'],
  ['ASG', 'Assignment engine and runs, approval, Allocation, residence and door-code release, forfeits, desk, late check-ins, terminations', 'assignment'],
  ['BIL', 'Invoices, payment claims, refunds, meter readings, utility and its debt warnings', 'billing'],
  ['REQ', 'Room changes, swaps, routing rules, SLA and escalations', 'request'],
  ['MNT', 'Maintenance Requests and inspections', 'maintenance'],
  ['NTF', 'Notifications, push, templates, email', 'notification'],
  ['RPT', 'Dashboards, reports, exports', 'report'],
  ['ARCH', 'Architecture rules', null],
]

function javadocText(lines) {
  return lines
    .join(' ')
    .replace(/^\s*\/\*\*/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/\s*\*\s?/g, ' ')
    .replace(/\{@code ([^}]*)\}/g, '`$1`')
    .replace(/\{@link ([^}]*)\}/g, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTests(file) {
  const src = readFileSync(file, 'utf8').split(/\r?\n/)
  const name = file.split(sep).pop().replace('.java', '')
  const level = name === 'LayeringTest' ? 'Architecture' : name.endsWith('IT') ? 'Integration' : 'Unit'
  const pkg = rel(file).replace('backend/src/test/java/vn/fpt/campusstay/', '').split('/').slice(0, -1).join('/')
  let doc = null // { text, end }
  let classDoc = ''
  const tests = []
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (/^\s*\/\*\*/.test(line)) {
      const start = i
      while (!/\*\//.test(src[i]) && i < src.length - 1) i++
      doc = { text: javadocText(src.slice(start, i + 1)), end: i }
      continue
    }
    if (!classDoc && /^(public\s+|final\s+|abstract\s+)*class\s+\w+/.test(line)) classDoc = doc?.text ?? ''
    if (/^\s*@(Test|ParameterizedTest)\b/.test(line)) {
      let j = i
      while (j < src.length && !/void\s+\w+\s*\(/.test(src[j])) j++
      const method = (src[j] ?? '').match(/void\s+(\w+)\s*\(/)?.[1] ?? '?'
      // The Javadoc belongs to this test when only annotations stand between it and @Test.
      const between = doc ? src.slice(doc.end + 1, i).every((l) => /^\s*(@.*)?$/.test(l)) : false
      tests.push({ file: rel(file), cls: name, pkg, method, level, text: between ? doc.text : '' })
      doc = null
      i = j
    }
  }
  return { name, classDoc, tests }
}

function splitId(text) {
  const head = text.match(/^((?:TC-[A-Z]+-\d+)(?:\s*(?:,|and|…|\.\.\.)\s*TC-[A-Z]+-\d+)*)\s*(\(([^)]*)\))?\s*:\s*(.*)$/)
  if (!head) return { ids: [], tag: '', desc: text }
  return { ids: head[1].match(/TC-[A-Z]+-\d+/g), tag: head[3] ?? '', desc: head[4] }
}

function featureOf(t) {
  if (t.ids.length) return t.ids[0].split('-')[1]
  if (t.level === 'Architecture') return 'ARCH'
  const byPkg = FEATURES.find(([, , p]) => p && t.pkg.includes(p))
  return byPkg ? byPkg[0] : 'ARCH'
}

function testCatalog() {
  const files = walk(join(root, 'backend/src/test/java'), '.java')
  const parsed = files.map(parseTests).filter((p) => p.tests.length)
  const tests = parsed.flatMap((p) => p.tests.map((t) => ({ ...t, ...splitId(t.text) }))).map((t) => ({ ...t, feature: featureOf(t) }))
  const num = (t) => (t.ids[0] ? Number(t.ids[0].split('-')[2]) : 9999)
  tests.sort((a, b) => FEATURES.findIndex((f) => f[0] === a.feature) - FEATURES.findIndex((f) => f[0] === b.feature) || num(a) - num(b) || a.cls.localeCompare(b.cls))

  const ids = tests.flatMap((t) => t.ids)
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
  const noId = tests.filter((t) => !t.ids.length)
  const count = (lvl) => tests.filter((t) => t.level === lvl).length
  const classes = (lvl) => new Set(tests.filter((t) => t.level === lvl).map((t) => t.cls)).size

  let md = `# CampusStay FPT — Automated test catalog

| Field | Value |
|---|---|
| Generated | ${today} by \`node docs/tools/generate-catalogs.mjs\` from the Javadoc of every \`@Test\` in \`backend/src/test/java\` |
| Feeds | Report 5 (Test Documentation), the Unit Test and Test Report workbooks |
| Related | \`docs/backend/01_Backend_Architecture.md\` §15 (strategy), \`docs/backend/02_Endpoint_Map.md\` (which test verifies which endpoint) |

Do not edit this file by hand: change the test's Javadoc and run the generator. A test case id has the form \`TC-<CODE>-NNN\`, where the code is the feature's table prefix; one id belongs to exactly one test. *Tag* is what the test's Javadoc says about the case (\`negative\`, \`boundary\`, \`permission\` …); an untagged case may still check a rejection, as its description says.

## 1. Summary

| Level | Tool | Classes | Tests |
|---|---|---|---|
| Unit | JUnit 5, AssertJ; hand-written fakes and \`MockRestServiceServer\` for outbound HTTP (no Mockito) | ${classes('Unit')} | ${count('Unit')} |
| Integration | Spring Boot test, MockMvc, Testcontainers PostgreSQL 17 (Flyway schema + \`db/test-seed\`); \`GoogleSignUpIT\` stubs Google's ID token check with \`@MockitoBean\` | ${classes('Integration')} | ${count('Integration')} |
| Architecture | JUnit source scan (\`LayeringTest\`: controller → service → repository) | ${classes('Architecture')} | ${count('Architecture')} |
| **Total** | | **${parsed.length}** | **${tests.length}** (${new Set(ids).size} test case ids) |

| Code | Feature | Tests |
|---|---|---|
${FEATURES.map(([c, d]) => `| ${c} | ${d} | ${tests.filter((t) => t.feature === c).length} |`).join('\n')}

How they run: \`mvn test\` (unit + architecture), \`mvn verify\` (+ integration, Docker required). GitHub Actions runs \`mvn verify\` on every push and pull request that touches the backend, and a failing test stops the deploy (\`.github/workflows/backend.yml\`).
${dup.length ? `\n> **Duplicate ids to fix:** ${dup.join(', ')}\n` : ''}`

  for (const [code, desc] of FEATURES) {
    const rows = tests.filter((t) => t.feature === code)
    if (!rows.length) continue
    md += `\n## ${code} — ${desc}\n\n| Id | Tag | What it checks | Test | Level |\n|---|---|---|---|---|\n`
    md += rows.map((t) => `| ${t.ids.join(', ') || '—'} | ${cell(t.tag) || '—'} | ${cell(t.desc || t.text) || '—'} | [\`${t.cls}.${t.method}\`](../../${t.file}) | ${t.level} |`).join('\n') + '\n'
  }

  md += `
## Not automated

| What | Why | How it is checked |
|---|---|---|
| \`POST /auth/google\` success path | Needs a real \`@fpt.edu.vn\` Google account and the OAuth client of the deployment | By hand on the deployed web app (passed 25/10/2026 with a real account, pop-up and redirect flows); validation, the disabled state, the code exchange, the redirect flow and the sign-up that follows a verified token are automated (TC-AUTH-009, 010, 029…033, 038, 040, 041, 051, 052) |
| Two requests racing for the same Bed or Invoice | No multi-thread integration test yet (architecture R-18) | Partial unique indexes and \`SELECT … FOR UPDATE\` (architecture §9); SePay deliveries are deduplicated by transaction id |
| The web app | No automated front-end tests; \`npm run build\` must pass before every push | End-to-end flows per role by hand against the dev stack or the demo server (Test Report workbook) |
| The Android app | Not started | — |
${noId.length ? `\n### Tests without a test case id\n\n${noId.map((t) => `- [\`${t.cls}.${t.method}\`](../../${t.file})${t.text ? `: ${cell(t.text)}` : ''}`).join('\n')}\n` : ''}`
  write(join(root, 'docs/backend/04_Test_Catalog.md'), md)
}

/* ------------------------------------------------------------------ Screen map */

function screenMap() {
  const routerSrc = readFileSync(join(root, 'web/src/app/router.jsx'), 'utf8')
  // Pages imported directly (public ones) or loaded on first visit: const X = () => import('@/pages/…').
  const imports = Object.fromEntries([...routerSrc.matchAll(/^(?:import (\w+) from |const (\w+) = \(\) => import\()'@\/pages\/([^']+)'/gm)].map((m) => [m[1] ?? m[2], `web/src/pages/${m[3]}.jsx`]))

  const screensSrc = readFileSync(join(root, 'web/src/app/screens.js'), 'utf8')
  const screens = [...screensSrc.matchAll(/\{ code: '([^']+)', title: '([^']+)', role: '(\w+)', path: '([^']+)' \}/g)].map((m) => ({ code: m[1], title: m[2], role: m[3], path: m[4].split('?')[0] }))
  const byPath = Object.fromEntries(screens.map((s) => [s.path, s]))

  // Routes: the public ones, then each portal('role', …, [ … ]) block.
  const routes = []
  let role = null
  for (const line of routerSrc.split(/\r?\n/)) {
    const portal = line.match(/portal\('(\w+)'/)
    if (portal) role = portal[1]
    // { path: 'x', element: <Page a="b" /> } or the lazy { path: 'x', ...page(Page, { a: 'b' }) }
    const lazy = line.match(/\{ (index: true|path: '([^']+)'), \.\.\.page\((\w+)(?:, \{ ([^}]*) \})?\)/)
    const m = lazy
      ? [lazy[0], lazy[1], lazy[2], lazy[3], (lazy[4] ?? '').replace(/(\w+): '([^']*)'/g, '$1="$2"').replace(/,\s*/g, ' ')]
      : line.match(/\{ (index: true|path: '([^']+)'), element: <(\w+)([^/>]*)\/?>/)
    if (!m || m[3] === 'Navigate' || m[3] === 'RootLayout') continue
    const path = m[1].startsWith('index') ? (role ? `/${role}` : '/') : m[2] === '*' ? '*' : role ? `/${role}/${m[2]}` : `/${m[2]}`
    routes.push({ role: role ?? 'public', path, comp: m[3], props: m[4].trim(), file: imports[m[3]] })
  }

  const header = (file) => {
    if (!file) return { lines: [] }
    const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('//')).slice(0, 40).map((l) => l.replace(/^\/\/\s?/, ''))
    return { lines }
  }
  const apiOf = (lines) => {
    const calls = []
    for (const l of lines) for (const m of l.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)(?:\|PUT)?\s+(\/[A-Za-z0-9_:/.{}-]+)/g)) calls.push(`${m[1]} ${m[2].replace(/\/$/, '')}`)
    return [...new Set(calls)]
  }

  const groups = [
    ['public', 'Public pages (no sign-in)'],
    ['student', 'Student — Figma page 05 Web – Student (phones and tablets: 09 Android – Student)'],
    ['staff', 'Staff — Figma page 06 Web – Staff'],
    ['manager', 'Block Manager — Figma page 07 Web – Manager'],
    ['admin', 'Admin — Figma page 08 Web – Admin'],
  ]
  const codes = []
  let md = `# CampusStay FPT — Web screen map

| Field | Value |
|---|---|
| Generated | ${today} by \`node docs/tools/generate-catalogs.mjs\` from \`web/src/app/router.jsx\`, \`web/src/app/screens.js\` and the header comment of each page |
| Feeds | Report 3 (SRS: screens and actors), Report 4 (SDD: user interface design), Report 6 (User Guides) |
| Related | \`docs/api-contract.md\` (request and response shapes), Figma file *CampusStay-FPT* |

Every route of the web app with its screen code, its Figma frame and the API calls the page makes. Do not edit by hand: change the page's header comment, \`screens.js\` or the router, then run the generator.
`
  for (const [key, title] of groups) {
    const rows = routes.filter((r) => r.role === key && r.path !== '*')
    md += `\n## ${title}\n\n| Code | Screen | Route | Figma | API calls | Page |\n|---|---|---|---|---|---|\n`
    for (const r of rows) {
      const h = header(r.file)
      const first = h.lines[0] ?? ''
      const scr = byPath[r.path]
      const code = scr?.code ?? first.match(/\b((?:SCR|MOB)-[A-Z]+-\d+)/)?.[1] ?? ''
      const titleText = scr?.title ?? (first.replace(/^((?:SCR|MOB)-[A-Z]+-\d+)\s*/, '').replace(/\s*[(—–].*$/, '') || r.comp)
      const figma = first.match(/Figma ([\d:]+)/)?.[1] ?? first.match(/\((\d+:\d+)/)?.[1] ?? ''
      const notInScope = r.comp === 'NotInScope'
      const api = notInScope ? [] : apiOf(h.lines)
      if (code) codes.push({ code, route: r.path, base: titleText.split(' – ')[0] })
      const shown = notInScope ? `${r.props.match(/title="([^"]+)"/)?.[1] ?? 'Not in scope'} — placeholder page, no API (not in scope this term)` : titleText
      md += `| ${code || '—'} | ${cell(shown)}${r.props && !notInScope ? ` (\`${cell(r.props)}\`)` : ''} | \`${r.path}\` | ${figma || '—'} | ${api.length ? api.map((a) => `\`${a}\``).join('<br>') : '—'} | ${r.file ? `[${r.file.replace('web/src/pages/', '')}](../../${r.file})` : '—'} |\n`
    }
  }

  // Steps of one screen (the wizard) and the Staff pages the Manager reuses share a code on purpose;
  // a code on two different screens is a naming clash to settle against Figma.
  const byCode = {}
  for (const c of codes) (byCode[c.code] ??= []).push(c)
  const shared = Object.entries(byCode)
    .filter(([, list]) => new Set(list.map((c) => c.base)).size > 1)
    .map(([code, list]) => [code, new Set(list.map((c) => c.route))])
  md += `
## Notes

- Detail pages (\`…/:id\`) open from their lists and are not in the development screen index (\`Alt + D\`).
- The Block Manager shares the Staff work queues (Applications, Inventory, Maintenance) for its Block; the same page then shows the Manager's scope.
- The back office is desktop-only (checked at 1440×900 and 1366×768); the Student portal also has a phone and tablet layout below 1024 px (\`web/README.md\`).
- The wizard steps share SCR-APP-01; the Manager's copies of Staff pages keep the Staff code.
${shared.length ? `- **Screen codes used by two different screens** (from the Figma frame names; settle against Figma before quoting them in a report): ${shared.map(([c, set]) => `${c} → ${[...set].map((p) => `\`${p}\``).join(', ')}`).join('; ')}.\n` : ''}`
  write(join(root, 'docs/web/01_Screen_Map.md'), md)
}

testCatalog()
screenMap()
