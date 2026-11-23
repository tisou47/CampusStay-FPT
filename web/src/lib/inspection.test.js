import test from 'node:test'
import assert from 'node:assert/strict'
import { photoAllowed } from './inspection.js'

// Final review #1: the API takes item photos only for furniture items; a photo matters when one is Damaged or Missing.
test('a photo can be added to a Damaged or Missing furniture item only', () => {
  assert.equal(photoAllowed({ id: 'furniture-7', furniture: true }, { condition: 'Damaged' }), true)
  assert.equal(photoAllowed({ id: 'furniture-7', furniture: true }, { condition: 'Missing' }), true)
  assert.equal(photoAllowed({ id: 'furniture-7', furniture: true }, { condition: 'Worn' }), false)
  assert.equal(photoAllowed({ id: 'check-3' }, { result: 'Fail' }), false)
  assert.equal(photoAllowed({ id: 'furniture-7', furniture: true }, undefined), false)
})
