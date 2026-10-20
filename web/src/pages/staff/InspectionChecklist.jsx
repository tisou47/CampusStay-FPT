import { useState } from 'react'
import { CalendarDays, CircleCheck } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, ErrorState, LoadingState, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber } from '@/lib/format'

// SCR-MNT-12 Inspection Checklist (Figma 98:4293)
// GET /inspection-runs/current?termId&block → { run: { id, date, dueAt, scheduleName, scope, rooms, inspected, failed, unreachable, inspectorName,
//   checklist: { name, version, items: [{ id, label, category, severity }] } } | null }
// GET /inspection-runs/:id/rooms?page&pageSize → { items: [{ room, roomTypeName, roomClassName, status, results: [{ itemId, result, note }] }], total }
// PUT /inspection-runs/:id/rooms/:room { results } → { createdRequests } · POST …/rooms/:room/unreachable · POST /inspection-runs/:id/submit
// GET /inspection-runs/upcoming?block → { items: [{ id, date, scope, scheduleName }] }

const resultTone = { Pass: 'success', Fail: 'error', 'Not checked': 'neutral' }
const nextResult = { 'Not checked': 'Pass', Pass: 'Fail', Fail: 'Not checked' }
const statusTone = { 'In progress': 'info', Done: 'success', 'To do': 'neutral', 'Not reachable': 'warning' }

function summary(r, total) {
  if (r.status === 'Not reachable') return 'No one home'
  const results = r.results ?? []
  const failed = results.filter((x) => x.result === 'Fail').length
  const checked = results.filter((x) => x.result && x.result !== 'Not checked').length
  if (!checked) return 'Not started'
  if (failed) return `${failed} ${failed === 1 ? 'item' : 'items'} failed`
  return checked < total ? 'In progress' : 'All passed'
}

function Checklist({ run, room }) {
  const { notify, notifyError } = useToast()
  const items = run.checklist?.items ?? []
  const initial = Object.fromEntries(items.map((it) => [it.id, room.results?.find((x) => x.itemId === it.id) ?? { result: 'Not checked', note: '' }]))
  const [results, setResults] = useState(initial)
  const failed = Object.values(results).filter((r) => r.result === 'Fail').length
  const done = room.status === 'Done' || room.status === 'Not reachable'
  const untouched = Object.values(results).every((r) => r.result === 'Not checked')

  const save = useMutation(() => api.inspections.saveRoom(run.id, room.room, { results: items.map((it) => ({ itemId: it.id, result: results[it.id].result, note: results[it.id].note || undefined })) }), {
    invalidates: ['inspections', 'maintenance'],
    onSuccess: (res) =>
      notify({ title: `${room.room} saved`, message: res?.createdRequests?.length ? `${res.createdRequests.join(', ')} created in Maintenance.` : 'All items passed.' }),
    onError: (e) => notifyError(e, 'Could not save the Room'),
  })
  const unreachable = useMutation(() => api.inspections.unreachable(run.id, room.room), {
    invalidates: ['inspections'],
    onSuccess: () => notify({ type: 'info', title: `${room.room} marked not reachable`, message: 'It moves to the next inspection run.' }),
    onError: (e) => notifyError(e, 'Could not update the Room'),
  })

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">
          {room.room} · {run.checklist?.name}
        </h2>
        <p className="text-sm text-fg-secondary">
          Checklist {run.checklist?.version} set by Admin · {items.length} items{run.inspectorName ? ` · Inspector ${run.inspectorName}` : ''}
        </p>
      </div>
      <Table fill>
        <THead>
          <tr>
            <Th>Item</Th>
            <Th className="w-32">Result</Th>
            <Th className="w-56">Note</Th>
          </tr>
        </THead>
        <TBody>
          {items.map((item) => {
            const r = results[item.id]
            return (
              <Tr key={item.id} className="[&>td]:h-11">
                <Td className="py-1.5">{item.label}</Td>
                <Td>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => setResults((rs) => ({ ...rs, [item.id]: { ...rs[item.id], result: nextResult[rs[item.id].result] ?? 'Pass' } }))}
                    aria-label={`${item.label}: ${r.result}. Change result`}
                    className={cx('rounded-full', !done && 'cursor-pointer hover:ring-2 hover:ring-line-strong')}
                  >
                    <Tag tone={resultTone[r.result] ?? 'neutral'}>{r.result}</Tag>
                  </button>
                </Td>
                <Td>
                  {r.result === 'Fail' && !done ? (
                    <Input aria-label={`Note for ${item.label}`} value={r.note ?? ''} onChange={(e) => setResults((rs) => ({ ...rs, [item.id]: { ...rs[item.id], note: e.target.value } }))} placeholder="What is wrong?" />
                  ) : (
                    <span className="text-fg">{r.note ?? ''}</span>
                  )}
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
      <div className="flex shrink-0 flex-col gap-2.5">
        {room.status === 'Done' ? (
          <Alert type="success" title="Room saved">
            {failed ? `${failed} failed ${failed === 1 ? 'item was' : 'items were'} sent to Maintenance.` : 'Every item passed.'}
          </Alert>
        ) : room.status === 'Not reachable' ? (
          <Alert type="warning" title="Not reachable">
            This Room moves to the next inspection run.
          </Alert>
        ) : failed > 0 ? (
          <Alert type="warning" title={`${failed} failed ${failed === 1 ? 'item' : 'items'} will create Maintenance Requests`}>
            They are routed by the Block routing rules after you save this Room.
          </Alert>
        ) : (
          <p className="text-sm text-fg-tertiary">Click a result to switch between Pass, Fail and Not checked.</p>
        )}
        {!done && (
          <div className="flex justify-end gap-2">
            <Button onClick={() => unreachable.run()} disabled={unreachable.pending}>
              Mark not reachable
            </Button>
            <Button variant="primary" onClick={() => save.run()} disabled={untouched || save.pending}>
              Save Room
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function Run({ run }) {
  const { notify, notifyError } = useToast()
  const [page, setPage] = useState(1)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [calendar, setCalendar] = useState(false)
  const rooms = useQuery(['inspections', 'rooms', run.id, page], ({ signal }) => api.inspections.rooms(run.id, { page, pageSize: 20 }, { signal }))
  const upcoming = useQuery(['inspections', 'upcoming'], ({ signal }) => api.inspections.upcoming(undefined, { signal }), { enabled: calendar })
  const items = rooms.data?.items ?? []
  const selected = items.find((r) => r.room === selectedRoom) ?? items[0]
  const total = run.checklist?.items?.length ?? 0
  const submit = useMutation(() => api.inspections.submit(run.id), {
    invalidates: ['inspections'],
    onSuccess: () => notify({ title: 'Results submitted', message: 'Sent to the Block Manager. Unvisited Rooms move to the next run.' }),
    onError: (e) => notifyError(e, 'Could not submit the results'),
  })

  return (
    <>
      <PageHeader
        title="Inspections"
        description={[formatDate(run.date), run.scheduleName, run.scope].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon={CalendarDays} onClick={() => setCalendar(true)}>
              Calendar
            </Button>
            <Button variant="primary" onClick={() => submit.run()} disabled={submit.pending}>
              Submit results
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile label="Rooms in this run" value={formatNumber(run.rooms)} note={run.id} noteTone="tertiary" />
        <KpiTile label="Inspected" value={formatNumber(run.inspected)} note={run.dueAt ? `Due ${formatDate(run.dueAt)}` : null} noteTone="tertiary" />
        <KpiTile label="Items failed" value={formatNumber(run.failed)} note="Each creates a Maintenance Request" noteTone="tertiary" />
        <KpiTile label="Not reachable" value={formatNumber(run.unreachable)} note="Re-schedule in the next run" noteTone="tertiary" />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-118 shrink-0 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-32">Room</Th>
                <Th>Result</Th>
                <Th className="w-32">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={rooms} colSpan={3} emptyTitle="No Rooms in this run" />
              {items.map((r) => (
                <Tr key={r.room} selected={r.room === selected?.room} onClick={() => setSelectedRoom(r.room)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.room} secondary={`${r.roomTypeName ?? ''} ${r.roomClassName ?? ''}`.trim()} />
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
          <Checklist key={`${selected.room}-${selected.status}`} run={run} room={selected} />
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={CircleCheck} title="Select a Room" />
          </Card>
        )}
      </div>

      <Modal open={calendar} onClose={() => setCalendar(false)} title="Upcoming inspections" description="Scheduled by the Block Manager." footer={<Button onClick={() => setCalendar(false)}>Close</Button>}>
        <QueryState query={upcoming} compact empty={<p className="text-base text-fg-secondary">No inspections scheduled.</p>}>
          {(d) => (
            <ul className="flex flex-col gap-2">
              {d.items.map((u) => (
                <li key={u.id} className="flex justify-between gap-4 text-base">
                  <span className="text-fg">{[u.scheduleName, u.scope].filter(Boolean).join(' · ')}</span>
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
  const query = useQuery(['inspections', 'current', scope], ({ signal }) => api.inspections.current(scope, { signal }))
  if (query.data?.run) return <Run run={query.data.run} />
  return (
    <>
      <PageHeader title="Inspections" />
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock icon={CircleCheck} title="No inspection run today">
            Runs are scheduled by the Block Manager. The next one appears here on its date.
          </EmptyBlock>
        </Card>
      )}
    </>
  )
}
