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
    // The Java method under the annotations: after the other annotations, the name before its parameter list.
    const handler = body.slice(m[0].length).match(/^(?:\s*@\w+(?:\((?:[^()]|\([^()]*\))*\))?)*\s*(?:public\s+)?[\w<>[\],.? ]+?\s+(\w+)\s*\(/)?.[1] ?? ''
    out.push({ method: METHODS[m[1]], path: join(base, annotationPath(m[2])), handler, controller, requires })
  })
  return out
}

/** `Permission` enum constants with their label and roles. */
export function parsePermissions(src) {
  const start = src.search(/\benum\s+\w+\s*\{/)
  const open = src.indexOf('{', start)
  // The constants end at the first ; outside a string literal (a label may contain one).
  const upToSemicolon = src.slice(open).match(/^(?:[^";]|"(?:[^"\\]|\\.)*")*;/)
  const body = src.slice(open + 1, upToSemicolon ? open + upToSemicolon[0].length - 1 : src.length)
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
/** Splits an SQL list at the commas outside parentheses and quotes. */
function splitTopLevel(s) {
  const out = []
  let depth = 0
  let quote = false
  let cur = ''
  for (const ch of s) {
    if (ch === "'") quote = !quote
    if (!quote && ch === '(') depth++
    if (!quote && ch === ')') { if (depth === 0) break; depth-- }
    if (!quote && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

export function parseTransitions(src, cls, stores = {}) {
  const out = []
  // Method declarations: a type, then the name; statements (return x(, new X(, else if () are not.
  const NOT_TYPE = new Set(['return', 'new', 'else', 'throw', 'case', 'yield', 'await', 'record', 'class', 'enum', 'interface'])
  const NOT_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'try', 'do'])
  // String contents blanked (same length, newlines kept) so SQL like "ON CONFLICT (id)" is not read as a method.
  const code = src.replace(/"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"/g, (s) => s.replace(/[^\n]/g, ' '))
  const methods = [...code.matchAll(/\n[ \t]+(?:(?:public|private|protected|static|final|synchronized|default)\s+)*(?:<[^>\n]+>\s+)?([\w.]+(?:<[^\n;=(){}]*>)?(?:\[\])?)\s+(\w+)\s*\(/g)]
    .filter((m) => !NOT_TYPE.has(m[1]) && !NOT_NAME.has(m[2]))
  const owner = (index) => {
    const m = methods.filter((x) => x.index < index).at(-1)
    if (!m) return '?'
    // Listeners are all called on(…): name them with their event.
    const event = m[2] === 'on' ? code.slice(m.index + m[0].length).match(/^\s*(?:final\s+)?(\w+)/)?.[1] : null
    return event ? `on(${event})` : m[2]
  }
  // One SQL string literal at a time (text blocks, then plain strings), so a match never runs into the next statement.
  for (const s of src.matchAll(/"""([\s\S]*?)"""|"((?:[^"\\\n]|\\.)*)"/g)) {
    const sql = s[1] ?? s[2]
    // The status = 'X' must be in the SET list, not in the WHERE after it.
    for (const u of sql.matchAll(/UPDATE\s+(\w+)\s+(?:\w+\s+)?SET\s+(?:(?!\bWHERE\b)[\s\S])*?\bstatus\s*=\s*'([A-Z_]+)'([\s\S]*)/g)) {
      const where = u[3].match(/WHERE([\s\S]*)/)?.[1] ?? ''
      const eq = [...where.matchAll(/\bstatus\s*=\s*'([A-Z_]+)'/g)].map((m) => m[1])
      const inn = where.match(/\bstatus\s+IN\s*\(([^)]*)\)/)
      const from = [...eq, ...(inn ? [...inn[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]) : [])]
      out.push({ index: s.index, table: u[1], from, to: u[2], by: `${cls}.${owner(s.index)}` })
    }
    // INSERT INTO t (…, status, …) VALUES (…) | SELECT …: the literal at the status column's position is the state a
    // row is created in.
    const ins = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)[\s\S]*?(?:VALUES\s*\(|SELECT\s+)([\s\S]*)/)
    if (ins) {
      const at = ins[2].split(',').map((c) => c.trim()).indexOf('status')
      const value = at < 0 ? undefined : splitTopLevel(ins[3])[at]?.trim().match(/^'([A-Z_]+)'$/)?.[1]
      if (value) out.push({ index: s.index, table: ins[1], from: ['(created)'], to: value, by: `${cls}.${owner(s.index)}` })
    }
  }
  // store.transition(id, Set.of("FROM", …), "TO"), where stores maps the field name to the store's table.
  for (const c of src.matchAll(/\b(\w+)\.transition\(\s*[^,]+,\s*Set\.of\(([^)]*)\)\s*,\s*"([A-Z_]+)"\s*\)/g)) {
    if (!stores[c[1]]) continue
    out.push({ index: c.index, table: stores[c[1]], from: [...c[2].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]), to: c[3],
      by: `${cls}.${owner(c.index)}` })
  }
  return out.sort((a, b) => a.index - b.index).map(({ index, ...t }) => t)
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

/** SQL literal list of a VALUES tuple: 'text' (with '' escapes), NULL, numbers, TRUE/FALSE; other expressions as text. */
function sqlValues(s) {
  const out = []
  let i = 0
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++
    if (i >= s.length) break
    if (s[i] === "'") {
      let v = ''
      i++
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { v += "'"; i += 2; continue }
        if (s[i] === "'") { i++; break }
        v += s[i++]
      }
      out.push(v)
    } else {
      const m = s.slice(i).match(/^[^,]+/)
      const raw = m[0].trim()
      out.push(/^NULL$/i.test(raw) ? null : raw)
      i += m[0].length
    }
  }
  return out
}

/** The tuples after VALUES, each as its text between the outer parentheses (quotes respected). */
function tuples(s) {
  const out = []
  let depth = 0
  let quote = false
  let start = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") { if (quote && s[i + 1] === "'") { i++; continue } quote = !quote; continue }
    if (quote) continue
    if (c === '(') { if (depth === 0) start = i + 1; depth++ }
    else if (c === ')') { depth--; if (depth === 0) out.push(s.slice(start, i)) }
    else if (depth === 0 && (c === ';' || /^ON\s+CONFLICT/i.test(s.slice(i, i + 12)))) break // "ON CONFLICT (key)" is not a row
  }
  return out
}

/**
 * The settings (cfg_parameter) the migrations leave, read from their text in order: INSERTs with their column lists,
 * then UPDATEs of literal values (WHERE key = / LIKE / IN) and DELETEs. Used when no database can be started.
 */
export function parseSettings(sqlFiles) {
  const rows = new Map()
  const where = (w) => {
    const eq = w.match(/key\s*=\s*'([^']+)'/)
    if (eq) return (k) => k === eq[1]
    const like = w.match(/key\s+LIKE\s+'([^']+)'/i)
    if (like) { const re = new RegExp('^' + like[1].replace(/[.]/g, '\\.').replace(/%/g, '.*').replace(/_/g, '.') + '$'); return (k) => re.test(k) }
    const inn = w.match(/key\s+IN\s*\(([^)]*)\)/i)
    if (inn) { const keys = [...inn[1].matchAll(/'([^']+)'/g)].map((m) => m[1]); return (k) => keys.includes(k) }
    return () => false
  }
  for (const sql of sqlFiles) {
    const re = /INSERT INTO cfg_parameter\s*\(([^)]*)\)\s*VALUES|UPDATE cfg_parameter\s+SET\s+([\s\S]*?)\s+WHERE\s+([\s\S]*?);|DELETE FROM cfg_parameter\s+WHERE\s+([\s\S]*?);/g
    for (const m of sql.matchAll(re)) {
      if (m[1]) {
        const cols = m[1].split(',').map((c) => c.trim())
        for (const t of tuples(sql.slice(m.index + m[0].length))) {
          const v = sqlValues(t)
          const o = Object.fromEntries(cols.map((c, i) => [c, v[i]]))
          rows.set(o.key, o)
        }
      } else if (m[2]) {
        const match = where(m[3])
        const sets = [...m[2].matchAll(/(\w+)\s*=\s*'((?:[^']|'')*)'/g)].map((s) => [s[1], s[2].replace(/''/g, "'")])
        for (const [k, o] of rows) if (match(k)) for (const [c, v] of sets) o[c] = v
      } else if (m[4]) {
        const match = where(m[4])
        for (const k of [...rows.keys()]) if (match(k)) rows.delete(k)
      }
    }
  }
  return [...rows.values()].map((o) => ({ key: o.key, section: o.section, label: o.label, valueType: o.value_type, value: o.value, helper: o.helper ?? null }))
}
