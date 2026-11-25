import test from 'node:test'
import assert from 'node:assert/strict'
import { PHOTO_MAX_MB, photoProblem } from './uploads.js'

test('photoProblem accepts JPEG and PNG up to the limit', () => {
  const mb = 1024 * 1024
  assert.equal(photoProblem({ type: 'image/jpeg', size: 2 * mb }), null)
  assert.equal(photoProblem({ type: 'image/png', size: PHOTO_MAX_MB * mb }), null)
  assert.equal(photoProblem({ type: 'image/png', size: PHOTO_MAX_MB * mb + 1 }), 'size')
  assert.equal(photoProblem({ type: 'image/heic', size: mb }), 'type')
  assert.equal(photoProblem({ type: 'application/pdf', size: mb }), 'type')
  assert.equal(photoProblem(null), 'type')
})
