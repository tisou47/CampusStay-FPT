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
  // Rows start where an INSERT puts them; when none is known, at the first state of the CHECK.
  const created = entry.transitions.some((t) => t.from.includes('(created)'))
  const edges = created ? [] : [{ from: 'initial', to: entry.states[0] }]
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
    const entries = extra[keyOf(s)] ?? []
    // { state, neverWritten: true }: the code only filters on that state (WHERE status IN …), nothing sets it.
    const never = new Set(entries.filter((x) => x.neverWritten).map((x) => x.state))
    const mine = entries.filter((x) => !x.neverWritten)
    const all = s.transitions.filter((t) => !mine.some((x) => x.by === t.by && x.to === t.to
      && (x.ignore || !t.from.length || x.from.join() === t.from.join())))
    for (const t of mine) if (!t.ignore) all.push(t)
    // A transition whose only origins were never-written states goes; an unknown from (empty) stays, to be reported.
    const kept = all.filter((t) => !never.has(t.to) && (!t.from.length || t.from.some((f) => !never.has(f))))
    return { ...s, transitions: kept.map((t) => ({ ...t, from: t.from.filter((f) => !never.has(f)) })) }
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
      const [cls, call] = t.by.split('.')
      const method = call.replace(/\(.*/, '') // on(DepositPaid) → on
      const src = sourceOf(cls)
      if (!src) out.push(`${s.table}: ${t.by} (no class ${cls})`)
      else if (!new RegExp(`\\b${method}\\s*\\(`).test(src)) out.push(`${s.table}: ${t.by} (no method ${method} in ${cls})`)
    }
  }
  return out
}

const ROLES = { STUDENT: 'Student', STAFF: 'Staff', MANAGER: 'Manager', ADMIN: 'Admin' }

/** One use-case diagram per role: the permissions the role holds (Permission enum), plus goals given by role-only
 *  endpoints (extra: { ROLE: [label] }). */
export function useCaseModels(permissions, extra = {}) {
  return Object.entries(ROLES).map(([role, actor]) => {
    const goals = [...permissions.filter((p) => p.roles.includes(role)).map((p) => p.label), ...(extra[role] ?? [])]
    return {
      name: `02_Use_Case/usecase-${role.toLowerCase()}`, kind: 'usecase', title: `Use cases: ${actor}`,
      groups: [{ id: 'system', label: 'CampusStay FPT' }],
      nodes: [{ id: 'actor', shape: 'actor', label: actor }, ...goals.map((g, i) => ({ id: `uc${i}`, shape: 'usecase', label: g }))],
      edges: goals.map((_, i) => ({ from: 'actor', to: `uc${i}`, arrow: 'none' })),
    }
  })
}

/** Screen flows: per web portal the routes as a tree (a route under its longest parent route, the portal home under
 *  sign-in); for the mobile app the screens and the screen each one opens (links: [{ from, to }]). */
export function screenFlowModels(screens, links) {
  const portals = [...new Set(screens.web.map((r) => r.portal))].filter((p) => p !== 'public')
  const label = (r) => `${r.component}\n${r.path}`
  const web = portals.map((portal) => {
    const routes = screens.web.filter((r) => r.portal === portal)
    const signIn = screens.web.find((r) => r.path === '/signin')
    const edges = []
    for (const r of routes) {
      const parent = routes.filter((p) => p !== r && r.path.startsWith(`${p.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
      if (parent) edges.push({ from: parent.path, to: r.path })
      else if (signIn) edges.push({ from: signIn.path, to: r.path })
    }
    return {
      name: `10_Screen_Flow/screens-${portal}`, kind: 'flow', dir: 'LR', title: `Screen flow: ${portal} portal (web)`,
      nodes: [...(signIn ? [{ id: signIn.path, shape: 'stadium', label: label(signIn) }] : []),
        ...routes.map((r) => ({ id: r.path, shape: 'round', label: label(r) }))],
      edges,
    }
  })
  // Public pages: sign-in and the password pages reached from it or from an emailed link (not-found and /dev/* left out).
  const open = screens.web.filter((r) => r.portal === 'public' && r.path !== '/*' && !r.path.startsWith('/dev/'))
  const pub = {
    name: '10_Screen_Flow/screens-public', kind: 'flow', dir: 'LR', title: 'Screen flow: public pages (web)',
    nodes: open.map((r) => ({ id: r.path, shape: r.path === '/signin' ? 'stadium' : 'round', label: label(r) })),
    edges: open.filter((r) => r.path !== '/signin').map((r) => ({ from: '/signin', to: r.path })),
  }
  const isScreen = (id) => screens.mobile.some((s) => s.screen === id)
  const mine = links.filter((l) => l.from !== l.to && isScreen(l.to))
  // Sources that are not screens (the app shell, notification links) are drawn too, as launchers.
  const launchers = [...new Set(mine.map((l) => l.from).filter((f) => !isScreen(f)))]
  const mobile = {
    name: '10_Screen_Flow/screens-mobile', kind: 'flow', dir: 'LR', title: 'Screen flow: student mobile app',
    nodes: [...launchers.map((l) => ({ id: l, shape: 'stadium', label: l })),
      ...screens.mobile.map((s) => ({ id: s.screen, shape: s.screen === 'SignInScreen' ? 'stadium' : 'round', label: `${s.screen}\n${s.file}` }))],
    edges: mine,
  }
  return [pub, ...web, mobile]
}

/** The backend's top-level packages and which ones each imports (imports: { pkg: [pkg] }). */
export function packageModel(imports) {
  // The layers (ADR-17) carry the edges; every layer uses the shared packages, so those edges would only be noise.
  const LAYERS = ['controller', 'service', 'repository', 'entity']
  const inLayers = (p) => LAYERS.includes(p)
  return {
    name: '04_Package/packages', kind: 'flow', dir: 'DOWN', title: 'Package diagram: backend (vn.fpt.campusstay)',
    groups: [{ id: 'layers', label: 'Layers' }, { id: 'shared', label: 'Shared (used by every layer)' }],
    nodes: Object.keys(imports).map((p) => ({ id: p, shape: 'menu', label: p, parent: inLayers(p) ? 'layers' : 'shared' })),
    edges: Object.entries(imports).filter(([from]) => inLayers(from))
      .flatMap(([from, tos]) => tos.filter(inLayers).map((to) => ({ from, to, dashed: true, arrow: 'open' }))),
  }
}

/** The members of a top-level Java class or interface, at class level only (4-space indent): non-static fields,
 *  public methods (interface: every method), and what it implements. */
export function parseJavaType(src) {
  const head = src.match(/(?:public\s+)?(?:abstract\s+|final\s+)*(class|interface|record)\s+(\w+)[^{]*\{/)
  const impl = head[0].match(/implements\s+([\w\s,<>]+)\{/)?.[1].split(',').map((s) => s.trim().replace(/<.*/, '')).filter(Boolean) ?? []
  const iface = head[1] === 'interface'
  const fields = [...src.matchAll(/^ {4}(?:(?:private|protected|public)\s+)?(?:final\s+)?([A-Za-z][\w.<>, ?]*?)\s+(\w+)\s*(?:=[^;]*)?;/gm)]
    .filter((m) => !/\(|\bstatic\b/.test(m[0]) && !/^(return|throw)$/.test(m[1])).map((m) => `${m[2]}: ${m[1].trim()}`)
  const methods = [...src.matchAll(iface
    ? /^ {4}(?:default\s+|static\s+)?(?!record\b|class\b|enum\b|interface\b)[\w.<>, ?[\]]+\s+(\w+)\s*\(/gm
    : /^ {4}public\s+(?!record\b|class\b|enum\b|interface\b)(?:static\s+)?[\w.<>, ?[\]]+\s+(\w+)\s*\(/gm)].map((m) => `${m[1]}()`)
  return { name: head[2], kind: iface ? 'interface' : 'class', fields: iface ? [] : fields, methods: [...new Set(methods)], implements: impl }
}

/** Class diagram of one feature's ports: the interfaces declared in service/<feature> and the classes (any feature)
 *  that implement them. */
export function portModel(feature, types) {
  const ports = types.filter((t) => t.kind === 'interface' && t.pkg === feature)
  const impls = types.filter((t) => t.kind === 'class' && t.implements.some((i) => ports.some((p) => p.name === i)))
  const show = (t) => ({ id: t.name, shape: 'class', name: t.name, stereotype: t.kind === 'interface' ? 'interface' : t.pkg !== feature ? t.pkg : undefined,
    fields: [], methods: t.kind === 'interface' ? t.methods.slice(0, 12) : [] })
  return {
    name: `06_Class/ports-${feature}`, kind: 'flow', dir: 'DOWN', title: `Class diagram: ports of ${feature}`,
    nodes: [...ports, ...impls].map(show),
    edges: impls.flatMap((c) => c.implements.filter((i) => ports.some((p) => p.name === i)).map((i) => ({ from: c.name, to: i, dashed: true, arrow: 'triangle' }))),
  }
}
