import test from 'node:test'
import assert from 'node:assert/strict'
import { ruleRows } from './brmatrix.mjs'

test('ruleRows numbers each coded rule once, with its feature, class and the test cases that assert its code', () => {
  const messages = [
    { code: 'ALREADY_PAID', kind: 'conflict', message: 'This Invoice is already paid.', source: 'PaymentClaimService' },
    { code: 'ALREADY_PAID', kind: 'conflict', message: 'This Invoice is already paid.', source: 'PaymentClaimService' },
    { code: 'DEADLINE_PASSED', kind: 'conflict', message: 'The deadline has passed.', source: 'PaymentClaimService' },
    { code: null, kind: 'badRequest', message: 'Enter the name.', source: 'X' },
  ]
  const featureOf = (cls) => (cls === 'PaymentClaimService' ? 'BIL' : 'Platform')
  const tests = [
    { id: 'TC-BIL-020', body: 'andExpect(jsonPath("$.code").value("ALREADY_PAID"))' },
    { id: 'TC-BIL-021', body: 'nothing about codes' },
  ]
  assert.deepEqual(ruleRows(messages, featureOf, tests), [
    { id: 'BR-001', feature: 'BIL', code: 'ALREADY_PAID', rule: 'This Invoice is already paid.', where: 'PaymentClaimService', tests: ['TC-BIL-020'] },
    { id: 'BR-002', feature: 'BIL', code: 'DEADLINE_PASSED', rule: 'The deadline has passed.', where: 'PaymentClaimService', tests: [] },
  ])
})
