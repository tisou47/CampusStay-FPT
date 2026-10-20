import { useEffect, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { EmptyBlock, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDate } from '@/lib/format'

// SCR-MNT-20 Inspection Schedule (Figma 99:2569)
// GET /inspection-schedules?block → {
//   items: [{ id, name, checklistId, scope, scopeLabel, repeat, repeatLabel, assignee, dueWithinDays, createRequests, notifyResidents, nextRunAt, status, createdAt }],
//   runs: [{ id, assigneeName, inspected, rooms, failed, status }],
//   options: { checklists: [{ value, label }], scopes: [{ value, label }], repeats: [{ value, label }], assignees: [{ value, label }] } }
// POST /inspection-schedules · PUT /inspection-schedules/:id

const tone = { Active: 'success', Planned: 'info', Paused: 'neutral', 'In progress': 'info', Done: 'success' }
const blank = { name: '', checklistId: '', scope: '', repeat: '', assignee: '', dueWithinDays: 3, createRequests: true, notifyResidents: true }

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
      notify({ title: 'Schedule saved', message: `${form.name.trim()}. Staff get each run on their Inspections page.` })
      if (isNew && res?.id) onCreated(res.id)
    },
    onError: () => {},
  })
  const pause = useMutation(() => api.inspections.updateSchedule(item.id, { status: item.status === 'Paused' ? 'Active' : 'Paused' }), {
    invalidates: ['inspection-schedules'],
    onSuccess: () => notify({ type: 'info', title: item.status === 'Paused' ? `${item.name} resumed` : `${item.name} paused` }),
    onError: (e) => notifyError(e, 'Could not change the schedule'),
  })
  const opt = (list) => [{ value: '', label: 'Choose…', disabled: true }, ...(list ?? [])]
  const complete = form.name.trim() && form.checklistId && form.scope && form.repeat && form.assignee

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{form.name || 'New schedule'}</h2>
        <p className="text-sm text-fg-secondary">{item.createdAt ? `Created ${formatDate(item.createdAt)}` : 'Not saved yet'}</p>
      </div>
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      {isNew && <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="e.g. Air-conditioner filters" />}</Field>}
      <Field label="Checklist">{(id) => <Select id={id} value={form.checklistId} onChange={set('checklistId')} options={opt(options?.checklists)} />}</Field>
      <Field label="Scope">{(id) => <Select id={id} value={form.scope} onChange={set('scope')} options={opt(options?.scopes)} />}</Field>
      <Field label="Repeats">{(id) => <Select id={id} value={form.repeat} onChange={set('repeat')} options={opt(options?.repeats)} />}</Field>
      <Field label="Assign to">{(id) => <Select id={id} value={form.assignee} onChange={set('assignee')} options={opt(options?.assignees)} />}</Field>
      <Field label="Due within (days)">{(id) => <Input id={id} value={form.dueWithinDays} onChange={set('dueWithinDays')} inputMode="numeric" />}</Field>
      <Checkbox label="Create Maintenance Requests for failed items" checked={form.createRequests} onChange={(e) => setForm((f) => ({ ...f, createRequests: e.target.checked }))} />
      <Checkbox label="Notify residents 24 hours before" checked={form.notifyResidents} onChange={(e) => setForm((f) => ({ ...f, notifyResidents: e.target.checked }))} />
      <div className="flex justify-end gap-2">
        {!isNew && (
          <Button onClick={() => pause.run()} disabled={pause.pending}>
            {item.status === 'Paused' ? 'Resume' : 'Pause'}
          </Button>
        )}
        <Button variant="primary" onClick={() => save.run()} disabled={!complete || save.pending}>
          Save
        </Button>
      </div>
    </Card>
  )
}

export default function InspectionSchedule() {
  const { block } = useSession()
  const query = useQuery(['inspection-schedules', block], ({ signal }) => api.inspections.schedules({ block: block ?? undefined }, { signal }))
  const items = query.data?.items ?? []
  const [selectedId, setSelectedId] = useState(null)
  const selected = selectedId === 'new' ? {} : items.find((s) => s.id === selectedId) ?? items[0]

  return (
    <>
      <PageHeader
        title="Inspection schedule"
        description="Plan recurring inspections; Staff run them with the Admin checklist."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setSelectedId('new')} disabled={!query.data}>
            New schedule
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-48">Schedule</Th>
                <Th>Scope</Th>
                <Th className="w-36">Repeats</Th>
                <Th className="w-28">Next run</Th>
                <Th className="w-25">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} emptyIcon={CalendarDays} emptyTitle="No schedules yet" emptyText="Create one to send inspection runs to Staff." />
              {items.map((s) => (
                <Tr key={s.id} selected={s.id === selected?.id} onClick={() => setSelectedId(s.id)} className="[&>td]:h-15.5">
                  <Td className="font-medium text-fg-brand">{s.name}</Td>
                  <Td>{s.scopeLabel}</Td>
                  <Td>{s.repeatLabel}</Td>
                  <Td>{formatDate(s.nextRunAt)}</Td>
                  <Td>
                    <Tag tone={tone[s.status] ?? 'neutral'}>{s.status}</Tag>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Table className="max-h-60 shrink-0">
            <THead>
              <tr>
                <Th className="w-48">Run</Th>
                <Th>Assigned to</Th>
                <Th className="w-30">Progress</Th>
                <Th className="w-28">Failed items</Th>
                <Th className="w-25">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} rows={query.data?.runs} emptyTitle="No runs yet" />
              {(query.data?.runs ?? []).map((r) => (
                <Tr key={r.id} className="[&>td]:h-11">
                  <Td className="font-medium text-fg-brand">{r.id}</Td>
                  <Td>{r.assigneeName}</Td>
                  <Td className="tabular">
                    {r.inspected} / {r.rooms}
                  </Td>
                  <Td className="tabular">{r.failed}</Td>
                  <Td>
                    <Tag tone={tone[r.status] ?? 'neutral'}>{r.status}</Tag>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        {selected ? (
          <Editor key={selected.id ?? 'new'} item={selected} options={query.data?.options} block={block} onCreated={setSelectedId} />
        ) : (
          <Card className="flex w-95 shrink-0 flex-col">
            <EmptyBlock icon={CalendarDays} title="Select a schedule" />
          </Card>
        )}
      </div>
    </>
  )
}
