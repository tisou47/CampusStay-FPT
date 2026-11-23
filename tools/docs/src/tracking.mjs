// Fills the Project Tracking workbook (docs/SEP490_Report/Report3_Project Tracking.xlsx) from the code:
//   node tools/docs/src/tracking.mjs
// WBS: one row per web page and mobile screen (level by the template's rule: fields / transactions counted in the
// source). Issues: the project risks of Report 2 that were met. Defects: every finding of the code review
// (review/findings.json, outside the repository: D:\Projects\CampusStay\review), Closed when a fix wave merged it.
import { TEMPLATE_BASE } from '../base.mjs'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { weekOf } from '../gen/parse.mjs'
import { pageHeader } from './r3parse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const REVIEW = process.env.REVIEW_DIR ?? 'D:/Projects/CampusStay/review'
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const walk = (d, ext) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), ext) : e.name.endsWith(ext) ? [path.join(d, e.name)] : []))

/** The template's rule: simple <= 7 fields and <= 3 transactions, medium <= 15 and <= 7, else complex. */
export const levelOf = (fields, transactions) => (fields > 15 || transactions > 7 ? 'Complex' : fields > 7 || transactions > 3 ? 'Medium' : 'Simple')

/** The feature (Report 1, section 6.1) a route or screen belongs to, by words of its path. */
const FEATURE_RULES = [
  [/family[-_ ]?day|visitor/, 'Family Day'],
  [/assistant/, 'AI assistant'],
  [/term-request|registration-period|terms\b|wizard|system-parameters|policies|settings|block-settings|deadline|fees|eligibility|matching|demo/, 'Terms and settings'],
  [/next-term|room-change|swap|stay|requests|transition/, 'Requests and Term transition'],
  [/maintenance|inspection|escalation|routing/, 'Maintenance and inspections'],
  [/invoice|payment|finance|refund|meter|utility/, 'Billing'],
  [/check-in|check-out|handover|termination|moves|reconciliation|turnover|assignment|proposal|round-2|round2|allocation|my-room|\/room\b/, 'Assignment and residence'],
  [/application|apply|roommate|registration/, 'Applications'],
  [/inventory|rooms|door-code|furniture|room-class|building|catalogue|blocks/, 'Inventory'],
  [/announcement|notification|message|email/, 'Notifications'],
  [/report|dashboard|occupancy|search|overview|home|^\/(student|staff|manager|admin)$/, 'Reports and dashboards'],
  [/student|staff|user|account|signin|password|verification|audit|shift|schedule|profile|activity/, 'Accounts'],
]
export const featureOf = (p) => FEATURE_RULES.find(([re]) => re.test(p.toLowerCase()))?.[1] ?? 'Common'

const humanize = (c) => c.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\bI D\b/, 'ID')

function firstWeeks(paths) {
  const log = execFileSync('git', ['log', 'origin/main', '--no-merges', '--diff-filter=A', '--format=%x01%ad', '--date=short', '--name-only', '--', ...paths],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  const first = {}
  let date = null
  for (const line of log.split('\n')) {
    if (line.startsWith('\x01')) { date = line.slice(1); continue }
    if (line.trim() && date) first[line.trim()] = date // log runs newest first: the last assignment is the oldest
  }
  return first
}

/** Every routed web page with its source file, counted fields and transactions, and its header (title, subtitle). */
export function webScreens() {
  const screens = data('screens.json')
  const web = walk(path.join(root, 'web/src'), '.jsx').map((f) => path.relative(root, f).replaceAll('\\', '/'))
  const text = Object.fromEntries(web.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]))
  return screens.web.filter((r) => r.path !== '/*' && !r.path.startsWith('/dev/')).map((r) => {
    const file = web.find((f) => path.basename(f, '.jsx') === r.component) ?? web.find((f) => new RegExp(`function ${r.component}\\b`).test(text[f]))
    const src = file ? text[file] : ''
    return {
      ...r, file,
      fields: (src.match(/<(Field|Select|Input|input|textarea|DateField|DateTimeField|TimeField|NumberField|Checkbox)\b/g) ?? []).length,
      transactions: (src.match(/useMutation\(/g) ?? []).length,
      ...pageHeader(src),
    }
  })
}

function wbsRows() {
  const screens = data('screens.json')
  const first = firstWeeks(['web/src', 'mobile/lib'])
  const rows = []
  for (const r of webScreens()) {
    const { fields, transactions: tx, file } = r
    const week = file && first[file] ? weekOf(first[file]) : null
    rows.push([humanize(r.component) + ` (${r.portal === 'public' ? 'web' : `web, ${r.portal}`})`, featureOf(r.path), levelOf(fields, tx),
      `${r.path} · fields: ${fields}, transactions: ${tx}`, week ? `Week ${week}` : '', 'Done'])
  }
  const dart = {}
  for (const s of screens.mobile.filter((x) => x.screen !== 'SubPage')) {
    const file = path.join(root, 'mobile/lib', s.file)
    dart[s.file] ??= fs.readFileSync(file, 'utf8')
    const src = dart[s.file]
    const start = src.search(new RegExp(`^class ${s.screen}\\b`, 'm'))
    const rest = start < 0 ? '' : src.slice(start + 1)
    const end = rest.search(/^class (?!_?\w*State\b)/m)
    const body = start < 0 ? '' : src.slice(start, end < 0 ? undefined : start + 1 + end)
    const fields = (body.match(/\b(TextField|TextFormField|DropdownButtonFormField|DropdownButton|Checkbox|Switch)\(/g) ?? []).length
    const tx = (body.match(/Api\.(post|put|patch|delete)\(/g) ?? []).length
    const rel = `mobile/lib/${s.file}`
    rows.push([humanize(s.screen.replace(/Screen$/, '')) + ' (mobile)', featureOf(`/${s.file.replace(/\.dart$/, '')} ${s.screen}`), levelOf(fields, tx),
      `${s.file} · fields: ${fields}, transactions: ${tx}`, first[rel] ? `Week ${weekOf(first[rel])}` : '', 'Done'])
  }
  return rows.map((r, i) => [i + 1, ...r])
}

function defectRows() {
  const o = JSON.parse(fs.readFileSync(path.join(REVIEW, 'findings.json'), 'utf8'))
  const closed = new Set(['wave1.json', 'wave2.json'].flatMap((f) => JSON.parse(fs.readFileSync(path.join(REVIEW, f), 'utf8')).map((x) => x.id)))
  const sev = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, IDEA: 4 }
  return o.findings.slice().sort((a, b) => sev[a.sev] - sev[b.sev] || a.id.localeCompare(b.id)).map((f) => [
    o.areas[f.area] ?? f.area, `${f.id} · ${path.basename(f.file.split(':')[0])}`, 'Code review (Claude Code, run by the leader)',
    `[${f.sev}] ${f.title}`, closed.has(f.id) ? 'Trung' : '', closed.has(f.id) ? 'Closed' : 'Pending',
    closed.has(f.id) ? 'Fixed and merged (wave 1 or 2)' : f.sev === 'CRITICAL' ? 'Waits for a production change (Report 2, R-07)' : 'Deferred after the defense',
  ])
}

// The risks of Report 2 that were met; dates only where the history gives them.
const ISSUES = [
  ['Azure for Students limits (credit, throttled B-series VM)', 'The API slows down or stops during a demo', 'Medium', 'Trung', '', '', 'Open', 'Budget alert and weekly checks in the runbook'],
  ['One VM and one database server', 'Downtime or lost data', 'Medium', 'Trung', '', '', 'Open', 'Azure backups; backup before each deploy'],
  ['Delivery pipeline gaps: web without CI gate, SSH key trusted on first use, no rollback point (REPO-02, 04, 05)', 'A broken release reaches production', 'High', 'Trung', '22/11/2026', '23/11/2026', 'Closed', 'Fixed in waves 1 and 2'],
  ['Knowledge concentrated in the leader (Report 2, section 4)', 'Members cannot explain parts of the system', 'High', 'All members', '', '', 'Open', 'Each member prepares their areas and one workflow before Defense 1.1'],
  ['Demo accounts with a known password in production (BE-AUTH-01)', 'Anyone could sign in as a demo Manager or Admin', 'High', 'Trung', '22/11/2026', '', 'Open', 'Needs a production change approved by the leader'],
  ['No rate limit on sign-in (BE-AUTH-02)', 'Demo accounts locked during the demo', 'High', 'Trung', '22/11/2026', '22/11/2026', 'Closed', 'Limiter in wave 1'],
  ['The AI assistant needs a model server', 'The assistant is unavailable', 'Low', 'Luân', '', '', 'Open', 'Switched off when no server is configured'],
]

export function config() {
  const wbs = wbsRows()
  return {
    template: 'tools/docs/build/tpl/Report3_Project Tracking.xlsx',
    out: 'docs/SEP490_Report/Report3_Project Tracking.xlsx',
    sheets: [
      { name: 'WBS', startRow: 8, startCol: 1, templateRows: 15, rows: wbs },
      { name: 'Issues', startRow: 4, startCol: 1, rows: ISSUES.map((r, i) => [i + 1, ...r]) },
      { name: 'Defects', startRow: 4, startCol: 1, rows: defectRows() },
      { name: 'Q&A', startRow: 4, startCol: 1, rows: [['', '', '', 'Medium', 'Open', 'Questions to the supervisor are not kept in the repository: the team fills this sheet (docs/SEP490_Report/TEAM-TODO.md)']] },
    ],
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = TEMPLATE_BASE
  const tpl = 'docs/SEP490_Report/Report3_Project Tracking.xlsx'
  fs.mkdirSync(path.join(root, 'tools/docs/build/tpl'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tools/docs/build/tpl/Report3_Project Tracking.xlsx'), execFileSync('git', ['show', `${base}:${tpl}`], { cwd: root, maxBuffer: 1 << 28 }))
  const cfg = config()
  const out = path.join(root, 'tools/docs/build/tracking.json')
  fs.writeFileSync(out, JSON.stringify(cfg))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/docs/pipeline/fill-workbook.ps1'), '-Config', out], { cwd: root, stdio: 'inherit' })
  const by = {}
  for (const r of cfg.sheets[0].rows) by[r[3]] = (by[r[3]] || 0) + 1
  console.log('WBS levels', by)
}
