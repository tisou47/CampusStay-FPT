// Checks that a built report names everything the code has: every web route, every endpoint, every API message.
//   node tools/docs/coverage.mjs Report3          exit 1 with the missing items
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))

/** What is missing from the document's lines: routes, "METHOD path" pairs (same table row), messages. */
export function missing(lines) {
  const text = lines.join('\n')
  const routes = data('screens.json').web.filter((r) => r.path !== '/*' && !r.path.startsWith('/dev/')).map((r) => r.path)
    .filter((p) => !text.includes(p))
  // A table row is read as its cells, one paragraph each: the method's line is followed by the path's line.
  const pairs = new Set(lines.map((l, i) => `${l.trim()} ${(lines[i + 1] ?? '').trim()}`))
  const endpoints = data('endpoints.json').map((e) => `${e.method} ${e.path}`).filter((k) => !pairs.has(k) && !text.includes(k))
  const messages = data('messages.json').map((m) => m.message.trim()).filter((m) => !text.includes(m))
  return { routes, endpoints, messages }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2] ?? 'Report3'
  const docx = JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/outlines/templates.json'), 'utf8'))[name]
  const out = path.join(root, 'tools/docs/build', `${name}.txt`)
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/docs/docx-text.ps1'), '-Path', path.join(root, docx), '-Out', out], { stdio: 'inherit' })
  const m = missing(fs.readFileSync(out, 'utf8').split(/\r?\n/))
  for (const [k, v] of Object.entries(m)) {
    console.log(`${k}: ${v.length} missing`)
    for (const x of v.slice(0, 10)) console.log(`  ${x}`)
  }
  process.exit(Object.values(m).some((v) => v.length) ? 1 : 0)
}
