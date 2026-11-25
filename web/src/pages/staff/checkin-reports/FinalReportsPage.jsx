import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
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
import { severityOf } from './checkinReports'
import { SeverityBadge } from './components/Badges'

const STATUS_TONE = {
  Final: 'success',
  Submitted: 'warning',
  Verifying: 'info',
  Draft: 'neutral',
  Cancelled: 'error',
}

export default function FinalReportsPage() {
  const navigate = useNavigate()
  const scope = useScopeQuery()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
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
    return allRows.filter((r) => {
      if (comparison && r.comparison !== comparison) return false
      if (!q) return true
      return [r.id, r.studentName, r.studentCode, r.room, r.block, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [allRows, search, comparison])

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  const openReport = (r) => {
    if (r.status === 'Final') {
      navigate(`/staff/check-in/inventories/${r.id}/report/3?from=done`)
      return
    }
    const from = r.status === 'Verifying' ? 'visit' : r.status === 'Draft' ? 'live' : 'review'
    navigate(`/staff/check-in/inventories/${r.id}?from=${from}`)
  }

  return (
    <>
      <PageHeader
        title="All student reports"
        description="Overview of every student check-in report across all statuses: draft, submitted, verifying, final, and cancelled."
      />

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
          <FilterSelect
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
          />
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
