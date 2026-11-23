// Pure parsers that read facts out of the code for the documents (no I/O here; run.mjs does the reading).

const METHODS = { GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT', PatchMapping: 'PATCH', DeleteMapping: 'DELETE' }

/** The first string literal of an annotation's arguments: `("/x")`, `(path = "/x", …)`, `(value = "/x")`; '' if none. */
function annotationPath(args) {
  if (!args) return ''
  const m = args.match(/(?:^|[(,\s])(?:value|path)?\s*=?\s*\{?\s*"([^"]*)"/)
  return m ? m[1] : ''
}

const join = (a, b) => ('/' + [a, b].filter(Boolean).join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1')

/** Endpoints of one controller: method, full path, and the `require(Role.X|Permission.X)` calls of its body. */
export function parseController(src, controller) {
  const head = src.slice(0, src.search(/\bclass\s+\w+/))
  const base = annotationPath(head.match(/@RequestMapping\s*(\([^)]*\))?/)?.[1])
  const out = []
  const re = /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\s*(\((?:[^()]|\([^()]*\))*\))?/g
  const marks = [...src.matchAll(re)]
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length
    const body = src.slice(m.index, end)
    const requires = [...body.matchAll(/\.require\(\s*((?:Role|Permission)\.[A-Z_]+)/g)].map((r) => r[1])
    out.push({ method: METHODS[m[1]], path: join(base, annotationPath(m[2])), controller, requires })
  })
  return out
}

/** `Permission` enum constants with their label and roles. */
export function parsePermissions(src) {
  const start = src.search(/\benum\s+\w+\s*\{/)
  const open = src.indexOf('{', start)
  const body = src.slice(open + 1, src.indexOf(';', open))
  return [...body.matchAll(/([A-Z_]+)\s*\(((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+),\s*([^)]*)\)/g)].map((m) => ({
    permission: m[1],
    label: [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) => s[1]).join(''),
    roles: [...m[3].matchAll(/Role\.([A-Z_]+)/g)].map((r) => r[1]),
  }))
}

/** Routed pages of web/src/app/router.jsx: public pages and portal pages (portal = role), redirects left out. */
export function parseRoutes(src) {
  const out = []
  let portal = 'public'
  for (const line of src.split('\n')) {
    const p = line.match(/portal\(\s*'([a-z-]+)'/)
    if (p) { portal = p[1]; continue }
    if (/^\s*\]\),?\s*$/.test(line)) { portal = 'public'; continue }
    if (/<Navigate\b/.test(line)) continue
    const comp = line.match(/\.\.\.page\((\w+)\)/)?.[1] ?? line.match(/element:\s*<(\w+)/)?.[1]
    if (!comp) continue
    const path = line.match(/path:\s*'([^']*)'/)?.[1]
    const index = /index:\s*true/.test(line)
    if (path === undefined && !index) continue
    out.push({ portal, path: portal === 'public' ? join('', path ?? '') : join(portal, index ? '' : path), component: comp })
  }
  return out
}

/** Screens of a Flutter file: public widget classes named …Screen or …Page. */
export function parseMobileScreens(src, file) {
  return [...src.matchAll(/class\s+([A-Z]\w*(?:Screen|Page))\s+extends\s+State(?:less|ful)Widget/g)].map((m) => ({ screen: m[1], file }))
}

/** `status` CHECK constraints per table across migrations in order; a later one replaces an earlier one. */
export function parseStatusChecks(migrations) {
  const found = new Map()
  for (const sql of migrations) {
    for (const t of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      const m = t[2].match(/\b(status)\s+\w+(?:\(\d+\))?[^,\n]*CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i)
      if (m) found.set(t[1], { table: t[1], column: 'status', states: [...m[2].matchAll(/'([^']+)'/g)].map((s) => s[1]) })
    }
    for (const a of sql.matchAll(/ALTER TABLE\s+(\w+)[\s\S]*?ADD CONSTRAINT\s+\w+\s+CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)\s*\)/gi)) {
      found.set(a[1], { table: a[1], column: 'status', states: [...a[2].matchAll(/'([^']+)'/g)].map((s) => s[1]) })
    }
  }
  return [...found.values()]
}

/** Status changes written by a service: `UPDATE t SET status = 'X' … WHERE … status = 'Y' | IN (…)`, per method. */
export function parseTransitions(src, cls) {
  const out = []
  const methods = [...src.matchAll(/\n\s+(?:public\s+|private\s+|protected\s+|static\s+)*[\w<>[\],\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws [\w, ]+)?\{/g)]
  for (const u of src.matchAll(/UPDATE\s+(\w+)\s+(?:\w+\s+)?SET\s+[\s\S]*?\bstatus\s*=\s*'([A-Z_]+)'([\s\S]*?)(?:"""|"\)|";)/g)) {
    const where = u[3].match(/WHERE([\s\S]*)/)?.[1] ?? ''
    const eq = [...where.matchAll(/\bstatus\s*=\s*'([A-Z_]+)'/g)].map((m) => m[1])
    const inn = where.match(/\bstatus\s+IN\s*\(([^)]*)\)/)
    const from = [...eq, ...(inn ? [...inn[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]) : [])]
    const owner = methods.filter((m) => m.index < u.index).at(-1)?.[1] ?? '?'
    out.push({ table: u[1], from, to: u[2], by: `${cls}.${owner}` })
  }
  return out
}

/** `English ⟶ Vietnamese` lines of i18n/messages_vi.txt. */
export function parseMessagesVi(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    const i = line.indexOf(' ⟶ ')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 3).trim()
  }
  return out
}

/** `ApiException.kind("CODE", "message")` and `ApiException.notFound("message")` calls. */
export function parseApiErrors(src) {
  return [...src.matchAll(/ApiException\.(\w+)\(\s*(?:"([A-Z0-9_]+)"\s*,\s*)?"((?:[^"\\]|\\.)*)"/g)].map((m) => ({
    code: m[2] ?? null, kind: m[1], message: m[3],
  }))
}

/** `TC-XXX-NNN` ids in the Javadoc right before a test method. */
export function parseTestIds(src, cls) {
  const out = []
  for (const m of src.matchAll(/\/\*\*([\s\S]*?)\*\/\s*(?:@\w+(?:\([^)]*\))?\s*)*\s*(?:public\s+)?void\s+(\w+)\s*\(/g)) {
    const doc = m[1].replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ').trim()
    const id = doc.match(/TC-[A-Z]+-\d+/)
    if (!id) continue
    const title = doc.slice(doc.indexOf(id[0]) + id[0].length).replace(/^:\s*/, '').trim()
    out.push({ id: id[0], class: cls, method: m[2], title })
  }
  return out
}

/** Surefire/Failsafe XML: one { class (simple name), method, result } per testcase. */
export function parseJunitXml(xml) {
  return [...xml.matchAll(/<testcase\s+([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => {
    const attr = (k) => m[1].match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? ''
    const inner = m[3] ?? ''
    const result = /<(failure|error)\b/.test(inner) ? 'Failed' : /<skipped\b/.test(inner) ? 'Not run' : 'Passed'
    return { class: attr('classname').split('.').at(-1), method: attr('name'), result }
  })
}

/** Week of the capstone (Week 1 starts Monday 07/09/2026, user-given). */
export function weekOf(isoDate) {
  const day = (Date.parse(isoDate + 'T00:00:00Z') - Date.parse('2026-09-07T00:00:00Z')) / 86400000
  return Math.floor(day / 7) + 1
}

/** Git authors as the team writes their names. */
export const AUTHORS = {
  tisou47: 'Lê Thành Minh Trung', 'Le Trung': 'Lê Thành Minh Trung', 'Lê Thành Minh Trung': 'Lê Thành Minh Trung',
  'Nguyễn Xuân Lộc': 'Nguyễn Xuân Lộc', 'Locng-fpt': 'Nguyễn Xuân Lộc', nguyenxuanloc22: 'Nguyễn Xuân Lộc',
  vominhluan17: 'Võ Minh Luân', 'Võ Minh Luân': 'Võ Minh Luân',
  'Tran Vo Quang Duy': 'Trần Võ Quang Duy', 'Trần Võ Quang Duy': 'Trần Võ Quang Duy',
}

/** `git log --format=%x01%h|%ad|%an|%s --date=short --name-only` output. */
export function parseGitLog(text) {
  return text.split('\u0001').filter((c) => c.trim()).map((chunk) => {
    const [head, ...files] = chunk.split('\n')
    const [sha, date, author, ...subject] = head.split('|')
    return { sha, date, author: AUTHORS[author] ?? author, subject: subject.join('|'), files: files.filter(Boolean) }
  })
}

/** URL rules of SecurityConfig's authorizeHttpRequests, in order: { methods: [] (all), patterns: [], access }. */
export function parseSecurityRules(src) {
  const block = src.slice(src.indexOf('authorizeHttpRequests'))
  const rules = []
  for (const m of block.matchAll(/\.requestMatchers\(([^)]*)\)\s*\.(permitAll\(\)|hasRole\("(\w+)"\)|hasAnyRole\(([^)]*)\)|authenticated\(\))/g)) {
    const methods = [...m[1].matchAll(/HttpMethod\.(\w+)/g)].map((x) => x[1])
    const patterns = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
    const access = m[2] === 'permitAll()' ? 'public' : m[3] ?? (m[4] ? [...m[4].matchAll(/"(\w+)"/g)].map((x) => x[1]).join(', ') : 'signed in')
    rules.push({ methods, patterns, access })
  }
  return rules
}

/** Spring's ant-style pattern ("/students/**", "/a/*") as a test on a path. */
const antMatch = (pattern, path) => {
  const quoted = pattern.split('').map((c) => ('.+?^${}()|[]\\'.includes(c) ? '\\' + c : c)).join('')
  // Placeholders first, so the * of one replacement is not rewritten by the next.
  const body = quoted.replace(/\/\*\*$/, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
    .replace('\u0001', '(?:/.*)?').replace(/\u0002/g, '.*')
  return new RegExp('^' + body + '$').test(path)
}

/** Who may call an endpoint by the URL rules alone (a method's require() narrows it further). */
export function accessOf(rules, method, path) {
  for (const r of rules) {
    if (r.methods.length && !r.methods.includes(method)) continue
    if (r.patterns.some((p) => antMatch(p, path))) return r.access
  }
  return 'signed in'
}

/** The enumerated column and values of a Postgres CHECK definition (pg_get_constraintdef); null if it is not one. */
export function statesOfCheck(def) {
  const col = def.match(/CHECK \(+(\w+)\)?(?:::text)?\s*=\s*ANY/)
  if (!col) return null
  return { column: col[1], states: [...def.matchAll(/'([A-Z0-9_]+)'::/g)].map((m) => m[1]) }
}
