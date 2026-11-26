import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Download, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { FilterSelect, SearchInput } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { SlaBadge, StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { OverdueRequests } from '@/pages/manager/Escalations'
import { t, tr } from '@/i18n'

// SCR-MNT-10 Maintenance Queue (Figma 42:2251). Shared with the Manager portal, where it also holds the overdue
// requests (SCR-REQ-21, user decision 24/11/2026: one page for the repair work). The tabs replace the filter tiles:
// All (first and the default; the status filter shows only there) · Open · Unassigned · Overdue (Managers).
// GET /maintenance-requests?termId&block&q&status&priority&category&assigneeId&page&pageSize → {
//   items: [{ id, room, title (shown on hover), category, priority, reportedAt, assignee: { id, name } | null, status, slaDueAt }], total,
//   summary: { open, urgent, urgentUnassigned, unassigned, oldestUnassignedAt, resolvedThisWeek, waitingConfirmation } }
// GET /maintenance-requests/options → { categories, priorities, staff: [{ id, name }] }

const statusFilters = [
  { value: '', label: 'All' },
  ...['Submitted', 'Assigned', 'In progress', 'Resolved', 'Closed'].map((s) => ({ value: s, label: s })),
]

/** The list each tab shows: its status and assignee filters. */
const tabFilters = {
  open: { status: 'open' },
  unassigned: { status: 'Submitted', assigneeId: 'none' },
}

export default function MaintenanceQueue() {
  const atManager = useRoleBase() === '/manager'
  const navigate = useNavigate()
  const location = useLocation()
  const base = useRoleBase()
  const [params, setParams] = useSearchParams()
  // Opened from a room of Rooms and beds (?from=inventory&back=…): a way back to that floor, room, filters and search.
  const back =
    params.get('from') === 'inventory' && params.get('back')?.startsWith('/')
      ? params.get('back')
      : params.get('room')
        ? `${base}/inventory?room=${encodeURIComponent(params.get('room'))}`
        : null
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const options = useQuery(['maintenance-options', 'staff'], ({ signal }) => api.maintenance.options({ for: 'staff' }, { signal }))

  // A room search (from the room hub) looks at every request of the room; a status link opens the All tab.
  const initialStatus = params.get('status') ?? ''
  const tabParam = params.get('tab')
  // The page opens on All (a status link keeps its own filter there).
  const tab = (['overdue', 'unassigned'].includes(tabParam) && !atManager) || !tabParam ? (initialStatus === 'open' ? 'open' : 'all') : tabParam
  const [q, setQ] = useState(params.get('room') ?? '')
  const [search, setSearch] = useState(params.get('room') ?? '')
  const [status, setStatus] = useState(initialStatus === 'open' ? '' : initialStatus)
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const shown = tabFilters[tab] ?? { status, assigneeId }
  const filters = { ...scope, q: search, priority, category, status: shown.status ?? '', assigneeId: shown.assigneeId ?? assigneeId, page, pageSize }
  const query = useQuery(['maintenance', filters], ({ signal }) => api.maintenance.list(filters, { signal }))
  const overdue = useQuery(['escalations', scope], ({ signal }) => api.escalations.list(scope, { signal }), { enabled: atManager })
  const items = query.data?.items ?? []
  const s = query.data?.summary
  const overdueOpen = (overdue.data?.items ?? []).filter((e) => !e.handled).length
  const exporting = useMutation(() => api.exports.download('maintenance', { ...filters, page: undefined, pageSize: undefined }, 'maintenance-requests.csv'), { onError: (e) => notifyError(e, 'Export failed') })
  const pick = (set) => (value) => {
    set(value)
    setPage(1)
  }
  const openTab = (key) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    next.delete('id')
    next.delete('status')
    setParams(next, { replace: true })
    setPage(1)
  }

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open', count: s?.open },
    // Staff see only the requests assigned to them: no Unassigned tab and no Assignee column.
    ...(atManager ? [{ key: 'unassigned', label: 'Unassigned', count: s?.unassigned }] : []),
    ...(atManager ? [{ key: 'overdue', label: 'Overdue', count: overdue.data ? overdueOpen : undefined }] : []),
  ]

  return (
    <>
      {back && (
        <div className="flex shrink-0 items-center gap-3">
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => (location.state?.fromInventory ? navigate(-1) : navigate(back))}>
            {t('Back')}
          </Button>
          <span className="text-sm text-fg-secondary">{t('Rooms and beds · {room}', { room: params.get('room') ?? '' })}</span>
        </div>
      )}
      <PageHeader
        title="Maintenance"
        description={atManager ? undefined : 'Students set urgency; staff set the final priority.'}
        actions={
          tab !== 'overdue' && (
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
          )
        }
      />

      <Tabs className="shrink-0" value={tab} onChange={openTab} items={tabs} />

      {tab === 'overdue' ? (
        <OverdueRequests
          query={overdue}
          selectedId={params.get('id')}
          onSelect={(id) => {
            const next = new URLSearchParams(params)
            next.set('id', id)
            setParams(next, { replace: true })
          }}
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <SearchInput wrapperClassName="min-w-64 flex-1" aria-label={t('Search')} placeholder="Search ID or room" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3">
              {tab === 'all' && <FilterSelect label="Status" value={status} onChange={pick(setStatus)} options={statusFilters} />}
              <FilterSelect label="Priority" value={priority} onChange={pick(setPriority)} options={[{ value: '', label: 'All' }, ...(options.data?.priorities ?? []).map((p) => ({ value: p, label: tr(p) }))]} />
              <FilterSelect label="Category" value={category} onChange={pick(setCategory)} options={[{ value: '', label: 'All' }, ...(options.data?.categories ?? []).map((c) => ({ value: c, label: tr(c) }))]} />
              {/* Who is in charge is the Managers' filter: Staff do not filter the queue by assignee. */}
              {atManager && tab !== 'unassigned' && (
                <FilterSelect
                  label="Assignee"
                  value={assigneeId}
                  onChange={pick(setAssigneeId)}
                  options={[{ value: '', label: 'All' }, { value: 'none', label: 'Unassigned' }, ...(options.data?.staff ?? []).map((m) => ({ value: m.id, label: m.name }))]}
                />
              )}
            </div>
          </div>

          <Table fill>
            <THead>
              <tr>
                <Th className="w-[13%]">Request</Th>
                <Th className="w-[9%]">Room</Th>
                <Th className="w-[13%]">Category</Th>
                <Th className="w-[11%]">Priority</Th>
                <Th className="w-[15%]">Reported</Th>
                {atManager && <Th>Assignee</Th>}
                <Th className="w-[12%]">Status</Th>
                <Th className="w-[12%]">Time left</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={atManager ? 8 : 7} emptyIcon={Wrench} emptyTitle={tab === 'unassigned' ? 'Every request has someone in charge' : 'No maintenance requests match these filters'} />
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
                  {atManager && <Td className={cx('max-w-0 truncate', !r.assignee && 'text-fg-tertiary')}>{r.assignee?.name ?? t('Unassigned')}</Td>}
                  <Td>
                    <StatusTag status={r.status} />
                  </Td>
                  <Td>{r.status === 'Resolved' || r.status === 'Closed' ? <span className="text-fg-tertiary">—</span> : <SlaBadge dueAt={r.slaDueAt} />}</Td>
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
      )}
    </>
  )
}
