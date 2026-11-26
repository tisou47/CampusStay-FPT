import { useState } from 'react'
import { CheckCheck, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { conditionName, conditionOptions, conditionTone } from '@/lib/furniture'
import { photoAllowed } from '@/lib/inspection'
import { t, tr } from '@/i18n'
import { printRoom, roomItems } from './inspectionPrint'

const resultTone = { Pass: 'success', Fail: 'error', 'Not checked': 'neutral' }
const statusTone = { 'In progress': 'info', Done: 'success', 'To do': 'neutral' }

export function RoomChecklistPanel({ run, room }) {
  const { notify, notifyError } = useToast()
  const items = roomItems(run, room)
  const initial = Object.fromEntries(
    items.map((it) => {
      const saved = room.results?.find((x) => x.itemId === it.id)
      return [
        it.id,
        saved
          ? { ...saved, note: saved.note ?? '', condition: saved.condition ?? null, restock: false }
          : { result: 'Not checked', note: '', condition: null, restock: false },
      ]
    }),
  )
  const [results, setResults] = useState(initial)
  const [meters, setMeters] = useState({
    electricity: room.meters?.electricity ?? '',
    water: room.meters?.water ?? '',
    replaced: room.meters?.replaced ?? false,
  })
  const [touched, setTouched] = useState({ electricity: false, water: false })

  const sent = run.status === 'Submitted'
  const mine = Boolean(run.mine)
  // A run whose schedule a Manager paused is read only until it is resumed.
  const held = run.status === 'Paused'
  const done = sent || held || !mine || room.status === 'Done'
  const failed = Object.values(results).filter((r) => r.result === 'Fail').length
  const untouched = Object.values(results).every((r) => r.result === 'Not checked') && meters.electricity === '' && meters.water === ''
  const metersMissing = room.metersNeeded && (meters.electricity === '' || meters.water === '')

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
    setResults((rs) => ({
      ...rs,
      [id]: { ...rs[id], condition, result: !condition ? 'Not checked' : condition === 'Good' || condition === 'Worn' ? 'Pass' : 'Fail' },
    }))
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
          message: res?.createdRequests?.length
            ? t('{ids} created in maintenance.', { ids: res.createdRequests.join(', ') })
            : 'Saved without new maintenance requests.',
        }),
      onError: (e) => notifyError(e, 'Could not save the room'),
    },
  )

  const addPhoto = useMutation(
    ({ itemId, file }) => {
      const data = new FormData()
      data.set('photo', file)
      data.set('itemId', itemId)
      return api.inspections.addPhoto(run.id, room.room, data)
    },
    { invalidates: ['inspections'], onError: (e) => notifyError(e, 'Could not add the photo') },
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
          <Button
            size="sm"
            icon={FileText}
            onClick={() => printRoom(run, room) || notify({ type: 'info', title: 'Allow pop-ups to print the report' })}
          >
            View and print report
          </Button>
        </div>
      </div>

      {/* 2. Scrollable work area */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {room.metersNeeded && (
          <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-subtle/40 p-4">
            <span className="text-sm font-semibold text-fg">{t('Meters of the Room')}</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Electricity (kWh)"
                required={room.metersNeeded}
                error={!done && touched.electricity ? electricityError : undefined}
                helper={
                  room.previousMeters
                    ? t('Previous reading: {value} kWh (recorded {date})', {
                        value: formatNumber(room.previousMeters.electricity),
                        date: formatDate(room.previousMeters.date),
                      })
                    : undefined
                }
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
                helper={
                  room.previousMeters
                    ? t('Previous reading: {value} m³ (recorded {date})', {
                        value: formatNumber(room.previousMeters.water),
                        date: formatDate(room.previousMeters.date),
                      })
                    : undefined
                }
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
                <Tr
                  key={item.id}
                  className={cx(
                    '[&>td]:py-2.5',
                    (r.condition === 'Damaged' || r.condition === 'Missing' || r.result === 'Fail') && 'bg-warning-bg/35',
                  )}
                >
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
                      <div className="flex flex-wrap gap-2">
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
                                'rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
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
                      <div className="flex flex-col gap-1">
                        <Input
                          size="sm"
                          aria-label={t('Note for {item}', { item: item.label })}
                          value={r.note ?? ''}
                          onChange={(e) => setNote(item.id, e.target.value)}
                          placeholder={item.furniture ? 'What do you see?' : 'What is wrong?'}
                        />
                        {photoAllowed(item, r) && (
                          <label className="flex cursor-pointer items-center gap-1 text-xs text-fg-brand">
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              disabled={addPhoto.pending}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.target.value = ''
                                if (file) addPhoto.run({ itemId: item.id, file })
                              }}
                            />
                            {t('Add a photo ({n} so far)', { n: (room.photos ?? []).filter((p) => p.itemId === item.id).length })}
                          </label>
                        )}
                      </div>
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
              {run.assigneeName ?? run.inspectorName
                ? t('This run is assigned to {name}. You can only view or export it.', { name: run.assigneeName ?? run.inspectorName })
                : t('This run has not been assigned to any staff member yet.')}
            </span>
          ) : (
            <span className="tabular">
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
