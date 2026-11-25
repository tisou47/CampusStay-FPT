import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays, ClipboardCheck, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card, ProgressBar } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { EmptyBlock, LoadingState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { conditionName, conditionTone, typeName } from '@/lib/furniture'
import { formatDate, formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-MNT-20 Inspection Schedule (Figma 99:2569). Two views of the same Blocks: the schedules (with the editor beside
// them) and the runs they started (INS-…), for one Block or every Block in scope.
// GET /inspection-schedules?block (a Block code, or "all") → {
//   items: [{ id, name, checklistId, scope, scopeLabel, repeat, repeatLabel, assignee, dueWithinDays, createRequests,
//     notifyResidents, nextRunAt, status, createdAt, block }],
//   runs: [{ id, assigneeName, inspected, rooms, failed, status, block, scheduleName, date, dueAt, unreachable, overdue }],
//   options: { checklists, scopes, repeats, assignees } | null (every Block: a schedule is changed in its own Block),
//   block, blocks }
// POST /inspection-schedules · PUT /inspection-schedules/:id

const tone = { Active: 'success', Planned: 'info', Paused: 'neutral', Submitted: 'info', 'In progress': 'info', Done: 'success', Completed: 'success' }
const scheduleDisplayStatus = (s) => (s?.status !== 'Completed' && s?.latestRunSubmitted ? 'Submitted' : s?.status)
const blank = { name: '', checklistId: '', scope: '', repeat: '', assignee: '', dueWithinDays: 3, createRequests: true, notifyResidents: true }
const NEW_ITEM = {}
const ALL = 'all'
const PRE_ARRIVAL_KEYS = ['pre-arrival', 'incoming']

// A schedule is pre-arrival by its scope only (WEB-OPS-07): names are free text in any language.
function isPreArrivalSchedule(s) {
  return s?.scope === 'INCOMING'
}

function isPreArrivalRun(r) {
  const text = `${r?.scheduleName ?? ''} ${tr(r?.scheduleName) ?? ''}`.toLowerCase()
  return PRE_ARRIVAL_KEYS.some((k) => text.includes(k))
}

function Editor({ item, options, block, onSaved, onCancel }) {
  const { notify, notifyError } = useToast()
  const isNew = !item.id
  const [form, setForm] = useState({ ...blank, ...item, assignee: item.assignee ?? '' })
  useEffect(() => setForm({ ...blank, ...item, assignee: item.assignee ?? '' }), [item])
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const body = () => ({
    block,
    name: form.name.trim(),
    checklistId: form.checklistId,
    scope: form.scope,
    repeat: form.repeat,
    assignee: form.assignee,
    dueWithinDays: Number(form.dueWithinDays) || 1,
    createRequests: form.createRequests,
    notifyResidents: form.notifyResidents,
  })
  const save = useMutation(() => (isNew ? api.inspections.createSchedule(body()) : api.inspections.updateSchedule(item.id, body())), {
    invalidates: ['inspection-schedules'],
    onSuccess: (res) => {
      notify({ title: 'Schedule saved', message: t('{name}. Staff get each run on their inspections page.', { name: form.name.trim() }) })
      onSaved?.(isNew ? res?.id : item.id)
    },
    onError: () => {},
  })
  const pause = useMutation(() => api.inspections.updateSchedule(item.id, { status: item.status === 'Paused' ? 'Active' : 'Paused' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ type: 'info', title: t(item.status === 'Paused' ? '{name} resumed' : '{name} paused', { name: item.name }) }),
    onError: (e) => notifyError(e, 'Could not change the schedule'),
  })
  const opt = (list, placeholder = 'Choose…') => [{ value: '', label: placeholder, disabled: true }, ...(list ?? [])]
  const complete = form.name.trim() && form.checklistId && form.scope && form.repeat && form.assignee
  const checklist = options?.checklists?.find((c) => c.value === form.checklistId)
  const assigneePlaceholder = block ? t('-- Choose a staff member of Block {code} --', { code: block }) : t('-- Choose a staff member --')

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{tr(form.name) || t('New schedule')}</h2>
        <p className="text-sm text-fg-secondary">
          {[block && t('Block {code}', { code: block }), item.createdAt ? t('Created {date}', { date: formatDate(item.createdAt) }) : t('Not saved yet')].filter(Boolean).join(' · ')}
        </p>
      </div>
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      {isNew && <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="e.g. Air-conditioner filters" />}</Field>}
      <Field label="Checklist" helper={checklist ? undefined : t('{n} published checklists to choose from.', { n: options?.checklists?.length ?? 0 })}>
        {(id) => <Select id={id} value={form.checklistId} onChange={set('checklistId')} options={opt(options?.checklists, t('-- Choose a checklist --'))} />}
      </Field>
      <Field label="Scope">{(id) => <Select id={id} value={form.scope} onChange={set('scope')} options={opt(options?.scopes, t('-- Choose a scope --'))} />}</Field>
      <Field label="Repeats">{(id) => <Select id={id} value={form.repeat} onChange={set('repeat')} options={opt(options?.repeats, t('-- Choose how often --'))} />}</Field>
      <Field label="Assign to">{(id) => <Select id={id} value={form.assignee} onChange={set('assignee')} options={opt(options?.assignees, assigneePlaceholder)} />}</Field>
      <Field label="Due within (days)">{(id) => <Input id={id} value={form.dueWithinDays} onChange={set('dueWithinDays')} inputMode="numeric" />}</Field>
      <Checkbox label="Create maintenance requests for failed items" checked={form.createRequests} onChange={(e) => setForm((f) => ({ ...f, createRequests: e.target.checked }))} />
      <Checkbox label="Notify residents when the inspection starts" checked={form.notifyResidents} onChange={(e) => setForm((f) => ({ ...f, notifyResidents: e.target.checked }))} />
      <div className="flex justify-end gap-2">
        {!isNew && onCancel && (
          <Button onClick={onCancel}>
            Cancel
          </Button>
        )}
        {!isNew && (
          <Button onClick={() => pause.run()} disabled={pause.pending}>
            {item.status === 'Paused' ? t('Resume') : t('Pause')}
          </Button>
        )}
        <Button variant="primary" onClick={() => save.run()} disabled={!complete || save.pending}>
          Save
        </Button>
      </div>
    </Card>
  )
}

/** Compact card for an already-assigned schedule: shows Pause/Resume and a small Edit button. */
function ScheduleCard({ item, options, linkedRunId, onEdit, onViewRun }) {
  const { notify, notifyError } = useToast()
  const pause = useMutation(() => api.inspections.updateSchedule(item.id, { status: item.status === 'Paused' ? 'Active' : 'Paused' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ type: 'info', title: t(item.status === 'Paused' ? '{name} resumed' : '{name} paused', { name: item.name }) }),
    onError: (e) => notifyError(e, 'Could not change the schedule'),
  })
  const completeSchedule = useMutation(() => api.inspections.updateSchedule(item.id, { status: 'Completed' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ title: 'Inspection schedule ended', message: tr(item.name) }),
    onError: (e) => notifyError(e, 'Could not end the inspection schedule'),
  })
  const assigneeName = options?.assignees?.find((a) => a.value === item.assignee)?.label
  const isCompleted = item.status === 'Completed'
  const displayStatus = scheduleDisplayStatus(item)
  const targetRunId = item.latestRunId ?? linkedRunId
  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{tr(item.name)}</h2>
          <p className="text-sm text-fg-secondary">
            {[item.block && t('Block {code}', { code: item.block }), item.createdAt ? t('Created {date}', { date: formatDate(item.createdAt) }) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Tag tone={tone[displayStatus] ?? 'neutral'}>{displayStatus}</Tag>
      </div>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-fg-secondary">{t('Scope')}</dt>
        <dd className="text-fg">{tr(item.scopeLabel)}</dd>
        <dt className="text-fg-secondary">{t('Repeats')}</dt>
        <dd className="text-fg">{tr(item.repeatLabel)}</dd>
        <dt className="text-fg-secondary">{t('Assign to')}</dt>
        <dd className="font-medium text-fg">{assigneeName || '—'}</dd>
        <dt className="text-fg-secondary">{t('Next run')}</dt>
        <dd className="text-fg">{item.nextRunAt ? formatDateTime(item.nextRunAt) : '—'}</dd>
        <dt className="text-fg-secondary">{t('Due within (days)')}</dt>
        <dd className="text-fg">{item.dueWithinDays}</dd>
      </dl>
      {!isCompleted && item.latestRunSubmitted && (
        <Alert type="success" title="Staff submitted the inspection results">
          {t('Staff submitted the report of this schedule’s run. You can record it as done and end the schedule.')}
        </Alert>
      )}
      {!isCompleted ? (
        item.latestRunSubmitted ? (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {targetRunId && (
              <Button onClick={() => onViewRun?.(targetRunId)}>
                {t('View stats & details')}
              </Button>
            )}
            <Button variant="primary" onClick={() => completeSchedule.run()} disabled={completeSchedule.pending}>
              {t('Complete schedule')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button onClick={() => pause.run()} disabled={pause.pending}>
              {item.status === 'Paused' ? t('Resume') : t('Pause')}
            </Button>
          </div>
        )
      ) : targetRunId ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button variant="primary" onClick={() => onViewRun?.(targetRunId)}>
            {t('View stats & details')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

/** Every Block is shown: a schedule is read here and changed in its own Block. */
function ScheduleSummary({ item, linkedRunId, onOpenBlock, onViewRun }) {
  const targetRunId = item.latestRunId ?? linkedRunId
  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{tr(item.name)}</h2>
        <p className="text-sm text-fg-secondary">{t('Block {code}', { code: item.block })}</p>
      </div>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-fg-secondary">{t('Scope')}</dt>
        <dd className="text-fg">{tr(item.scopeLabel)}</dd>
        <dt className="text-fg-secondary">{t('Repeats')}</dt>
        <dd className="text-fg">{tr(item.repeatLabel)}</dd>
        <dt className="text-fg-secondary">{t('Next run')}</dt>
        <dd className="text-fg">{item.nextRunAt ? formatDateTime(item.nextRunAt) : '—'}</dd>
        <dt className="text-fg-secondary">{t('Due within (days)')}</dt>
        <dd className="text-fg">{item.dueWithinDays}</dd>
        <dt className="text-fg-secondary">{t('Status')}</dt>
        <dd>
          {(() => {
            const displayStatus = scheduleDisplayStatus(item)
            return <Tag tone={tone[displayStatus] ?? 'neutral'}>{displayStatus}</Tag>
          })()}
        </dd>
      </dl>
      <Alert type="info" title="Changed in its own Block">
        {t('Every Block is shown. Open Block {code} to change this schedule or create one there.', { code: item.block })}
      </Alert>
      <div className="flex flex-wrap justify-end gap-2">
        {targetRunId && (
          <Button onClick={() => onViewRun?.(targetRunId)}>
            {t('View stats & details')}
          </Button>
        )}
        <Button variant="primary" onClick={() => onOpenBlock(item.block)}>
          {t('Open Block {code}', { code: item.block })}
        </Button>
      </div>
    </Card>
  )
}

function RunDetail({ run }) {
  const done = run.inspected + run.unreachable
  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{run.id}</h2>
          <p className="text-sm text-fg-secondary">{[tr(run.scheduleName), run.block && t('Block {code}', { code: run.block })].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex gap-1">
          {run.overdue && <Tag tone="error">Overdue</Tag>}
          <Tag tone={tone[run.status] ?? 'neutral'}>{run.status}</Tag>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-fg-secondary">{t('Progress')}</span>
          <span className="font-semibold text-fg tabular">{t('{n} of {total} Rooms', { n: done, total: run.rooms })}</span>
        </div>
        <ProgressBar value={done} max={run.rooms || 1} tone={run.status === 'Completed' ? 'success' : 'accent'} />
      </div>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-fg-secondary">{t('Assigned to')}</dt>
        <dd className="text-fg">{run.assigneeName ?? '—'}</dd>
        <dt className="text-fg-secondary">{t('Started')}</dt>
        <dd className="text-fg">{run.date ? formatDate(run.date) : '—'}</dd>
        <dt className="text-fg-secondary">{t('Due')}</dt>
        <dd className={run.overdue ? 'font-semibold text-error-fg' : 'text-fg'}>{run.dueAt ? formatDateTime(run.dueAt) : '—'}</dd>
        <dt className="text-fg-secondary">{t('Rooms inspected')}</dt>
        <dd className="text-fg tabular">{run.inspected}</dd>
        <dt className="text-fg-secondary">{t('Not reachable')}</dt>
        <dd className="text-fg tabular">{run.unreachable}</dd>
        <dt className="text-fg-secondary">{t('Items not passed')}</dt>
        <dd className={run.failed ? 'font-semibold text-error-fg tabular' : 'text-fg tabular'}>{run.failed}</dd>
      </dl>
      <p className="text-sm text-fg-tertiary">{t('Items not passed became maintenance requests (or a spare from the store for a missing item).')}</p>
      <RunStats run={run} />
    </Card>
  )
}

/** Every Room of a run (pages of 100), for the statistics. */
async function allRooms(runId, signal) {
  const rooms = []
  for (let page = 1; page < 50; page++) {
    const res = await api.inspections.rooms(runId, { page, pageSize: 100 }, { signal })
    rooms.push(...(res?.items ?? []))
    if (!res?.items?.length || rooms.length >= (res.total ?? 0)) break
  }
  return rooms
}

/**
 * The statistics of a run: Rooms by state, furniture found Worn, Damaged or Missing by type, and every Room's report. Read from the run's Rooms, so a run sent by Staff shows its final results at once.
 */
function RunStats({ run }) {
  const query = useQuery(['inspections', 'rooms', run.id, 'stats'], ({ signal }) => allRooms(run.id, signal))
  const rooms = query.data ?? []
  const stat = { done: 0, unreachable: 0, open: 0, Worn: 0, Damaged: 0, Missing: 0, failedChecks: 0 }
  const byType = new Map()
  // Every Room of the run: what Staff found wrong (0 when fine), not reachable, or not inspected yet.
  const checked = []
  for (const r of rooms) {
    if (r.status === 'Done') stat.done += 1
    else if (r.status === 'Not reachable') stat.unreachable += 1
    else stat.open += 1
    const checks = Object.fromEntries((r.checks ?? []).map((c) => [c.id, c]))
    const items = []
    for (const x of r.results ?? []) {
      const check = checks[x.itemId]
      if (check?.kind === 'furniture' && x.condition && x.condition !== 'Good') {
        stat[x.condition] += 1
        const key = typeName(check)
        const row = byType.get(key) ?? { type: key, Worn: 0, Damaged: 0, Missing: 0 }
        row[x.condition] += 1
        byType.set(key, row)
        items.push({ name: typeName(check), condition: x.condition, label: conditionName(x.condition), note: x.note, damaged: x.condition !== 'Worn' })
      } else if (!check && x.result === 'Fail') {
        stat.failedChecks += 1
        const label = run.checklist?.items?.find((i) => String(i.id) === String(x.itemId))?.label
        items.push({ name: tr(label) ?? t('Checklist item'), condition: 'Fail', label: t('Fail'), note: x.note, damaged: true })
      }
    }
    checked.push({ room: r.room, state: r.status === 'Done' ? 'done' : r.status === 'Not reachable' ? 'unreachable' : 'open', items })
  }
  const types = [...byType.values()].sort((a, b) => b.Damaged + b.Missing - (a.Damaged + a.Missing))
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="text-base font-semibold text-fg">{t(run.status === 'Completed' ? 'Results of the completed run' : 'Results so far')}</h3>
      {query.loading && !query.data ? (
        <p className="text-sm text-fg-secondary">{t('Loading…')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Rooms done', value: stat.done },
              { label: 'Not reachable', value: stat.unreachable },
              { label: 'Rooms not finished', value: stat.open },
              { label: 'Damaged', value: stat.Damaged, warn: true },
              { label: 'Missing', value: stat.Missing, warn: true },
              { label: 'Worn', value: stat.Worn },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-subtle/60 px-2 py-2">
                <p className={x.warn && x.value ? 'text-h3 font-semibold text-error-fg tabular' : 'text-h3 font-semibold text-fg tabular'}>{x.value}</p>
                <p className="text-xs text-fg-secondary">{x.label === 'Damaged' || x.label === 'Missing' || x.label === 'Worn' ? conditionName(x.label) : t(x.label)}</p>
              </div>
            ))}
          </div>
          {stat.failedChecks > 0 && <p className="text-sm text-fg-secondary">{t('{n} checklist items failed.', { n: stat.failedChecks })}</p>}
          {types.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-fg">{t('By furniture type')}</span>
              <ul className="flex flex-col divide-y divide-line/70 rounded-lg border border-line text-sm">
                {types.map((x) => (
                  <li key={x.type} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate text-fg">{x.type}</span>
                    <span className="flex shrink-0 gap-1">
                      {x.Damaged > 0 && <Tag tone={conditionTone.Damaged}>{`${conditionName('Damaged')} ${x.Damaged}`}</Tag>}
                      {x.Missing > 0 && <Tag tone={conditionTone.Missing}>{`${conditionName('Missing')} ${x.Missing}`}</Tag>}
                      {x.Worn > 0 && <Tag tone={conditionTone.Worn}>{`${conditionName('Worn')} ${x.Worn}`}</Tag>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <RoomReportList run={run} rooms={checked} />
        </>
      )}
    </section>
  )
}


/**
 * Every Room of the run, one line each: the damaged items (Damaged, Missing or a failed check) counted apart from the
 * Worn ones, "0 damaged items" when fine, "Not reachable" or "Not inspected yet", and a short chip per item found
 * (its note in the tooltip). A finished Room opens its report.
 */
function RoomReportList({ run, rooms }) {
  const navigate = useNavigate()
  if (!rooms.length) return null
  const order = { done: 0, unreachable: 1, open: 2 }
  const damagedOf = (r) => r.items.filter((i) => i.damaged).length
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg">{t('Room reports ({n})', { n: rooms.length })}</span>
      <ul className="flex max-h-96 flex-col divide-y divide-line/70 overflow-y-auto rounded-lg border border-line text-sm">
        {[...rooms]
          .sort((a, b) => order[a.state] - order[b.state] || damagedOf(b) - damagedOf(a) || b.items.length - a.items.length || a.room.localeCompare(b.room))
          .map((r) => {
            const damaged = damagedOf(r)
            const worn = r.items.length - damaged
            return (
              <li key={r.room}>
                <button
                  type="button"
                  disabled={r.state === 'open'}
                  onClick={() => navigate(`/manager/inspections/${encodeURIComponent(run.id)}/rooms/${encodeURIComponent(r.room)}?from=schedule`)}
                  className="flex w-full flex-col gap-1.5 px-3 py-2 text-left enabled:hover:bg-subtle"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-auto font-semibold text-fg tabular">{r.room}</span>
                    {r.state === 'open' ? (
                      <Tag tone="neutral">{t('Not inspected yet')}</Tag>
                    ) : r.state === 'unreachable' ? (
                      <Tag tone="warning">{t('Not reachable')}</Tag>
                    ) : (
                      <>
                        <Tag tone={damaged ? 'error' : 'success'}>{t('{n} damaged items', { n: damaged })}</Tag>
                        {worn > 0 && <Tag tone="info">{t('{n} worn', { n: worn })}</Tag>}
                      </>
                    )}
                  </span>
                  {r.items.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {r.items.map((i, k) => (
                        <span
                          key={`${i.name}-${k}`}
                          title={i.note ? tr(i.note) : undefined}
                          className={`rounded-md px-1.5 py-0.5 text-xs ${i.damaged ? 'bg-error-bg text-error-fg' : 'bg-subtle text-fg-secondary'}`}
                        >
                          {`${i.name} · ${i.label}`}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}

export default function InspectionSchedule() {
  const { block: scopeBlock, blocks } = useSession()
  const [filter, setFilter] = useState(scopeBlock ?? ALL)
  const effectiveFilter = scopeBlock ?? filter
  const [selectedId, setSelectedId] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    setFilter(scopeBlock ?? ALL)
    setSelectedId(null)
    setSelectedRun(null)
    setEditing(false)
  }, [scopeBlock])
  const [view, setView] = useState('schedules')
  const [q, setQ] = useState('')
  const query = useQuery(
    ['inspection-schedules', effectiveFilter],
    ({ signal }) => api.inspections.schedules({ block: effectiveFilter }, { signal }),
  )
  const one = effectiveFilter !== ALL
  const needle = q.trim().toLowerCase()
  const matches = (...texts) => !needle || texts.some((x) => (x ?? '').toLowerCase().includes(needle))
  const items = (query.data?.items ?? [])
    .filter((s) => matches(tr(s.name), s.name, s.block, tr(s.scopeLabel)))
    .sort((a, b) => {
      const pa = isPreArrivalSchedule(a) ? 0 : 1
      const pb = isPreArrivalSchedule(b) ? 0 : 1
      if (pa !== pb) return pa - pb
      const sa = a.status === 'Active' ? 0 : 1
      const sb = b.status === 'Active' ? 0 : 1
      if (sa !== sb) return sa - sb
      return (a.block ?? '').localeCompare(b.block ?? '') || tr(a.name).localeCompare(tr(b.name))
    })
  const runs = (query.data?.runs ?? [])
    .filter((r) => matches(r.id, r.assigneeName, tr(r.scheduleName), r.block))
    .sort((a, b) => {
      const pa = isPreArrivalRun(a) ? 0 : 1
      const pb = isPreArrivalRun(b) ? 0 : 1
      if (pa !== pb) return pa - pb
      const da = a.status !== 'Completed' ? 0 : 1
      const db = b.status !== 'Completed' ? 0 : 1
      if (da !== db) return da - db
      return String(b.date ?? '').localeCompare(String(a.date ?? ''))
    })
  const selected = selectedId === 'new' ? NEW_ITEM : items.find((s) => s.id === selectedId) ?? items[0]
  const allRuns = query.data?.runs ?? []
  const linkedRunOf = (s) => {
    if (!s || !s.id) return null
    if (s.latestRunId) return s.latestRunId
    const found = allRuns.find((r) => r.scheduleId === s.id || (r.block === s.block && r.scheduleName === s.name))
    return found?.id ?? null
  }
  const openRunStats = (runId) => {
    if (runId) setSelectedRun(runId)
    setQ('')
    setView('runs')
  }
  const run = runs.find((r) => r.id === selectedRun) ?? runs[0]
  const blockOptions = [{ value: ALL, label: t('Every Block in use') }, ...(query.data?.blocks ?? blocks).map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))]
  const openBlock = (code) => {
    setFilter(code)
    setSelectedId(null)
    setSelectedRun(null)
    setEditing(false)
  }

  return (
    <>
      <PageHeader
        title={one ? t('Inspection schedules · Block {code}', { code: effectiveFilter }) : 'Inspection schedules'}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => { setView('schedules'); setSelectedId('new'); setEditing(true) }} disabled={!query.data || !one} tip={one ? undefined : 'Choose a Block to create a schedule in it.'}>
            New schedule
          </Button>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'schedules', label: t('Schedules in use · {n}', { n: query.data?.items?.length ?? 0 }) },
            { value: 'runs', label: t('Inspection runs · {n}', { n: query.data?.runs?.length ?? 0 }) },
          ]}
        />
        {!scopeBlock && (
          <Select
            fit wrapperClassName="max-w-80"
            aria-label={t('Block')}
            value={effectiveFilter}
            onChange={(e) => {
              setFilter(e.target.value)
              setSelectedId(null)
              setSelectedRun(null)
              setEditing(false)
            }}
            options={blockOptions}
          />
        )}
        <SearchInput wrapperClassName="w-72" aria-label={t('Search')} placeholder={view === 'runs' ? 'Run code, staff or schedule' : 'Schedule name or scope'} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {view === 'schedules' ? (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <Table fill>
              <THead>
                <tr>
                  <Th className="w-56">Schedule</Th>
                  {!one && <Th className="w-20">Block</Th>}
                  <Th>Scope</Th>
                  <Th className="w-36">Repeats</Th>
                  <Th className="w-28">Next run</Th>
                  <Th className="w-25">Status</Th>
                </tr>
              </THead>
              <TBody>
                <TableStatus query={query} colSpan={one ? 5 : 6} rows={items} emptyIcon={CalendarDays} emptyTitle="No schedules yet" emptyText="Create one to send inspection runs to staff." />
                {items.map((s) => (
                  <Tr key={s.id} selected={s.id === selected?.id} onClick={() => { setSelectedId(s.id); setEditing(false) }} className="[&>td]:h-15.5">
                    <Td className="font-medium text-fg-brand">{tr(s.name)}</Td>
                    {!one && <Td>{s.block}</Td>}
                    <Td>{tr(s.scopeLabel)}</Td>
                    <Td>{tr(s.repeatLabel)}</Td>
                    <Td>{s.nextRunAt ? formatDate(s.nextRunAt) : s.repeat === 'ONCE' ? <span className="text-sm text-fg-tertiary">{t('One-off (started)')}</span> : '—'}</Td>
                    <Td>
                      {(() => {
                        const displayStatus = scheduleDisplayStatus(s)
                        return <Tag tone={tone[displayStatus] ?? 'neutral'}>{displayStatus}</Tag>
                      })()}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          {query.loading && !query.data ? (
            <Card className="flex w-95 shrink-0 flex-col">
              <LoadingState />
            </Card>
          ) : selected && one ? (
            editing || selectedId === 'new' || !selected.assignee ? (
              <Editor
                key={`${effectiveFilter}-${selected.id ?? 'new'}`}
                item={selected}
                options={query.data?.options}
                block={effectiveFilter}
                onSaved={(id) => {
                  if (id) setSelectedId(id)
                  setEditing(false)
                }}
                onCancel={selected.assignee ? () => setEditing(false) : undefined}
              />
            ) : (
              <ScheduleCard
                item={selected}
                options={query.data?.options}
                linkedRunId={linkedRunOf(selected)}
                onEdit={() => setEditing(true)}
                onViewRun={openRunStats}
              />
            )
          ) : selected?.id ? (
            <ScheduleSummary item={selected} linkedRunId={linkedRunOf(selected)} onOpenBlock={openBlock} onViewRun={openRunStats} />
          ) : (
            <Card className="flex w-95 shrink-0 flex-col">
              <EmptyBlock icon={CalendarDays} title="Select a schedule" />
            </Card>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            <p className="shrink-0 px-0.5 text-sm text-fg-tertiary">
              {t('Actual execution runs generated from the schedules (code, assigned staff, room progress and items not passed).')}
            </p>
            <Table fill>
              <THead>
                <tr>
                  <Th className="w-32">Run</Th>
                  {!one && <Th className="w-20">Block</Th>}
                  <Th>Schedule · assigned to</Th>
                  <Th className="w-28">Started</Th>
                  <Th className="w-28">Progress</Th>
                  <Th className="w-32">Items not passed</Th>
                  <Th className="w-32">Status</Th>
                </tr>
              </THead>
              <TBody>
                <TableStatus query={query} colSpan={one ? 6 : 7} rows={runs} emptyIcon={ClipboardCheck} emptyTitle="No runs yet" />
                {runs.map((r) => (
                  <Tr key={r.id} selected={r.id === run?.id} onClick={() => setSelectedRun(r.id)} className="[&>td]:h-15.5">
                    <Td className="font-medium text-fg-brand">{r.id}</Td>
                    {!one && <Td>{r.block}</Td>}
                    <Td>
                      <TwoLine primary={tr(r.scheduleName) || '—'} secondary={r.assigneeName ?? '—'} />
                    </Td>
                    <Td>{r.date ? formatDate(r.date) : '—'}</Td>
                    <Td className="tabular">
                      {r.inspected + r.unreachable} / {r.rooms}
                    </Td>
                    <Td className={r.failed ? 'font-semibold text-error-fg tabular' : 'tabular'}>{r.failed}</Td>
                    <Td>
                      <span className="flex flex-col items-start gap-1">
                        <Tag tone={tone[r.status] ?? 'neutral'}>{r.status}</Tag>
                        {r.overdue && <Tag tone="error">Overdue</Tag>}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          {query.loading && !query.data ? (
            <Card className="flex w-95 shrink-0 flex-col">
              <LoadingState />
            </Card>
          ) : run ? (
            <RunDetail run={run} />
          ) : (
            <Card className="flex w-95 shrink-0 flex-col">
              <EmptyBlock icon={ClipboardCheck} title="Select a run" />
            </Card>
          )}
        </div>
      )}
    </>
  )
}
