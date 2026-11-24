import test from 'node:test'
import assert from 'node:assert/strict'
import { stripRefs } from './refs.mjs'

test('stripRefs drops parentheses that hold only internal references', () => {
  assert.equal(stripRefs('Utility debt (spec §6.14, D-27), worked out'), 'Utility debt, worked out')
  assert.equal(stripRefs('commits a Block\'s proposal (ADR-19).'), 'commits a Block\'s proposal.')
  assert.equal(stripRefs('Family Day statistics (contract A-71).'), 'Family Day statistics.')
})

test('stripRefs keeps the meaning inside a longer parenthesis', () => {
  assert.equal(stripRefs('in one list (spec §5.1 M4: Managers decide in bulk), then'), 'in one list (M4: Managers decide in bulk), then')
  assert.equal(stripRefs('The Term transition (spec §10): the window'), 'The Term transition: the window')
})

test('stripRefs removes review ids that lead a test title', () => {
  assert.equal(stripRefs('(Wave 1 regression): BE-AUTH-02: a stranger cannot lock the owner out'), 'Regression: a stranger cannot lock the owner out')
  assert.equal(stripRefs('(BE-3RD-05): a list said "Withdrawn"'), 'a list said "Withdrawn"')
  assert.equal(stripRefs('Endpoints had no rate limit (BE-AUTH-02)'), 'Endpoints had no rate limit')
})

test('stripRefs leaves ordinary text alone', () => {
  assert.equal(stripRefs('Flyway migrations V1–V103 (negative): checks'), 'Flyway migrations V1–V103 (negative): checks')
})

test('stripRefs removes trailing reference lists, bare spec sections and contract numbers', () => {
  assert.equal(stripRefs('A resident\'s Family Days, guests and passes: ADR-29, contract A-69.'), 'A resident\'s Family Days, guests and passes.')
  assert.equal(stripRefs('Announcements (A-30, spec §6.5): /announcements for Staff'), 'Announcements: /announcements for Staff')
  assert.equal(stripRefs('the Timeline step checks spec §5.2 per field'), 'the Timeline step checks per field')
  assert.equal(stripRefs('The seven refund triggers of spec §9 are there'), 'The seven refund triggers are there')
  assert.equal(stripRefs('BE-ASG-06 (uses the requests window, hence here): a resident'), 'a resident')
  assert.equal(stripRefs('Room A-801 and Block A'), 'Room A-801 and Block A')
})

test('stripRefs drops a leading parenthesis that names a finding, and the id after "finding"', () => {
  assert.equal(stripRefs('(final review of BE-3RD-01): when the inspector is disabled'), 'when the inspector is disabled')
  assert.equal(stripRefs('(review finding BE-AUTH-01, the only Critical one)'), '(review finding, the only Critical one)')
})
