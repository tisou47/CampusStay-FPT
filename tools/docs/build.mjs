// Builds documents into the school templates, in place:
//   node tools/docs/build.mjs Report1 [Report3 …]     (names: tools/docs/outlines/templates.json)
//
// Each build starts from the untouched template at the branch base (git show <base>:<path>), so rebuilding is
// idempotent even though the result overwrites the template file in docs/. Content: tools/docs/src/<Name>.md (Markdown,
// `@include` partials). Record of Changes rows: tools/docs/src/changes.json { <Name>: [[date, A|M|D, in charge, text]] }.
// Writes docs/…/<template>.docx and .pdf, then runs check-docx.ps1 on the result.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const here = (...p) => path.join(root, 'tools/docs', ...p)
const templates = JSON.parse(fs.readFileSync(here('outlines/templates.json'), 'utf8'))
const changesFile = here('src/changes.json')
const changes = fs.existsSync(changesFile) ? JSON.parse(fs.readFileSync(changesFile, 'utf8')) : {}
const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim()
const COVER_PLACE_DATE = 'Ho Chi Minh City, November 2026'

/** Per document: where the replaced body starts, and extra cover replacements. */
const OPTIONS = {
  // The final report's template has no Record of Changes table.
  Report7: { bodyStart: 'Acknowledgement', replace: [['<Group Name>', 'GFA26SE104']], noRecordOfChanges: true },
}

// The tables the Markdown includes (tools/docs/src/_*.md) are regenerated from the data and git first.
execFileSync('node', [here('src/partials.mjs')], { cwd: root, stdio: 'inherit' })
execFileSync('node', [here('src/report3.mjs')], { cwd: root, stdio: 'inherit' })
execFileSync('node', [here('src/report4.mjs')], { cwd: root, stdio: 'inherit' })
const names = process.argv.slice(2)
if (!names.length) { console.error('usage: node tools/docs/build.mjs <Name> […]'); process.exit(2) }
// Report 5 also fills its two workbooks, each from its untouched template (data: tools/docs/build/testcases.json).
if (names.includes('Report5')) {
  execFileSync('node', [here('src/report5.mjs')], { cwd: root, stdio: 'inherit' })
  fs.mkdirSync(here('build/tpl'), { recursive: true })
  const tpl = (file) => {
    const p = here('build/tpl', path.basename(file))
    fs.writeFileSync(p, execFileSync('git', ['show', `${base}:${file}`], { cwd: root, maxBuffer: 1 << 28 }))
    return p
  }
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', here('pipeline/build-test-workbooks.ps1'),
    '-TestReportTpl', tpl('docs/SEP490_Report/Report5_Test Report.xlsx'), '-UnitTestTpl', tpl('docs/SEP490_Report/Report5_Unit Test.xls')], { cwd: root, stdio: 'inherit' })
}
let failed = 0
for (const name of names) {
  const template = templates[name]
  if (!template) throw new Error(`unknown document ${name}`)
  const src = here('src', `${name}.md`)
  if (!fs.existsSync(src)) throw new Error(`missing ${path.relative(root, src)}`)
  fs.mkdirSync(here('build/tpl'), { recursive: true })
  const pristine = here('build/tpl', `${name}.docx`)
  fs.writeFileSync(pristine, execFileSync('git', ['show', `${base}:${template}`], { cwd: root, maxBuffer: 1 << 28 }))
  const html = here('build', `${name}.html`)
  execFileSync('node', [here('pipeline/md2html.mjs'), src, html], { stdio: 'inherit' })
  const out = template.replace(/\.docx$/, '')
  const opt = OPTIONS[name] ?? {}
  const cfg = here('build', `${name}.json`)
  fs.writeFileSync(cfg, JSON.stringify({
    template: path.relative(root, pristine).replaceAll('\\', '/'),
    html: path.relative(root, html).replaceAll('\\', '/'),
    out,
    coverDate: COVER_PLACE_DATE,
    bodyStart: opt.bodyStart ?? 'II.',
    replace: opt.replace ?? [],
    changes: changes[name] ?? [],
  }, null, 1))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', here('pipeline/build-report.ps1'), '-Config', cfg], { stdio: 'inherit' })
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', here('check-docx.ps1'),
      '-Path', path.join(root, `${out}.docx`), '-Outline', here('outlines', `${name}.json`), ...(opt.noRecordOfChanges ? ['-NoRecordOfChanges'] : [])], { stdio: 'inherit' })
  } catch {
    failed++
  }
}
process.exit(failed ? 1 : 0)
