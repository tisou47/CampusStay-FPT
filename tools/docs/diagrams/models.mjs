// Diagram models generated from tools/docs/data (the code), laid out by pipeline/drawio.mjs.

/** Table prefixes (backend/CLAUDE.md feature codes) and the area each ERD covers. */
export const AREAS = {
  auth: 'Accounts, staff and reconciliation (AUTH)',
  cfg: 'Configuration, Terms and prices (CFG)',
  inv: 'Inventory: Blocks, Rooms, Beds, furniture, door codes (INV)',
  app: 'Applications (APP)',
  asg: 'Assignment, Allocations, stays and the desk (ASG)',
  bil: 'Billing: Invoices, claims, refunds, utility (BIL)',
  req: 'Requests: room changes, swaps, stay requests, routing (REQ)',
  mnt: 'Maintenance and inspections (MNT)',
  ntf: 'Notifications and email (NTF)',
  vis: 'Family Day visitors (VIS)',
  shared: 'Shared: audit log and files',
}

const fkColumn = (def) => def.match(/FOREIGN KEY \(([^)]+)\)/)?.[1] ?? ''
const pkColumns = (t) => (t.constraints.find((c) => c.type === 'PK')?.def.match(/PRIMARY KEY \(([^)]+)\)/)?.[1] ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

/** One logical ERD (Chen notation) per area: its tables, every foreign key as a relationship; tables of other areas
 *  that are referenced appear as external entities. */
export function erdModels(schema) {
  const tables = schema.filter((t) => !t.view)
  return Object.entries(AREAS).flatMap(([prefix, title]) => {
    const mine = tables.filter((t) => t.prefix === prefix)
    if (!mine.length) return []
    const relationships = []
    const external = new Set()
    for (const t of mine) {
      for (const fk of t.constraints.filter((c) => c.type === 'FK' && c.refTable)) {
        const cols = fkColumn(fk.def)
        const pk = pkColumns(t)
        const one = pk.length === 1 && pk[0] === cols
        relationships.push({
          id: `${t.name}.${cols}`, label: cols.split(',')[0].trim().replace(/_id$/, '').replace(/_/g, ' '),
          from: t.name, fromCard: one ? '1' : 'N', to: fk.refTable, toCard: '1',
        })
        if (!mine.some((m) => m.name === fk.refTable)) external.add(fk.refTable)
      }
    }
    const entities = [
      ...mine.map((t) => ({ id: t.name, label: t.name, attributes: t.columns.filter((c) => !c.name.endsWith('_id') || pkColumns(t).includes(c.name))
        .slice(0, 8).map((c) => ({ name: c.name, key: pkColumns(t).includes(c.name) })) })),
      ...[...external].map((x) => ({ id: x, label: x, attributes: [], external: true })),
    ]
    return [{ name: `05_ERD/erd-${prefix}`, kind: 'chen', title: `Logical ERD: ${title}`, entities, relationships }]
  })
}

const humanize = (s) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** A state machine of one enumerated status column: the states of its CHECK, an edge per transition written in the
 *  code (labelled with the method), the first state as the initial one, and a final node after each state no code
 *  moves out of. */
export function stateModel(entry) {
  const edges = [{ from: 'initial', to: entry.states[0] }]
  const seen = new Set()
  for (const t of entry.transitions) {
    const label = t.by.split('.').at(-1)
    for (const f of t.from) {
      const from = f === '(created)' ? 'initial' : f
      if (from === t.to || (from !== 'initial' && !entry.states.includes(from)) || !entry.states.includes(t.to)) continue
      const key = `${from}>${t.to}:${label}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from, to: t.to, label })
    }
  }
  const written = entry.states.filter((s) => edges.some((e) => e.from === s || e.to === s))
  const leaves = written.filter((s) => !edges.some((e) => e.from === s))
  for (const s of leaves) if (s !== entry.states[0]) edges.push({ from: s, to: 'final' })
  const nodes = [{ id: 'initial', shape: 'initial', label: '' },
    ...written.map((s) => ({ id: s, shape: 'state', label: humanize(s) })),
    ...(edges.some((e) => e.to === 'final') ? [{ id: 'final', shape: 'final', label: '' }] : [])]
  const notWritten = entry.states.filter((s) => !written.includes(s))
  if (notWritten.length) {
    nodes.push({ id: 'note', shape: 'note', label: `Allowed by the database, not set by the current code: ${notWritten.map(humanize).join(', ')}` })
  }
  return {
    name: `08_State_Machine/state-${entry.table}${entry.column === 'status' ? '' : `-${entry.column}`}`,
    kind: 'state', dir: 'LR', title: `State machine: ${entry.table}.${entry.column}`, nodes, edges,
    notWritten,
  }
}

const keyOf = (s) => (s.column === 'status' ? s.table : `${s.table}.${s.column}`)

/** Adds the transitions read from the code by hand ({ table | table.column: [{ from, to, by, ignore? }] }) to the
 *  generated ones. A hand-read one with the same by and to replaces the generated one (whose from the generator could
 *  not see); ignore: true drops it (demo-data tools, not the product). */
export function mergeTransitions(states, extra) {
  return states.map((s) => {
    const mine = extra[keyOf(s)] ?? []
    const all = s.transitions.filter((t) => !mine.some((x) => x.by === t.by && x.to === t.to
      && (x.ignore || !t.from.length || x.from.join() === t.from.join())))
    for (const t of mine) if (!t.ignore) all.push(t)
    return { ...s, transitions: all }
  })
}

/** Differences between the state machines and the code: transitions whose from is still unknown. */
export function unresolved(states) {
  return states.flatMap((s) => s.transitions.filter((t) => !t.from.length).map((t) => `${keyOf(s)}: → ${t.to} by ${t.by} (from unknown)`))
}

/** Transitions whose "Class.method" is not in the code: sourceOf(cls) gives the class's source or undefined. */
export function missingMethods(states, sourceOf) {
  const out = []
  for (const s of states) {
    for (const t of s.transitions) {
      const [cls, method] = t.by.split('.')
      const src = sourceOf(cls)
      if (!src) out.push(`${s.table}: ${t.by} (no class ${cls})`)
      else if (!new RegExp(`\\b${method}\\s*\\(`).test(src)) out.push(`${s.table}: ${t.by} (no method ${method} in ${cls})`)
    }
  }
  return out
}
