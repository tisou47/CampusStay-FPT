import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths, endOfMonth, isoWeek, localToIso, mask, monthWeeks, parseDate, parseDateTime, parseTime, RANGES, slotErrors,
  splitRange, startOfWeek, timeSlots, toDay, toLocal,
} from './datetime.js'

test('masks typed digits', () => {
  assert.equal(mask('date', '16112026'), '16/11/2026')
  assert.equal(mask('date', '161'), '16/1')
  assert.equal(mask('time', '830'), '08:30')
  assert.equal(mask('time', '8'), '08')
  assert.equal(mask('time', '1'), '1')
  assert.equal(mask('time', '1245'), '12:45')
  assert.equal(mask('dateTime', '161120260830'), '16/11/2026, 08:30')
  assert.equal(mask('timeRange', '08001000'), '08:00 – 10:00')
  assert.equal(mask('dateRange', '1611202620112026'), '16/11/2026 – 20/11/2026')
  assert.equal(mask('dateTimeRange', '16112026080010'), '16/11/2026, 08:00 – 10')
})

test('parses typed dates and times', () => {
  assert.equal(parseDate('16/11/2026'), '2026-11-16')
  assert.equal(parseDate('1/2/26'), '2026-02-01')
  assert.equal(parseDate('31/02/2026'), null)
  assert.equal(parseDate('abc'), null)
  assert.equal(parseTime('830'), '08:30')
  assert.equal(parseTime('8h30'), '08:30')
  assert.equal(parseTime('8'), '08:00')
  assert.equal(parseTime('24:00'), null)
  assert.equal(parseDateTime('16/11/2026, 08:30'), '2026-11-16T08:30')
  assert.equal(parseDateTime('16/11/2026 8:30'), '2026-11-16T08:30')
  assert.deepEqual(splitRange('08:00 – 10:00'), ['08:00', '10:00'])
  assert.deepEqual(splitRange('08:00-10:00'), ['08:00', '10:00'])
})

test('campus clock is UTC+7 and calendar days never shift', () => {
  assert.equal(toLocal('2026-11-15T18:30:00Z'), '2026-11-16T01:30')
  assert.equal(localToIso('2026-11-16T01:30'), '2026-11-15T18:30:00.000Z')
  assert.equal(toDay('2026-11-16'), '2026-11-16')
})

test('calendar grid starts on Monday', () => {
  assert.equal(startOfWeek('2026-11-15'), '2026-11-09')
  const weeks = monthWeeks('2026-11-01')
  assert.equal(weeks[0][0], '2026-10-26')
  assert.equal(weeks.length, 6)
  assert.equal(isoWeek('2026-01-01'), 1)
  assert.equal(isoWeek('2026-11-16'), 47)
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28')
  assert.deepEqual(RANGES('2026-11-15')[1].value, { start: '2026-11-16', end: '2026-11-22' })
  assert.deepEqual(timeSlots('06:00', '07:00', 30), ['06:00', '06:30', '07:00'])
})

test('time slots of a day do not overlap', () => {
  const errors = slotErrors([
    { start: '2026-11-16T08:00', end: '2026-11-16T10:00' },
    { start: '2026-11-16T10:00', end: '2026-11-16T12:00' },
    { start: '2026-11-16T11:00', end: '2026-11-16T13:00' },
    { start: '2026-11-16T15:00', end: '2026-11-16T14:00' },
  ])
  assert.equal(errors[0], null)
  assert.deepEqual(errors[1], { code: 'overlap', with: 2 })
  assert.deepEqual(errors[2], { code: 'overlap', with: 1 })
  assert.deepEqual(errors[3], { code: 'end-before-start' })
})
