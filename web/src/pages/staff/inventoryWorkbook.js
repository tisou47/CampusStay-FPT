import { formatDateTime } from '@/lib/format'
import { XS, buildXlsx, colName } from '@/lib/xlsx'
import { t, tr } from '@/i18n'

// The Rooms and beds export as an XLSX workbook: an overview sheet (one row per floor, a total, beds per state), then
// one sheet per floor listing every bed with its room, state, occupant and the room's out-of-service record.
// Built from the same GET /inventory/rooms responses the screen shows.

export const bedLabel = {
  unpaid: 'Assigned – unpaid',
  paid: 'Paid – waiting for the door code',
  resident: 'Resident',
  leaving: 'Leaving at the end of the term',
  next_term: 'Moving in next term',
  available: 'Available',
  oos: 'Out of service',
}
const HELD = ['unpaid', 'paid', 'resident', 'leaving', 'next_term']

// A floor whose rooms have different Room Classes has no single class: list them.
const floorClasses = (data) =>
  data.roomClassName ? tr(data.roomClassName) : [...new Set((data.rooms ?? []).map((r) => r.roomClassName).filter(Boolean))].map((c) => tr(c)).join(' / ')

const count = (rooms, states) => rooms.reduce((a, r) => a + r.beds.filter((b) => states.includes(b.state)).length, 0)

/** floors: [{ floor, data: { roomClassName, rooms, summary } }] */
export function inventoryWorkbook({ block, termName, floors }) {
  const now = formatDateTime(new Date())
  const blockLabel = t('Block {code}', { code: block })
  const subtitle = [termName && t('Term {term}', { term: termName }), t('Exported {date}', { date: now })].filter(Boolean).join(' · ')

  // Overview sheet.
  const head = ['Floor', 'Room tier', 'Rooms', 'Beds', 'Allocated', 'Residents', 'Available', 'Out of service', 'Allocated (%)']
  const rows = [
    [{ v: t('Rooms and beds · {block}', { block: blockLabel }), s: XS.title }],
    [{ v: subtitle, s: XS.subtitle }],
    [],
    head.map((h) => ({ v: t(h), s: XS.header })),
  ]
  const totals = { rooms: 0, beds: 0, allocated: 0, residents: 0, available: 0, oos: 0 }
  for (const { floor, data } of floors) {
    const rooms = data.rooms ?? []
    const beds = rooms.reduce((a, r) => a + r.beds.length, 0)
    const allocated = count(rooms, HELD)
    const residents = count(rooms, ['resident', 'leaving'])
    const available = count(rooms, ['available'])
    const oos = count(rooms, ['oos'])
    totals.rooms += rooms.length
    totals.beds += beds
    totals.allocated += allocated
    totals.residents += residents
    totals.available += available
    totals.oos += oos
    rows.push([
      { v: t('Floor {n}', { n: floor }), s: XS.strong },
      { v: floorClasses(data), s: XS.cell },
      { v: rooms.length, s: XS.center },
      { v: beds, s: XS.center },
      { v: allocated, s: XS.center },
      { v: residents, s: XS.center },
      { v: available, s: XS.center },
      { v: oos, s: XS.center },
      { v: beds ? allocated / beds : 0, s: XS.percent },
    ])
  }
  rows.push([
    { v: t('Total'), s: XS.totalLabel },
    { v: '', s: XS.totalLabel },
    { v: totals.rooms, s: XS.totalNumber },
    { v: totals.beds, s: XS.totalNumber },
    { v: totals.allocated, s: XS.totalNumber },
    { v: totals.residents, s: XS.totalNumber },
    { v: totals.available, s: XS.totalNumber },
    { v: totals.oos, s: XS.totalNumber },
    { v: totals.beds ? totals.allocated / totals.beds : 0, s: XS.totalPercent },
  ])
  // Beds per state, the legend of the screen.
  rows.push([], [{ v: t('Beds by state'), s: XS.title }], [{ v: t('State'), s: XS.header }, { v: t('Beds'), s: XS.header }])
  const all = floors.flatMap((f) => f.data.rooms ?? [])
  for (const state of Object.keys(bedLabel)) rows.push([{ v: t(bedLabel[state]), s: XS[state] }, { v: count(all, [state]), s: XS.center }])

  const overview = {
    name: t('Overview'),
    cols: [16, 16, 10, 10, 12, 12, 12, 16, 14],
    rows,
    merges: [`A1:${colName(head.length - 1)}1`, `A2:${colName(head.length - 1)}2`],
    heights: { 0: 26, 3: 22 },
    freezeRow: 4,
  }

  // One sheet per floor.
  const cols = ['Room', 'Room type', 'Room tier', 'Bed', 'State', 'Student', 'Student code', 'Room status', 'Out of service since', 'Reason', 'Set by', 'Note']
  const floorSheets = floors.map(({ floor, data }) => {
    const rooms = data.rooms ?? []
    const s = data.summary
    const title = [blockLabel, t('Floor {n}', { n: floor }), floorClasses(data)].filter(Boolean).join(' · ')
    const line = s
      ? [
          t('{n} rooms', { n: rooms.length }),
          t('{beds} beds · {allocated} allocated · {available} available', { beds: s.beds, allocated: s.allocated, available: s.available }),
          s.outOfService ? t('{n} out of service', { n: s.outOfService }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
    const out = [[{ v: title, s: XS.title }], [{ v: `${line}${line ? ' · ' : ''}${subtitle}`, s: XS.subtitle }], [], cols.map((h) => ({ v: t(h), s: XS.header }))]
    for (const room of rooms) {
      const oos = room.outOfService
      const allocated = room.beds.filter((b) => HELD.includes(b.state)).length
      const status = oos ? t('Out of service') : t('{n} / {total} allocated', { n: allocated, total: room.capacity })
      room.beds.forEach((bed, i) => {
        out.push([
          { v: room.code, s: i === 0 ? XS.strong : XS.muted },
          { v: tr(room.roomTypeName), s: XS.cell },
          { v: tr(room.roomClassName), s: XS.cell },
          { v: bed.id, s: XS.cell },
          { v: t(bedLabel[bed.state] ?? bed.state), s: XS[bed.state] ?? XS.cell },
          { v: bed.occupant?.name ?? '', s: XS.cell },
          { v: bed.occupant?.studentCode ?? '', s: XS.cell },
          { v: status, s: XS.cell },
          { v: oos ? formatDateTime(oos.since) : '', s: XS.cell },
          { v: oos ? tr(oos.reason) : '', s: XS.cell },
          { v: oos?.by ?? '', s: XS.cell },
          { v: oos?.note ?? '', s: XS.cell },
        ])
      })
    }
    const last = Math.max(out.length, 5)
    return {
      name: t('Floor {n}', { n: floor }),
      cols: [10, 12, 12, 12, 28, 26, 14, 16, 20, 22, 18, 28],
      rows: out,
      merges: [`A1:${colName(cols.length - 1)}1`, `A2:${colName(cols.length - 1)}2`],
      heights: { 0: 26, 3: 22 },
      freezeRow: 4,
      filter: `A4:${colName(cols.length - 1)}${last}`,
    }
  })

  return buildXlsx([overview, ...floorSheets])
}
