import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// checkinReports.js imports the app's modules (@/ alias, React, i18n), so it is loaded through Vite like the app,
// with a stand-in for the browser storage the i18n module reads. No test library beyond node:test.

let server
let m

before(async () => {
  // English, so the expected words are the source texts (the app's default is Vietnamese).
  const store = new Map([['campusstay-lang', 'en']])
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
  globalThis.window ??= globalThis
  server = await createServer({
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    resolve: { alias: { '@': fileURLToPath(new URL('../../../', import.meta.url)) } },
  })
  m = await server.ssrLoadModule(fileURLToPath(new URL('./checkinReports.js', import.meta.url)))
})

after(async () => {
  await server?.close()
})

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
  const d = m.diffReports(detail({ differences: ['Wardrobe B: Good → Missing', 'Electricity +45 kWh (allowed 2 kWh)'] }))
  assert.equal(d.diffCount, 2)
  assert.equal(d.meters[0].delta, 45)
  assert.equal(d.meters[0].isDiff, true)
  assert.equal(d.meters[1].isDiff, false)
  assert.deepEqual(m.differences(d).map((x) => x.key), ['electricity', '2'])
})

test('a meter within the accepted use is not a difference even when it moved', () => {
  const d = m.diffReports(detail({ items: [] }))
  assert.equal(d.meters[0].delta, 45)
  assert.equal(d.diffCount, 0)
})

test('a reading lower than the record counts once the backend flags it', () => {
  const d = m.diffReports(detail({ items: [], electricity: { baseline: 1703, student: 1450 }, differences: ['Electricity -253 kWh (lower than the record: meters only go up)'] }))
  assert.equal(d.meters[0].delta, -253)
  assert.equal(d.diffCount, 1)
})

test('the Final report exists only once Staff recorded something in the Room', () => {
  assert.equal(m.hasFinal(detail()), false)
  assert.equal(m.hasFinal(detail({ water: { baseline: 80, student: 80, verified: 80 } })), true)
  const d = m.diffReports(detail({ items: [{ itemId: '1', baseline: 'Good', condition: 'Damaged', verified: 'Good', differs: true }] }))
  assert.equal(d.final, true)
  assert.equal(d.items[0].final, 'Good')
})

test('photos count as on when the student sent any, or when the API says they are required', () => {
  assert.equal(m.photosOn(detail()), false)
  assert.equal(m.photosOn(detail({ meterPhotos: [{ id: 'p' }] })), true)
  assert.equal(m.photosOn(detail({ photosRequired: true })), true)
})

test('severity follows the backend comparison', () => {
  assert.equal(m.severityOf('Matched'), 'none')
  assert.equal(m.severityOf('Minor difference'), 'minor')
  assert.equal(m.severityOf('Major difference'), 'major')
})

test('without a comparison a Missing item is major and other differences minor', () => {
  assert.equal(m.severityOf(null, m.diffReports(detail())), 'major')
  const minor = detail({ items: [{ itemId: '1', baseline: 'Good', condition: 'Damaged', differs: true }] })
  assert.equal(m.severityOf(null, m.diffReports(minor)), 'minor')
  assert.equal(m.severityOf(null, m.diffReports(detail({ items: [] }))), 'none')
  assert.equal(m.severityOf(null, null), null)
})

test('the queue puts major first, then the longest waiting', () => {
  const rows = [
    { id: 'a', comparison: 'Minor difference', submittedAt: '2026-11-20T01:00:00Z' },
    { id: 'b', comparison: 'Major difference', submittedAt: '2026-11-21T01:00:00Z' },
    { id: 'c', comparison: 'Minor difference', submittedAt: '2026-11-19T01:00:00Z' },
  ]
  assert.deepEqual(m.queueOrder(rows).map((r) => r.id), ['b', 'c', 'a'])
})

test('a difference reads as words: the meter change, or the item from → to', () => {
  assert.equal(m.signedDelta(45, 'kWh'), '+45 kWh')
  assert.equal(m.signedDelta(-253, 'kWh'), '−253 kWh')
  assert.equal(m.signedDelta(null, 'kWh'), null)
  const d = m.diffReports(detail({ differences: ['Electricity +45 kWh (allowed 2 kWh)'] }))
  assert.equal(m.diffText(d.meters[0]), 'Electricity +45 kWh')
})
