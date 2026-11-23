// Reads the code and writes tools/docs/data/*.json, the single source of every list and number in the documents.
//
//   node tools/docs/gen/run.mjs code      endpoints, permissions, screens, states, messages
//   node tools/docs/gen/run.mjs schema    tables and columns of a throwaway Postgres migrated with every Flyway file
//   node tools/docs/gen/run.mjs states    enumerated columns (status …) from the schema CHECKs, with the transitions in code
//   node tools/docs/gen/run.mjs tests     TC ids + results (backend reports of the last `mvn verify`, web and mobile runs)
//   node tools/docs/gen/run.mjs history   commits per week and the other members' document changes
//   node tools/docs/gen/run.mjs facts     the counts of all of the above
//   node tools/docs/gen/run.mjs all
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTHORS, accessOf, parseApiErrors, parseController, parseGitLog, parseJunitXml, parseMessagesVi, parseMobileScreens,
  parsePermissions, parseRoutes, parseSecurityRules, parseTestIds, parseTransitions, statesOfCheck, weekOf, parseSettings } from './parse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const dataDir = path.join(root, 'tools/docs/data')
fs.mkdirSync(dataDir, { recursive: true })
const rel = (p) => path.relative(root, p).replaceAll('\\', '/')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const write = (name, value) => {
  fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(value, null, 1) + '\n')
  console.log(`${name}.json: ${Array.isArray(value) ? value.length + ' entries' : 'written'}`)
}
const walk = (dir, ext) => fs.readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
  .filter((d) => d.isFile() && d.name.endsWith(ext)).map((d) => rel(path.join(d.parentPath ?? d.path, d.name))).sort()
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts })
const JAVA = 'backend/src/main/java'
const MIGRATIONS = 'backend/src/main/resources/db/migration'
const migrationFiles = () => fs.readdirSync(path.join(root, MIGRATIONS)).filter((f) => /^V\d+__.*\.sql$/.test(f))
  .sort((a, b) => Number(a.match(/^V(\d+)/)[1]) - Number(b.match(/^V(\d+)/)[1]))

function code() {
  const security = read(walk(JAVA, '.java').find((f) => f.endsWith('/SecurityConfig.java')))
  const rules = parseSecurityRules(security)
  const endpoints = walk(JAVA, '.java').filter((f) => /\/controller\//.test(f)).flatMap((f) => {
    const src = read(f)
    if (!/@RestController/.test(src)) return []
    return parseController(src, path.basename(f, '.java')).map((e) => ({
      ...e, feature: f.split('/controller/')[1].split('/')[0], access: accessOf(rules, e.method, e.path),
    }))
  })
  write('endpoints', endpoints)
  write('permissions', parsePermissions(read(walk(JAVA, '.java').find((f) => f.endsWith('/security/Permission.java')))))
  write('screens', {
    web: parseRoutes(read('web/src/app/router.jsx')),
    mobile: walk('mobile/lib', '.dart').flatMap((f) => parseMobileScreens(read(f), f.replace('mobile/lib/', ''))),
  })
  const vi = parseMessagesVi(read('backend/src/main/resources/i18n/messages_vi.txt'))
  const seen = new Map()
  for (const f of walk(JAVA, '.java')) {
    for (const e of parseApiErrors(read(f))) {
      const key = `${e.code}|${e.message}`
      if (!seen.has(key)) seen.set(key, { ...e, vi: vi[e.message] ?? null, source: path.basename(f, '.java') })
    }
  }
  write('messages', [...seen.values()].sort((a, b) => String(a.code).localeCompare(String(b.code))))
}

function schema() {
  const name = 'cs-docs-schema'
  const run = (args, opts) => sh('docker', args, opts)
  try { run(['rm', '-f', name], { stdio: 'ignore' }) } catch { /* not there */ }
  run(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=docs', '-e', 'POSTGRES_DB=campusstay', 'postgres:17-alpine'])
  try {
    for (let i = 0; i < 60; i++) {
      try { run(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'campusstay'], { stdio: 'ignore' }); break } catch { sh('node', ['-e', 'setTimeout(()=>{},1000)']) }
    }
    for (const f of migrationFiles()) {
      run(['exec', '-i', name, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'campusstay'], { input: read(`${MIGRATIONS}/${f}`) })
    }
    const q = (sql) => JSON.parse(run(['exec', '-i', name, 'psql', '-At', '-U', 'postgres', '-d', 'campusstay'], { input: sql }).trim() || '[]')
    const columns = q(`SELECT coalesce(json_agg(c ORDER BY c.table_name, c.ordinal_position), '[]') FROM (
        SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length AS length, c.is_nullable = 'YES' AS nullable,
               c.column_default AS "default", c.ordinal_position, t.table_type
        FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = 'public' AND c.table_name <> 'flyway_schema_history') c;`)
    const constraints = q(`SELECT coalesce(json_agg(x), '[]') FROM (
        SELECT conrelid::regclass::text AS table_name, conname AS name, contype AS type, pg_get_constraintdef(oid) AS def,
               CASE WHEN contype = 'f' THEN confrelid::regclass::text END AS ref_table
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace) x;`)
    const tables = new Map()
    for (const c of columns) {
      if (!tables.has(c.table_name)) {
        tables.set(c.table_name, { name: c.table_name, prefix: c.table_name.split('_')[0], view: c.table_type === 'VIEW', columns: [], constraints: [] })
      }
      tables.get(c.table_name).columns.push({ name: c.column_name, type: c.length ? `${c.data_type}(${c.length})` : c.data_type, nullable: c.nullable, default: c.default })
    }
    for (const k of constraints) tables.get(k.table_name)?.constraints.push({ name: k.name, type: { p: 'PK', f: 'FK', u: 'UNIQUE', c: 'CHECK', x: 'EXCLUDE' }[k.type] ?? k.type, def: k.def, refTable: k.ref_table })
    write('schema', [...tables.values()])
    // The settings and refund rules the migrations leave in the base data (the business rules of Report 3).
    write('settings', {
      parameters: q(`SELECT coalesce(json_agg(p ORDER BY p.section, p.sort_order, p.key), '[]') FROM (
          SELECT key, section, label, value_type AS "valueType", value, helper FROM cfg_parameter) p;`),
      refundRules: q(`SELECT coalesce(json_agg(r ORDER BY r.sort_order), '[]') FROM (
          SELECT trigger_code AS code, description, refund_percent AS percent, approver_role AS approver, sort_order FROM cfg_refund_rule) r;`),
    })
  } finally {
    run(['rm', '-f', name], { stdio: 'ignore' })
  }
}

/** Enumerated columns (status, renewal, …) from the migrated schema's CHECKs, with the transitions services write. */
function states() {
  const schemaJ = JSON.parse(fs.readFileSync(path.join(dataDir, 'schema.json'), 'utf8'))
  const files = walk(JAVA, '.java').filter((f) => /\/(service|repository)\//.test(f))
  // Stores with a transition(id, from, to) method, and the table their UPDATE writes.
  const storeTables = Object.fromEntries(files.map((f) => [path.basename(f, '.java'), read(f)])
    .filter(([, src]) => /\bboolean transition\(/.test(src))
    .map(([name, src]) => [name, src.match(/UPDATE\s+(\w+)\s+SET\s+status/)?.[1]]).filter(([, t]) => t))
  const transitions = files.flatMap((f) => {
    const src = read(f)
    const stores = {}
    for (const [store, table] of Object.entries(storeTables)) {
      for (const m of src.matchAll(new RegExp(`\\b${store}\\s+(\\w+)\\s*[;,)=]`, 'g'))) stores[m[1]] = table
    }
    return parseTransitions(src, path.basename(f, '.java'), stores)
  })
  const out = []
  for (const t of schemaJ.filter((x) => !x.view)) {
    for (const k of t.constraints.filter((c) => c.type === 'CHECK')) {
      const s = statesOfCheck(k.def)
      if (s && s.states.length > 1) {
        out.push({ table: t.name, column: s.column, constraint: k.name, states: s.states,
          transitions: s.column === 'status' ? transitions.filter((x) => x.table === t.name) : [] })
      }
    }
  }
  // A column may also appear in a partial CHECK ("status IN ('A','B') OR x IS NOT NULL"): keep its full list only.
  const best = new Map()
  for (const s of out) {
    const key = `${s.table}.${s.column}`
    if (!best.has(key) || best.get(key).states.length < s.states.length) best.set(key, s)
  }
  write('states', [...best.values()])
}

function tests() {
  const ids = walk('backend/src/test/java', '.java').flatMap((f) => parseTestIds(read(f), path.basename(f, '.java')).map((t) => ({ ...t, file: f })))
  const results = new Map()
  let backendUnit = 0, backendIt = 0
  for (const [dir, level] of [['backend/target/surefire-reports', 'unit'], ['backend/target/failsafe-reports', 'integration']]) {
    if (!fs.existsSync(path.join(root, dir))) throw new Error(`${dir} is missing: run mvn -B -o verify in backend/ first`)
    for (const f of fs.readdirSync(path.join(root, dir)).filter((n) => n.startsWith('TEST-') && n.endsWith('.xml'))) {
      for (const r of parseJunitXml(read(`${dir}/${f}`))) {
        results.set(`${r.class}#${r.method}`, { ...r, level })
        if (level === 'unit') backendUnit++; else backendIt++
      }
    }
  }
  const web = parseJunitXml(sh('node', ['--test', '--test-reporter=junit', 'src/lib/**/*.test.js'], { cwd: path.join(root, 'web') }))
  const flutter = process.platform === 'win32' ? 'flutter.bat' : 'flutter'
  const mobileLines = sh(flutter, ['test', '--machine'], { cwd: path.join(root, 'mobile'), shell: true }).split('\n')
  const mobileNames = new Map()
  const mobile = []
  for (const line of mobileLines) {
    if (!line.startsWith('{')) continue
    const e = JSON.parse(line)
    if (e.type === 'testStart' && e.test?.url) mobileNames.set(e.test.id, { name: e.test.name, file: path.basename(e.test.url) })
    if (e.type === 'testDone' && !e.hidden && mobileNames.has(e.testID)) {
      mobile.push({ ...mobileNames.get(e.testID), result: e.result === 'success' ? 'Passed' : 'Failed' })
    }
  }
  write('tests', {
    runDate: new Date().toISOString().slice(0, 10),
    cases: ids.map((t) => ({ ...t, level: results.get(`${t.class}#${t.method}`)?.level ?? (t.class.endsWith('IT') ? 'integration' : 'unit'), result: results.get(`${t.class}#${t.method}`)?.result ?? 'Not run' })),
    runs: { backendUnit, backendIt, web: web.length, mobile: mobile.length, backendFailed: [...results.values()].filter((r) => r.result === 'Failed').length,
      webFailed: web.filter((r) => r.result === 'Failed').length, mobileFailed: mobile.filter((r) => r.result === 'Failed').length },
    backend: [...results.values()], web, mobile,
  })
}

function history() {
  const log = parseGitLog(sh('git', ['log', '--all', '--no-merges', '--date=short', '--format=%x01%h|%ad|%an|%s', '--name-only']))
    .filter((c) => AUTHORS[c.author] || Object.values(AUTHORS).includes(c.author))
  const weeks = new Map()
  for (const c of log) {
    const w = weekOf(c.date)
    if (!weeks.has(w)) weeks.set(w, { week: w, commits: [] })
    weeks.get(w).commits.push({ date: c.date, author: c.author, subject: c.subject, areas: [...new Set(c.files.map((f) => f.split('/')[0]))] })
  }
  const isDoc = (f) => /^(docs|templates)\//.test(f) || /\.(md|docx|xlsx|xls|drawio)$/.test(f)
  write('history', {
    weeks: [...weeks.values()].sort((a, b) => a.week - b.week),
    docChanges: log.filter((c) => c.files.some(isDoc)).map((c) => ({ date: c.date, author: c.author, subject: c.subject, paths: c.files.filter(isDoc) })),
  })
}

function facts() {
  const j = (n) => JSON.parse(fs.readFileSync(path.join(dataDir, `${n}.json`), 'utf8'))
  const loc = (glob) => sh('git', ['ls-files', glob]).split('\n').filter(Boolean)
    .reduce((n, f) => n + fs.readFileSync(path.join(root, f), 'utf8').split('\n').length, 0)
  const endpoints = j('endpoints'), screens = j('screens'), schemaJ = j('schema'), t = j('tests')
  const migrations = migrationFiles()
  write('facts', {
    endpoints: endpoints.length,
    controllers: new Set(endpoints.map((e) => e.controller)).size,
    migrations: migrations.length,
    lastMigration: migrations.at(-1).match(/^(V\d+)/)[1],
    tables: schemaJ.filter((x) => !x.view).length,
    views: schemaJ.filter((x) => x.view).length,
    webPages: screens.web.length,
    mobileScreens: screens.mobile.filter((s) => s.screen !== 'SubPage').length, // SubPage is the frame of the sub-screens
    permissions: j('permissions').length,
    statusMachines: j('states').length,
    messages: j('messages').length,
    tcIds: new Set(t.cases.map((c) => c.id)).size,
    tests: { backendUnit: t.runs.backendUnit, backendIt: t.runs.backendIt, web: t.runs.web, mobile: t.runs.mobile },
    loc: { java: loc('backend/src/main/*.java'), js: loc('web/src/*.js') + loc('web/src/*.jsx'), dart: loc('mobile/lib/*.dart') },
    generatedFrom: sh('git', ['rev-parse', '--short', 'HEAD']).trim(),
  })
}

/** The settings and refund rules the migrations leave in the base data (Report 3, business rules), read from the
 *  migration text in order, so no database is needed. */
function settings() {
  const sql = migrationFiles().map((f) => read(`${MIGRATIONS}/${f}`))
  const refundRules = new Map()
  for (const text of sql.filter((t) => t.includes('cfg_refund_rule'))) {
    for (const m of text.matchAll(/\('([A-Z_]+)',\s*'((?:[^']|'')*)',\s*(\d+),\s*'([A-Z]+)',\s*(\d+)\)|SELECT '([A-Z_]+)',\s*'((?:[^']|'')*)',\s*(\d+),\s*'([A-Z]+)',\s*(\d+)/g)) {
      const v = m[1] ? m.slice(1, 6) : m.slice(6, 11)
      refundRules.set(v[0], { code: v[0], description: v[1].replace(/''/g, "'"), percent: +v[2], approver: v[3], sort_order: +v[4] })
    }
  }
  write('settings', { parameters: parseSettings(sql).sort((a, b) => a.section.localeCompare(b.section) || a.key.localeCompare(b.key)),
    refundRules: [...refundRules.values()].sort((a, b) => a.sort_order - b.sort_order) })
}

const steps = { code, schema, settings, states, tests, history, facts }
const pick = process.argv[2] ?? 'all'
for (const [name, fn] of Object.entries(steps)) if (pick === 'all' || pick === name) fn()
