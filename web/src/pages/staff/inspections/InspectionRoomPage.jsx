import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, CheckCheck, ClipboardCheck, FileText, Info, Save, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { DetailFacts } from '@/components/ui/DetailFacts'
import { Field, Input, Select } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { parseReading } from '@/lib/numbers'
import { conditionName, conditionOptions, conditionTone } from '@/lib/furniture'
import { t, tr } from '@/i18n'
import { printRoom, roomItems } from './inspectionPrint'
import { PausedRunNote } from './RunHeaderAndStats'

const resultTone = { Pass: 'success', Fail: 'error', 'Not checked': 'neutral' }
const statusTone = { 'In progress': 'info', Done: 'success', 'To do': 'neutral', 'Not reachable': 'warning' }

function RoomInspectionForm({ run, room, nextTodoRoom }) {
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const [activeSeg, setActiveSeg] = useState('overview')

  const overviewRef = useRef(null)
  const metersRef = useRef(null)
  const itemsRef = useRef(null)

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

  useEffect(() => {
    setResults(initial)
    setMeters({
      electricity: room.meters?.electricity ?? '',
      water: room.meters?.water ?? '',
      replaced: room.meters?.replaced ?? false,
    })
    setTouched({ electricity: false, water: false })
    setActiveSeg('overview')
  }, [run.id, room.room])

  const sent = run.status === 'Submitted'
  const mine = Boolean(run.mine)
  const assignee = run.assigneeName ?? run.inspectorName
  // A run whose schedule a Manager paused is read only until it is resumed.
  const held = run.status === 'Paused'
  const done = sent || held || !mine || room.status === 'Done'
  const failed = Object.values(results).filter((r) => r.result === 'Fail').length
  const untouched = Object.values(results).every((r) => r.result === 'Not checked') && meters.electricity === '' && meters.water === ''
  const metersMissing = room.metersNeeded && (meters.electricity === '' || meters.water === '')

  const meterError = (key, unit) => {
    const raw = String(meters[key] ?? '').trim()
    if (raw === '') return t('Enter the reading ({unit}).', { unit })
    const value = parseReading(raw)
    if (Number.isNaN(value)) return Number(raw) < 0 ? t('The reading cannot be negative.') : t('Enter a valid number.')
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
            ? { electricity: parseReading(meters.electricity), water: parseReading(meters.water), replaced: meters.replaced }
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

  const checkedCount = items.filter((it) => {
    const r = results[it.id]
    return it.furniture ? Boolean(r?.condition) : r?.result && r.result !== 'Not checked'
  }).length

  const jumpTo = (key, ref) => {
    setActiveSeg(key)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const segments = [
    { key: 'overview', label: 'Overview', icon: Info, ref: overviewRef },
    ...(room.metersNeeded ? [{ key: 'meters', label: '1. Room meters', icon: Zap, ref: metersRef }] : []),
    { key: 'items', label: room.metersNeeded ? '2. Checklist & furniture' : '1. Checklist & furniture', icon: ClipboardCheck, ref: itemsRef },
  ]

  return (
    <div className="flex flex-col gap-5 pb-8">
      {held && <PausedRunNote />}
      {/* Sticky Header Segment Bar */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/95 px-3 py-2 backdrop-blur-xs">
        <Button size="sm" icon={ArrowLeft} onClick={() => (new URLSearchParams(window.location.search).get('from') ? navigate(-1) : navigate('/staff/inspections'))}>
          {t('Back to rooms')}
        </Button>

        <nav aria-label={t('Inspection sections')} className="flex flex-wrap items-center gap-1 rounded-lg bg-subtle p-1">
          {segments.map((seg) => {
            const Icon = seg.icon
            const isActive = activeSeg === seg.key
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => jumpTo(seg.key, seg.ref)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  isActive ? 'bg-primary font-semibold text-fg-on-brand' : 'text-fg-secondary hover:bg-surface hover:text-fg',
                )}
              >
                <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                <span>{t(seg.label)}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={FileText}
            onClick={() => printRoom(run, room) || notify({ type: 'info', title: 'Allow pop-ups to print the report' })}
          >
            View and print report
          </Button>
          {!done && (
            <Button
              size="sm"
              variant="primary"
              icon={Save}
              onClick={() => {
                setTouched({ electricity: true, water: true })
                if (canSave) save.run()
              }}
              disabled={!canSave || save.pending}
            >
              {metersMissing ? t('Save (meters still needed)') : t('Save room')}
            </Button>
          )}
        </div>
      </div>

      {/* Section 0: Room Overview */}
      <div ref={overviewRef} className="flex scroll-mt-16 flex-col gap-4">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h2 font-semibold text-fg">
                {room.room} · {tr(run.checklist?.name)}
              </h1>
              <Tag tone={statusTone[room.status] ?? 'neutral'}>{room.status}</Tag>
              {room.createdRequests?.length > 0 && (
                <Tag tone="warning">
                  {t('Maintenance requests: {ids}', { ids: room.createdRequests.join(', ') })}
                </Tag>
              )}
            </div>
            <p className="text-sm text-fg-secondary">
              {run.id} · {tr(run.scheduleName)} · {t('Report 1 (Room baseline · Web fast entry)')}
            </p>
          </div>
          {nextTodoRoom && (
            <Button
              size="sm"
              onClick={() => navigate(`/staff/inspections/${encodeURIComponent(run.id)}/rooms/${encodeURIComponent(nextTodoRoom.room)}`)}
            >
              <span className="inline-flex items-center gap-1.5">
                {t('Next room: {room}', { room: nextTodoRoom.room })}
                <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
              </span>
            </Button>
          )}
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <DetailFacts
            facts={[
              { label: 'Run', value: run.id },
              { label: 'Room', value: room.room },
              { label: 'Room type', value: [tr(room.roomTypeName), tr(room.roomClassName)].filter(Boolean).join(' ') },
              { label: 'Assignee', value: assignee || t('Unassigned') },
              { label: 'Inspected at', value: room.inspectedAt ? formatDateTime(room.inspectedAt) : null },
              { label: 'Checked', value: `${checkedCount}/${items.length}` },
            ]}
          />
        </section>
      </div>

      {/* Section 1: Meters */}
      {room.metersNeeded && (
        <section ref={metersRef} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <Zap size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
              <div>
                <h2 className="text-h3 font-semibold text-fg">{t('Meters of the Room')}</h2>
                <p className="text-xs text-fg-secondary">
                  {t('Enter the current electricity and water readings for {room}.', { room: room.room })}
                </p>
              </div>
            </div>
            <Tag tone={!electricityError && !waterError ? 'success' : 'warning'}>
              {!electricityError && !waterError ? t('Entered') : t('Pending')}
            </Tag>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
                inputMode="decimal"
                disabled={done}
                invalid={!done && touched.electricity && Boolean(electricityError)}
                value={meters.electricity}
                onChange={(e) => {
                  setMeters((m) => ({ ...m, electricity: e.target.value }))
                  setTouched((s) => ({ ...s, electricity: true }))
                }}
                onBlur={() => setTouched((s) => ({ ...s, electricity: true }))}
                className="text-left text-base font-semibold tabular"
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
                inputMode="decimal"
                disabled={done}
                invalid={!done && touched.water && Boolean(waterError)}
                value={meters.water}
                onChange={(e) => {
                  setMeters((m) => ({ ...m, water: e.target.value }))
                  setTouched((s) => ({ ...s, water: true }))
                }}
                onBlur={() => setTouched((s) => ({ ...s, water: true }))}
                className="text-left text-base font-semibold tabular"
              />
            </Field>
          </div>
        </section>
      )}

      {/* Section 2: Checklist & Furniture */}
      <section ref={itemsRef} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
            <div>
              <h2 className="text-h3 font-semibold text-fg">
                {t('Checklist & furniture ({n} items)', { n: items.length })}
              </h2>
              <p className="text-xs text-fg-secondary">
                {t('Checked {n} of {total} items', { n: checkedCount, total: items.length })}
                {failed > 0 ? ` · ${t('{n} failed items will create maintenance requests', { n: failed })}` : ''}
              </p>
            </div>
          </div>
          {!done && items.length > 0 && (
            <Button size="sm" icon={CheckCheck} onClick={markAllGood}>
              {t('Mark all Good / Pass')}
            </Button>
          )}
        </div>

        <Table className="overflow-visible">
          <THead>
            <tr>
              <Th>Item</Th>
              <Th className="w-76">Condition or result</Th>
              <Th className="w-72">Note</Th>
            </tr>
          </THead>
          <TBody>
            {items.map((item) => {
              const r = results[item.id]
              return (
                <Tr
                  key={item.id}
                  className={cx(
                    '[&>td]:py-2',
                    (r.condition === 'Damaged' || r.condition === 'Missing' || r.result === 'Fail') && 'bg-warning-bg/35',
                  )}
                >
                  <Td>
                    {item.furniture ? (
                      <div className="flex flex-col">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-medium text-fg">{item.name}</span>
                          {item.scopeLabel && (
                            <span className="text-xs font-medium text-fg-brand">{item.scopeLabel}</span>
                          )}
                        </div>
                        {item.assetCode && (
                          <span className="font-mono text-xs text-fg-tertiary">{item.assetCode}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-fg">{item.label}</span>
                    )}
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
                      <span className="text-sm text-fg">{r.note ? tr(r.note) : '—'}</span>
                    ) : (
                      <Input
                        size="sm"
                        aria-label={t('Note for {item}', { item: item.label })}
                        value={r.note ?? ''}
                        onChange={(e) => setNote(item.id, e.target.value)}
                        placeholder={item.furniture ? 'What do you see?' : 'What is wrong?'}
                      />
                    )}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-xs text-fg-secondary">
            {sent ? (
              <span className="font-medium text-fg">{t('This run was sent: read the Rooms, print a Room’s report or export the run.')}</span>
            ) : !mine ? (
              <span className="font-medium text-warning-fg">
                {assignee
                  ? t('This run is assigned to {name}. You can only view or export it.', { name: assignee })
                  : t('This run has not been assigned to any staff member yet.')}
              </span>
            ) : (
              saveHint && <span className="font-medium text-warning-fg">{saveHint}</span>
            )}
          </div>
          {!done && (
            <Button
              variant="primary"
              icon={Save}
              onClick={() => {
                setTouched({ electricity: true, water: true })
                if (canSave) save.run()
              }}
              disabled={!canSave || save.pending}
            >
              {metersMissing ? t('Save (meters still needed)') : t('Save room')}
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

export default function InspectionRoomPage() {
  const { runId, roomCode } = useParams()
  const scope = useScopeQuery()
  const runsQuery = useQuery(['inspections', 'runs', scope], ({ signal }) => api.inspections.runs(scope, { signal }))
  const roomsQuery = useQuery(['inspections', 'rooms', runId, 'all'], ({ signal }) =>
    api.inspections.rooms(runId, { page: 1, pageSize: 100 }, { signal }),
    { enabled: Boolean(runId) },
  )

  if ((runsQuery.loading && !runsQuery.data) || (roomsQuery.loading && !roomsQuery.data)) {
    return <LoadingState className="min-h-80" />
  }
  if (runsQuery.error && !runsQuery.data) return <ErrorState error={runsQuery.error} onRetry={runsQuery.reload} />
  if (roomsQuery.error && !roomsQuery.data) return <ErrorState error={roomsQuery.error} onRetry={roomsQuery.reload} />

  const run = (runsQuery.data?.items ?? []).find((r) => String(r.id) === String(runId))
  const rooms = roomsQuery.data?.items ?? []
  const room = rooms.find((r) => String(r.room) === String(roomCode))
  if (!run || !room) {
    return <ErrorState error={{ message: t('Room or inspection run not found.') }} onRetry={roomsQuery.reload} />
  }

  const nextTodoRoom = rooms.find(
    (r) => r.room !== room.room && (r.status === 'To do' || r.status === 'In progress'),
  )

  return <RoomInspectionForm key={`${run.id}-${room.room}-${room.status}`} run={run} room={room} nextTodoRoom={nextTodoRoom} />
}
