import { useEffect, useState } from 'react'
import { CalendarDays, CheckCheck, CircleCheck, Download, FileText, Printer } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Checkbox } from '@/components/ui/Choice'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, ErrorState, LoadingState, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { downloadCsv, h, printDocument } from '@/lib/report'
import { t, tr } from '@/i18n'

// SCR-MNT-12 Inspection Checklist (Figma 98:4293). A Room's inspection is Report 1: the record a new resident's
// check-in inventory (Report 2) is compared with, so it records the same things: each furniture item's condition (Good,
// Worn, Damaged, Missing) with a note and photos, and the meters with their photos.
// GET /inspection-runs?block → { items: [run] }: the runs Staff can open (open ones, theirs first, then the ones sent
//   lately); run = { id, date, dueAt, scheduleName, scope, rooms, inspected, failed, unreachable, inspectorName,
//   checklist: { name, version, items }, status: Open | Submitted, block, mine, overdue }
// GET /inspection-runs/:id → { run } · GET /inspection-runs/current → { run } (the first open one)
// GET /inspection-runs/:id/rooms?page&pageSize → { items: [{ room, roomTypeName, roomClassName, status, results:
//   [{ itemId, result, note, condition }], checks: [{ id, kind: people | furniture, expected, assetCode, type, typeVi,
//   bed }], meters, metersNeeded, previousMeters, photos: [{ id, itemId, url }], inspectedAt }], total }
// PUT /inspection-runs/:id/rooms/:room { results, meters } → { createdRequests } · POST …/rooms/:room/unreachable
// POST …/rooms/:room/photos (multipart photo, itemId) · DELETE …/rooms/:room/photos/:photoId
// POST /inspection-runs/:id/submit { confirmed } · GET /inspection-runs/upcoming?block → { items }

const resultTone = { Pass: 'success', Fail: 'error', 'Not checked': 'neutral' }
const statusTone = { 'In progress': 'info', Done: 'success', 'To do': 'neutral' }

function summary(r, total) {
  const results = r.results ?? []
  const failed = results.filter((x) => x.result === 'Fail').length
  const checked = results.filter((x) => x.result && x.result !== 'Not checked').length
  if (!checked) return t('Not started')
  if (failed) return t(failed === 1 ? '{n} item failed' : '{n} items failed', { n: failed })
  return checked < total ? t('In progress') : t('All passed')
}

/** The checklist's items; pre-arrival handover runs also include the Room's own checks (people count & furniture items). */
function roomItems(run, room) {
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
function buildRoomSheetHtml(run, room, { pageIndex, totalPages } = {}) {
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
function printRoom(run, room) {
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
async function printBatchForms(run, mode) {
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
async function printBlankForms(run) {
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

function Checklist({ run, room }) {
  const { notify, notifyError } = useToast()
  const items = roomItems(run, room)
  const initial = Object.fromEntries(
    items.map((it) => {
      const saved = room.results?.find((x) => x.itemId === it.id)
      return [it.id, saved ? { ...saved, note: saved.note ?? '', condition: saved.condition ?? null, restock: false } : { result: 'Not checked', note: '', condition: null, restock: false }]
    }),
  )
  const [results, setResults] = useState(initial)
  const [meters, setMeters] = useState({
    electricity: room.meters?.electricity ?? '',
    water: room.meters?.water ?? '',
    replaced: room.meters?.replaced ?? false,
  })
  const sent = run.status === 'Submitted'
  const mine = Boolean(run.mine)
  const done = sent || !mine || room.status === 'Done'
  const failed = Object.values(results).filter((r) => r.result === 'Fail').length
  const untouched = Object.values(results).every((r) => r.result === 'Not checked') && meters.electricity === '' && meters.water === ''
  const metersMissing = room.metersNeeded && (meters.electricity === '' || meters.water === '')
  // Live checks of the meters (on change and on blur): a number of 0 or more, not below the Room's last reading unless
  // the meter was replaced. Shown at once under the field; the Room cannot be saved while one fails.
  const [touched, setTouched] = useState({ electricity: false, water: false })
  const meterError = (key, unit) => {
    const raw = String(meters[key] ?? '').trim()
    if (raw === '') return t('Enter the reading ({unit}).', { unit })
    const value = Number(raw)
    if (!Number.isFinite(value)) return t('Enter a valid number.')
    if (value < 0) return t('The reading cannot be negative.')
    const last = room.previousMeters?.[key]
    if (!meters.replaced && last != null && value < Number(last)) {
      return t('Lower than the last reading ({value} {unit}). Read the meter again.', { value: formatNumber(last), unit })
    }
    return null
  }
  const electricityError = room.metersNeeded ? meterError('electricity', 'kWh') : null
  const waterError = room.metersNeeded ? meterError('water', 'm³') : null
  // Every item answered: a condition for furniture, Pass or Fail for checklist items; a Missing item needs nothing else,
  // a failed item may carry a note.
  const unanswered = items.filter((it) => {
    const r = results[it.id]
    return it.furniture ? !r?.condition : !r?.result || r.result === 'Not checked'
  }).length
  const canSave = !untouched && unanswered === 0 && !electricityError && !waterError
  const saveHint = unanswered > 0
    ? t('{n} items still need a condition or a result.', { n: unanswered })
    : electricityError || waterError
      ? t('Enter valid electricity and water readings.')
      : null

  const setCondition = (id, condition) =>
    setResults((rs) => ({ ...rs, [id]: { ...rs[id], condition, result: !condition ? 'Not checked' : condition === 'Good' || condition === 'Worn' ? 'Pass' : 'Fail' } }))
  const setNote = (id, note) => setResults((rs) => ({ ...rs, [id]: { ...rs[id], note } }))
  const markAllGood = () => {
    setResults((rs) => {
      const next = { ...rs }
      for (const it of items) {
        next[it.id] = it.furniture
          ? { ...next[it.id], condition: 'Good', result: 'Pass', restock: false }
          : { ...next[it.id], result: 'Pass' }
      }
      return next
    })
  }

  const save = useMutation(
    () =>
      api.inspections.saveRoom(run.id, room.room, {
        results: items.map((it) => {
          const r = results[it.id]
          return it.furniture && r.condition
            ? { itemId: it.id, condition: r.condition, note: r.note || undefined, restock: r.condition === 'Missing' ? r.restock : undefined }
            : { itemId: it.id, result: r.result, note: r.note || undefined }
        }),
        meters:
          meters.electricity !== '' || meters.water !== ''
            ? { electricity: Number(meters.electricity), water: Number(meters.water), replaced: meters.replaced }
            : undefined,
      }),
    {
      invalidates: ['inspections', 'maintenance', 'furniture'],
      onSuccess: (res) =>
        notify({
          title: t('{room} saved', { room: room.room }),
          message: res?.createdRequests?.length ? t('{ids} created in maintenance.', { ids: res.createdRequests.join(', ') }) : 'Saved without new maintenance requests.',
        }),
      onError: (e) => notifyError(e, 'Could not save the room'),
    },
  )

  const checkedCount = items.filter((it) => {
    const r = results[it.id]
    return it.furniture ? Boolean(r?.condition) : r?.result && r.result !== 'Not checked'
  }).length

  return (
    <Card padding="none" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* 1. Pinned compact room header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-h3 font-semibold text-fg">
              {room.room} · {tr(run.checklist?.name)}
            </h2>
            <Tag tone={statusTone[room.status] ?? 'neutral'}>{room.status}</Tag>
            {room.createdRequests?.length > 0 && (
              <Tag tone="warning">
                {t('Maintenance requests: {ids}', { ids: room.createdRequests.join(', ') })}
              </Tag>
            )}
          </div>
          <p className="text-xs text-fg-secondary">
            {t('Report 1 (Room baseline · Web fast entry)')}
            {room.inspectedAt ? ` · ${t('Inspected {date}', { date: formatDateTime(room.inspectedAt) })}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" icon={FileText} onClick={() => printRoom(run, room) || notify({ type: 'info', title: 'Allow pop-ups to print the report' })}>
            View and print report
          </Button>
        </div>
      </div>

      {/* 2. Scrollable work area: Meters (pre-arrival runs) + Fast Checklist Table */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {room.metersNeeded && (
          <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-subtle/40 p-4">
            <span className="text-sm font-semibold text-fg">{t('Meters of the Room')}</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Electricity (kWh)"
                required={room.metersNeeded}
                error={!done && touched.electricity ? electricityError : undefined}
                helper={room.previousMeters ? t('Previous reading: {value} kWh (recorded {date})', { value: formatNumber(room.previousMeters.electricity), date: formatDate(room.previousMeters.date) }) : undefined}
              >
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  disabled={done}
                  invalid={!done && touched.electricity && Boolean(electricityError)}
                  value={meters.electricity}
                  onChange={(e) => {
                    setMeters((m) => ({ ...m, electricity: e.target.value }))
                    setTouched((s) => ({ ...s, electricity: true }))
                  }}
                  onBlur={() => setTouched((s) => ({ ...s, electricity: true }))}
                  className="font-semibold tabular"
                />
              </Field>
              <Field
                label="Water (m³)"
                required={room.metersNeeded}
                error={!done && touched.water ? waterError : undefined}
                helper={room.previousMeters ? t('Previous reading: {value} m³ (recorded {date})', { value: formatNumber(room.previousMeters.water), date: formatDate(room.previousMeters.date) }) : undefined}
              >
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  disabled={done}
                  invalid={!done && touched.water && Boolean(waterError)}
                  value={meters.water}
                  onChange={(e) => {
                    setMeters((m) => ({ ...m, water: e.target.value }))
                    setTouched((s) => ({ ...s, water: true }))
                  }}
                  onBlur={() => setTouched((s) => ({ ...s, water: true }))}
                  className="font-semibold tabular"
                />
              </Field>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-fg">
            {t('Checklist & furniture ({n} items)', { n: items.length })}
          </span>
          {!done && items.length > 0 && (
            <Button size="sm" icon={CheckCheck} onClick={markAllGood}>
              {t('Mark all Good / Pass')}
            </Button>
          )}
        </div>

        <Table className="shrink-0 overflow-visible">
          <THead>
            <tr>
              <Th>Item</Th>
              <Th className="w-76">Condition or result</Th>
              <Th className="w-56">Note</Th>
            </tr>
          </THead>
          <TBody>
            {items.map((item) => {
              const r = results[item.id]
              return (
                <Tr key={item.id} className={cx('[&>td]:py-2.5', (r.condition === 'Damaged' || r.condition === 'Missing' || r.result === 'Fail') && 'bg-warning-bg/35')}>
                  <Td>
                    <span className="text-sm text-fg">{item.label}</span>
                  </Td>
                  <Td>
                    {item.furniture ? (
                      done ? (
                        <Tag tone={conditionTone[r.condition] ?? resultTone[r.result] ?? 'neutral'}>
                          {r.condition ? conditionName(r.condition, run.conditionLevels) : r.result}
                        </Tag>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <Select
                            size="sm"
                            wrapperClassName="w-44"
                            aria-label={t('Condition of {item}', { item: item.label })}
                            value={r.condition ?? ''}
                            onChange={(e) => setCondition(item.id, e.target.value || null)}
                          >
                            <option value="" disabled hidden />
                            {conditionOptions(run.conditionLevels).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                          {r.condition === 'Missing' && (
                            <Checkbox
                              label="Take a spare from the Block store"
                              checked={!!r.restock}
                              onChange={(e) => setResults((rs) => ({ ...rs, [item.id]: { ...rs[item.id], restock: e.target.checked } }))}
                            />
                          )}
                        </div>
                      )
                    ) : done ? (
                      <Tag tone={resultTone[r.result] ?? 'neutral'}>{r.result}</Tag>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { value: 'Pass', label: t('Pass'), cls: 'border-success bg-success-bg text-success-fg' },
                          { value: 'Fail', label: t('Fail'), cls: 'border-error bg-error-bg text-error-fg' },
                        ].map((opt) => {
                          const active = r.result === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setResults((rs) => ({ ...rs, [item.id]: { ...rs[item.id], result: active ? 'Not checked' : opt.value } }))}
                              className={cx(
                                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                                active ? opt.cls : 'border-line bg-surface text-fg-secondary hover:bg-subtle',
                              )}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {done ? (
                      <span className="text-sm text-fg">{r.note || '—'}</span>
                    ) : (
                      <Input size="sm" aria-label={t('Note for {item}', { item: item.label })} value={r.note ?? ''} onChange={(e) => setNote(item.id, e.target.value)} placeholder={item.furniture ? 'What do you see?' : 'What is wrong?'} />
                    )}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </div>

      {/* 3. Pinned bottom action bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-5 py-3">
        <div className="text-xs text-fg-secondary">
          {sent ? (
            <span className="font-medium text-fg">{t('This run was sent: read the Rooms, print a Room’s report or export the run.')}</span>
          ) : !mine ? (
            <span className="font-medium text-warning-fg">
              {run.assigneeName
                ? t('This run is assigned to {name}. You can only view or export it.', { name: run.assigneeName })
                : t('This run has not been assigned to any staff member yet.')}
            </span>
          ) : (
            <span>
              {t('Checked {n} of {total} items', { n: checkedCount, total: items.length })}
              {failed > 0 ? ` · ${t('{n} failed items will create maintenance requests', { n: failed })}` : ''}
            </span>
          )}
        </div>
        {!done && (
          <div className="flex items-center gap-2">
            {saveHint && <span className="text-xs font-medium text-warning-fg">{saveHint}</span>}
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setTouched({ electricity: true, water: true })
                if (canSave) save.run()
              }}
              disabled={!canSave || save.pending}
            >
              {metersMissing ? 'Save (meters still needed)' : 'Save room'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * The review before the results are sent: every Room of the run with its state, what is still missing (Rooms not
 * visited, meters not read in a pre-arrival run), the items found Damaged or Missing, and the inspector's commitment.
 * Once sent, the run cannot be changed and Rooms not visited move to the next run.
 */
function SubmitReview({ run, onClose, onSubmit, pending }) {
  const [committed, setCommitted] = useState(false)
  const all = useQuery(['inspections', 'rooms', run.id, 'review'], ({ signal }) => api.inspections.rooms(run.id, { page: 1, pageSize: 100 }, { signal }))
  const rooms = all.data?.items ?? []
  const notDone = rooms.filter((r) => r.status === 'To do' || r.status === 'In progress')
  const noMeters = rooms.filter((r) => r.metersNeeded && r.status !== 'Not reachable' && !r.meters)
  const unreachable = rooms.filter((r) => r.status === 'Not reachable')
  const found = rooms.flatMap((r) =>
    (r.results ?? [])
      .filter((x) => x.condition === 'Damaged' || x.condition === 'Missing' || x.result === 'Fail')
      .map((x) => {
        const check = (r.checks ?? []).find((c) => c.id === x.itemId)
        const item = run.checklist?.items?.find((i) => String(i.id) === String(x.itemId))
        return { room: r.room, label: check ? `${typeName(check)} · ${check.assetCode}` : tr(item?.label) ?? x.itemId, condition: x.condition, result: x.result, note: x.note }
      }),
  )
  const blocking = notDone.length > 0 || noMeters.length > 0
  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title="Review before sending"
      description="Check the results of every Room. Once sent, they cannot be changed: Rooms not visited move to the next run and the record of each Room is what new residents' inventories are compared with."
      footer={
        <>
          <Button onClick={onClose}>Back to the Rooms</Button>
          <Button variant="primary" disabled={!committed || pending || all.loading} onClick={onSubmit}>
            Send results
          </Button>
        </>
      }
    >
      <QueryState query={all} compact>
        {() => (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-subtle p-2">
                <p className="text-h3 font-semibold text-fg tabular">{formatNumber(rooms.length - notDone.length - unreachable.length)}</p>
                <p className="text-xs text-fg-secondary">{t('Rooms inspected')}</p>
              </div>
              <div className="rounded-lg bg-subtle p-2">
                <p className="text-h3 font-semibold text-fg tabular">{formatNumber(notDone.length)}</p>
                <p className="text-xs text-fg-secondary">{t('Rooms not finished')}</p>
              </div>
              <div className="rounded-lg bg-subtle p-2">
                <p className="text-h3 font-semibold text-fg tabular">{formatNumber(found.length)}</p>
                <p className="text-xs text-fg-secondary">{t('Items failed, damaged or missing')}</p>
              </div>
            </div>
            {notDone.length > 0 && (
              <Alert type="error" title={t('{n} Rooms are not finished', { n: notDone.length })}>
                {notDone.map((r) => r.room).join(', ')}. {t('If you send now they are not inspected: new residents of these Rooms have no record to be compared with.')}
              </Alert>
            )}
            {noMeters.length > 0 && (
              <Alert type="warning" title={t('Meters not read in {n} Rooms', { n: noMeters.length })}>
                {noMeters.map((r) => r.room).join(', ')}
              </Alert>
            )}
            {unreachable.length > 0 && (
              <Alert type="info" title={t('{n} Rooms not reachable', { n: unreachable.length })}>
                {unreachable.map((r) => r.room).join(', ')}
              </Alert>
            )}
            {found.length > 0 && (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
                {found.map((f, i) => (
                  <div key={`${f.room}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-fg">
                      {f.room} · {f.label}
                      {f.note ? <span className="text-fg-secondary"> · {f.note}</span> : null}
                    </span>
                    <Tag tone={conditionTone[f.condition] ?? 'error'}>{f.condition ? conditionName(f.condition) : f.result}</Tag>
                  </div>
                ))}
              </div>
            )}
            <Checkbox
              label={blocking ? 'I checked the list and still send it with the Rooms above not finished' : 'I inspected these Rooms myself and the conditions and meters are correct'}
              description="Your name and the time are kept with the results."
              checked={committed}
              onChange={(e) => setCommitted(e.target.checked)}
            />
          </div>
        )}
      </QueryState>
    </Modal>
  )
}

/** Every Room of the run with every answer, as a CSV file (Excel opens it with the Vietnamese accents). */
async function exportRun(run) {
  const rooms = []
  for (let page = 1; page < 50; page++) {
    const res = await api.inspections.rooms(run.id, { page, pageSize: 100 })
    rooms.push(...(res?.items ?? []))
    if (!res?.items?.length || rooms.length >= (res.total ?? 0)) break
  }
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

function RunSwitcher({ runs, value, onChange }) {
  if (runs.length === 0) return null
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" role="tablist" aria-label={t('Inspection runs assigned to you')}>
      {runs.map((r) => {
        const active = r.id === value
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.id)}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active ? 'border-primary bg-brand-subtle text-fg' : 'border-line bg-subtle/50 text-fg-secondary hover:bg-subtle',
            )}
          >
            <span className="font-semibold text-fg">{r.id}</span>
            <span className="max-w-44 truncate">{tr(r.scheduleName) || t('Inspection')}</span>
            <span className="rounded bg-surface px-1.5 py-0.5 font-medium tabular">
              {r.inspected + r.unreachable}/{r.rooms}
            </span>
            {r.overdue && <Tag tone="error">Overdue</Tag>}
          </button>
        )
      })}
    </div>
  )
}

function Run({ run, switcher, onSubmitted }) {
  const { notify, notifyError } = useToast()
  const [page, setPage] = useState(1)
  const [roomFilter, setRoomFilter] = useState('all')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [calendar, setCalendar] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [exporting, setExporting] = useState(false)
  useEffect(() => {
    setPage(1)
    setRoomFilter('all')
    setSelectedRoom(null)
  }, [run.id])
  const rooms = useQuery(['inspections', 'rooms', run.id, page], ({ signal }) => api.inspections.rooms(run.id, { page, pageSize: 20 }, { signal }))
  const upcoming = useQuery(['inspections', 'upcoming'], ({ signal }) => api.inspections.upcoming(undefined, { signal }), { enabled: calendar })
  const allItems = rooms.data?.items ?? []
  const items = allItems.filter((r) => {
    if (roomFilter === 'todo') return r.status === 'To do' || r.status === 'In progress'
    if (roomFilter === 'done') return r.status === 'Done' || r.status === 'Not reachable'
    return true
  })
  const selected =
    items.find((r) => r.room === selectedRoom) ??
    items.find((r) => r.status === 'To do' || r.status === 'In progress') ??
    items[0]
  const total = run.checklist?.items?.length ?? 0
  const sent = run.status === 'Submitted'
  const mine = Boolean(run.mine)
  const submit = useMutation(() => api.inspections.submit(run.id, { confirmed: true }), {
    invalidates: ['inspections'],
    onSuccess: () => {
      onSubmitted?.(run.id)
      setReviewing(false)
      notify({ title: 'Results submitted', message: 'Sent to the managers. Unvisited rooms move to the next run.' })
    },
    onError: (e) => notifyError(e, 'Could not submit the results'),
  })
  const [printing, setPrinting] = useState(false)
  const [printingBatch, setPrintingBatch] = useState(null)
  const doPrintForms = async () => {
    setPrinting(true)
    try {
      if (!(await printBlankForms(run))) notify({ type: 'info', title: 'Allow pop-ups to print the report' })
    } catch (e) {
      notifyError(e, 'Could not print the forms')
    } finally {
      setPrinting(false)
    }
  }
  const doPrintBatch = async (mode) => {
    setPrintingBatch(mode)
    try {
      const res = await printBatchForms(run, mode)
      if (res.empty) {
        notify({
          type: 'info',
          title: mode === 'todo' ? t('No unfinished inspection forms to export') : t('No completed inspection forms to export'),
        })
      } else if (!res.opened) {
        notify({ type: 'info', title: 'Allow pop-ups to print the report' })
      }
    } catch (e) {
      notifyError(e, 'Could not print the forms')
    } finally {
      setPrintingBatch(null)
    }
  }
  const doExport = async () => {
    setExporting(true)
    try {
      await exportRun(run)
    } catch (e) {
      notifyError(e, 'Could not export the run')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        compact
        title="Inspections"
        description={[run.id, formatDate(run.date), tr(run.scheduleName), tr(run.scope), run.block && t('Block {code}', { code: run.block })].filter(Boolean).join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={CalendarDays} onClick={() => setCalendar(true)}>
              Calendar
            </Button>
            <Button size="sm" icon={Download} onClick={doExport} disabled={exporting}>
              Export CSV
            </Button>
            <Button size="sm" icon={Printer} onClick={doPrintForms} disabled={printing}>
              Print Report 1 forms
            </Button>
            <Button size="sm" icon={Printer} onClick={() => doPrintBatch('todo')} disabled={printingBatch !== null}>
              Print all unfinished forms
            </Button>
            <Button size="sm" icon={Printer} onClick={() => doPrintBatch('done')} disabled={printingBatch !== null}>
              Print all completed forms
            </Button>
            {!sent && mine && (
              <Button size="sm" variant="primary" onClick={() => setReviewing(true)} disabled={submit.pending}>
                Submit results
              </Button>
            )}
          </div>
        }
      />

      {/* Compact single-bar Run Switcher + Inline Stats */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
        {switcher}
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-subtle px-2.5 py-1 text-fg-secondary">
            {t('Assignee')}: <strong className={mine ? 'font-semibold text-fg-brand' : 'font-semibold text-fg'}>{run.assigneeName ?? t('Unassigned')}</strong>
          </span>
          <span className="rounded-md bg-subtle px-2.5 py-1 text-fg-secondary">
            {t('Rooms in this run')}: <strong className="font-semibold text-fg tabular">{formatNumber(run.rooms)}</strong>
          </span>
          <span className="rounded-md bg-subtle px-2.5 py-1 text-fg-secondary">
            {t('Inspected')}: <strong className="font-semibold text-fg tabular">{formatNumber(run.inspected)}</strong>
          </span>
          <span className={cx('rounded-md px-2.5 py-1', run.failed > 0 ? 'bg-error-bg text-error-fg' : 'bg-subtle text-fg-secondary')}>
            {t('Items failed')}: <strong className="font-semibold tabular">{formatNumber(run.failed)}</strong>
          </span>
          {run.dueAt && (
            <span className={cx('rounded-md px-2.5 py-1 tabular', run.overdue ? 'bg-error-bg text-error-fg' : 'bg-subtle text-fg-secondary')}>
              {t('Due {date}', { date: formatDate(run.dueAt) })}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-4 lg:flex-row">
        <div className="flex min-h-0 w-full shrink-0 flex-col gap-3 lg:w-104">
          <Segmented
            value={roomFilter}
            onChange={setRoomFilter}
            options={[
              { value: 'all', label: `${t('All')} (${allItems.length})` },
              { value: 'todo', label: `${t('To do')} (${allItems.filter((r) => r.status === 'To do' || r.status === 'In progress').length})` },
              { value: 'done', label: `${t('Done')} (${allItems.filter((r) => r.status === 'Done').length})` },
            ]}
          />
          <Table fill>
            <THead>
              <tr>
                <Th className="w-32">Room</Th>
                <Th>Result</Th>
                <Th className="w-32">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={rooms} colSpan={3} rows={items} emptyTitle="No rooms in this run" />
              {items.map((r) => (
                <Tr
                  key={r.room}
                  tabIndex={0}
                  selected={r.room === selected?.room}
                  onClick={() => setSelectedRoom(r.room)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedRoom(r.room)
                    }
                  }}
                  className="cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&>td]:py-2.5"
                >
                  <Td>
                    <TwoLine primary={r.room} secondary={`${tr(r.roomTypeName)} ${tr(r.roomClassName)}`.trim()} />
                  </Td>
                  <Td>{summary(r, roomItems(run, r).length)}</Td>
                  <Td>
                    <Tag tone={statusTone[r.status] ?? 'neutral'}>{r.status}</Tag>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
            <Pagination total={rooms.data?.total ?? 0} page={page} onChange={setPage} showSizeChanger={false} />
          </div>
        </div>
        {selected ? (
          <Checklist key={`${run.id}-${selected.room}-${selected.status}`} run={run} room={selected} />
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={CircleCheck} title="Select a room" />
          </Card>
        )}
      </div>

      {reviewing && <SubmitReview run={run} pending={submit.pending} onClose={() => setReviewing(false)} onSubmit={() => submit.run()} />}
      <Modal open={calendar} onClose={() => setCalendar(false)} title="Upcoming inspections" description="Scheduled by the managers." footer={<Button onClick={() => setCalendar(false)}>Close</Button>}>
        <QueryState query={upcoming} compact empty={<p className="text-base text-fg-secondary">{t('No inspections scheduled.')}</p>}>
          {(d) => (
            <ul className="flex flex-col gap-2">
              {d.items.map((u) => (
                <li key={u.id} className="flex justify-between gap-4 text-base">
                  <span className="text-fg">{[tr(u.scheduleName), tr(u.scope)].filter(Boolean).join(' · ')}</span>
                  <span className="text-fg-secondary">{formatDate(u.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Modal>
    </>
  )
}

export default function InspectionChecklist() {
  const scope = useScopeQuery()
  const list = useQuery(['inspections', 'runs', scope], ({ signal }) => api.inspections.runs(scope, { signal }))
  const runs = list.data?.items ?? []
  const [runId, setRunId] = useState(null)
  const run = runs.find((r) => r.id === runId) ?? runs[0]
  if (run) return <Run run={run} switcher={<RunSwitcher runs={runs} value={run.id} onChange={setRunId} />} onSubmitted={setRunId} />
  return (
    <>
      <PageHeader title="Inspections" />
      {list.data === undefined && list.loading ? (
        <LoadingState />
      ) : list.data === undefined ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock icon={CircleCheck} title="No inspection run today">
            Runs are scheduled by the managers. The next one appears here on its date.
          </EmptyBlock>
        </Card>
      )}
    </>
  )
}
