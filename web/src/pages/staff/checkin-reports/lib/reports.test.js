import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffReports, differences, hasFinal, photosOn } from './diffReports.js'
import { queueOrder, severityOf } from './severity.js'

const detail = (over = {}) => ({
  differences: [],
  electricity: { baseline: 2072, student: 2117, verified: null },
  water: { baseline: 80, student: 80, verified: null },
  meterPhotos: [],
  items: [
    { itemId: '1', type: 'Bed', bed: 'B', baseline: 'Good', condition: 'Good', verified: null, differs: false, photos: [] },
    { itemId: '2', type: 'Wardrobe', bed: 'B', baseline: 'Good', condition: 'Missing', verified: null, differs: true, photos: [] },
  ],
  ...over,
})

test('counts the items and the meters the backend reports as different', () => {
  const d = diffReports(detail({ differences: ['Wardrobe B: Good → Missing', 'Electricity +45 kWh (allowed 2 kWh)'] }))
  assert.equal(d.diffCount, 2)
  assert.equal(d.meters[0].delta, 45)
  assert.equal(d.meters[0].isDiff, true)
  assert.equal(d.meters[1].isDiff, false)
  assert.deepEqual(differences(d).map((x) => x.key), ['electricity', '2'])
})

test('a meter within the accepted use is not a difference even when it moved', () => {
  const d = diffReports(detail({ items: [] }))
  assert.equal(d.meters[0].delta, 45)
  assert.equal(d.diffCount, 0)
})

test('a reading lower than the record counts once the backend flags it', () => {
  const d = diffReports(detail({ items: [], electricity: { baseline: 1703, student: 1450 }, differences: ['Electricity -253 kWh (lower than the record: meters only go up)'] }))
  assert.equal(d.meters[0].delta, -253)
  assert.equal(d.diffCount, 1)
})

test('the Final report exists only once Staff recorded something in the Room', () => {
  assert.equal(hasFinal(detail()), false)
  assert.equal(hasFinal(detail({ water: { baseline: 80, student: 80, verified: 80 } })), true)
  const d = diffReports(detail({ items: [{ itemId: '1', baseline: 'Good', condition: 'Damaged', verified: 'Good', differs: true }] }))
  assert.equal(d.final, true)
  assert.equal(d.items[0].final, 'Good')
})

test('photos count as on when the student sent any, or when the API says they are required', () => {
  assert.equal(photosOn(detail()), false)
  assert.equal(photosOn(detail({ meterPhotos: [{ id: 'p' }] })), true)
  assert.equal(photosOn(detail({ photosRequired: true })), true)
})

test('severity follows the backend comparison', () => {
  assert.equal(severityOf('Matched'), 'none')
  assert.equal(severityOf('Minor difference'), 'minor')
  assert.equal(severityOf('Major difference'), 'major')
})

test('without a comparison a Missing item is major and other differences minor', () => {
  assert.equal(severityOf(null, diffReports(detail())), 'major')
  const minor = detail({ items: [{ itemId: '1', baseline: 'Good', condition: 'Damaged', differs: true }] })
  assert.equal(severityOf(null, diffReports(minor)), 'minor')
  assert.equal(severityOf(null, diffReports(detail({ items: [] }))), 'none')
  assert.equal(severityOf(null, null), null)
})

test('the queue puts major first, then the longest waiting', () => {
  const rows = [
    { id: 'a', comparison: 'Minor difference', submittedAt: '2026-11-20T01:00:00Z' },
    { id: 'b', comparison: 'Major difference', submittedAt: '2026-11-21T01:00:00Z' },
    { id: 'c', comparison: 'Minor difference', submittedAt: '2026-11-19T01:00:00Z' },
  ]
  assert.deepEqual(queueOrder(rows).map((r) => r.id), ['b', 'c', 'a'])
})
