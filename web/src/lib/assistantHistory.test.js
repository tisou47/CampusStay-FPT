import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TURN, turnsToSend } from './assistantHistory.js'

test('turnsToSend leaves out errors and turns the API would refuse', () => {
  const long = 'x'.repeat(MAX_TURN + 1)
  const sent = turnsToSend([
    { role: 'user', content: 'a' },
    { role: 'assistant', content: long, signature: 's1' },
    { role: 'assistant', content: 'Cannot reach the server', error: true },
    { role: 'assistant', content: 'b', signature: 's2' },
    { role: 'user', content: 'c' },
  ])
  assert.deepEqual(sent, [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b', signature: 's2' },
    { role: 'user', content: 'c' },
  ])
})

test('turnsToSend leaves out a question whose answer was stopped or failed, and the stopped answer', () => {
  const sent = turnsToSend([
    { role: 'user', content: 'When does registration close?' },
    { role: 'assistant', content: 'Registration closes on', stopped: true },
    { role: 'user', content: 'Which room am I in?' },
    { role: 'assistant', content: 'The assistant is offline', error: true },
    { role: 'user', content: 'hi' },
  ])
  assert.deepEqual(sent, [{ role: 'user', content: 'hi' }])
})

test('turnsToSend keeps only the last turns', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: String(i) }))
  const sent = turnsToSend(many, 20)
  assert.equal(sent.length, 20)
  assert.equal(sent[0].content, '10')
})
