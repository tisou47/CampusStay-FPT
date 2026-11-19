import { useEffect, useState } from 'react'
import { Camera, CalendarDays, CircleCheck, Download, FileText, ImageOff, Trash2 } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card } from '@/components/ui/Display'
import { Checkbox } from '@/components/ui/Choice'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, ErrorState, LoadingState, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
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
const nextResult = { 'Not checked': 'Pass', Pass: 'Fail', Fail: 'Not checked' }
const statusTone = { 'In progress': 'info', Done: 'success', 'To do': 'neutral', 'Not reachable': 'warning' }
const runTone = { Open: 'info', Submitted: 'success' }

function summary(r, total) {
  if (r.status === 'Not reachable') return t('No one home')
  const results = r.results ?? []
  const failed = results.filter((x) => x.result === 'Fail').length
  const checked = results.filter((x) => x.result && x.result !== 'Not checked').length
  if (!checked) return t('Not started')
  if (failed) return t(failed === 1 ? '{n} item failed' : '{n} items failed', { n: failed })
  return checked < total ? t('In progress') : t('All passed')
}

/** The checklist's items, then the Room's own checks (the number of people, each furniture item). */
function roomItems(run, room) {
  return [
    ...(run.checklist?.items ?? []).map((i) => ({ id: String(i.id), label: tr(i.label), kind: 'checklist' })),
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

function PhotoStrip({ photos, onRemove }) {
  if (!photos?.length) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-fg-tertiary">
        <ImageOff size={13} aria-hidden="true" />
        {t('No photo')}
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((p) => (
        <div key={p.id} className="relative size-12 overflow-hidden rounded-md border border-line">
          <a href={p.url} target="_blank" rel="noreferrer">
            <img src={p.url} alt={t('Photo')} className="size-full object-cover" />
          </a>
          {onRemove && (
            <IconButton icon={Trash2} size="sm" aria-label={t('Remove photo')} className="absolute top-0 right-0 bg-surface" onClick={() => onRemove(p.id)} />
          )}
        </div>
      ))}
    </div>
  )
}

function PhotoButton({ runId, room, itemId }) {
  const { notifyError } = useToast()
  const upload = useMutation(
    (file) => {
      const form = new FormData()
      form.append('photo', file)
      if (itemId) form.append('itemId', itemId)
      return api.inspections.addPhoto(runId, room, form)
    },
    { invalidates: ['inspections'], onError: (e) => notifyError(e, 'Could not add the photo') },
  )
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-fg-brand">
      <Camera size={14} aria-hidden="true" />
      {upload.pending ? t('Uploading…') : t('Add photo')}
      <input type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && upload.run(e.target.files[0])} />
    </label>
  )
}

/** The Room's inspection as a document: printed, or saved as PDF, to keep or show. */
function printRoom(run, room) {
  const items = roomItems(run, room)
  const results = Object.fromEntries((room.results ?? []).map((r) => [r.itemId, r]))
  const photos = (id) => (room.photos ?? []).filter((p) => (id ? p.itemId === id : !p.itemId))
  const cls = (r) => (r?.condition === 'Damaged' || r?.result === 'Fail' ? 'bad' : r?.condition === 'Missing' ? 'warn' : r?.result === 'Pass' ? 'ok' : '')
  const answer = (it, r) => (it.furniture ? conditionName(r?.condition) || t(r?.result ?? 'Not checked') : t(r?.result ?? 'Not checked'))
  const rows = items
    .map((it) => {
      const r = results[it.id]
      const pics = photos(it.id).map((p) => `<img src="${h(p.url)}" alt="">`).join('')
      return `<tr><td>${h(it.label)}</td><td><span class="tag ${cls(r)}">${h(answer(it, r))}</span></td><td>${h(r?.note ?? '')}</td><td>${pics || `<span class="muted">${h(t('No photo'))}</span>`}</td></tr>`
    })
    .join('')
  const meterPics = photos(null).map((p) => `<img src="${h(p.url)}" alt="">`).join('')
  const body = `
    <h1>${h(t('Room inspection report · {room}', { room: room.room }))}</h1>
    <p class="muted">${h(t('Report 1 · Room’s record: new residents’ check-in inventories are compared with it.'))}</p>
    <div class="grid">
      <div><b>${h(t('Run'))}:</b> ${h(run.id)} · ${h(tr(run.scheduleName) ?? '')}</div>
      <div><b>${h(t('Block'))}:</b> ${h(run.block ?? '')}</div>
      <div><b>${h(t('Room'))}:</b> ${h(room.room)} · ${h([tr(room.roomTypeName), tr(room.roomClassName)].filter(Boolean).join(' '))}</div>
      <div><b>${h(t('Status'))}:</b> ${h(t(room.status))}</div>
      <div><b>${h(t('Inspector'))}:</b> ${h(run.inspectorName ?? '')}</div>
      <div><b>${h(t('Inspected at'))}:</b> ${h(room.inspectedAt ? formatDateTime(room.inspectedAt) : '—')}</div>
      <div><b>${h(t('Checklist'))}:</b> ${h(tr(run.checklist?.name) ?? '')} ${h(run.checklist?.version ?? '')}</div>
    </div>
    <h2>${h(t('Meters'))}</h2>
    <table><tr><th>${h(t('Electricity (kWh)'))}</th><th>${h(t('Water (m³)'))}</th><th>${h(t('Previous reading'))}</th><th>${h(t('Photos'))}</th></tr>
      <tr><td>${h(room.meters?.electricity ?? '—')}</td><td>${h(room.meters?.water ?? '—')}</td>
      <td>${room.previousMeters ? h(`${room.previousMeters.electricity} kWh · ${room.previousMeters.water} m³ (${formatDate(room.previousMeters.date)})`) : '—'}</td>
      <td>${meterPics || `<span class="muted">${h(t('No photo'))}</span>`}</td></tr></table>
    <h2>${h(t('Items'))}</h2>
    <table><tr><th>${h(t('Item'))}</th><th style="width:120px">${h(t('Result'))}</th><th>${h(t('Note'))}</th><th style="width:170px">${h(t('Photos'))}</th></tr>${rows}</table>
    <div class="sign"><div><b>${h(t('Inspector'))}</b><br><span class="muted">${h(run.inspectorName ?? '')}</span></div><div><b>${h(t('Manager'))}</b></div></div>`
  return printDocument(t('Room inspection report · {room}', { room: room.room }), body)
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
  const done = sent || room.status === 'Done' || room.status === 'Not reachable'
  const failed = Object.values(results).filter((r) => r.result === 'Fail').length
  const untouched = Object.values(results).every((r) => r.result === 'Not checked') && meters.electricity === '' && meters.water === ''
  const metersMissing = room.metersNeeded && (meters.electricity === '' || meters.water === '')
  const photosOf = (id) => (room.photos ?? []).filter((p) => (id ? p.itemId === id : !p.itemId))

  const setCondition = (id, condition) =>
    setResults((rs) => ({ ...rs, [id]: { ...rs[id], condition, result: !condition ? 'Not checked' : condition === 'Good' || condition === 'Worn' ? 'Pass' : 'Fail' } }))
  const setNote = (id, note) => setResults((rs) => ({ ...rs, [id]: { ...rs[id], note } }))

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
  const unreachable = useMutation(() => api.inspections.unreachable(run.id, room.room), {
    invalidates: ['inspections'],
    onSuccess: () => notify({ type: 'info', title: t('{room} marked not reachable', { room: room.room }), message: 'It moves to the next inspection run.' }),
    onError: (e) => notifyError(e, 'Could not update the room'),
  })
  const removePhoto = useMutation((id) => api.inspections.removePhoto(run.id, room.room, id), {
    invalidates: ['inspections'],
    onError: (e) => notifyError(e, 'Could not remove the photo'),
  })

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">
            {room.room} · {tr(run.checklist?.name)}
          </h2>
          <p className="text-sm text-fg-secondary">
            {t('Checklist {version} set by admin · {n} items', { version: run.checklist?.version, n: items.length })}
            {run.inspectorName ? ` · ${t('Inspector {name}', { name: run.inspectorName })}` : ''}
            {room.inspectedAt ? ` · ${t('Inspected {date}', { date: formatDateTime(room.inspectedAt) })}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tag tone={statusTone[room.status] ?? 'neutral'}>{room.status}</Tag>
          <Button size="sm" icon={FileText} onClick={() => printRoom(run, room) || notify({ type: 'info', title: 'Allow pop-ups to print the report' })}>
            View and print report
          </Button>
        </div>
      </div>
      <p className="shrink-0 rounded-lg bg-subtle/60 px-3 py-2 text-sm text-fg-secondary">
        {t('This inspection is Report 1, the Room’s record: each new resident’s check-in inventory (Report 2) is compared with it item by item and meter by meter.')}
      </p>
      <Table className="shrink-0 overflow-visible">
        <THead>
          <tr>
            <Th>Item</Th>
            <Th className="w-48">Condition or result</Th>
            <Th className="w-64">Note</Th>
            <Th className="w-44">Photos</Th>
          </tr>
        </THead>
        <TBody>
          {items.map((item) => {
            const r = results[item.id]
            return (
              <Tr key={item.id} className={cx('[&>td]:py-2', (r.condition === 'Damaged' || r.condition === 'Missing' || r.result === 'Fail') && 'bg-warning-bg/50')}>
                <Td>
                  <span className="text-sm text-fg">{item.label}</span>
                </Td>
                <Td>
                  {item.furniture ? (
                    done ? (
                      <Tag tone={conditionTone[r.condition] ?? resultTone[r.result] ?? 'neutral'}>{r.condition ? conditionName(r.condition) : r.result}</Tag>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Select
                          size="sm"
                          aria-label={t('Condition of {item}', { item: item.label })}
                          value={r.condition ?? ''}
                          onChange={(e) => setCondition(item.id, e.target.value || null)}
                          options={[{ value: '', label: 'Not checked' }, ...conditionOptions()]}
                        />
                        {r.condition === 'Missing' && (
                          <Checkbox
                            label="Take a spare from the Block store"
                            checked={!!r.restock}
                            onChange={(e) => setResults((rs) => ({ ...rs, [item.id]: { ...rs[item.id], restock: e.target.checked } }))}
                          />
                        )}
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={done}
                      onClick={() => setResults((rs) => ({ ...rs, [item.id]: { ...rs[item.id], result: nextResult[rs[item.id].result] ?? 'Pass' } }))}
                      aria-label={t('{item}: {result}. Change result', { item: item.label, result: t(r.result) })}
                      className={cx('rounded-full', !done && 'cursor-pointer hover:ring-2 hover:ring-line-strong')}
                    >
                      <Tag tone={resultTone[r.result] ?? 'neutral'}>{r.result}</Tag>
                    </button>
                  )}
                </Td>
                <Td>
                  {done ? (
                    <span className="text-sm text-fg">{r.note || '—'}</span>
                  ) : (
                    <Input size="sm" aria-label={t('Note for {item}', { item: item.label })} value={r.note ?? ''} onChange={(e) => setNote(item.id, e.target.value)} placeholder={item.furniture ? 'What do you see?' : 'What is wrong?'} />
                  )}
                </Td>
                <Td>
                  {item.furniture ? (
                    <div className="flex flex-col gap-1">
                      <PhotoStrip photos={photosOf(item.id)} onRemove={sent ? undefined : (id) => removePhoto.run(id)} />
                      {!sent && photosOf(item.id).length < 3 && <PhotoButton runId={run.id} room={room.room} itemId={item.id} />}
                    </div>
                  ) : (
                    <span className="text-xs text-fg-tertiary">—</span>
                  )}
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
      <section className="flex shrink-0 flex-col gap-2 rounded-lg border border-line p-3">
        <span className="text-base font-medium text-fg">{t('Meters of the Room')}</span>
        <div className="flex flex-wrap items-start gap-3">
          <Field
            label="Electricity (kWh)"
            required={room.metersNeeded}
            className="w-56"
            helper={room.previousMeters ? t('Previous reading: {value} kWh (recorded {date})', { value: formatNumber(room.previousMeters.electricity), date: formatDate(room.previousMeters.date) }) : undefined}
          >
            <Input type="number" min="0" step="0.1" disabled={done} value={meters.electricity} onChange={(e) => setMeters((m) => ({ ...m, electricity: e.target.value }))} />
          </Field>
          <Field
            label="Water (m³)"
            required={room.metersNeeded}
            className="w-56"
            helper={room.previousMeters ? t('Previous reading: {value} m³ (recorded {date})', { value: formatNumber(room.previousMeters.water), date: formatDate(room.previousMeters.date) }) : undefined}
          >
            <Input type="number" min="0" step="0.1" disabled={done} value={meters.water} onChange={(e) => setMeters((m) => ({ ...m, water: e.target.value }))} />
          </Field>
          <div className="pt-7">
            <Checkbox label="Meter replaced" disabled={done} checked={!!meters.replaced} onChange={(e) => setMeters((m) => ({ ...m, replaced: e.target.checked }))} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PhotoStrip photos={photosOf(null)} onRemove={sent ? undefined : (id) => removePhoto.run(id)} />
          {!sent && photosOf(null).length < 3 && <PhotoButton runId={run.id} room={room.room} />}
        </div>
        {room.metersNeeded && <p className="text-sm text-fg-tertiary">{t('Pre-arrival inspection: the Room is done once its meters are read.')}</p>}
      </section>
      <div className="flex shrink-0 flex-col gap-2.5">
        {sent ? (
          <Alert type="info" title="Results sent">
            {t('This run was sent: read the Rooms, print a Room’s report or export the run.')}
          </Alert>
        ) : room.status === 'Done' ? (
          <Alert type="success" title="Room saved">
            {failed ? t('{n} failed items were sent to maintenance.', { n: failed }) : t('Every item passed.')}
          </Alert>
        ) : room.status === 'Not reachable' ? (
          <Alert type="warning" title="Not reachable">
            This room moves to the next inspection run.
          </Alert>
        ) : failed > 0 ? (
          <Alert type="warning" title={t('{n} failed items will create maintenance requests', { n: failed })}>
            Damaged items become furniture repair requests; a Missing item with a spare from the store becomes a planned move instead.
          </Alert>
        ) : (
          <p className="text-sm text-fg-tertiary">{t('Choose Good, Worn, Damaged or Missing for each furniture item; click a checklist result to switch between Pass, Fail and Not checked.')}</p>
        )}
        {!done && (
          <div className="flex justify-end gap-2">
            <Button onClick={() => unreachable.run()} disabled={unreachable.pending}>
              Mark not reachable
            </Button>
            <Button variant="primary" onClick={() => save.run()} disabled={untouched || save.pending}>
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
  if (runs.length < 2) return null
  return (
    <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('Inspection runs assigned to you')}>
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
              'flex min-w-56 shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors',
              active ? 'border-primary bg-brand-subtle' : 'border-line bg-surface hover:bg-subtle',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-fg">{r.id}</span>
              <span className="flex gap-1">
                {r.overdue && <Tag tone="error">Overdue</Tag>}
                <Tag tone={runTone[r.status] ?? 'neutral'}>{r.status === 'Open' ? 'In progress' : 'Sent'}</Tag>
              </span>
            </span>
            <span className="truncate text-sm text-fg">{tr(r.scheduleName) || t('Inspection')}</span>
            <span className="text-xs text-fg-secondary">
              {[r.block && t('Block {code}', { code: r.block }), t('{n} of {total} Rooms', { n: r.inspected + r.unreachable, total: r.rooms }), r.mine ? t('Assigned to you') : r.inspectorName].filter(Boolean).join(' · ')}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Run({ run, switcher }) {
  const { notify, notifyError } = useToast()
  const [page, setPage] = useState(1)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [calendar, setCalendar] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [exporting, setExporting] = useState(false)
  useEffect(() => {
    setPage(1)
    setSelectedRoom(null)
  }, [run.id])
  const rooms = useQuery(['inspections', 'rooms', run.id, page], ({ signal }) => api.inspections.rooms(run.id, { page, pageSize: 20 }, { signal }))
  const upcoming = useQuery(['inspections', 'upcoming'], ({ signal }) => api.inspections.upcoming(undefined, { signal }), { enabled: calendar })
  const items = rooms.data?.items ?? []
  const selected = items.find((r) => r.room === selectedRoom) ?? items[0]
  const total = run.checklist?.items?.length ?? 0
  const sent = run.status === 'Submitted'
  const submit = useMutation(() => api.inspections.submit(run.id, { confirmed: true }), {
    invalidates: ['inspections'],
    onSuccess: () => {
      setReviewing(false)
      notify({ title: 'Results submitted', message: 'Sent to the managers. Unvisited rooms move to the next run.' })
    },
    onError: (e) => notifyError(e, 'Could not submit the results'),
  })
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
        title="Inspections"
        description={[run.id, formatDate(run.date), tr(run.scheduleName), tr(run.scope), run.block && t('Block {code}', { code: run.block })].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon={CalendarDays} onClick={() => setCalendar(true)}>
              Calendar
            </Button>
            <Button icon={Download} onClick={doExport} disabled={exporting}>
              Export CSV
            </Button>
            {!sent && (
              <Button variant="primary" onClick={() => setReviewing(true)} disabled={submit.pending}>
                Submit results
              </Button>
            )}
          </>
        }
      />
      {switcher}
      <div className="flex shrink-0 gap-4">
        <KpiTile label="Rooms in this run" value={formatNumber(run.rooms)} note={sent ? t('Sent') : run.id} noteTone="tertiary" />
        <KpiTile label="Inspected" value={formatNumber(run.inspected)} note={run.dueAt ? t('Due {date}', { date: formatDate(run.dueAt) }) : null} noteTone={run.overdue ? 'error' : 'tertiary'} />
        <KpiTile label="Items failed" value={formatNumber(run.failed)} note="Each creates a maintenance request" noteTone="tertiary" />
        <KpiTile label="Not reachable" value={formatNumber(run.unreachable)} note="Re-schedule in the next run" noteTone="tertiary" />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-96 shrink-0 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-28">Room</Th>
                <Th>Result</Th>
                <Th className="w-30">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={rooms} colSpan={3} emptyTitle="No rooms in this run" />
              {items.map((r) => (
                <Tr key={r.room} selected={r.room === selected?.room} onClick={() => setSelectedRoom(r.room)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.room} secondary={`${tr(r.roomTypeName)} ${tr(r.roomClassName)}`.trim()} />
                  </Td>
                  <Td>{summary(r, total)}</Td>
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
  if (run) return <Run run={run} switcher={<RunSwitcher runs={runs} value={run.id} onChange={setRunId} />} />
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
