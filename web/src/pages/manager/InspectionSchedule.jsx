import { useEffect, useState } from 'react'
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
import { EmptyBlock, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
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

const tone = { Active: 'success', Planned: 'info', Paused: 'neutral', 'In progress': 'info', Done: 'success' }
const blank = { name: '', checklistId: '', scope: '', repeat: '', assignee: '', dueWithinDays: 3, createRequests: true, notifyResidents: true }
const ALL = 'all'

function Editor({ item, options, block, onCreated }) {
  const { notify, notifyError } = useToast()
  const isNew = !item.id
  const [form, setForm] = useState({ ...blank, ...item })
  useEffect(() => setForm({ ...blank, ...item }), [item])
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
      if (isNew && res?.id) onCreated(res.id)
    },
    onError: () => {},
  })
  const pause = useMutation(() => api.inspections.updateSchedule(item.id, { status: item.status === 'Paused' ? 'Active' : 'Paused' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ type: 'info', title: t(item.status === 'Paused' ? '{name} resumed' : '{name} paused', { name: item.name }) }),
    onError: (e) => notifyError(e, 'Could not change the schedule'),
  })
  const opt = (list) => [{ value: '', label: 'Choose…', disabled: true }, ...(list ?? [])]
  const complete = form.name.trim() && form.checklistId && form.scope && form.repeat && form.assignee
  const checklist = options?.checklists?.find((c) => c.value === form.checklistId)

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
        {(id) => <Select id={id} value={form.checklistId} onChange={set('checklistId')} options={opt(options?.checklists)} />}
      </Field>
      <Field label="Scope">{(id) => <Select id={id} value={form.scope} onChange={set('scope')} options={opt(options?.scopes)} />}</Field>
      <Field label="Repeats">{(id) => <Select id={id} value={form.repeat} onChange={set('repeat')} options={opt(options?.repeats)} />}</Field>
      <Field label="Assign to">{(id) => <Select id={id} value={form.assignee} onChange={set('assignee')} options={opt(options?.assignees)} />}</Field>
      <Field label="Due within (days)">{(id) => <Input id={id} value={form.dueWithinDays} onChange={set('dueWithinDays')} inputMode="numeric" />}</Field>
      <Checkbox label="Create maintenance requests for failed items" checked={form.createRequests} onChange={(e) => setForm((f) => ({ ...f, createRequests: e.target.checked }))} />
      <Checkbox label="Notify residents when the inspection starts" checked={form.notifyResidents} onChange={(e) => setForm((f) => ({ ...f, notifyResidents: e.target.checked }))} />
      <div className="flex justify-end gap-2">
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

/** Every Block is shown: a schedule is read here and changed in its own Block. */
function ScheduleSummary({ item, onOpenBlock }) {
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
          <Tag tone={tone[item.status] ?? 'neutral'}>{item.status}</Tag>
        </dd>
      </dl>
      <Alert type="info" title="Changed in its own Block">
        {t('Every Block is shown. Open Block {code} to change this schedule or create one there.', { code: item.block })}
      </Alert>
      <div className="flex justify-end">
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
        <ProgressBar value={done} max={run.rooms || 1} tone={run.status === 'Done' ? 'success' : 'accent'} />
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
    </Card>
  )
}

export default function InspectionSchedule() {
  const { block: scopeBlock, blocks } = useSession()
  const [filter, setFilter] = useState(scopeBlock ?? ALL)
  useEffect(() => {
    if (scopeBlock) setFilter(scopeBlock)
  }, [scopeBlock])
  const [view, setView] = useState('schedules')
  const [q, setQ] = useState('')
  const query = useQuery(['inspection-schedules', filter], ({ signal }) => api.inspections.schedules({ block: filter }, { signal }))
  const one = filter !== ALL
  const needle = q.trim().toLowerCase()
  const matches = (...texts) => !needle || texts.some((x) => (x ?? '').toLowerCase().includes(needle))
  const items = (query.data?.items ?? []).filter((s) => matches(tr(s.name), s.name, s.block, tr(s.scopeLabel)))
  const runs = (query.data?.runs ?? []).filter((r) => matches(r.id, r.assigneeName, tr(r.scheduleName), r.block))
  const [selectedId, setSelectedId] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const selected = selectedId === 'new' ? {} : items.find((s) => s.id === selectedId) ?? items[0]
  const run = runs.find((r) => r.id === selectedRun) ?? runs[0]
  const blockOptions = [{ value: ALL, label: t('Every Block in use') }, ...(query.data?.blocks ?? blocks).map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))]
  const openBlock = (code) => {
    setFilter(code)
    setSelectedId(null)
  }

  return (
    <>
      <PageHeader
        title={one ? t('Inspection schedules · Block {code}', { code: filter }) : 'Inspection schedules'}
        description="Plan recurring inspections; staff run them with the admin checklist."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => { setView('schedules'); setSelectedId('new') }} disabled={!query.data || !one} tip={one ? undefined : 'Choose a Block to create a schedule in it.'}>
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
            wrapperClassName="w-56"
            aria-label={t('Block')}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setSelectedId(null)
              setSelectedRun(null)
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
                  <Tr key={s.id} selected={s.id === selected?.id} onClick={() => setSelectedId(s.id)} className="[&>td]:h-15.5">
                    <Td className="font-medium text-fg-brand">{tr(s.name)}</Td>
                    {!one && <Td>{s.block}</Td>}
                    <Td>{tr(s.scopeLabel)}</Td>
                    <Td>{tr(s.repeatLabel)}</Td>
                    <Td>{s.nextRunAt ? formatDate(s.nextRunAt) : s.repeat === 'ONCE' ? <span className="text-sm text-fg-tertiary">{t('One-off (started)')}</span> : '—'}</Td>
                    <Td>
                      <Tag tone={tone[s.status] ?? 'neutral'}>{s.status}</Tag>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          {selected && one ? (
            <Editor key={selected.id ?? 'new'} item={selected} options={query.data?.options} block={filter} onCreated={setSelectedId} />
          ) : selected?.id ? (
            <ScheduleSummary item={selected} onOpenBlock={openBlock} />
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
          {run ? (
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
