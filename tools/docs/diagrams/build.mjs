// Generated diagram models (ERD, state machines) from tools/docs/data, checked against the code.
//   node tools/docs/diagrams/build.mjs            writes build/models.json for pipeline/drawio.mjs layout; exit 1 on a difference
//   node tools/docs/diagrams/build.mjs --check    the check only
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { erdModels, stateModel, mergeTransitions, missingMethods, unresolved } from './models.mjs'

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
if (!process.argv.includes('--check')) {
  const out = path.join(here, '../build/models.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify([...erdModels(data('schema.json')), ...machines], null, 1))
  fs.writeFileSync(path.join(here, '../data/machines.json'), JSON.stringify(machines.map((m) => ({
    name: m.name, title: m.title, notWritten: m.notWritten,
    transitions: m.edges.filter((e) => e.label).map((e) => `${e.from} → ${e.to} (${e.label})`),
  })), null, 1))
  console.log(`models.json: ${machines.length} state machines + ERDs`)
}
diffs.forEach((d) => console.log(`DIFF ${d}`))
console.log(`${diffs.length} differences`)
process.exit(diffs.length ? 1 : 0)
