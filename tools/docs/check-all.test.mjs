import test from 'node:test'
import assert from 'node:assert/strict'
import { numberDiffs } from './check-all.mjs'

const facts = { controllers: 63, endpoints: 353, tables: 118, migrations: 100, lastMigration: 'V103', mobileScreens: 30 }

test('numberDiffs reports labelled numbers that differ from the facts', () => {
  const text = 'It has 63 REST controllers and 350 endpoints, 118 tables, 99 Flyway migrations (V1–V102).'
  assert.deepEqual(numberDiffs(text, facts), [
    '350 endpoints (facts: 353)',
    '99 Flyway migrations (facts: 100)',
    'V1–V102 (facts: V103)',
  ])
})

test('numberDiffs reads thousands separators and ignores unlabelled numbers', () => {
  assert.deepEqual(numberDiffs('1,000 tables; 30 screens; room 118', { ...facts, tables: 1000 }), [])
})
