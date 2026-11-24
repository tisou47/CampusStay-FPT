// Generates the Markdown parts of Report 4 (SDD) from the code: tools/docs/src/_r4-*.md. Run by build.mjs.
//   node tools/docs/src/report4.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURES } from './partials.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')
const diagram = (rel) => fs.existsSync(path.join(root, 'docs/Diagrams', `${rel}.png`))
const img = (rel, caption) => `![${caption}](../../../docs/Diagrams/${rel}.png)`

export function technologies() {
  const pom = read('backend/pom.xml')
  const boot = pom.match(/spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)/)?.[1]
  const java = pom.match(/<java.version>([^<]+)/)?.[1]
  const starters = [...pom.matchAll(/<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?(?:\s*<scope>([^<]+)<\/scope>)?/g)]
  const web = JSON.parse(read('web/package.json'))
  const pub = read('mobile/pubspec.yaml')
  const dart = [...pub.slice(pub.indexOf('\ndependencies:'), pub.indexOf('\ndev_dependencies:')).matchAll(/^ {2}(\w+):\s*(\^?[\d.]+)?/gm)].filter((m) => m[1] !== 'flutter')
  const rows = [
    ['Backend', 'Java', java, 'language (virtual threads)'],
    ['Backend', 'Spring Boot', boot, 'application framework (parent of the build)'],
    ...starters.map((m) => ['Backend', m[2], m[3] ?? `(${boot ? 'Boot ' + boot : 'managed'})`, m[4] === 'test' ? 'tests' : m[1].startsWith('org.springframework') ? 'Spring module' : 'library']),
    ['Database', 'PostgreSQL', '17', 'data (Flyway migrations V1–V103)'],
    ...Object.entries(web.dependencies).map(([k, v]) => ['Web', k, v, 'runtime']),
    ...Object.entries(web.devDependencies ?? {}).map(([k, v]) => ['Web', k, v, 'build']),
    ['Mobile', 'Flutter / Dart', pub.match(/sdk:\s*['"]?([^'"\n]+)/)?.[1] ?? '', 'Android app (minimum Android 8.0)'],
    ...dart.map((m) => ['Mobile', m[1], m[2] ?? '', 'package']),
    ['Infrastructure', 'Docker Compose, Caddy', '', 'API, reverse proxy and HTTPS on the VM'],
    ['Infrastructure', 'GitHub Actions, GHCR', '', 'CI, images, deployment'],
    ['Infrastructure', 'Vercel', '', 'static web build'],
  ]
  return table(['Layer', 'Technology', 'Version', 'Use'], rows)
}

const AREA_NAME = { auth: 'Accounts (AUTH)', cfg: 'Configuration (CFG)', inv: 'Inventory (INV)', app: 'Applications (APP)', asg: 'Assignment (ASG)',
  bil: 'Billing (BIL)', req: 'Requests (REQ)', mnt: 'Maintenance (MNT)', ntf: 'Notifications (NTF)', vis: 'Family Day (VIS)', shared: 'Shared', rpt: 'Report views (RPT)' }

export function database() {
  const schema = data('schema.json')
  const tables = schema.filter((t) => !t.view)
  const out = []
  for (const area of Object.keys(AREA_NAME)) {
    const mine = tables.filter((t) => t.prefix === area)
    if (!mine.length) continue
    out.push(`**${AREA_NAME[area]}: ${mine.length} tables**`)
    for (const t of mine) {
      const pk = (t.constraints.find((c) => c.type === 'PK')?.def.match(/\(([^)]+)\)/)?.[1] ?? '').split(',').map((s) => s.trim())
      const fks = t.constraints.filter((c) => c.type === 'FK').map((c) => ({ cols: (c.def.match(/FOREIGN KEY \(([^)]+)\)/)?.[1] ?? '').split(',').map((s) => s.trim()), ref: c.refTable }))
      const keyOf = (col) => [pk.includes(col) ? 'PK' : '', ...fks.filter((f) => f.cols.includes(col)).map((f) => `FK → ${f.ref}`)].filter(Boolean).join(', ')
      const others = t.constraints.filter((c) => c.type === 'UNIQUE' || c.type === 'CHECK' || c.type === 'EXCLUDE')
      out.push(`Table: \`${t.name}\` (${t.columns.length} columns)\n` +
        table(['Column', 'Type', 'Null', 'Default', 'Key'], t.columns.map((c) => [c.name, c.type, c.nullable ? 'yes' : 'no', (c.default ?? '').slice(0, 40), keyOf(c.name)])) +
        (others.length ? `\n\n*Constraints of ${t.name}:* ` + others.map((c) => `${c.name} (${c.type}): ${c.def.length > 140 ? c.def.slice(0, 140) + '…' : c.def}`).join(' · ') : ''))
    }
  }
  const views = schema.filter((t) => t.view)
  out.push(`**Views: ${views.length}** (the report views read by RPT and the views of each feature)\n\n` + table(['View', 'Columns'], views.map((v) => [v.name, v.columns.map((c) => c.name).join(', ')])))
  return out.join('\n\n')
}

export function erds() {
  return [img('05_ERD/erd-overview', 'Logical ERD of the whole system (main entities)'),
    ...['auth', 'cfg', 'inv', 'app', 'asg', 'bil', 'req', 'mnt', 'ntf', 'vis', 'shared'].map((p) => img(`05_ERD/erd-${p}`, `Logical ERD: ${AREA_NAME[p]}`))].join('\n\n')
}

const PREFIX = { AUTH: 'auth', CFG: 'cfg', INV: 'inv', APP: 'app', ASG: 'asg', BIL: 'bil', REQ: 'req', MNT: 'mnt', NTF: 'ntf', VIS: 'vis' }
const PORTS = { AUTH: 'auth', CFG: 'setting', INV: 'inventory', APP: 'application', ASG: 'assignment', BIL: 'billing', MNT: 'maintenance', NTF: 'notification', AST: 'assistant' }

export function detailed() {
  const ucs = JSON.parse(read('tools/docs/src/usecases.json'))
  const endpoints = data('endpoints.json')
  const machines = data('machines.json')
  const out = []
  let k = 1
  for (const [code, name, ep] of FEATURES) {
    const parts = [`### 3.${k} ${name} (${code})`]
    const ports = PORTS[code] && diagram(`06_Class/ports-${PORTS[code]}`)
    parts.push(`#### 3.${k}.1 Class Diagram`)
    if (code === 'AUTH') parts.push('The JPA entities (the rest of the data is read and written with SQL through the stores of each feature):\n\n' + img('06_Class/entities', 'JPA entities'))
    parts.push(ports ? `The ports this feature declares (interfaces) and the classes that implement them; other features call it only through these.\n\n${img(`06_Class/ports-${PORTS[code]}`, `Ports of ${name}`)}`
      : 'This feature declares no port: its services are called by its own controllers and it reaches other features through their ports and events.')
    const seqs = ucs.filter((u) => u.feature === code && diagram(u.diagram))
    if (seqs.length) parts.push(`#### 3.${k}.2 Sequence Diagrams\n\n` + seqs.map((u) => `${u.id} ${u.name}.\n\n${img(u.diagram, `${u.name} (${u.id})`)}`).join('\n\n'))
    const states = PREFIX[code] ? machines.filter((m) => m.name.split('/')[1].replace(/^state-/, '').split('_')[0] === PREFIX[code]) : []
    if (states.length) {
      parts.push(`#### 3.${k}.3 State Diagrams\n\n` + states.map((m) => `${m.title}.${m.notWritten.length ? ` Values allowed by the database but not set by the code: ${m.notWritten.join(', ')}.` : ''}\n\n${img(m.name, m.title)}`).join('\n\n'))
    }
    const eps = endpoints.filter((e) => e.feature === ep || (code === 'AUTH' && e.feature === 'file'))
    parts.push(`#### 3.${k}.4 API\n\n${eps.length} endpoints (request and error details in Report 3).\n\nTable: Endpoints of ${name} (${code})\n` + table(['Method', 'Path', 'Access', 'Controller'], eps.map((e) => [e.method, `\`${e.path}\``, e.access, e.controller])))
    out.push(parts.join('\n\n'))
    k++
  }
  return out.join('\n\n')
}

export function writeAll() {
  const out = { tech: technologies(), db: database(), erd: erds(), detailed: detailed() }
  for (const [name, md] of Object.entries(out)) fs.writeFileSync(path.join(here, `_r4-${name}.md`), md.trim() + '\n')
  return Object.keys(out)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`report4 parts: ${writeAll().join(', ')}`)
