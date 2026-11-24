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
import { FilterSelect, SearchInput } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { SlaBadge, StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// SCR-MNT-10 Maintenance Queue (Figma 42:2251). Shared with the Manager portal.
// GET /maintenance-requests?termId&block&q&status&priority&category&assigneeId&page&pageSize → {
//   items: [{ id, room, title (shown on hover), category, priority, reportedAt, assignee: { id, name } | null, status, slaDueAt }], total,
//   summary: { open, urgent, urgentUnassigned, unassigned, oldestUnassignedAt, resolvedThisWeek, waitingConfirmation } }
// GET /maintenance-requests/options → { categories, priorities, staff: [{ id, name }] }

const statusFilters = [
  { value: '', label: 'Status: All' },
  { value: 'open', label: 'Status: Open' },
  ...['Submitted', 'Assigned', 'In progress', 'Resolved', 'Closed'].map((s) => ({ value: s, label: t('Status: {s}', { s: t(s) }) })),
]

// A KPI tile that filters the queue: a second click clears the filter.
function FilterTile({ active, onClick, ...tile }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="group flex min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <KpiTile size="md" {...tile} className={cx('h-full transition-colors group-hover:border-primary', active && 'border-primary bg-primary-subtle')} />
    </button>
  )
}

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
        description="Students set urgency; staff set the final priority."
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <FilterTile
          icon={Wrench}
          label="Open"
          value={formatNumber(s?.open)}
          note="Submitted, Assigned or In progress"
          active={status === 'open'}
          onClick={() => filter(setStatus)({ target: { value: status === 'open' ? '' : 'open' } })}
        />
        <KpiTile size="md" icon={TriangleAlert} label="Urgent" value={formatNumber(s?.urgent)} valueTone={s?.urgent ? 'error' : undefined} note={s ? t('{n} unassigned', { n: formatNumber(s.urgentUnassigned) }) : null} />
        <FilterTile
          icon={User}
          label="Unassigned"
          value={formatNumber(s?.unassigned)}
          valueTone={s?.unassigned ? 'warning' : undefined}
          note={s?.oldestUnassignedAt ? t('Oldest {date}', { date: formatDateTime(s.oldestUnassignedAt) }) : s ? 'None waiting' : null}
          active={assigneeId === 'none'}
          onClick={() => filter(setAssigneeId)({ target: { value: assigneeId === 'none' ? '' : 'none' } })}
        />
        <KpiTile size="md" icon={CircleCheck} label="Resolved this week" value={formatNumber(s?.resolvedThisWeek)} note={s ? t('{n} waiting for student confirmation', { n: formatNumber(s.waitingConfirmation) }) : null} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput wrapperClassName="w-65" aria-label={t('Search')} placeholder="Search ID or room" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => filter(setStatus)({ target: { value: v } })}
          options={statusFilters.map((o) => ({ value: o.value, label: String(o.label).replace(/^Status:\s*/i, '') }))}
        />
        <FilterSelect
          label="Priority"
          value={priority}
          onChange={(v) => filter(setPriority)({ target: { value: v } })}
          options={[{ value: '', label: 'All' }, ...(options.data?.priorities ?? []).map((p) => ({ value: p, label: tr(p) }))]}
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={(v) => filter(setCategory)({ target: { value: v } })}
          options={[{ value: '', label: 'All' }, ...(options.data?.categories ?? []).map((c) => ({ value: c, label: tr(c) }))]}
        />
        <FilterSelect
          label="Assignee"
          value={assigneeId}
          onChange={(v) => filter(setAssigneeId)({ target: { value: v } })}
          options={[{ value: '', label: 'All' }, { value: 'none', label: 'Unassigned' }, ...(options.data?.staff ?? []).map((m) => ({ value: m.id, label: m.name }))]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-[13%]">Request</Th>
            <Th className="w-[9%]">Room</Th>
            <Th className="w-[13%]">Category</Th>
            <Th className="w-[11%]">Priority</Th>
            <Th className="w-[15%]">Reported</Th>
            <Th>Assignee</Th>
            <Th className="w-[12%]">Status</Th>
            <Th className="w-[12%]">Time left</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={8} emptyIcon={Wrench} emptyTitle="No maintenance requests match these filters" />
          {items.map((r) => (
            <Tr key={r.id} onClick={() => navigate(`${base}/maintenance/${r.id}`)} className="[&>td]:h-12">
              <Td className="font-medium whitespace-nowrap text-fg-brand">
                <span title={r.title}>{r.id}</span>
              </Td>
              <Td className="font-medium whitespace-nowrap">{r.room}</Td>
              <Td className="whitespace-nowrap">{tr(r.category)}</Td>
              <Td>
                <StatusTag status={r.priority} />
              </Td>
              <Td className="whitespace-nowrap text-fg-secondary tabular">{formatDateTime(r.reportedAt)}</Td>
              <Td className={cx('max-w-0 truncate', !r.assignee && 'text-fg-tertiary')}>{r.assignee?.name ?? t('Unassigned')}</Td>
              <Td>
                <StatusTag status={r.status} />
              </Td>
              <Td>
                {r.status === 'Resolved' || r.status === 'Closed' ? <span className="text-fg-tertiary">—</span> : <SlaBadge dueAt={r.slaDueAt} />}
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
