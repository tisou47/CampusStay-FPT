// Consistency check of the whole document set: hand-written numbers against facts.json, the diagrams against the code,
// the coverage of Reports 3 and 4, and every built document against its template outline. Exit 1 on any difference.
//   node tools/docs/check-all.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Labels used in the hand-written text (tools/docs/src/Report*.md) and the fact each one states.
const LABELS = [['REST controllers', 'controllers'], ['controllers', 'controllers'], ['endpoints', 'endpoints'], ['web pages', 'webPages'],
  ['permissions', 'permissions'], ['tables', 'tables'], ['views', 'views'], ['Flyway migrations', 'migrations'], ['migrations', 'migrations'], ['screens', 'mobileScreens']]

/** The labelled numbers of a text that differ from the facts, e.g. "350 endpoints (facts: 353)". */
export function numberDiffs(text, facts) {
  const out = []
  const labels = LABELS.map(([l]) => l).join('|')
  for (const m of text.matchAll(new RegExp(`\\b(\\d[\\d,]*) (${labels})\\b`, 'g'))) {
    const key = LABELS.find(([l]) => l === m[2])[1]
    if (facts[key] !== undefined && Number(m[1].replace(/,/g, '')) !== facts[key]) out.push(`${m[0]} (facts: ${facts[key]})`)
  }
  for (const m of text.matchAll(/V1–(V\d+)/g)) if (m[1] !== facts.lastMigration) out.push(`${m[0]} (facts: ${facts.lastMigration})`)
  return out
}

function run(label, cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    console.log(`ok   ${label}`)
    return 0
  } catch (e) {
    console.log(`FAIL ${label}\n${String(e.stdout ?? '').split('\n').filter((l) => /FAIL|missing|differ|error/i.test(l)).slice(0, 8).join('\n')}`)
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const facts = JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data/facts.json'), 'utf8'))
  let failed = 0
  for (const f of fs.readdirSync(path.join(root, 'tools/docs/src')).filter((n) => /^Report\d\.md$/.test(n))) {
    const diffs = numberDiffs(fs.readFileSync(path.join(root, 'tools/docs/src', f), 'utf8'), facts)
    console.log(diffs.length ? `FAIL numbers in ${f}: ${diffs.join('; ')}` : `ok   numbers in ${f}`)
    failed += diffs.length ? 1 : 0
  }
  failed += run('diagrams match the code', 'node', ['tools/docs/diagrams/build.mjs', '--check'])
  for (const r of ['Report3', 'Report4']) failed += run(`coverage of ${r}`, 'node', ['tools/docs/coverage.mjs', r])
  const templates = JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/outlines/templates.json'), 'utf8'))
  for (const name of Object.keys(templates).filter((n) => n.startsWith('Report'))) {
    failed += run(`template outline of ${name}`, 'powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/docs/check-docx.ps1',
      '-Path', templates[name], '-Outline', `tools/docs/outlines/${name}.json`, ...(name === 'Report7' ? ['-NoRecordOfChanges'] : [])])
  }
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed')
  process.exit(failed ? 1 : 0)
}
