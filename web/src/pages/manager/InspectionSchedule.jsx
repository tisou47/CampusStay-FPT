import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, ClipboardCheck, Plus, Repeat } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card, ProgressBar } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, LoadingState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { conditionName, conditionTone, typeName } from '@/lib/furniture'
import { daysFromToday, formatDate, formatDateTime } from '@/lib/format'
import { cx } from '@/lib/cx'
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

const tone = { Active: 'success', Planned: 'info', Paused: 'neutral', 'In progress': 'info', Done: 'success', Completed: 'success' }
const blank = { name: '', checklistId: '', scope: '', repeat: '', assignee: '', dueWithinDays: 3, createRequests: true, notifyResidents: true }
const NEW_ITEM = {}
const ALL = 'all'
const PRE_ARRIVAL_KEYS = ['pre-arrival', 'trước nhận phòng', 'trước khi nhận phòng', 'trước khi giao', 'đón sinh viên mới', 'bàn giao', 'incoming']

// "Kiểm tra an ninh · Tòa A" → "Kiểm tra an ninh": the block has its own column and title.
const shortName = (name) => (tr(name) ?? '').replace(/\s*·\s*(Tòa|Block)\s+\S+\s*$/i, '')

/** The runs a schedule started (same block and name), newest first. */
const runsOf = (schedule, runs) =>
  (runs ?? [])
    .filter((r) => r.block === schedule.block && shortName(r.scheduleName) === shortName(schedule.name))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))

/** When the schedule starts its next run, in words. */
function NextRun({ item }) {
  if (item.status === 'Paused') return <span className="text-fg-tertiary">{t('Paused')}</span>
  if (!item.nextRunAt) return <span className="text-fg-tertiary">{item.repeat === 'ONCE' ? t('Ran once') : '—'}</span>
  const days = daysFromToday(item.nextRunAt)
  return (
    <span className="flex flex-col">
      <span className="text-fg tabular">{formatDate(item.nextRunAt)}</span>
      <span className="text-sm text-fg-tertiary">{days <= 0 ? t('Today') : days === 1 ? t('Tomorrow') : t('In {n} days', { n: days })}</span>
    </span>
  )
}

/** The latest runs of a schedule with their progress; one opens in the runs view. */
function RecentRuns({ runs, onOpen }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 className="text-sm font-semibold text-fg">{t('Latest runs of this schedule')}</h3>
      {runs.length === 0 ? (
        <p className="text-sm text-fg-tertiary">{t('No run yet: the first one starts on the next run date.')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {runs.slice(0, 3).map((r) => {
            const done = r.inspected + r.unreachable
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-col gap-1 rounded-lg border border-line px-3 py-2 text-left hover:border-line-strong hover:bg-subtle/40">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-fg-brand">{r.id}</span>
                    <span className="flex gap-1">
                      {r.overdue && <Tag tone="error">Overdue</Tag>}
                      <Tag tone={tone[r.status] ?? 'neutral'}>{r.status}</Tag>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-sm text-fg-secondary">
                    <ProgressBar value={done} max={r.rooms || 1} tone={r.status === 'Completed' ? 'success' : 'accent'} className="flex-1" />
                    <span className="shrink-0 tabular">{t('{n}/{total} rooms', { n: done, total: r.rooms })}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function isPreArrivalSchedule(s) {
  if (s?.scope === 'INCOMING') return true
  const text = `${s?.checklistId ?? ''} ${s?.name ?? ''} ${tr(s?.name) ?? ''}`.toLowerCase()
  return PRE_ARRIVAL_KEYS.some((k) => text.includes(k))
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

  return (
    <Modal
      open
      width={880}
      onClose={onCancel}
      title={isNew ? t('New inspection schedule') : t('Edit {name}', { name: shortName(form.name) })}
      description={[block && t('Block {code}', { code: block }), item.createdAt ? t('Created {date}', { date: formatDate(item.createdAt) }) : null].filter(Boolean).join(' · ') || undefined}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          {!isNew && (
            <Button onClick={() => pause.run()} disabled={pause.pending}>
              {item.status === 'Paused' ? t('Resume') : t('Pause')}
            </Button>
          )}
          <Button variant="primary" onClick={() => save.run()} disabled={!complete || save.pending}>
            {isNew ? t('Create schedule') : t('Save')}
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          <EditorStep n={1} title={t('What to check')}>
            {isNew && <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="e.g. Air-conditioner filters" />}</Field>}
            <Field label="Checklist" helper={t('The list of items staff tick in each room (Admin › Inspection checklists).')}>
              {(id) => <Select id={id} value={form.checklistId} onChange={set('checklistId')} options={opt(options?.checklists, t('Choose a checklist'))} />}
            </Field>
          </EditorStep>
          <EditorStep n={2} title={t('Which rooms')}>
            <Field label="Scope">{(id) => <Select id={id} value={form.scope} onChange={set('scope')} options={opt(options?.scopes, t('Choose the rooms'))} />}</Field>
          </EditorStep>
        </div>
        <div className="flex flex-col gap-5">
          <EditorStep n={3} title={t('How often')}>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Field label="Repeats">{(id) => <Select id={id} value={form.repeat} onChange={set('repeat')} options={opt(options?.repeats, t('Choose…'))} />}</Field>
              <Field label="Days to finish" tip={t('Each run must be finished within this many days after it starts.')}>
                {(id) => <Input id={id} value={form.dueWithinDays} onChange={set('dueWithinDays')} inputMode="numeric" />}
              </Field>
            </div>
          </EditorStep>
          <EditorStep n={4} title={t('Who does it')}>
            <Field label="Assign to">{(id) => <Select id={id} value={form.assignee} onChange={set('assignee')} options={opt(options?.assignees, t('Choose a staff member of Block {code}', { code: block }))} />}</Field>
          </EditorStep>
          <EditorStep n={5} title={t('After the inspection')}>
            <Checkbox label="Create maintenance requests for failed items" checked={form.createRequests} onChange={(e) => setForm((f) => ({ ...f, createRequests: e.target.checked }))} />
            <Checkbox label="Notify residents when the inspection starts" checked={form.notifyResidents} onChange={(e) => setForm((f) => ({ ...f, notifyResidents: e.target.checked }))} />
          </EditorStep>
        </div>
      </div>
    </Modal>
  )
}

/** One numbered step of the schedule editor. */
function EditorStep({ n, title, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary-subtle text-xs text-fg-brand">{n}</span>
        {title}
      </h3>
      <div className="flex flex-col gap-3 pl-7">{children}</div>
    </section>
  )
}

/** Compact card for an already-assigned schedule: shows Pause/Resume and a small Edit button. */
function ScheduleCard({ item, options, onEdit, runs, onOpenRun }) {
  const { notify, notifyError } = useToast()
  const pause = useMutation(() => api.inspections.updateSchedule(item.id, { status: item.status === 'Paused' ? 'Active' : 'Paused' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ type: 'info', title: t(item.status === 'Paused' ? '{name} resumed' : '{name} paused', { name: item.name }) }),
    onError: (e) => notifyError(e, 'Could not change the schedule'),
  })
  const completeSchedule = useMutation(() => api.inspections.updateSchedule(item.id, { status: 'Completed' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ title: 'Inspection schedule ended', message: tr(item.name) }),
    onError: (e) => notifyError(e, 'Không thể kết thúc lịch kiểm tra'),
  })
  const assigneeName = options?.assignees?.find((a) => a.value === item.assignee)?.label
  const isCompleted = item.status === 'Completed'
  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{shortName(item.name)}</h2>
          <p className="text-sm text-fg-secondary">
            {[item.block && t('Block {code}', { code: item.block }), item.createdAt ? t('Created {date}', { date: formatDate(item.createdAt) }) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Tag tone={tone[item.status] ?? 'neutral'}>{item.status}</Tag>
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
        <dt className="text-fg-secondary">{t('Time to finish')}</dt>
        <dd className="text-fg">{t('{n} days per run', { n: item.dueWithinDays })}</dd>
      </dl>
      {!isCompleted && item.latestRunSubmitted && (
        <Alert type="success" title="Staff submitted the inspection results">
          Đợt kiểm tra của lịch này đã được nhân viên nộp báo cáo. Bạn có thể ghi nhận hoàn thành và bấm kết thúc lịch.
        </Alert>
      )}
      {!isCompleted && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button size="sm" onClick={onEdit}>
            Chỉnh sửa
          </Button>
          <Button onClick={() => pause.run()} disabled={pause.pending}>
            {item.status === 'Paused' ? t('Resume') : t('Pause')}
          </Button>
          {item.latestRunSubmitted && (
            <Button variant="primary" onClick={() => completeSchedule.run()} disabled={completeSchedule.pending}>
              Kết thúc lịch
            </Button>
          )}
        </div>
      )}
      <RecentRuns runs={runs} onOpen={onOpenRun} />
    </Card>
  )
}

/** Every Block is shown: a schedule is read here and changed in its own Block. */
function ScheduleSummary({ item, onOpenBlock, runs, onOpenRun }) {
  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{shortName(item.name)}</h2>
          <p className="text-sm text-fg-secondary">{t('Block {code}', { code: item.block })}</p>
        </div>
        <Tag tone={tone[item.status] ?? 'neutral'}>{item.status}</Tag>
      </div>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-fg-secondary">{t('Scope')}</dt>
        <dd className="text-fg">{tr(item.scopeLabel)}</dd>
        <dt className="text-fg-secondary">{t('Repeats')}</dt>
        <dd className="text-fg">{tr(item.repeatLabel)}</dd>
        <dt className="text-fg-secondary">{t('Next run')}</dt>
        <dd className="text-fg">{item.nextRunAt ? formatDateTime(item.nextRunAt) : '—'}</dd>
        <dt className="text-fg-secondary">{t('Time to finish')}</dt>
        <dd className="text-fg">{t('{n} days per run', { n: item.dueWithinDays })}</dd>
      </dl>
      <Button variant="text" icon={ArrowRight} className="self-start" onClick={() => onOpenBlock(item.block)} tip="A schedule is changed in its own block.">
        {t('Edit in Block {code}', { code: item.block })}
      </Button>
      <RecentRuns runs={runs} onOpen={onOpenRun} />
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
 * The statistics of a run: Rooms by state, furniture found Worn, Damaged or Missing by type, and a short list of the
 * Rooms with something found. Read from the run's Rooms, so a run sent by Staff shows its final results at once.
 */
function RunStats({ run }) {
  const query = useQuery(['inspections', 'rooms', run.id, 'stats'], ({ signal }) => allRooms(run.id, signal))
  const rooms = query.data ?? []
  const stat = { done: 0, unreachable: 0, open: 0, Worn: 0, Damaged: 0, Missing: 0, failedChecks: 0 }
  const byType = new Map()
  const found = []
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
        items.push(`${typeName(check)}: ${conditionName(x.condition)}${x.note ? ` (${x.note})` : ''}`)
      } else if (!check && x.result === 'Fail') {
        stat.failedChecks += 1
        const label = run.checklist?.items?.find((i) => String(i.id) === String(x.itemId))?.label
        items.push(`${tr(label) ?? t('Checklist item')}: ${t('Fail')}${x.note ? ` (${x.note})` : ''}`)
      }
    }
    if (items.length) found.push({ room: r.room, items })
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
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg">{t('Rooms with something found ({n})', { n: found.length })}</span>
            {found.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('Nothing worn, damaged or missing was found.')}</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {found.map((f) => (
                  <li key={f.room} className="rounded-lg bg-subtle/40 px-3 py-2 text-sm">
                    <span className="font-semibold text-fg">{f.room}</span>
                    <span className="text-fg-secondary"> · {f.items.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export default function InspectionSchedule() {
  const { block: scopeBlock, blocks } = useSession()
  const [filter, setFilter] = useState(scopeBlock ?? ALL)
  const effectiveFilter = scopeBlock ?? filter
  const [selectedId, setSelectedId] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
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
    { keepPrevious: false },
  )
  // Staff send their results from their own screens: read the runs again when the Manager comes back to this window
  // and every 30 seconds, so a run sent shows as Completed with its results without reloading the page.
  const reloadRuns = query.reload
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && reloadRuns()
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
    }
  }, [reloadRuns])
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
  const selected = items.find((s) => s.id === selectedId) ?? items[0]
  const run = runs.find((r) => r.id === selectedRun) ?? runs[0]
  // The API lists only the chosen block once one is chosen: keep every block seen (and the session's) in the list.
  const [knownBlocks, setKnownBlocks] = useState([])
  useEffect(() => {
    const list = query.data?.blocks ?? []
    if (list.length) setKnownBlocks((all) => [...new Set([...all, ...list])].sort())
  }, [query.data?.blocks])
  const allBlocks = [...new Set([...(blocks ?? []), ...knownBlocks])].sort()
  const blockOptions = [{ value: ALL, label: t('Every block') }, ...allBlocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))]
  const openRun = (id) => {
    setSelectedRun(id)
    setView('runs')
  }
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
          <Button variant="primary" icon={Plus} onClick={() => { setView('schedules'); setCreating(true) }} disabled={!query.data || !one} tip={one ? undefined : 'Choose a Block to create a schedule in it.'}>
            New schedule
          </Button>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'schedules', label: t('Schedules · {n}', { n: query.data?.items?.length ?? 0 }) },
            { value: 'runs', label: t('Runs · {n}', { n: query.data?.runs?.length ?? 0 }) },
          ]}
        />
        {!scopeBlock && (
          <Select
            wrapperClassName="w-44"
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
      <p className="-mt-1 flex shrink-0 items-center gap-1.5 text-sm text-fg-tertiary">
        <Repeat size={14} aria-hidden="true" />
        {view === 'runs'
          ? t('A run is one round of a schedule: the rooms a staff member inspects by a date, with what was found.')
          : t('A schedule is the plan (what, where, how often, who). Each time it is due it starts a run for staff.')}
      </p>

      {one && (creating || (editing && selected)) && (
        <Editor
          key={`${effectiveFilter}-${creating ? 'new' : selected.id}`}
          item={creating ? NEW_ITEM : selected}
          options={query.data?.options}
          block={effectiveFilter}
          onSaved={(id) => {
            if (id) setSelectedId(id)
            setCreating(false)
            setEditing(false)
          }}
          onCancel={() => {
            setCreating(false)
            setEditing(false)
          }}
        />
      )}
      {view === 'schedules' ? (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <Table fill>
              <THead>
                <tr>
                  <Th>Schedule</Th>
                  {!one && <Th className="w-20">Block</Th>}
                  <Th className="w-36">Repeats</Th>
                  <Th className="w-36">Next run</Th>
                  <Th className="w-36">Status</Th>
                </tr>
              </THead>
              <TBody>
                <TableStatus query={query} colSpan={one ? 4 : 5} rows={items} emptyIcon={CalendarDays} emptyTitle="No schedules yet" emptyText="Create one to send inspection runs to staff." />
                {items.map((s) => (
                  <Tr key={s.id} selected={s.id === selected?.id} onClick={() => { setSelectedId(s.id); setEditing(false) }} className="[&>td]:h-15.5">
                    <Td>
                      <span className="flex flex-col">
                        <span className="font-medium text-fg-brand">{shortName(s.name)}</span>
                        <span className="text-sm text-fg-tertiary">{tr(s.scopeLabel)}</span>
                      </span>
                    </Td>
                    {!one && (
                      <Td>
                        <Tag dot={false}>{s.block}</Tag>
                      </Td>
                    )}
                    <Td>{tr(s.repeatLabel)}</Td>
                    <Td>
                      <NextRun item={s} />
                    </Td>
                    <Td>
                      <span className="flex flex-col items-start gap-1">
                        <Tag tone={tone[s.status] ?? 'neutral'}>{s.status}</Tag>
                        {(() => {
                          const open = runsOf(s, query.data?.runs).filter((r) => r.status !== 'Completed').length
                          return open > 0 ? <span className="text-xs text-fg-tertiary">{t('{n} runs open', { n: open })}</span> : null
                        })()}
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
          ) : selected && one ? (
            <ScheduleCard item={selected} options={query.data?.options} onEdit={() => setEditing(true)} runs={runsOf(selected, query.data?.runs)} onOpenRun={openRun} />
          ) : selected?.id ? (
            <ScheduleSummary item={selected} onOpenBlock={openBlock} runs={runsOf(selected, query.data?.runs)} onOpenRun={openRun} />
          ) : (
            <Card className="flex w-95 shrink-0 flex-col">
              <EmptyBlock icon={CalendarDays} title="Select a schedule" />
            </Card>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
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
                    {!one && (
                      <Td>
                        <Tag dot={false}>{r.block}</Tag>
                      </Td>
                    )}
                    <Td>
                      <TwoLine primary={shortName(r.scheduleName) || '—'} secondary={r.assigneeName ?? '—'} />
                    </Td>
                    <Td>{r.date ? formatDate(r.date) : '—'}</Td>
                    <Td>
                      <span className="flex flex-col gap-1">
                        <span className="text-sm tabular">
                          {r.inspected + r.unreachable} / {r.rooms}
                        </span>
                        <ProgressBar value={r.inspected + r.unreachable} max={r.rooms || 1} tone={r.status === 'Completed' ? 'success' : 'accent'} className="h-1.5 w-20" />
                      </span>
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
