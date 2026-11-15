#!/usr/bin/env node
// npm run lint (also before every build): dates and times are chosen with components/ui/date-time only.
// Fails on a native <input type="date|time|datetime-local|month|week">, on an import of the removed pickers
// (components/ui/DatePicker, components/ui/DateTimePicker) and on a third-party date-picker package.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'src')
const NATIVE = /<(input|Input)\b[^>]*?\btype\s*=\s*(?:\{\s*)?["'`](date|time|datetime-local|month|week)["'`]/gs
const OLD = /from\s+["']@\/components\/ui\/(DatePicker|DateTimePicker)["']/g
const PACKAGES = ['react-datepicker', 'react-day-picker', 'flatpickr', 'react-flatpickr', 'pikaday', '@mui/x-date-pickers', 'rc-picker', 'react-dates']

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/.*$/gm, '$1')
const lineOf = (code, index) => code.slice(0, index).split('\n').length

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) yield path
  }
}

const problems = []
for (const file of files(src)) {
  const code = stripComments(readFileSync(file, 'utf8'))
  const name = relative(root, file).replaceAll('\\', '/')
  for (const m of code.matchAll(NATIVE)) {
    problems.push(`${name}:${lineOf(code, m.index)}  native <input type="${m[2]}">: use DatePicker, TimePicker, DateTimePicker… from @/components/ui/date-time`)
  }
  for (const m of code.matchAll(OLD)) {
    problems.push(`${name}:${lineOf(code, m.index)}  ${m[1]} was removed: use @/components/ui/date-time`)
  }
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (PACKAGES.includes(dep)) problems.push(`package.json  ${dep}: dates are chosen with @/components/ui/date-time`)
}

if (problems.length) {
  console.error(`lint-date-inputs: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('lint-date-inputs: no native date/time inputs')
