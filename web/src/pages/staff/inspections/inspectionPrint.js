import { api } from '@/api/endpoints'
import { conditionName, typeName } from '@/lib/furniture'
import { formatDate, formatDateTime } from '@/lib/format'
import { downloadCsv, h, printDocument } from '@/lib/report'
import { t, tr } from '@/i18n'

export function summary(r, total) {
  const results = r.results ?? []
  const failed = results.filter((x) => x.result === 'Fail').length
  const checked = results.filter((x) => x.result && x.result !== 'Not checked').length
  if (!checked) return t('Not started')
  if (failed) return t(failed === 1 ? '{n} item failed' : '{n} items failed', { n: failed })
  return checked < total ? t('In progress') : t('All passed')
}

/** The checklist's items; pre-arrival handover runs also include the Room's own checks (people count & furniture items). */
export function roomItems(run, room) {
  const checklist = (run.checklist?.items ?? []).map((i) => ({ id: String(i.id), label: tr(i.label), kind: 'checklist' }))
  if (!room?.metersNeeded) {
    return checklist
  }
  return [
    ...checklist,
    ...(room.checks ?? []).map((c) => ({
      id: c.id,
      kind: c.kind,
      furniture: c.kind === 'furniture',
      label:
        c.kind === 'people'
          ? t('Number of people matches the residents ({n})', { n: c.expected ?? 0 })
          : `${typeName(c)} · ${c.assetCode}${c.bed ? ` · ${t('Bed {bed}', { bed: c.bed })}` : ` · ${t('Shared')}`}`,
    })),
  ]
}

/** Builds a printable room inspection sheet; leaves unchecked results, missing meter readings, and empty notes blank for hand-writing. */
export function buildRoomSheetHtml(run, room, { pageIndex, totalPages } = {}) {
  const items = roomItems(run, room)
  const results = Object.fromEntries((room.results ?? []).map((r) => [r.itemId, r]))
  const cls = (r) => (r?.condition === 'Damaged' || r?.result === 'Fail' ? 'bad' : r?.condition === 'Missing' ? 'warn' : r?.result === 'Pass' ? 'ok' : '')
  const hasAnswer = (it, r) => (it.furniture ? Boolean(r?.condition || (r?.result && r.result !== 'Not checked')) : Boolean(r?.result && r.result !== 'Not checked'))
  const answer = (it, r) => (it.furniture ? conditionName(r?.condition) || (r?.result && r.result !== 'Not checked' ? t(r.result) : '') : r?.result && r.result !== 'Not checked' ? t(r.result) : '')
  const rows = items
    .map((it) => {
      const r = results[it.id]
      const answered = hasAnswer(it, r)
      const resultCell = answered
        ? `<td><span class="tag ${cls(r)}">${h(answer(it, r))}</span></td>`
        : `<td style="height:26px">&nbsp;</td>`
      const noteCell = r?.note ? `<td>${h(r.note)}</td>` : `<td style="height:26px">&nbsp;</td>`
      return `<tr><td>${h(it.label)}</td>${resultCell}${noteCell}</tr>`
    })
    .join('')
  const elecCell = room.meters?.electricity != null ? `<td>${h(room.meters.electricity)}</td>` : `<td style="height:32px">&nbsp;</td>`
  const waterCell = room.meters?.water != null ? `<td>${h(room.meters.water)}</td>` : `<td style="height:32px">&nbsp;</td>`
  const pageBadge = totalPages > 1 ? `<div class="page-num">${h(t('Page {n} / {total}', { n: pageIndex + 1, total: totalPages }))}</div>` : ''
  return `<section class="page-sheet">
    ${pageBadge}
    <h1>${h(t('Room inspection report · {room}', { room: room.room }))}</h1>
    <p class="muted">${h(t('Report 1 · Room’s record: new residents’ check-in inventories are compared with it.'))}</p>
    <div class="grid">
      <div><b>${h(t('Run'))}:</b> ${h(run.id)} · ${h(tr(run.scheduleName) ?? '')}</div>
      <div><b>${h(t('Block'))}:</b> ${h(run.block ?? '')}</div>
      <div><b>${h(t('Room'))}:</b> ${h(room.room)} · ${h([tr(room.roomTypeName), tr(room.roomClassName)].filter(Boolean).join(' '))}</div>
      <div><b>${h(t('Status'))}:</b> ${h(t(room.status))}</div>
      <div><b>${h(t('Inspector'))}:</b> ${h(run.assigneeName ?? run.inspectorName ?? '')}</div>
      <div><b>${h(t('Inspected at'))}:</b> ${h(room.inspectedAt ? formatDateTime(room.inspectedAt) : '—')}</div>
      <div><b>${h(t('Checklist'))}:</b> ${h(tr(run.checklist?.name) ?? '')} ${h(run.checklist?.version ?? '')}</div>
    </div>
    <h2>${h(t('Meters'))}</h2>
    <table><thead><tr><th>${h(t('Electricity (kWh)'))}</th><th>${h(t('Water (m³)'))}</th><th>${h(t('Previous reading'))}</th></tr></thead>
      <tbody><tr>${elecCell}${waterCell}
      <td>${room.previousMeters ? h(`${room.previousMeters.electricity} kWh · ${room.previousMeters.water} m³ (${formatDate(room.previousMeters.date)})`) : '—'}</td></tr></tbody></table>
    <h2>${h(t('Items'))}</h2>
    <table><thead><tr><th>${h(t('Item'))}</th><th style="width:120px">${h(t('Result'))}</th><th>${h(t('Note'))}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sign"><div><b>${h(t('Inspector'))}</b><br><span class="muted">${h(run.assigneeName ?? run.inspectorName ?? '')}</span></div><div><b>${h(t('Manager'))}</b></div></div>
  </section>`
}

/** The Room's inspection as a document: printed, or saved as PDF, to keep or show. */
export function printRoom(run, room) {
  return printDocument(t('Room inspection report · {room}', { room: room.room }), buildRoomSheetHtml(run, room))
}

async function fetchAllRunRooms(runId) {
  const rooms = []
  for (let page = 1; page < 50; page++) {
    const res = await api.inspections.rooms(runId, { page, pageSize: 100 })
    rooms.push(...(res?.items ?? []))
    if (!res?.items?.length || rooms.length >= (res.total ?? 0)) break
  }
  return rooms
}

/** Batch prints all unfinished ('todo') or all completed ('done') room inspection reports in the current run. */
export async function printBatchForms(run, mode) {
  const rooms = await fetchAllRunRooms(run.id)
  const filtered = rooms.filter((r) =>
    mode === 'todo'
      ? r.status === 'To do' || r.status === 'In progress'
      : r.status === 'Done' || r.status === 'Not reachable',
  )
  if (filtered.length === 0) {
    return { empty: true, opened: false }
  }
  const sheets = filtered.map((room, index) => buildRoomSheetHtml(run, room, { pageIndex: index, totalPages: filtered.length })).join('')
  const title = mode === 'todo'
    ? t('Unfinished inspection forms · {run}', { run: run.id })
    : t('Completed inspection forms · {run}', { run: run.id })
  return { empty: false, opened: printDocument(title, sheets) }
}

/**
 * Paper Report 1 forms for every Room of the run, one page each: the items with an empty Condition and Note to fill in
 * by hand in the Room (no status, no answer printed), the meters with blank boxes and the previous reading.
 */
export async function printBlankForms(run) {
  const rooms = await fetchAllRunRooms(run.id)
  if (rooms.length === 0) {
    return false
  }
  const sheets = rooms
    .map((room, index) => {
      const rows = roomItems(run, room)
        .map((it, n) => `<tr><td style="width:32px">${n + 1}</td><td>${h(it.label)}</td><td style="width:150px">&nbsp;</td><td style="width:240px">&nbsp;</td></tr>`)
        .join('')
      const meters = room.metersNeeded
        ? `<h2>${h(t('Meters'))}</h2>
          <table><tr><th>${h(t('Electricity (kWh)'))}</th><th>${h(t('Water (m³)'))}</th><th>${h(t('Previous reading'))}</th></tr>
          <tr><td style="height:34px">&nbsp;</td><td>&nbsp;</td>
          <td>${room.previousMeters ? h(`${room.previousMeters.electricity} kWh · ${room.previousMeters.water} m³ (${formatDate(room.previousMeters.date)})`) : '—'}</td></tr></table>`
        : ''
      return `<section class="page-sheet">
        ${rooms.length > 1 ? `<div class="page-num">${h(t('Page {n} / {total}', { n: index + 1, total: rooms.length }))}</div>` : ''}
        <h1>${h(t('Room inspection report · {room}', { room: room.room }))}</h1>
        <p class="muted">${h(t('Report 1 · paper form: write the condition (Good, Worn, Damaged, Missing) and a note for each item.'))}</p>
        <div class="grid">
          <div><b>${h(t('Run'))}:</b> ${h(run.id)} · ${h(tr(run.scheduleName) ?? '')}</div>
          <div><b>${h(t('Block'))}:</b> ${h(run.block ?? '')}</div>
          <div><b>${h(t('Room'))}:</b> ${h(room.room)} · ${h([tr(room.roomTypeName), tr(room.roomClassName)].filter(Boolean).join(' '))}</div>
          <div><b>${h(t('Inspector'))}:</b> ${h(run.assigneeName ?? run.inspectorName ?? '')}</div>
          <div><b>${h(t('Date'))}:</b> ....../....../..........</div>
          <div><b>${h(t('Checklist'))}:</b> ${h(tr(run.checklist?.name) ?? '')} ${h(run.checklist?.version ?? '')}</div>
        </div>
        ${meters}
        <h2>${h(t('Items'))}</h2>
        <table><thead><tr><th>#</th><th>${h(t('Item'))}</th><th>${h(t('Condition'))}</th><th>${h(t('Note'))}</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="sign"><div><b>${h(t('Inspector'))}</b></div><div><b>${h(t('Manager'))}</b></div></div>
      </section>`
    })
    .join('')
  return printDocument(t('Report 1 forms · {run}', { run: run.id }), sheets)
}

/** Every Room of the run with every answer, as a CSV file (Excel opens it with the Vietnamese accents). */
export async function exportRun(run) {
  const rooms = await fetchAllRunRooms(run.id)
  const header = [t('Run'), t('Block'), t('Room'), t('Status'), t('Item'), t('Condition or result'), t('Note'), t('Photos'), t('Electricity (kWh)'), t('Water (m³)'), t('Inspected at')]
  const rows = [header]
  for (const room of rooms) {
    const results = Object.fromEntries((room.results ?? []).map((r) => [r.itemId, r]))
    for (const it of roomItems(run, room)) {
      const r = results[it.id]
      rows.push([
        run.id,
        run.block ?? '',
        room.room,
        t(room.status),
        it.label,
        it.furniture && r?.condition ? conditionName(r.condition) : t(r?.result ?? 'Not checked'),
        r?.note ?? '',
        (room.photos ?? []).filter((p) => p.itemId === it.id).length,
        room.meters?.electricity ?? '',
        room.meters?.water ?? '',
        room.inspectedAt ? formatDateTime(room.inspectedAt) : '',
      ])
    }
  }
  downloadCsv(`${run.id}-${run.block ?? 'block'}.csv`, rows)
}
