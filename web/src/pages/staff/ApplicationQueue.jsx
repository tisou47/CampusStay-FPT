import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Check, Download, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { useCatalog } from '@/pages/student/apply/wizard'
import { t, tr } from '@/i18n'

// SCR-APP-10 Application Queue (Figma 22:2)
// GET /applications?termId&block&q&status&roomTypeId&roomClassId&submittedWithin&page&pageSize →
//   { items: [{ id, studentName, studentCode, pair, roomTypeName, roomClassName, depositStatus, depositPaidAt, status }], total,
//     counts: { Submitted, 'Under Review', Approved, Waitlisted, Rejected, Expired } }
// POST /applications/bulk-review { ids, decision: 'Approved' }

const statusFilters = [
  { value: 'Submitted,Under Review', label: 'Status: Submitted, Under Review' },
  { value: '', label: 'Status: All' },
  ...['Submitted', 'Under Review', 'Approved', 'Waitlisted', 'Rejected', 'Expired'].map((s) => ({ value: s, label: `Status: ${s}` })),
]
const countTones = { Submitted: 'info', 'Under Review': 'info', Approved: 'info', Waitlisted: 'warning', Rejected: 'error', Expired: 'neutral' }
const reviewable = (r) => ['Submitted', 'Under Review'].includes(r.status)

export default function ApplicationQueue() {
  const navigate = useNavigate()
  const base = useRoleBase()
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const { notify, notifyError } = useToast()
  const catalog = useCatalog()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(params.get('status') ?? 'Submitted,Under Review')
  const [roomTypeId, setRoomTypeId] = useState('')
  const [roomClassId, setRoomClassId] = useState('')
  const [submittedWithin, setSubmittedWithin] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Search waits until typing pauses.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = { ...scope, q: search, status, roomTypeId, roomClassId, submittedWithin, page, pageSize }
  const query = useQuery(['applications', filters], ({ signal }) => api.applications.list(filters, { signal }))
  const items = query.data?.items ?? []
  const counts = query.data?.counts ?? {}

  const selectable = items.filter(reviewable)
  const selectedVisible = selectable.filter((r) => selected.has(r.id))
  const allChecked = selectable.length > 0 && selectedVisible.length === selectable.length
  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  const approve = useMutation((ids) => api.applications.bulkReview({ ids, decision: 'Approved' }), {
    invalidates: ['applications', 'dashboard'],
    onSuccess: (_, ids) => {
      setSelected(new Set())
      notify({ title: t(ids.length === 1 ? '{n} Application approved' : '{n} Applications approved', { n: ids.length }), message: 'They join the next assignment run.' })
    },
    onError: (e) => notifyError(e, 'Could not approve the Applications'),
  })
  const exporting = useMutation(() => api.exports.download('applications', { ...filters, page: undefined, pageSize: undefined }, 'applications.xlsx'), {
    onError: (e) => notifyError(e, 'Export failed'),
  })

  return (
    <>
      <PageHeader
        title="Applications"
        description="Applications reach this queue after the deposit is paid."
        actions={
          <>
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
            <Button variant="primary" icon={Check} onClick={() => approve.run(selectedVisible.map((r) => r.id))} disabled={!selectedVisible.length || approve.pending}>
              {t('Approve selected ({n})', { n: selectedVisible.length })}
            </Button>
          </>
        }
      />

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-65" aria-label={t('Search')} placeholder="Search name, student code or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select wrapperClassName="w-60" aria-label={t('Status')} value={status} onChange={filter(setStatus)} options={statusFilters} />
        <Select
          wrapperClassName="w-38"
          aria-label={t('Room Type')}
          value={roomTypeId}
          onChange={filter(setRoomTypeId)}
          options={[{ value: '', label: 'Room Type: All' }, ...(catalog.data?.roomTypes ?? []).map((type) => ({ value: type.id, label: t('Room Type: {name}', { name: tr(type.name) }) }))]}
        />
        <Select
          wrapperClassName="w-40"
          aria-label={t('Room Class')}
          value={roomClassId}
          onChange={filter(setRoomClassId)}
          options={[{ value: '', label: 'Room Class: All' }, ...(catalog.data?.roomClasses ?? []).map((c) => ({ value: c.id, label: t('Room Class: {name}', { name: tr(c.name) }) }))]}
        />
        <Select
          wrapperClassName="w-44"
          aria-label={t('Submitted')}
          value={submittedWithin}
          onChange={filter(setSubmittedWithin)}
          options={[
            { value: '', label: 'Submitted: Any time' },
            { value: '24h', label: 'Submitted: Last 24 hours' },
            { value: '7d', label: 'Submitted: Last 7 days' },
          ]}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {Object.entries(countTones).map(([s, tone]) => (
          <Tag key={s} tone={tone}>
            {tr(s)} {counts[s] ?? '—'}
          </Tag>
        ))}
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-4">
              <Checkbox
                aria-label={t('Select all')}
                checked={allChecked}
                indeterminate={!allChecked && selectedVisible.length > 0}
                onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))}
              />
            </Th>
            <Th className="w-35">Application</Th>
            <Th className="w-48">Student</Th>
            <Th className="w-24">Room Type</Th>
            <Th className="w-26">Room Class</Th>
            <Th className="w-22">Deposit</Th>
            <Th className="w-40">Deposit paid</Th>
            <Th>Status</Th>
            <Th className="w-18">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={9} emptyIcon={FileText} emptyTitle="No Applications match these filters" />
          {items.map((r) => (
            <Tr key={r.id} selected={selected.has(r.id)} onClick={() => navigate(`${base}/applications/${r.id}`)}>
              <Td onClick={stop}>
                <Checkbox aria-label={t('Select {id}', { id: r.id })} checked={selected.has(r.id)} disabled={!reviewable(r)} onChange={() => toggle(r.id)} />
              </Td>
              <Td className="font-medium text-fg-brand">{r.id}</Td>
              <Td>
                <TwoLine primary={r.studentName} secondary={r.pair ? `${r.studentCode} · ${t('pair')}` : r.studentCode} />
              </Td>
              <Td>{tr(r.roomTypeName)}</Td>
              <Td>{tr(r.roomClassName)}</Td>
              <Td>
                <StatusTag status={r.depositStatus} />
              </Td>
              <Td>{formatDateTime(r.depositPaidAt)}</Td>
              <Td>
                <StatusTag status={r.status} />
              </Td>
              <Td onClick={stop}>
                <Button variant="text" to={`${base}/applications/${r.id}`}>
                  Review
                </Button>
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
