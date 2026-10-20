import { useState } from 'react'
import { CircleCheck, CircleX, Repeat } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card, Divider, Note } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDate } from '@/lib/format'

// SCR-REQ-13 Room Swap Requests (Figma 98:3780)
// GET /swaps?termId&block&kind&status&page&pageSize → { items: [{ id, kind, agreedAt, crossBlock, status,
//   a: { name, studentCode, room, bed, roomTypeName, roomClassName }, b: { … },
//   checks: [{ label, passed }], decision: { by, at, reason } | null }], total }
// POST /swaps/:id/decision { decision: 'Approved'|'Rejected', reason }

const tone = { 'Waiting for Staff': 'warning', 'To Manager': 'info', Approved: 'success', Rejected: 'error' }

export function RoomChangeModeSwitch({ mode }) {
  return (
    <>
      <Button variant={mode === 'changes' ? 'primary' : 'default'} to="/staff/room-changes">
        Room changes
      </Button>
      <Button variant={mode === 'swaps' ? 'primary' : 'default'} to="/staff/room-changes/swaps">
        Swaps
      </Button>
    </>
  )
}

function Line({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  )
}

function Review({ swap: s }) {
  const { notify, notifyError } = useToast()
  const decide = useMutation((decision) => api.swaps.decide(s.id, { decision }), {
    invalidates: ['swaps'],
    onSuccess: (_, decision) =>
      notify({
        type: decision === 'Approved' ? 'success' : 'warning',
        title: `${s.id} ${decision.toLowerCase()}`,
        message: decision === 'Approved' ? `${s.a.name} and ${s.b.name} swap Beds on the move date.` : 'Both students were notified.',
      }),
    onError: (e) => notifyError(e, 'Could not save the decision'),
  })
  const waiting = s.status === 'Waiting for Staff'
  const blocked = (s.checks ?? []).some((c) => !c.passed)
  return (
    <Card className="flex min-h-0 w-100 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">
          {s.id} · {s.kind === 'Direct' ? 'Direct swap' : 'Board match'}
        </h2>
        <p className="text-sm text-fg-secondary">Both Students agreed on {formatDate(s.agreedAt)}</p>
      </div>
      {[
        ['Student A', s.a],
        ['Student B', s.b],
      ].map(([label, p], i) => (
        <div key={label} className="flex flex-col gap-3">
          {i > 0 && <Divider />}
          <dl className="flex flex-col gap-3">
            <Line label={label}>
              {p.name} · {p.studentCode}
            </Line>
            <Line label={`${p.room} Bed ${p.bed}`}>
              {p.roomTypeName} {p.roomClassName}
            </Line>
          </dl>
        </div>
      ))}
      <Divider />
      <p className="text-base font-medium text-fg">Rule check</p>
      <ul className="flex flex-col gap-2">
        {(s.checks ?? []).map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-base text-fg">
            {c.passed ? <CircleCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" /> : <CircleX size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />}
            {c.label}
          </li>
        ))}
      </ul>
      <p className="text-sm text-fg-tertiary">Meter readings are cut for both Rooms on the move date. Current roommates of both Rooms are notified.</p>
      {waiting ? (
        <div className="flex justify-end gap-2">
          <Button variant="danger" onClick={() => decide.run('Rejected')} disabled={decide.pending}>
            Reject
          </Button>
          <Button variant="primary" onClick={() => decide.run('Approved')} disabled={blocked || decide.pending}>
            Approve swap
          </Button>
        </div>
      ) : (
        <Note>
          {s.status === 'To Manager'
            ? 'Cross-Block swap: waiting for the Block Manager in Approvals.'
            : s.decision
              ? `${s.status} by ${s.decision.by} · ${formatDate(s.decision.at)}${s.decision.reason ? ` · ${s.decision.reason}` : ''}`
              : s.status}
        </Note>
      )}
    </Card>
  )
}

export default function SwapRequests() {
  const scope = useScopeQuery()
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('Waiting for Staff')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState(null)
  const filters = { ...scope, kind, status, page, pageSize }
  const query = useQuery(['swaps', filters], ({ signal }) => api.swaps.list(filters, { signal }))
  const items = query.data?.items ?? []
  const selected = items.find((s) => s.id === selectedId) ?? items[0]
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader title="Room swaps" description="Same-Block swaps are approved here; cross-Block swaps go to the Block Manager." actions={<RoomChangeModeSwitch mode="swaps" />} />
      <div className="flex shrink-0 items-center gap-3">
        <Select
          wrapperClassName="w-60"
          aria-label="Type"
          value={kind}
          onChange={filter(setKind)}
          options={[
            { value: '', label: 'Type: All' },
            { value: 'Direct', label: 'Type: Direct' },
            { value: 'Board match', label: 'Type: Board match' },
          ]}
        />
        <Select wrapperClassName="w-60" aria-label="Status" value={status} onChange={filter(setStatus)} options={[{ value: '', label: 'Status: All' }, ...Object.keys(tone).map((t) => ({ value: t, label: `Status: ${t}` }))]} />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-34">Swap</Th>
                <Th>Student A → Room</Th>
                <Th>Student B → Room</Th>
                <Th className="w-30">Type</Th>
                <Th className="w-38">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} emptyIcon={Repeat} emptyTitle="No swaps match these filters" />
              {items.map((s) => (
                <Tr key={s.id} selected={s.id === selected?.id} onClick={() => setSelectedId(s.id)} className="[&>td]:h-15.5">
                  <Td className="font-medium whitespace-nowrap text-fg-brand">{s.id}</Td>
                  <Td>
                    <TwoLine primary={`${s.a.studentCode} · ${s.a.room}`} secondary={`→ ${s.b.room}`} />
                  </Td>
                  <Td>
                    <TwoLine primary={`${s.b.studentCode} · ${s.b.room}`} secondary={`→ ${s.a.room}`} />
                  </Td>
                  <Td>
                    <Tag>{s.kind}</Tag>
                  </Td>
                  <Td>
                    <Tag tone={tone[s.status] ?? 'neutral'}>{s.status}</Tag>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
            <Pagination
              total={query.data?.total ?? 0}
              page={page}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </div>
        </div>
        {selected ? (
          <Review key={`${selected.id}-${selected.status}`} swap={selected} />
        ) : (
          <Card className="flex w-100 shrink-0 flex-col">
            <EmptyBlock icon={Repeat} title="Select a swap" />
          </Card>
        )}
      </div>
    </>
  )
}
