// Generated diagram models (ERD, state machines) from tools/docs/data, checked against the code.
//   node tools/docs/diagrams/build.mjs            writes build/models.json for pipeline/drawio.mjs layout; exit 1 on a difference
//   node tools/docs/diagrams/build.mjs --check    the check only
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { erdModels, overviewErd, stateModel, mergeTransitions, missingMethods, unresolved, useCaseModels, screenFlowModels, packageModel, parseJavaType, portModel } from './models.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(here, '../data', f), 'utf8'))
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.java') ? [path.join(d, e.name)] : []))
const sources = Object.fromEntries(walk(path.join(root, 'backend/src/main/java')).map((f) => [path.basename(f, '.java'), f]))

// Lifecycle columns: status-like columns; other enumerations (kind, source, gender …) are value lists, not machines.
const lifecycle = data('states.json').filter((s) => /status$/.test(s.column))
const states = mergeTransitions(lifecycle, JSON.parse(fs.readFileSync(path.join(here, 'transitions.json'), 'utf8')))
const diffs = [
  ...unresolved(states),
  ...missingMethods(states, (cls) => (sources[cls] ? fs.readFileSync(sources[cls], 'utf8') : undefined)),
]
// A machine needs a move: a column no code changes after the insert is documented as a table, not drawn.
const machines = states.map(stateModel).filter((m) => m.edges.length > 1)
for (const m of machines) {
  for (const n of m.nodes.filter((x) => x.shape === 'state' && !m.edges.some((e) => e.to === x.id))) {
    diffs.push(`${m.name}: no way into ${n.id} (missing INSERT or transition)`)
  }
}

// Use cases: the permissions, plus the Student goals of Student-only controllers.
const endpoints = data('endpoints.json')
const { _comment, ...goals } = JSON.parse(fs.readFileSync(path.join(here, 'student-goals.json'), 'utf8'))
for (const c of Object.keys(goals)) {
  if (!endpoints.some((e) => e.controller === c && e.access === 'STUDENT')) diffs.push(`student-goals: ${c} has no Student-only endpoint`)
}
const useCases = useCaseModels(data('permissions.json'), { STUDENT: Object.values(goals) })

// Mobile screen flow: in each Dart class, the screens it builds (push(context, X()), tabs, => X(); the deep-link
// table of links.dart opens screens from a notification).
const dartFiles = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? dartFiles(path.join(d, e.name)) : e.name.endsWith('.dart') ? [path.join(d, e.name)] : []))
const screens = data('screens.json')
const names = new Set(screens.mobile.map((s) => s.screen))
const links = []
for (const f of dartFiles(path.join(root, 'mobile/lib'))) {
  const src = fs.readFileSync(f, 'utf8')
  const classes = [...src.matchAll(/^class (\w+)/gm)]
  for (const m of src.matchAll(/(?<!class |extends |\w)(\w+Screen|\w+Page)\(/g)) {
    if (m[1] === 'SubPage') continue // the page frame every sub-screen uses, not a screen
    const before = classes.filter((c) => c.index < m.index).map((c) => c[1].replace(/^_/, '').replace(/State$/, ''))
    // A State class belongs to its widget (_FooScreenState → FooScreen); a helper widget (Detail, HandoverCard …) to
    // the screen declared before it in its file; links.dart has no class: notification links.
    // shortcut: "the screen before it" assumes helpers follow their screen in the file; check the PNG if files change.
    const from = path.basename(f) === 'links.dart' ? 'Notification link'
      : before.findLast((c) => names.has(c)) && !names.has(before.at(-1)) && !['Shell', 'CampusStayApp'].includes(before.at(-1))
        ? before.findLast((c) => names.has(c)) : before.at(-1)
    if (from && from !== m[1] && names.has(m[1]) && !links.some((l) => l.from === from && l.to === m[1])) links.push({ from, to: m[1] })
  }
}
const flows = screenFlowModels({ ...screens, mobile: screens.mobile.filter((s) => s.screen !== 'SubPage') }, links)
const routes = new Set(flows.flatMap((m) => m.nodes.map((n) => n.id)))
// The not-found page and /dev/* (a developer page) are not screens of the flow.
for (const r of screens.web.filter((x) => x.path !== '/*' && !x.path.startsWith('/dev/'))) if (!routes.has(r.path)) diffs.push(`screen flow: route ${r.path} missing`)

// Packages: top-level packages of vn.fpt.campusstay and the ones each imports.
const base = path.join(root, 'backend/src/main/java/vn/fpt/campusstay')
const pkgOf = (f) => path.relative(base, f).split(path.sep)[0]
const imports = {}
for (const f of Object.values(sources)) {
  const p = pkgOf(f)
  if (p.endsWith('.java')) continue
  imports[p] ??= []
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/^import vn\.fpt\.campusstay\.(\w+)\./gm)) {
    if (m[1] !== p && !imports[p].includes(m[1])) imports[p].push(m[1])
  }
}
const packages = packageModel(imports)

// Class diagrams: the JPA entities; each feature's ports (interfaces) with the classes implementing them.
const types = Object.values(sources).filter((f) => /[\\/](entity|service)[\\/]/.test(f)).flatMap((f) => {
  try {
    return [{ ...parseJavaType(fs.readFileSync(f, 'utf8')), pkg: path.basename(path.dirname(f)), layer: pkgOf(f) }]
  } catch { return [] } // shortcut: a file without a top-level class/interface (none today) is skipped
})
const entities = types.filter((t) => t.layer === 'entity')
const entityModel = {
  name: '06_Class/entities', kind: 'flow', dir: 'RIGHT', title: 'Class diagram: JPA entities',
  nodes: entities.map((t) => ({ id: t.name, shape: 'class', name: t.name, stereotype: 'entity', fields: t.fields, methods: t.methods.slice(0, 14) })),
  // The entities refer to each other by id (userId → UserEntity).
  edges: entities.flatMap((t) => t.fields.map((f) => f.split(': ')[0].match(/^(\w+)Id$/)?.[1])
    .map((n) => n && `${n[0].toUpperCase()}${n.slice(1)}Entity`).filter((e) => e && e !== t.name && entities.some((x) => x.name === e))
    .map((e) => ({ from: t.name, to: e, arrow: 'open', label: 'N..1' }))),
}
const features = [...new Set(types.filter((t) => t.layer === 'service' && t.kind === 'interface').map((t) => t.pkg))].sort()
const portModels = features.map((f) => portModel(f, types.filter((t) => t.layer === 'service'))).filter((m) => m.nodes.length)

// Drawn diagrams: every Class.method, class participant and "METHOD /path" they name must be in the code.
const { drawn } = await import('./drawn.mjs')
const routeKey = (m, p) => `${m} ${p.replace(/\{[^}]+\}/g, '{}')}`
const apiRoutes = new Set(endpoints.map((e) => routeKey(e.method, e.path)))
const srcOf = (cls) => (sources[cls] ? fs.readFileSync(sources[cls], 'utf8') : undefined)
for (const d of drawn) {
  const texts = [...(d.items ?? []).map((i) => i.text ?? i.label ?? ''), ...(d.nodes ?? []).map((n) => n.label ?? ''),
    ...(d.edges ?? []).map((e) => e.label ?? '')]
  for (const p of d.participants ?? []) {
    if (/^[A-Z]\w+(Service|Controller|Store|Listener|Job|Gate|Verifier|Exchanger|SignUp|Model)$/.test(p.label) && !srcOf(p.label)) diffs.push(`${d.name}: no class ${p.label}`)
  }
  for (const t of texts) {
    for (const m of t.matchAll(/\b([A-Z][A-Za-z0-9]+)\.([a-z]\w*)\b/g)) {
      const src = srcOf(m[1])
      if (!src) diffs.push(`${d.name}: no class ${m[1]} (${m[0]})`)
      else if (!new RegExp(`\\b${m[2]}\\s*\\(`).test(src)) diffs.push(`${d.name}: no method ${m[0]}`)
    }
    for (const m of t.matchAll(/\b(GET|POST|PUT|PATCH|DELETE) (\/[\w\-/{}]+)/g)) {
      if (!apiRoutes.has(routeKey(m[1], m[2]))) diffs.push(`${d.name}: no endpoint ${m[1]} ${m[2]}`)
    }
  }
}
if (!process.argv.includes('--check')) {
  const out = path.join(here, '../build/models.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  // The whole system at entity level: the main entity of each feature and the ones they hang on.
  const MAIN = ['auth_user', 'auth_student', 'cfg_term', 'cfg_room_type', 'cfg_room_class', 'inv_building', 'inv_room', 'inv_bed',
    'inv_furniture_item', 'app_application', 'asg_allocation', 'asg_stay', 'asg_handover', 'asg_check_out', 'bil_invoice',
    'bil_payment_claim', 'bil_payment', 'bil_refund', 'bil_meter_reading', 'req_room_change', 'req_swap', 'mnt_request',
    'mnt_inspection_run', 'ntf_notification', 'vis_family_day', 'vis_registration', 'vis_visitor']
  // Feature tree (Report 1 §6.1): the product, its features FE-nn and their functions, read from the report itself.
  const r1 = fs.readFileSync(path.join(here, '../src/Report1.md'), 'utf8')
  const tree = { name: '11_Feature_Tree/feature-tree', kind: 'flow', title: 'Feature tree', dir: 'LR', nodes: [{ id: 'root', label: 'CampusStay FPT', shape: 'menu' }], edges: [] }
  for (const f of r1.slice(r1.indexOf('### 6.1'), r1.indexOf('### 6.2')).split(/\n(?=- \*\*FE-)/).slice(1)) {
    const head = f.match(/^- \*\*(FE-\d+) ([^:*]+?)(?: \(\w+\))?:\*\*/)
    if (!head) continue
    tree.nodes.push({ id: head[1], label: `${head[1]}\n${head[2]}`, shape: 'rect' })
    tree.edges.push({ from: 'root', to: head[1] })
    f.split('\n').filter((l) => /^ {2}- /.test(l)).forEach((l, i) => {
      const text = l.replace(/^ {2}- /, '').split(/[;:,(]/)[0].trim().replace(/\.$/, '')
      tree.nodes.push({ id: `${head[1]}-${i}`, label: text.charAt(0).toUpperCase() + text.slice(1), shape: 'round' })
      tree.edges.push({ from: head[1], to: `${head[1]}-${i}` })
    })
  }
  fs.writeFileSync(out, JSON.stringify([...erdModels(data('schema.json')), overviewErd(data('schema.json'), MAIN), tree, ...machines, ...useCases, ...flows, packages, entityModel, ...portModels, ...drawn], null, 1))
  fs.writeFileSync(path.join(here, '../data/machines.json'), JSON.stringify(machines.map((m) => ({
    name: m.name, title: m.title, notWritten: m.notWritten,
    transitions: m.edges.filter((e) => e.label).map((e) => `${e.from} → ${e.to} (${e.label})`),
  })), null, 1))
  console.log(`models.json: ${machines.length} state machines + ERDs`)
}
diffs.forEach((d) => console.log(`DIFF ${d}`))
console.log(`${diffs.length} differences`)
process.exit(diffs.length ? 1 : 0)
