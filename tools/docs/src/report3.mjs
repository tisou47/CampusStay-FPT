// Generates the Markdown parts of Report 3 (SRS) from the code: tools/docs/src/_r3-*.md. Run by build.mjs before the build.
//   node tools/docs/src/report3.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURES } from './partials.mjs'
import { eventListeners, importedServices, javadocBefore, scheduledJobs, validationMessages } from './r3parse.mjs'
import { featureOf, webScreens } from './tracking.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const walk = (d, ext) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), ext) : e.name.endsWith(ext) ? [path.join(d, e.name)] : []))
const JAVA = path.join(root, 'backend/src/main/java/vn/fpt/campusstay')
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const humanize = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')
const ROLES = ['STUDENT', 'STAFF', 'MANAGER', 'ADMIN']
const ROLE_NAME = { STUDENT: 'Student', STAFF: 'Staff', MANAGER: 'Manager', ADMIN: 'Admin' }

export function permissionsTable() {
  return table(['Permission', 'What it allows', ...ROLES.map((r) => ROLE_NAME[r])],
    data('permissions.json').map((p) => [p.permission, p.label, ...ROLES.map((r) => (p.roles.includes(r) ? 'Yes' : ''))]))
}

export function actorsTable() {
  const perms = data('permissions.json')
  const web = data('screens.json').web
  const portalOf = { STUDENT: 'student', STAFF: 'staff', MANAGER: 'manager', ADMIN: 'admin' }
  const who = {
    STUDENT: 'A resident or applicant of the dormitory. Signs in with Google (@fpt.edu.vn) or a password; uses the web app and the Android app.',
    STAFF: 'Dormitory staff of one or more Blocks (desk, maintenance, inspections). Works only inside their Blocks, on the web.',
    MANAGER: 'The dormitory office: works for every Block. Reviews, assigns, confirms payments, runs the Term transition.',
    ADMIN: 'The system administrator: configures Terms, prices, rules, Buildings, users and reads the audit log.',
  }
  return table(['Actor', 'Who', 'Web pages', 'Permissions'],
    ROLES.map((r) => [ROLE_NAME[r], who[r], web.filter((x) => x.portal === portalOf[r]).length, perms.filter((p) => p.roles.includes(r)).length]))
}

export function useCases() {
  const eps = new Set(data('endpoints.json').map((e) => `${e.method} ${e.path.replace(/\{[^}]+\}/g, '{}')}`))
  const list = JSON.parse(fs.readFileSync(path.join(here, 'usecases.json'), 'utf8'))
  const missing = list.flatMap((u) => u.endpoints.filter((e) => !eps.has(e.replace(/\{[^}]+\}/g, '{}'))).map((e) => `${u.id}: ${e}`))
  if (missing.length) throw new Error(`use cases name endpoints that do not exist:\n${missing.join('\n')}`)
  const li = (a) => a.map((x, i) => `${i + 1}. ${x}`).join('<br>')
  return list.map((u) => `**${u.id} ${u.name}**\n\n` + table(['Item', 'Description'], [
    ['Actors', u.actors.join(', ')], ['Feature', FEATURES.find((f) => f[0] === u.feature)?.[1] ?? u.feature],
    ['Trigger', u.trigger], ['Preconditions', u.pre.join('<br>')], ['Main flow', li(u.flow)],
    ['Alternative flows and exceptions', u.alt.join('<br>')], ['Business rules', u.rules.join('<br>')],
    ['Functions (endpoints)', u.endpoints.map((e) => `\`${e}\``).join('<br>')], ['Sequence diagram', `${u.diagram} (Report 4)`],
  ])).join('\n\n')
}

export function screens() {
  const web = webScreens()
  const portals = [['public', 'Public pages'], ['student', 'Student portal'], ['staff', 'Staff portal'], ['manager', 'Manager portal'], ['admin', 'Admin portal']]
  const parts = portals.map(([p, label]) => {
    const rows = web.filter((s) => s.portal === p)
    return `**${label}** (${rows.length} pages)\n\n` + table(['#', 'Screen', 'Route', 'Page title', 'Feature', 'Fields', 'Transactions'],
      rows.map((s, i) => [i + 1, humanize(s.component), `\`${s.path}\``, s.title, featureOf(s.path), s.fields, s.transactions]))
  })
  const mobile = data('screens.json').mobile.filter((m) => m.screen !== 'SubPage')
  parts.push(`**Student mobile app** (${mobile.length} screens)\n\n` + table(['#', 'Screen', 'File'], mobile.map((m, i) => [i + 1, humanize(m.screen.replace(/Screen$/, '')), `\`${m.file}\``])))
  return parts.join('\n\n')
}

export function authorization() {
  const web = data('screens.json').web
  const count = (p) => web.filter((s) => s.portal === p).length
  const portal = table(['Pages', ...ROLES.map((r) => ROLE_NAME[r])], [
    ['Public pages (sign-in, password)', ...ROLES.map(() => `${count('public')}`)],
    ['Student portal', `${count('student')}`, '', '', ''],
    ['Staff portal', '', `${count('staff')}`, '', ''],
    ['Manager portal', '', '', `${count('manager')}`, ''],
    ['Admin portal', '', '', '', `${count('admin')}`],
  ])
  const eps = data('endpoints.json')
  const by = {}
  for (const e of eps) by[e.access] = (by[e.access] || 0) + 1
  const label = { public: 'Public: no sign-in', 'signed in': 'Any signed-in user; the service then checks the permission and the Block', STUDENT: 'Student role (URL rule)', ADMIN: 'Admin role (URL rule)' }
  return `**Web pages by role**\n\n${portal}\n\n**Endpoints by access rule**\n\n` +
    table(['Rule', 'Endpoints'], Object.entries(by).map(([k, v]) => [label[k] ?? k, v]))
}

export function nonScreen() {
  const files = walk(JAVA, '.java')
  const jobs = []
  const listeners = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    const cls = path.basename(f, '.java')
    jobs.push(...scheduledJobs(src, cls))
    listeners.push(...eventListeners(src, cls))
  }
  jobs.sort((a, b) => a.class.localeCompare(b.class))
  listeners.sort((a, b) => a.event.localeCompare(b.event) || a.class.localeCompare(b.class))
  return `**Scheduled jobs** (${jobs.length})\n\n` + table(['Class', 'Method', 'Schedule', 'What it does'], jobs.map((j) => [j.class, j.method, j.schedule, j.description])) +
    `\n\n**Event listeners** (${listeners.length}): a domain event published by one feature and handled by another, in the same transaction or after commit.\n\n` +
    table(['Event', 'Handled by', 'When', 'What it does'], listeners.map((l) => [l.event, `${l.class}.${l.method}`, l.after ? 'after commit' : 'same transaction', l.description]))
}

export function features() {
  const endpoints = data('endpoints.json')
  const messages = data('messages.json')
  const controllerFile = Object.fromEntries(walk(path.join(JAVA, 'controller'), '.java').map((f) => [path.basename(f, '.java'), f]))
  const order = [...FEATURES.map((f) => ({ name: f[1], code: f[0], key: f[2] })), { name: 'Files', code: 'FILE', key: 'file' }]
  let k = 2
  const out = []
  for (const f of order) {
    const eps = endpoints.filter((e) => e.feature === f.key)
    if (!eps.length) continue
    out.push(`### 3.${k} ${f.name} (${f.code})\n\n${eps.length} endpoints in ${new Set(eps.map((e) => e.controller)).size} controllers.`)
    let n = 1
    for (const c of [...new Set(eps.map((e) => e.controller))]) {
      const src = fs.readFileSync(controllerFile[c], 'utf8')
      const doc = javadocBefore(src, src.search(new RegExp(`\\bclass\\s+${c}\\b`)))
      const services = importedServices(src)
      const rules = [...new Map(messages.filter((m) => services.includes(m.source)).map((m) => [m.code ?? m.message, m])).values()]
      const msgs = validationMessages(src)
      out.push(`#### 3.${k}.${n} ${humanize(c.replace(/Controller$/, ''))}\n\n${doc ? `${doc}\n\n` : ''}` +
        `Table: Endpoints of ${humanize(c.replace(/Controller$/, ''))}\n` + table(['Method', 'Path', 'Access', 'Function'], eps.filter((e) => e.controller === c).map((e) => [e.method, `\`${e.path}\``, e.access, humanize(e.handler)])) +
        (msgs.length ? `\n\n*Validation messages:* ${msgs.slice(0, 12).join(' · ')}${msgs.length > 12 ? ` (+${msgs.length - 12} more)` : ''}` : '') +
        (rules.length ? `\n\n*Rules and error conditions (code, message), ${rules.length} in total:*\n\n` +
          table(['Code', 'Message'], rules.slice(0, 10).map((m) => [m.code ?? '', m.message])) + (rules.length > 10 ? `\n\n*+${rules.length - 10} more in section 5.3.*` : '') : ''))
      n++
    }
    k++
  }
  return out.join('\n\n')
}

export function messagesTable() {
  const m = data('messages.json')
  return table(['ID', 'Kind', 'Code', 'English', 'Vietnamese', 'Raised by'],
    m.map((x, i) => [`MSG${String(i + 1).padStart(3, '0')}`, x.kind, x.code ?? '', x.message, x.vi ?? '', x.source]))
}

export function erd() {
  return ['auth', 'cfg', 'inv', 'app', 'asg', 'bil', 'req', 'mnt', 'ntf', 'vis', 'shared']
    .map((p) => `![Logical ERD of the ${p} tables](../../../docs/Diagrams/05_ERD/erd-${p}.png)`).join('\n\n')
}

export function businessRules() {
  const s = data('settings.json')
  const pct = (r) => `${r.percent} %`
  return `**Refund rules** (setting table cfg_refund_rule: the percentage of the money paid that is refunded, and who approves)\n\n` +
    table(['Trigger', 'Rule', 'Refund', 'Approver'], s.refundRules.map((r) => [r.code, r.description, pct(r), r.approver])) +
    `\n\n**Settings** (cfg_parameter, ${s.parameters.length} values the Administrator changes; the value shown is the base value)\n\n` +
    table(['Setting', 'Section', 'Meaning', 'Type', 'Base value'], s.parameters.map((p) => [`\`${p.key}\``, p.section, p.label, p.valueType, p.value]))
}

export function states() {
  const lifecycle = data('states.json').filter((e) => /status$/.test(e.column))
  const machine = new Set(data('machines.json').map((m) => m.name.split('/')[1].replace(/^state-/, '')))
  return table(['Status column', 'Allowed values', 'State diagram'], lifecycle.map((e) => {
    const key = e.column === 'status' ? e.table : `${e.table}-${e.column}`
    return [`${e.table}.${e.column}`, e.states.join(', '), machine.has(key) ? `08_State_Machine/state-${key}` : 'a value list: no change after the insert']
  }))
}

export function writeAll() {
  const out = { 'permissions': permissionsTable(), 'actors': actorsTable(), 'usecases': useCases(), 'screens': screens(), 'authz': authorization(),
    'nonscreen': nonScreen(), 'states': states(), 'features': features(), 'messages': messagesTable(), 'erd': erd() }
  if (fs.existsSync(path.join(root, 'tools/docs/data/settings.json'))) out.rules = businessRules()
  for (const [name, md] of Object.entries(out)) fs.writeFileSync(path.join(here, `_r3-${name}.md`), md.trim() + '\n')
  return Object.keys(out)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`report3 parts: ${writeAll().join(', ')}`)
