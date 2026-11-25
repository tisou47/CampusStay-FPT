import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDecimal } from './numbers.js'
import { csvCell } from './report.js'

test('parseDecimal reads vi and en formats', () => {
  assert.equal(parseDecimal('1360,5'), 1360.5)
  assert.equal(parseDecimal('1.360,5'), 1360.5)
  assert.equal(parseDecimal('1360.5'), 1360.5)
  assert.equal(parseDecimal('1,360.5'), 1360.5)
  assert.equal(parseDecimal('12,5'), 12.5)
  assert.equal(parseDecimal(''), null)
  assert.equal(parseDecimal('  '), null)
  assert.equal(parseDecimal(null), null)
  assert.ok(Number.isNaN(parseDecimal('12a')))
  assert.equal(parseDecimal(55), 55)
})

test('csvCell neutralises formulas', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csvCell('-5'), "'-5")
  assert.equal(csvCell('@x'), "'@x")
  assert.equal(csvCell('Nguyễn'), 'Nguyễn')
  assert.equal(csvCell('a,b'), '"a,b"')
})

test('a lone separator followed by exactly three digits is ambiguous (M1)', () => {
  // "1.360" is 1360 in Vietnamese and 1.36 in English: the field shows an error instead of guessing.
  assert.ok(Number.isNaN(parseDecimal('1.360')))
  assert.ok(Number.isNaN(parseDecimal('1,360')))
  assert.ok(Number.isNaN(parseDecimal('-2.500')))
  assert.equal(parseDecimal('12,5'), 12.5)
  assert.equal(parseDecimal('1360,5'), 1360.5)
  assert.equal(parseDecimal('1.360,5'), 1360.5)
  assert.equal(parseDecimal('0,125'), 0.125)
  assert.equal(parseDecimal('1.25'), 1.25)
})

test('parseReading: one reader for every meter input (WEB-OPS-17)', async () => {
  const { parseReading } = await import('./numbers.js')
  assert.equal(parseReading('12,5'), 12.5)
  assert.equal(parseReading('1.234,5'), 1234.5)
  assert.equal(parseReading(''), null)
  assert.ok(Number.isNaN(parseReading('1.234')))
  assert.ok(Number.isNaN(parseReading('abc')))
  assert.ok(Number.isNaN(parseReading('-3')))
  assert.equal(parseReading('0'), 0)
})
