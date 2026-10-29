// Regenerates the endpoint folders of the Postman collection postman/collections/CampusStay API/ so they cannot drift
// from the backend: one request per operation of the backend's OpenAPI document (springdoc, /v3/api-docs), filed under
// the section of docs/api-contract.md that describes it, with the contract text as its description.
// Run from the repository root with the backend running (dev profile):
//   node docs/tools/generate-postman.mjs [OpenAPI URL or file; default http://localhost:8080/api/v3/api-docs]
// The collection settings (.resources/definition.yaml: auth, scripts) and the folder "Smoke tests" are written by hand
// and left alone. Commit the regenerated folders with the backend change that adds or changes an endpoint, then run
// `postman collection lint "postman/collections/CampusStay API"`.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'

const root = process.cwd()
const source = process.argv[2] ?? 'http://localhost:8080/api/v3/api-docs'
const collection = join(root, 'postman', 'collections', 'CampusStay API')
const contractFile = 'docs/api-contract.md'
const rel = (p) => relative(root, p).split(sep).join('/')

const spec = source.startsWith('http')
  ? await (await fetch(source)).json()
  : JSON.parse(readFileSync(source, 'utf8'))

/* ------------------------------------------------------------------ Folders */

// Top-level folders: the contract's sections. The collection script signs in as the role named by the innermost
// folder (Student, Staff, Manager, Admin); the others run as {{sessionRole}}, and "Public" sends no token.
const FOLDERS = {
  Session: { order: 1000, from: 'Session and shared', runs: 'any signed-in user ({{sessionRole}})' },
  Student: { order: 2000, from: 'Student', runs: 'the student account {{studentEmail}}' },
  Staff: { order: 3000, from: 'Staff (also used by the Manager for its Block)', runs: 'the Staff account {{staffEmail}}' },
  Manager: { order: 4000, from: 'Manager', runs: 'the Manager account {{managerEmail}}' },
  Admin: { order: 5000, from: 'Admin', runs: 'the Admin account {{adminEmail}}' },
  Exports: { order: 6000, from: 'Exports', runs: 'the back-office role in {{sessionRole}}' },
  Unsorted: { order: 9000, from: null, runs: 'any signed-in user ({{sessionRole}})' },
}
const TOP_BY_SECTION = Object.fromEntries(Object.entries(FOLDERS).map(([name, f]) => [f.from, name]))

// The Manager and Admin sections have no sub-headings: group their endpoints by path.
const GROUPS = {
  Manager: [
    ['Dashboards and approvals', ['/dashboards/', '/approvals/']],
    ['Assignment approval', ['/assignment-runs/']],
    ['Late check-ins and terminations', ['/late-check-ins', '/terminations']],
    ['Next Term', ['/next-term-fees', '/room-class-changes', '/reconciliations']],
    ['Round 2', ['/round2']],
    ['Finance', ['/finance/', '/refunds', '/invoices', '/payment-claims']],
    ['Inventory and furniture', ['/inventory/', '/furniture']],
    ['Block staff, routing and escalations', ['/block-staff', '/staff-account-requests', '/routing-rules', '/escalations', '/reports/', '/block-settings']],
    ['Accounts', ['/student-accounts', '/student-imports', '/staff-accounts']],
    ['Registration periods', ['/term-requests', '/announcements']],
    ['Inspections', ['/inspection-schedules']],
  ],
  Admin: [
    ['Dashboard', ['/dashboards/']],
    ['Registration periods', ['/admin/terms', '/term-requests', '/admin/settings']],
    ['Catalog', ['/admin/room-types', '/admin/room-classes', '/admin/furniture-types', '/admin/room-class-requirements']],
    ['Policies', ['/admin/fees', '/admin/utility', '/admin/eligibility', '/admin/matching', '/admin/system-parameters']],
    ['Messages', ['/admin/notification-templates', '/admin/emails']],
    ['Buildings and users', ['/admin/buildings', '/admin/users', '/admin/permissions']],
    ['Inspections, reports and audit', ['/inspection-checklists', '/reports/', '/admin/audit-log']],
    ['Demo data', ['/admin/demo']],
  ],
}

// Calls made without a token (SecurityConfig and the signed file links).
const PUBLIC = new Set(['POST /auth/sign-in', 'POST /auth/google', 'POST /auth/password/forgot', 'POST /auth/password/reset', 'GET /files/{}'])

const PATH_HINTS = {
  id: 'The record id or code (Applications APP-…, Invoices INV-…, Maintenance Requests MR-…)',
  applicationId: 'Application code, e.g. APP-SP27-000123',
  invoiceId: 'Invoice code, e.g. INV-SP27-000123',
  runId: 'Assignment run id, e.g. RUN-3',
  allocationId: 'Allocation id',
  room: 'Room code, e.g. A-305',
  code: 'Room code, e.g. A-305',
  key: 'Template or setting key',
  report: 'Export name, see the folder Exports',
}

/* ------------------------------------------------------------------ Contract */

const METHOD = /^((?:GET|POST|PUT|PATCH|DELETE)(?:[|,] ?(?:GET|POST|PUT|PATCH|DELETE))*)(?:\s+(\S+))?(?:\s+(\{.*\}))?$/
const norm = (path) => path.replace(/\{[^}]*\}/g, '{}')
const spans = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim())

// Every endpoint the contract defines: { key, top, sub, text, shape, order }. An endpoint is defined where it opens a
// bullet, a "·"-separated part of one, or a table row; mentions inside sentences do not count.
function readContract() {
  const lines = readFileSync(join(root, contractFile), 'utf8').split('\n')
  const out = []
  let h2 = null
  let h3 = null
  lines.forEach((line, n) => {
    if (line.startsWith('## ')) [h2, h3] = [line.slice(3).trim(), null]
    else if (line.startsWith('### ')) h3 = line.slice(4).trim()
    if (!h2 || h2 === 'Conventions') return
    let lastPath = null
    const add = (methods, path, text, shape) => {
      if (path.startsWith('…/') && lastPath) {
        const first = path.slice(1).split('/')[1]
        const at = lastPath.lastIndexOf('/' + first + '/')
        path = (at >= 0 ? lastPath.slice(0, at) : lastPath) + path.slice(1)
      }
      path = path.replace(/\?.*$/, '').replace(/[.,;:]+$/, '')
      if (!path.startsWith('/')) return
      lastPath = path
      for (const m of methods) out.push({ key: `${m} ${norm(path)}`, h2, h3, text: text.trim(), shape, order: n })
    }
    if (line.startsWith('|')) {
      const cells = line.split(/(?<!\\)\|/).map((c) => c.trim())
      const methods = (cells[1] ?? '').split(/[ ,]+/).filter((m) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(m))
      if (!methods.length) return
      const shape = spans(cells[3] ?? '').find((s) => s.startsWith('{'))
      const text = `${methods.join(', ')} ${cells[2]} — request: ${cells[3]} — response: ${cells[4]}`
      for (const p of spans(cells[2] ?? '')) add(methods, p, text, shape)
      return
    }
    const body = line.replace(/^- /, '')
    if (!body.startsWith('`')) return
    for (const part of body.split(' · ')) {
      const parts = spans(part)
      const m = parts[0]?.match(METHOD)
      if (m) {
        const methods = m[1].split(/[|,] ?/)
        add(methods, m[2] ?? lastPath ?? '', part, m[3] ?? parts.slice(1).find((s) => s.startsWith('{')))
      } else if (parts[0]?.startsWith('/') && lastPath) {
        add([out.at(-1).key.split(' ')[0]], parts[0], part, parts.slice(1).find((s) => s.startsWith('{')))
      }
    }
  })
  return out
}

/* ------------------------------------------------------------------ Requests */

const schemaOf = (ref) => spec.components.schemas[ref.replace('#/components/schemas/', '')]

function sample(schema, name = '', depth = 0) {
  if (!schema) return ''
  if (schema.$ref) return sample(schemaOf(schema.$ref), name, depth)
  if (name === 'termId') return '{{termId}}'
  if (name === 'block') return '{{block}}'
  if (schema.enum) return schema.enum[0]
  switch (schema.type) {
    case 'object':
      if (depth > 4 || !schema.properties) return {}
      return Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, sample(v, k, depth + 1)]))
    case 'array': {
      const item = schema.items?.$ref ? schemaOf(schema.items.$ref) : schema.items
      return item?.type === 'object' && depth < 4 ? [sample(item, '', depth + 1)] : []
    }
    case 'integer':
    case 'number':
      return name === 'id' || name.endsWith('Id') ? '' : 0
    case 'boolean':
      return false
    default:
      if (schema.format === 'date') return '2026-12-01'
      if (schema.format === 'date-time') return '2026-12-01T00:00:00Z'
      return ''
  }
}

// A request body the backend reads as a map has no schema: take its fields from the contract, `{ a, b?, c: 'x'|'y' }`.
function sampleFromShape(shape) {
  if (!shape) return {}
  const inner = shape.trim().replace(/^\{/, '').replace(/\}$/, '')
  const fields = []
  let depth = 0
  let current = ''
  for (const ch of inner) {
    if ('{['.includes(ch)) depth++
    if ('}]'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      fields.push(current)
      current = ''
    } else current += ch
  }
  fields.push(current)
  return Object.fromEntries(fields.map((f) => f.trim()).filter(Boolean).map((f) => {
    const [name, type = ''] = f.split(/:(.*)/s).map((s) => s.trim())
    const key = name.replace(/\?$/, '')
    const literal = type.match(/^'([^']*)'/)
    return [key, literal ? literal[1] : key === 'termId' ? '{{termId}}' : key === 'block' ? '{{block}}' : '']
  }))
}

function queryValue(name) {
  return { termId: '{{termId}}', block: '{{block}}', page: '1', pageSize: '20' }[name] ?? ''
}

function buildRequest(method, path, op, defs) {
  const multipart = op.requestBody?.content?.['multipart/form-data']
  const query = (op.parameters ?? []).filter((p) => p.in === 'query' && p.schema?.type !== 'object')
  const req = {
    method: method.toUpperCase(),
    path,
    pathVariables: (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => ({
      key: p.name,
      value: p.name === 'termId' ? '{{termId}}' : '',
      description: PATH_HINTS[p.name] ?? '',
    })),
    queryParams: multipart ? [] : query.map((p) => ({
      key: p.name,
      value: queryValue(p.name),
      disabled: !(p.required || p.name === 'termId' || p.name === 'block'),
    })),
    body: null,
  }
  if (multipart) {
    const files = Object.entries(multipart.schema?.properties ?? {})
    req.body = {
      type: 'formdata',
      content: [
        ...query.map((p) => ({ key: p.name, type: 'text', value: queryValue(p.name) })),
        ...files.map(([key]) => ({ key, type: 'file', src: '' })),
      ],
    }
  } else if (op.requestBody?.content?.['application/json']) {
    const schema = op.requestBody.content['application/json'].schema
    const shape = defs.map((d) => d.shape).find(Boolean)
    const value = schema.$ref ? sample(schema) : sampleFromShape(shape)
    req.body = { type: 'json', content: JSON.stringify(value, null, 2) }
  }
  return req
}

/* ------------------------------------------------------------------ YAML */

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const block = (text, indent) => '|-\n' + String(text).split('\n').map((l) => (l ? ' '.repeat(indent) + l : '')).join('\n')

function requestYaml(r) {
  const enabled = r.queryParams.filter((p) => !p.disabled)
  const url = `{{baseUrl}}${r.path.replace(/\{([^}]+)\}/g, ':$1')}` +
    (enabled.length ? '?' + enabled.map((p) => `${p.key}=${p.value}`).join('&') : '')
  const y = ['$kind: http-request', `name: ${q(r.path)}`, `method: ${r.method}`, `url: ${q(url)}`, `order: ${r.order}`]
  y.push(`description: ${block(r.description, 2)}`)
  if (r.pathVariables.length) {
    y.push('pathVariables:')
    for (const p of r.pathVariables) {
      y.push(`  - key: ${p.key}`, `    value: ${q(p.value)}`)
      if (p.description) y.push(`    description: ${q(p.description)}`)
    }
  }
  if (r.queryParams.length) {
    y.push('queryParams:')
    for (const p of r.queryParams) {
      y.push(`  - key: ${p.key}`, `    value: ${q(p.value)}`)
      if (p.disabled) y.push('    disabled: true')
    }
  }
  if (r.body?.type === 'json') {
    y.push('headers:', '  - key: Content-Type', '    value: application/json')
    y.push('body:', '  type: json', `  content: ${block(r.body.content, 4)}`)
  } else if (r.body) {
    y.push('body:', '  type: formdata', '  content:')
    for (const f of r.body.content) {
      y.push(`    - key: ${f.key}`, `      type: ${f.type}`)
      y.push(f.type === 'file' ? `      src: ''` : `      value: ${q(f.value)}`)
    }
  }
  return y.join('\n') + '\n'
}

function folderYaml({ name, order, description, publicCalls }) {
  const y = ['$kind: collection', `name: ${q(name)}`, `description: ${block(description, 2)}`, `order: ${order}`]
  if (publicCalls) y.push('auth:', '  type: noauth')
  return y.join('\n') + '\n'
}

/* ------------------------------------------------------------------ Placement */

const contract = readContract()
const GENERATED = 'Generated by `docs/tools/generate-postman.mjs` from the backend\'s OpenAPI document and `docs/api-contract.md`: regenerate instead of editing by hand.'

function place(key, path, def) {
  let top = def ? TOP_BY_SECTION[def.h2] ?? 'Unsorted' : 'Unsorted'
  let sub = def?.h3 ?? null
  // The contract files a few Manager-only calls with the screen that shows them, marked "(Managers…)".
  if (def?.text.includes('(Managers')) top = 'Manager'
  if (top === 'Session' && path.startsWith('/students/')) [top, sub] = ['Student', 'Account verification']
  if (top === 'Session' && PUBLIC.has(key)) sub = 'Public'
  if (GROUPS[top]) sub = GROUPS[top].find(([, prefixes]) => prefixes.some((p) => path.startsWith(p)))?.[0] ?? 'Other'
  return { top, sub }
}

const items = new Map() // folder path → requests
let unsorted = 0
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const key = `${method.toUpperCase()} ${norm(path)}`
    const defs = contract.filter((d) => d.key === key)
    // One request per top-level folder that defines the endpoint (a student view and a back-office view are two).
    const byFolder = new Map()
    for (const def of defs) {
      const at = place(key, path, def)
      const id = `${at.top}/${at.sub ?? ''}`
      if (!byFolder.has(id)) byFolder.set(id, { at, defs: [] })
      byFolder.get(id).defs.push(def)
    }
    if (!byFolder.size) {
      // Not in the contract: file it with the contract's endpoints that share its first path segment.
      const segment = '/' + path.split('/')[1]
      const near = contract.find((d) => d.key.split(' ')[1].startsWith(segment + '/') || d.key.split(' ')[1] === segment)
      const at = path.startsWith('/students/') ? { top: 'Student', sub: 'Other' } : near ? place(key, path, { ...near, h3: near.h3 }) : place(key, path, null)
      byFolder.set(`${at.top}/${at.sub ?? ''}`, { at, defs: [] })
      unsorted++
    }
    for (const { at, defs: found } of byFolder.values()) {
      const r = buildRequest(method, path, op, found)
      r.position = (found[0]?.order ?? 900) * 1000 + Object.keys(ops).indexOf(method)
      const where = [FOLDERS[at.top].from ?? 'not described', at.sub].filter(Boolean).join(' › ')
      r.description = found.length
        ? `${[...new Set(found.map((d) => d.text))].join('\n\n')}\n\nContract: \`${contractFile}\` › ${where}`
        : `Not described in \`${contractFile}\`: found only in the backend's OpenAPI document (operation \`${op.operationId}\` of \`${op.tags?.[0]}\`). Add it to the contract or remove it from the backend.`
      const folder = [at.top, at.sub].filter(Boolean).join('/')
      if (!items.has(folder)) items.set(folder, [])
      items.get(folder).push(r)
    }
  }
}

/* ------------------------------------------------------------------ Write */

function write(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

for (const name of Object.keys(FOLDERS)) rmSync(join(collection, name), { recursive: true, force: true })

// `order` is the rank inside the folder (contract order), so a contract edit renumbers only the folder it touches.
const fileName = (r) => `${r.method} ${r.path.slice(1).replace(/[{}]/g, '').replace(/[\\/:*?"<>|]+/g, ' ').trim()}`
const first = (folder) => Math.min(...items.get(folder).map((r) => r.position))
let written = 0
for (const [folder, requests] of [...items].sort()) {
  const used = new Set()
  requests.sort((a, b) => a.position - b.position).forEach((r, i) => { r.order = (i + 1) * 1000 })
  for (const r of requests) {
    let stem = fileName(r)
    while (used.has(stem.toLowerCase())) stem += ' 2'
    used.add(stem.toLowerCase())
    write(join(collection, folder, `${stem}.request.yaml`), requestYaml(r))
    written++
  }
}

const tops = new Set([...items.keys()].map((f) => f.split('/')[0]))
for (const top of tops) {
  const f = FOLDERS[top]
  const description = top === 'Unsorted'
    ? `Endpoints of the backend that \`${contractFile}\` does not describe.\n\n${GENERATED}`
    : `\`${contractFile}\` › ${f.from}. Runs as ${f.runs}.\n\n${GENERATED}`
  write(join(collection, top, '.resources', 'definition.yaml'), folderYaml({ name: top, order: f.order, description }))
}
for (const folder of items.keys()) {
  const [top, sub] = folder.split('/')
  if (!sub) continue
  const siblings = [...items.keys()].filter((f) => f.startsWith(top + '/')).sort((a, b) => first(a) - first(b))
  const order = (siblings.indexOf(folder) + 1) * 1000
  const description = sub === 'Public'
    ? `Calls made without a token (sign-in, password reset, signed file links).\n\n${GENERATED}`
    : `\`${contractFile}\` › ${FOLDERS[top].from ?? top} › ${sub}.\n\n${GENERATED}`
  write(join(collection, folder, '.resources', 'definition.yaml'), folderYaml({ name: sub, order, description, publicCalls: sub === 'Public' }))
}

console.log(`${written} requests in ${items.size} folders under ${rel(collection)} (${unsorted} not described in the contract)`)
