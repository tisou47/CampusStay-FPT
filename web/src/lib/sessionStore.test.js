import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionStore } from './sessionStore.js'

function fakeStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }
}

test('"Remember me" keeps the session in localStorage', () => {
  const local = fakeStorage(), tab = fakeStorage()
  const s = sessionStore(local, tab, 'k')
  s.write({ token: 'a' }, true)
  assert.equal(local.m.has('k'), true)
  assert.equal(tab.m.has('k'), false)
  assert.deepEqual(s.read(), { token: 'a' })
})

test('without "Remember me" the session lives only in the tab', () => {
  const local = fakeStorage(), tab = fakeStorage()
  const s = sessionStore(local, tab, 'k')
  s.write({ token: 'old' }, true)
  s.write({ token: 'b' }, false)
  assert.equal(local.m.has('k'), false, 'an older remembered session is removed')
  assert.deepEqual(s.read(), { token: 'b' })
})

test('a refresh without remember stays where the session is; sign-out clears both', () => {
  const local = fakeStorage(), tab = fakeStorage()
  const s = sessionStore(local, tab, 'k')
  s.write({ token: 'c' }, false)
  s.write({ token: 'c', user: { name: 'X' } })
  assert.equal(local.m.has('k'), false)
  assert.deepEqual(s.read(), { token: 'c', user: { name: 'X' } })
  s.write(null)
  assert.equal(s.read(), null)
})
