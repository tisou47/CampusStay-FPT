// Generated diagram models (ERD, state machines) from tools/docs/data, checked against the code.
//   node tools/docs/diagrams/build.mjs            writes build/models.json for pipeline/drawio.mjs layout; exit 1 on a difference
//   node tools/docs/diagrams/build.mjs --check    the check only
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { erdModels, stateModel, mergeTransitions, missingMethods, unresolved, useCaseModels, screenFlowModels, packageModel } from './models.mjs'

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
if (!process.argv.includes('--check')) {
  const out = path.join(here, '../build/models.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify([...erdModels(data('schema.json')), ...machines, ...useCases, ...flows, packages], null, 1))
  fs.writeFileSync(path.join(here, '../data/machines.json'), JSON.stringify(machines.map((m) => ({
    name: m.name, title: m.title, notWritten: m.notWritten,
    transitions: m.edges.filter((e) => e.label).map((e) => `${e.from} → ${e.to} (${e.label})`),
  })), null, 1))
  console.log(`models.json: ${machines.length} state machines + ERDs`)
}
diffs.forEach((d) => console.log(`DIFF ${d}`))
console.log(`${diffs.length} differences`)
process.exit(diffs.length ? 1 : 0)
