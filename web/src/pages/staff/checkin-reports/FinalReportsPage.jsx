import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ChevronRight, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Avatar } from '@/components/ui/Display'
import { FilterSelect, SearchInput } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'

import { Tag } from '@/components/ui/Tag'
import { t, tr } from '@/i18n'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { severityOf } from './checkinReports'
import { SeverityBadge } from './components/Badges'

const STATUS_TONE = {
  Final: 'success',
  Submitted: 'warning',
  Verifying: 'info',
  Draft: 'neutral',
  Cancelled: 'error',
}

const updatedAtMs = (r) => {
  const at = r.finalizedAt ?? r.submittedAt ?? r.openedAt
  return at ? new Date(at).getTime() : 0
}

// finalOnly: the Room's final reports (the inventories Staff closed); otherwise every student check-in inventory.
function StudentReports({ finalOnly = false }) {
  const navigate = useNavigate()
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [search, setSearch] = useState('')
  const [chosenStatus, setStatusFilter] = useState('All')
  const statusFilter = finalOnly ? 'Final' : chosenStatus
  const [comparison, setComparison] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const query = useQuery(
    ['handovers', 'list', scope, statusFilter, comparison || null, 'all-overview'],
    ({ signal }) =>
      api.handover.list(
        {
          ...scope,
          status: statusFilter,
          comparison: comparison || undefined,
          page: 1,
          pageSize: 100,
        },
        { signal },
      ),
  )

  const allRows = query.data?.items ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows
      .filter((r) => {
        if (comparison && r.comparison !== comparison) return false
        if (!q) return true
        return [r.id, r.studentName, r.studentCode, r.room, r.block, r.status]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      })
      .sort((a, b) => updatedAtMs(b) - updatedAtMs(a) || String(b.id).localeCompare(String(a.id)))
  }, [allRows, search, comparison])

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  const openReport = (r) => {
    if (r.status === 'Final') {
      navigate(`${base}/check-in/inventories/${r.id}/report/3?from=done`)
      return
    }
    const from = r.status === 'Verifying' ? 'visit' : r.status === 'Draft' ? 'live' : 'review'
    navigate(`${base}/check-in/inventories/${r.id}?from=${from}`)
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            wrapperClassName="w-84"
            aria-label={t('Search')}
            placeholder="Search report ID, student or room"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          {!finalOnly && <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
            options={[
              { value: 'All', label: 'All' },
              { value: 'Draft', label: 'Draft' },
              { value: 'Submitted', label: 'Submitted' },
              { value: 'Verifying', label: 'Verifying' },
              { value: 'Final', label: 'Final' },
              { value: 'Late report', label: 'Late report' },
              { value: 'Cancelled', label: 'Cancelled' },
            ]}
          />}
          <FilterSelect
            label="Comparison"
            value={comparison}
            onChange={(v) => {
              setComparison(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All' },
              { value: 'Match', label: 'Matched' },
              { value: 'Minor difference', label: 'Minor difference' },
              { value: 'Major difference', label: 'Major difference' },
            ]}
          />
        </div>
        <span className="rounded-full bg-subtle px-3 py-1 text-sm font-medium text-fg-secondary tabular">
          {t('{n} reports', { n: formatNumber(filtered.length) })}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill tableClassName="table-fixed">
          <THead>
            <tr>
              <Th className="w-32">{t('Report ID')}</Th>
              <Th className="w-60">{t('Student')}</Th>
              <Th className="w-40">{t('Room · Bed')}</Th>
              <Th className="w-36">{t('Status')}</Th>
              <Th className="w-36">{t('Comparison')}</Th>
              <Th>{t('Updated')}</Th>
              <Th className="w-10">
                <span className="sr-only">{t('Open')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus
              query={query}
              colSpan={7}
              rows={paged}
              emptyIcon={FileText}
              emptyTitle="No reports found"
            />
            {paged.map((r) => {
              const severity = severityOf(r.comparison)
              const at = r.finalizedAt ?? r.submittedAt ?? r.openedAt
              return (
                <Tr
                  key={r.id}
                  onClick={() => openReport(r)}
                  className="cursor-pointer [&>td]:h-15.5"
                >
                  <Td className="font-mono text-sm font-medium text-fg">{r.id}</Td>
                  <Td>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={r.studentName} size={32} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-fg">{r.studentName}</span>
                        <span className="font-mono text-xs text-fg-secondary">{r.studentCode}</span>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-medium text-fg tabular">{t('{room} · Bed {bed}', { room: r.room, bed: r.bed })}</span>
                      {r.block && <span className="text-xs text-fg-secondary">{tr(r.block)}</span>}
                    </div>
                  </Td>
                  <Td>
                    <Tag tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Tag>
                  </Td>
                  <Td>
                    {severity ? (
                      <SeverityBadge severity={severity} />
                    ) : r.comparison === 'Match' ? (
                      <Tag tone="success">{t('Matched')}</Tag>
                    ) : (
                      <span className="text-sm text-fg-tertiary">—</span>
                    )}
                  </Td>
                  <Td className="text-sm text-fg-secondary tabular">
                    {at ? formatDateTime(at) : '—'}
                  </Td>
                  <Td>
                    <ChevronRight size={16} aria-hidden="true" className="text-fg-tertiary" />
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
        <div className="flex shrink-0 justify-end">
          <Pagination
            total={filtered.length}
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
    </>
  )
}

// Every finished Room report of the inspections the Managers scheduled (pre-arrival, Wi-Fi, fire safety …): one row
// per inspected Room, kept with that Room (Rooms and beds shows the same reports). It opens the Room's results.
function InspectionReports({ kind }) {
  const navigate = useNavigate()
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const query = useQuery(['inspection-reports', scope, kind, search, page, pageSize], ({ signal }) =>
    api.inspections.reports({ ...scope, kind, q: search || undefined, page, pageSize }, { signal }),
  )
  const items = query.data?.items ?? []
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <SearchInput wrapperClassName="w-84" aria-label={t('Search')} placeholder="Search run, room or inspection" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="rounded-full bg-subtle px-3 py-1 text-sm font-medium text-fg-secondary tabular">
          {t('{n} reports', { n: formatNumber(query.data?.total ?? 0) })}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <InspectionReportTable query={query} items={items} onOpen={(r) => navigate(`${base}/inspections/${r.runId}/rooms/${r.room}?from=reports`)} />
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
    </>
  )
}

/** The inspection reports as a table (also used by a Room's profile in Rooms and beds, without the Room column). */
export function InspectionReportTable({ query, items, onOpen, showRoom = true }) {
  return (
    <Table fill tableClassName="table-fixed min-w-[1240px]">
      <THead>
        <tr>
          <Th className="w-28">{t('Run')}</Th>
          {showRoom && <Th className="w-28">{t('Room')}</Th>}
          <Th>{t('Inspection')}</Th>
          <Th className="w-60">{t('Result')}</Th>
          <Th className="w-44">{t('Inspected by')}</Th>
          <Th className="w-40">{t('Inspected')}</Th>
          <Th className="w-36">{t('Sent to managers')}</Th>
        </tr>
      </THead>
      <TBody>
        <TableStatus query={query} colSpan={showRoom ? 7 : 6} rows={items} emptyIcon={FileText} emptyTitle="No inspection reports yet" />
        {items.map((r) => (
          <Tr key={`${r.runId}-${r.room}`} onClick={() => onOpen(r)} className="cursor-pointer [&>td]:h-14">
            <Td className="font-mono text-sm font-medium whitespace-nowrap text-fg">{r.runId}</Td>
            {showRoom && <Td className="font-medium tabular">{r.room}</Td>}
            <Td>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-fg">{tr(r.name)}</span>
                <span className="text-xs text-fg-secondary">{tr(r.kind)}</span>
              </div>
            </Td>
            <Td>
              {r.status === 'Unreachable' ? (
                <Tag tone="warning">{t('Unreachable')}</Tag>
              ) : r.failed > 0 ? (
                <Tag tone="error">{t('{n} items failed', { n: r.failed })}</Tag>
              ) : (
                <Tag tone="success">{t('No item failed')}</Tag>
              )}
            </Td>
            <Td className="truncate">{r.inspector ?? '—'}</Td>
            <Td className="text-sm text-fg-secondary tabular">{r.inspectedAt ? formatDateTime(r.inspectedAt) : '—'}</Td>
            <Td>{r.submitted ? <Tag tone="success">{t('Sent')}</Tag> : <Tag tone="neutral">{t('Run in progress')}</Tag>}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

// Which reports the summary shows (user decision 25/11/2026): every report is kept with its Room.
const REPORT_TYPES = [
  { value: 'student', label: 'Student check-in inventories' },
  { value: 'final', label: 'Final room reports' },
  { value: 'report1', label: 'Report 1 · Staff pre-arrival check' },
  { value: 'inspections', label: 'Other inspections (Wi-Fi, fire safety …)' },
]

export default function FinalReportsPage() {
  const [params, setParams] = useSearchParams()
  const asked = params.get('type') ?? (params.get('tab') === 'inspections' ? 'inspections' : null)
  const type = REPORT_TYPES.some((x) => x.value === asked) ? asked : 'student'
  return (
    <>
      <PageHeader
        title="Final reports"
        description="Every report kept for the rooms: the students' check-in inventories, the rooms' final reports and the inspections Staff sent to the Managers. Students see only their own inventory and their room's final report."
        actions={
          <FilterSelect
            label="Report type"
            value={type}
            onChange={(v) => setParams(v === 'student' ? {} : { type: v }, { replace: true })}
            options={REPORT_TYPES}
          />
        }
      />
      {type === 'student' && <StudentReports key="student" />}
      {type === 'final' && <StudentReports key="final" finalOnly />}
      {type === 'report1' && <InspectionReports key="report1" kind="Pre-arrival" />}
      {type === 'inspections' && <InspectionReports key="inspections" kind="Periodic" />}
    </>
  )
}
