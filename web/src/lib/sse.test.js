import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSse } from './sse.js'

test('complete events are parsed, the unfinished tail is kept', () => {
  const { events, rest } = parseSse('event: delta\ndata: {"text":"Xin"}\n\nevent: delta\ndata: {"text":" chào"}\n\nevent: do')
  assert.deepEqual(events, [
    { event: 'delta', data: '{"text":"Xin"}' },
    { event: 'delta', data: '{"text":" chào"}' },
  ])
  assert.equal(rest, 'event: do')
})

test('CRLF lines, multi-line data and comments', () => {
  const { events, rest } = parseSse(': ping\r\n\r\nevent: done\r\ndata: a\r\ndata: b\r\n\r\n')
  assert.deepEqual(events, [{ event: 'done', data: 'a\nb' }])
  assert.equal(rest, '')
})
