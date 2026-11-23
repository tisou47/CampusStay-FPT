// Generates the Markdown tables the reports include (tools/docs/src/_*.md) from tools/docs/data and the git history.
// Run by build.mjs before every build:  node tools/docs/src/partials.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTHORS } from '../gen/parse.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const write = (name, md) => fs.writeFileSync(path.join(here, name), md.trim() + '\n')
const nf = (n) => n.toLocaleString('en-US')

export const FEATURES = [
  // code, name, endpoint feature, table prefix, test code
  ['AUTH', 'Accounts, staff and audit', 'auth', 'auth', 'AUTH'],
  ['CFG', 'Terms and settings', 'setting', 'cfg', 'CFG'],
  ['INV', 'Inventory', 'inventory', 'inv', 'INV'],
  ['APP', 'Applications', 'application', 'app', 'APP'],
  ['ASG', 'Assignment and residence', 'assignment', 'asg', 'ASG'],
  ['BIL', 'Billing', 'billing', 'bil', 'BIL'],
  ['REQ', 'Requests and Term transition', 'request', 'req', 'REQ'],
  ['MNT', 'Maintenance and inspections', 'maintenance', 'mnt', 'MNT'],
  ['NTF', 'Notifications', 'notification', 'ntf', 'NTF'],
  ['RPT', 'Reports', 'report', 'rpt', 'RPT'],
  ['VIS', 'Family Day', 'visitor', 'vis', 'VIS'],
  ['AST', 'AI assistant', 'assistant', 'ast', 'AST'],
]

export function scopeTable() {
  const endpoints = data('endpoints.json')
  const tables = data('schema.json').filter((t) => !t.view)
  const cases = data('tests.json').cases
  const rows = FEATURES.map(([code, name, ep, prefix, tc]) => [
    `${name} (${code})`,
    endpoints.filter((e) => e.feature === ep).length,
    tables.filter((t) => t.prefix === prefix).length,
    new Set(cases.filter((c) => c.id.split('-')[1] === tc).map((c) => c.id)).size,
  ])
  const sum = (i) => rows.reduce((a, r) => a + r[i], 0)
  return [
    '| Feature (code) | Endpoints | Tables | Test ids |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    `| **Total** | **${sum(1)}** (+${endpoints.length - sum(1)} shared) | **${sum(2)}** (+${tables.length - sum(2)} shared) | **${sum(3)}** |`,
  ].join('\n')
}

const AREA = (p) => (p.startsWith('backend/') ? 'backend' : p.startsWith('web/') ? 'web' : p.startsWith('mobile/') ? 'mobile'
  : p.startsWith('docs/') || p.startsWith('tools/') ? 'docs' : p.startsWith('infra/') || p.startsWith('.github/') ? 'infra' : 'other')

/** Per member: commits, active days, changed lines per area, on main (merges left out). */
export function memberStats() {
  const log = execFileSync('git', ['log', 'origin/main', '--no-merges', '--format=%x01%ad%x02%an', '--date=short', '--numstat'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  const by = {}
  let cur = null
  for (const line of log.split('\n')) {
    if (line.startsWith('\x01')) {
      const [d, a] = line.slice(1).split('\x02')
      const m = AUTHORS[a]
      if (!m) { cur = null; continue } // the tool's own commits (Claude) are not a member's work
      cur = by[m] ??= { commits: 0, days: new Set(), lines: {} }
      cur.commits++
      cur.days.add(d)
      continue
    }
    const t = line.split('\t')
    if (t.length < 3 || !cur) continue
    const a = AREA(t[2])
    cur.lines[a] = (cur.lines[a] || 0) + (+t[0] || 0) + (+t[1] || 0)
  }
  return by
}

export function memberTable() {
  const by = memberStats()
  const order = ['Lê Thành Minh Trung', 'Nguyễn Xuân Lộc', 'Võ Minh Luân', 'Trần Võ Quang Duy']
  const areas = ['backend', 'web', 'mobile', 'infra', 'docs']
  return [
    `| Member | Commits | Active days | ${areas.map((a) => `${a} lines`).join(' | ')} |`,
    `|---|---|---|${areas.map(() => '---').join('|')}|`,
    ...order.map((m) => `| ${m} | ${by[m].commits} | ${by[m].days.size} | ${areas.map((a) => nf(by[m].lines[a] || 0)).join(' | ')} |`),
  ].join('\n')
}

/** Who wrote what: changed lines per member for each backend feature package, web portal folder and the mobile app. */
export function ownershipTable() {
  const log = execFileSync('git', ['log', 'origin/main', '--no-merges', '--format=%x01%an', '--numstat'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  const order = ['Lê Thành Minh Trung', 'Nguyễn Xuân Lộc', 'Võ Minh Luân', 'Trần Võ Quang Duy']
  const bucketOf = (p) => {
    let m = p.match(/^backend\/src\/main\/java\/vn\/fpt\/campusstay\/(?:service|controller|repository)\/([a-z]+)\//)
    if (m) return `Backend · ${m[1]}`
    if (/^backend\/src\/main\/resources\/db\/migration\//.test(p)) return 'Backend · database migrations'
    if (/^backend\/src\/test\//.test(p)) return 'Backend · tests'
    m = p.match(/^web\/src\/pages\/([a-z]+)\//)
    if (m) return `Web · ${m[1]} pages`
    if (/^web\/src\/(components|lib|app|api|i18n)\//.test(p)) return 'Web · shared components and i18n'
    if (/^mobile\/lib\//.test(p)) return 'Mobile · Flutter app'
    if (/^(infra|\.github)\//.test(p)) return 'Infrastructure and CI'
    return null
  }
  const b = {}
  let who = null
  for (const line of log.split('\n')) {
    if (line.startsWith('\x01')) { who = AUTHORS[line.slice(1)] ?? null; continue }
    const t = line.split('\t')
    if (t.length < 3 || !who) continue
    const k = bucketOf(t[2])
    if (!k) continue
    ;(b[k] ??= {})[who] = (b[k][who] || 0) + (+t[0] || 0)
  }
  const rows = Object.entries(b).sort((x, y) => x[0].localeCompare(y[0]))
  return [
    '| Area | ' + order.map((m) => m.split(' ').at(-1)).join(' | ') + ' | Main author |',
    '|---|---|---|---|---|---|',
    ...rows.map(([k, v]) => {
      const total = Object.values(v).reduce((a, n) => a + n, 0)
      const top = order.slice().sort((x, y) => (v[y] || 0) - (v[x] || 0))[0]
      return `| ${k} | ${order.map((m) => (v[m] ? `${Math.round((100 * v[m]) / total)} %` : '–')).join(' | ')} | ${top.split(' ').at(-1)} |`
    }),
  ].join('\n')
}

/** One sentence: how many functions and screens of the WBS are Simple, Medium and Complex (tracking.mjs counts them). */
export async function levelsSentence() {
  const { config } = await import('./tracking.mjs')
  const rows = config().sheets[0].rows
  const n = (l) => rows.filter((r) => r[3] === l).length
  return `Result: ${rows.length} functions and screens (${rows.filter((r) => r[1].endsWith('(mobile)')).length} of them in the mobile app), of which ${n('Simple')} are Simple, ${n('Medium')} Medium and ${n('Complex')} Complex.`
}

export function weekTable() {
  const h = data('history.json')
  const order = ['Lê Thành Minh Trung', 'Nguyễn Xuân Lộc', 'Võ Minh Luân', 'Trần Võ Quang Duy']
  return [
    '| Week | Dates | Commits | ' + order.map((m) => m.split(' ').at(-1)).join(' | ') + ' |',
    '|---|---|---|---|---|---|---|',
    ...h.weeks.map((w) => {
      const start = new Date(Date.UTC(2026, 8, 7 + (w.week - 1) * 7))
      const end = new Date(+start + 6 * 86400000)
      const f = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const cnt = (m) => w.commits.filter((c) => AUTHORS[c.author] === m).length
      return `| ${w.week} | ${f(start)}–${f(end)} | ${w.commits.length} | ${order.map(cnt).join(' | ')} |`
    }),
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  write('_scope.md', scopeTable())
  write('_members.md', memberTable())
  write('_weeks.md', weekTable())
  write('_ownership.md', ownershipTable())
  write('_levels.md', await levelsSentence())
  console.log('partials: _scope.md, _members.md, _weeks.md, _ownership.md')
}
