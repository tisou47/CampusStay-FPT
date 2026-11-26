// Route-link check (review WEB-ADM-19, Wave 3 QA): every in-app link target written in web/src (`to="…"`,
// `to={`…`}`, `to: '…'`, `navigate('…')`) must match a route of src/app/router.jsx, so a renamed page cannot leave a
// 404 link behind (WEB-ADM-01). Template parts (`${id}`, `${base}`) match any one path segment.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('..', import.meta.url))
const ANY = '\u0000' // a segment built from a template expression

/**
 * Route patterns ("/student/invoices/:id/pay") read from the router's `{ path: … }` and `portal(…)` entries. A shared
 * list (`const checkinReportRoutes = [ … ]`) is read once and its paths added where a portal spreads it (`...name`).
 */
export function routePatterns(routerSource) {
  const shared = {}
  for (const m of routerSource.matchAll(/^const (\w+) = \[\r?\n([\s\S]*?)^\]/gm)) {
    shared[m[1]] = [...m[2].matchAll(/\bpath:\s*'([^']+)'/g)].map((p) => p[1])
  }
  const patterns = new Set()
  let portal = null
  for (const line of routerSource.split('\n')) {
    const spread = line.match(/^\s*\.\.\.(\w+),?\s*$/)
    if (portal && spread && shared[spread[1]]) {
      for (const p of shared[spread[1]]) patterns.add(`/${portal}/${p}`)
      continue
    }
    const opened = line.match(/portal\('([a-z]+)'/)
    if (opened) {
      portal = opened[1]
      patterns.add(`/${portal}`)
      continue
    }
    if (portal && /^\s*\]\),?\s*$/.test(line)) {
      portal = null
      continue
    }
    for (const m of line.matchAll(/\bpath:\s*'([^']+)'/g)) {
      if (m[1] === '*') continue
      patterns.add(portal ? `/${portal}/${m[1]}` : `/${m[1]}`)
    }
  }
  return [...patterns]
}

/** Link targets of one source file: absolute in-app paths, templates included. */
export function linkTargets(source) {
  const found = []
  const add = (raw) => {
    const literal = raw.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ANY)
    if (literal.startsWith('/') || literal.startsWith(ANY)) found.push(literal)
  }
  const direct = /(?:\bto=\{?|\bto:\s*|\bnavigate\(\s*)(['"`])((?:\/|\$\{)(?:(?!\1)[^\n])*)\1/g
  for (const m of source.matchAll(direct)) add(m[2])
  // to={cond ? '/a' : '/b'} and navigate(cond ? `/a/${x}` : '/b')
  for (const m of source.matchAll(/(?:\bto=\{|\bnavigate\()([^\n]*\?[^\n]*)/g)) {
    for (const s of m[1].matchAll(/(['"`])((?:\/|\$\{)(?:(?!\1)[^\n])*)\1/g)) add(s[2])
  }
  return [...new Set(found)]
}

/** Does the target (query and hash dropped) match one of the patterns? */
export function matches(target, patterns) {
  const path = target.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  const segs = (path.startsWith('/') ? path : `/${path}`).split('/').slice(1)
  // `${base}/meters`: a leading template part may stand for several segments (the page's own path), so the rest only
  // has to match the end of a route.
  const base = segs[0] === ANY && segs.length > 1
  return patterns.some((p) => {
    let ps = p.split('/').slice(1)
    if (base && ps.length > segs.length) ps = [ps.slice(0, ps.length - segs.length + 1).join('/'), ...ps.slice(ps.length - segs.length + 1)]
    if (ps.length !== segs.length) return false
    return ps.every((s, i) => s === segs[i] || s.startsWith(':') || segs[i].includes(ANY))
  })
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return files(full)
    return /\.(jsx?|mjs)$/.test(name) && !name.endsWith('.test.js') ? [full] : []
  })
}

test('the matcher understands params, templates and queries', () => {
  const patterns = ['/student', '/student/invoices/:id/pay', '/admin/terms/new']
  assert.ok(matches('/student/invoices/INV-1/pay?from=home', patterns))
  assert.ok(matches(`/student/invoices/${ANY}/pay`, patterns))
  assert.ok(matches(`${ANY}/terms/new`, patterns))
  assert.ok(!matches('/student/invoice/INV-1/pay', patterns))
  assert.ok(matches(`${ANY}/pay`, patterns))
  assert.ok(!matches(`${ANY}/payment`, patterns))
  assert.deepEqual(routePatterns("const shared = [\n  { path: 'a/:id' },\n]\nportal('staff', [\n  ...shared,\n])"), ['/a/:id', '/staff', '/staff/a/:id'])
  assert.deepEqual(linkTargets("<Link to={`/student/invoices/${inv.id}/pay`}> navigate(ok ? '/student' : `/x/${a}`)"),
    [`/student/invoices/${ANY}/pay`, '/student', `/x/${ANY}`])
})

test('every link in web/src points to a route of router.jsx', () => {
  const patterns = routePatterns(readFileSync(join(src, 'app', 'router.jsx'), 'utf8'))
  assert.ok(patterns.length > 100, `only ${patterns.length} routes read from router.jsx`)
  const broken = []
  let checked = 0
  for (const file of files(src)) {
    for (const target of linkTargets(readFileSync(file, 'utf8'))) {
      checked++
      if (!matches(target, patterns)) broken.push(`${relative(src, file)}: ${target.replaceAll(ANY, '${…}')}`)
    }
  }
  assert.ok(checked > 100, `only ${checked} links found`)
  assert.deepEqual(broken, [], `links without a route:\n${broken.join('\n')}`)
})
