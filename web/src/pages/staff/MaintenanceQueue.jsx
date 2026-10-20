import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CircleCheck, Download, TriangleAlert, User, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'

// SCR-MNT-10 Maintenance Queue (Figma 42:2251). Shared with the Manager portal.
// GET /maintenance-requests?termId&block&q&status&priority&category&assigneeId&page&pageSize → {
//   items: [{ id, room, title, category, priority, reportedAt, assignee: { id, name } | null, status }], total,
//   summary: { open, urgent, urgentUnassigned, unassigned, oldestUnassignedAt, resolvedThisWeek, waitingConfirmation } }
// GET /maintenance-requests/options → { categories, priorities, staff: [{ id, name }] }

const statusFilters = [
  { value: '', label: 'Status: All' },
  { value: 'open', label: 'Status: Open' },
  ...['Submitted', 'Assigned', 'In progress', 'Resolved', 'Closed'].map((s) => ({ value: s, label: `Status: ${s}` })),
]

export default function MaintenanceQueue() {
  const navigate = useNavigate()
  const base = useRoleBase()
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const options = useQuery(['maintenance-options', 'staff'], ({ signal }) => api.maintenance.options({ for: 'staff' }, { signal }))

  const [q, setQ] = useState(params.get('room') ?? '')
  const [search, setSearch] = useState(params.get('room') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = { ...scope, q: search, status, priority, category, assigneeId, page, pageSize }
  const query = useQuery(['maintenance', filters], ({ signal }) => api.maintenance.list(filters, { signal }))
  const items = query.data?.items ?? []
  const s = query.data?.summary
  const exporting = useMutation(() => api.exports.download('maintenance', { ...filters, page: undefined, pageSize: undefined }, 'maintenance-requests.csv'), { onError: (e) => notifyError(e, 'Export failed') })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Students set urgency; Staff set the final priority."
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" icon={Wrench} label="Open" value={formatNumber(s?.open)} note="Submitted, Assigned or In progress" />
        <KpiTile size="md" icon={TriangleAlert} label="Urgent" value={formatNumber(s?.urgent)} valueTone={s?.urgent ? 'error' : undefined} note={s ? `${formatNumber(s.urgentUnassigned)} unassigned` : null} />
        <KpiTile
          size="md"
          icon={User}
          label="Unassigned"
          value={formatNumber(s?.unassigned)}
          valueTone={s?.unassigned ? 'warning' : undefined}
          note={s?.oldestUnassignedAt ? `Oldest ${formatDateTime(s.oldestUnassignedAt)}` : s ? 'None waiting' : null}
        />
        <KpiTile size="md" icon={CircleCheck} label="Resolved this week" value={formatNumber(s?.resolvedThisWeek)} note={s ? `${formatNumber(s.waitingConfirmation)} waiting for student confirmation` : null} />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-65" aria-label="Search" placeholder="Search ID, Room or title" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select wrapperClassName="w-40" aria-label="Status" value={status} onChange={filter(setStatus)} options={statusFilters} />
        <Select
          wrapperClassName="w-36"
          aria-label="Priority"
          value={priority}
          onChange={filter(setPriority)}
          options={[{ value: '', label: 'Priority: All' }, ...(options.data?.priorities ?? []).map((p) => ({ value: p, label: `Priority: ${p}` }))]}
        />
        <Select
          wrapperClassName="w-44"
          aria-label="Category"
          value={category}
          onChange={filter(setCategory)}
          options={[{ value: '', label: 'Category: All' }, ...(options.data?.categories ?? []).map((c) => ({ value: c, label: `Category: ${c}` }))]}
        />
        <Select
          wrapperClassName="w-48"
          aria-label="Assignee"
          value={assigneeId}
          onChange={filter(setAssigneeId)}
          options={[{ value: '', label: 'Assignee: All' }, { value: 'none', label: 'Assignee: Unassigned' }, ...(options.data?.staff ?? []).map((m) => ({ value: m.id, label: `Assignee: ${m.name}` }))]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-36">Request</Th>
            <Th className="w-20">Room</Th>
            <Th>Title</Th>
            <Th className="w-32">Category</Th>
            <Th className="w-24">Priority</Th>
            <Th className="w-40">Reported</Th>
            <Th className="w-36">Assignee</Th>
            <Th className="w-28">Status</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={8} emptyIcon={Wrench} emptyTitle="No Maintenance Requests match these filters" />
          {items.map((r) => (
            <Tr key={r.id} onClick={() => navigate(`${base}/maintenance/${r.id}`)} className="[&>td]:h-11.5">
              <Td className="font-medium whitespace-nowrap text-fg-brand">{r.id}</Td>
              <Td>{r.room}</Td>
              <Td className="max-w-0 truncate">{r.title}</Td>
              <Td className="whitespace-nowrap">{r.category}</Td>
              <Td>
                <StatusTag status={r.priority} />
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(r.reportedAt)}</Td>
              <Td className={r.assignee ? 'whitespace-nowrap' : 'text-fg-tertiary'}>{r.assignee?.name ?? '—'}</Td>
              <Td>
                <StatusTag status={r.status} />
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
    </>
  )
}
