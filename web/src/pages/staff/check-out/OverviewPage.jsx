import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertTriangle, ChevronRight, ClipboardCheck, LogOut } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Avatar } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { FilterSelect, SearchInput } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { Tabs } from '@/components/ui/Tabs'
import { formatDate, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'
import { ProgressSegmentBar } from '../checkin-reports/components/ReportUI'
import { CHECKOUT_TONES } from './checkOutShared'

const STATUS_TABS = [
  { key: 'All', label: 'All', hint: 'All leavers in the current scope' },
  { key: 'Pending', label: 'Pending', hint: 'Leavers waiting at the check-out desk' },
  { key: 'Draft', label: 'Draft', hint: 'Meter readings or condition saved as draft' },
  { key: 'Overdue', label: 'Overdue', hint: 'Past the check-out deadline and still holding a bed' },
  { key: 'Checked out', label: 'Checked out', hint: 'Completed check-out and settlement' },
]

export default function CheckOutOverviewPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const scope = useScopeQuery()

  const status = STATUS_TABS.some((x) => x.key === params.get('status')) ? params.get('status') : 'All'
  const [q, setQ] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [reason, setReason] = useState(params.get('reason') ?? '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const setStatusTab = (nextStatus) => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (nextStatus === 'All') next.delete('status')
      else next.set('status', nextStatus)
      return next
    })
    setPage(1)
  }

  const filters = {
    ...scope,
    q: search,
    reason,
    status: status === 'All' ? undefined : status,
    page,
    pageSize,
  }
  const list = useQuery(['check-out', filters], ({ signal }) => api.desk.checkOutList(filters, { signal }))
  const items = list.data?.items ?? []
  const statusCounts = list.data?.statusCounts ?? {}

  const pendingCount = statusCounts.Pending ?? list.data?.pendingCount ?? 0
  const draftCount = statusCounts.Draft ?? 0
  const overdueCount = statusCounts.Overdue ?? list.data?.overdueCount ?? 0
  const checkedOutCount = statusCounts['Checked out'] ?? 0
  const totalCount = statusCounts.All ?? pendingCount + draftCount + checkedOutCount

  const firstActionable = items[0]
  const tipText = list.data?.checkOutBy
    ? t('Check out by {date}', { date: formatDate(list.data.checkOutBy) })
    : t('Allocations in Pending check-out.')

  return (
    <>
      <PageHeader
        compact
        title="Check-out"
        tip={tipText}
        actions={
          <>
            <ProgressSegmentBar
              compact
              title="checked out"
              done={checkedOutCount}
              total={totalCount}
              note={list.data?.checkOutBy ? t('Check out by {date}', { date: formatDate(list.data.checkOutBy) }) : null}
              segments={[
                { key: 'done', label: 'Checked out', value: checkedOutCount, className: 'bg-success' },
                { key: 'draft', label: 'Draft', value: draftCount, className: 'bg-info' },
                { key: 'overdue', label: 'Overdue', value: overdueCount, className: 'bg-error' },
                { key: 'pending', label: 'Pending', value: Math.max(0, pendingCount - overdueCount), className: 'bg-warning' },
              ]}
            />
            <Button
              variant="primary"
              icon={ClipboardCheck}
              disabled={!firstActionable}
              onClick={() => firstActionable && navigate(`/staff/check-out/${firstActionable.allocationId}`)}
            >
              {t('Start check-out ({n})', { n: formatNumber(pendingCount) })}
            </Button>
          </>
        }
      />

      <Tabs
        label={t('Check-out status')}
        value={status}
        onChange={setStatusTab}
        items={STATUS_TABS.map((tab) => ({
          ...tab,
          count: statusCounts[tab.key],
        }))}
      />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            wrapperClassName="w-72"
            aria-label={t('Search')}
            placeholder="Search student code or room"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <FilterSelect
            label="Reason"
            value={reason}
            onChange={(v) => {
              setReason(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All' },
              ...(list.data?.reasons ?? []).map((r) => ({ value: r, label: tr(r) })),
            ]}
          />
        </div>

        {overdueCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-error-bg px-3 py-1 text-xs font-medium text-error-fg"
            title={t('They still hold their bed. Managers see them on their dashboard.')}
          >
            <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('{n} leavers are past the check-out date', { n: formatNumber(overdueCount) })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill tableClassName="table-fixed">
          <THead>
            <tr>
              <Th className="w-[30%]">Student</Th>
              <Th className="w-[26%]">Room · Bed</Th>
              <Th className="w-[22%]">Reason</Th>
              <Th>Status</Th>
              <Th className="w-10">
                <span className="sr-only">{t('Open')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={list} colSpan={5} emptyIcon={LogOut} emptyTitle="No allocations match these filters" />
            {items.map((r) => (
              <Tr key={r.allocationId} onClick={() => navigate(`/staff/check-out/${r.allocationId}`)} className="cursor-pointer [&>td]:py-3">
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} size={36} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-fg">{r.name}</span>
                      <span className="font-mono text-xs text-fg-tertiary">{r.studentCode}</span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col">
                    <span className="truncate font-medium text-fg tabular">{t('{room} · Bed {bed}', { room: r.room, bed: r.bed })}</span>
                    <span className="truncate text-xs text-fg-secondary">
                      {[tr(r.roomTypeName), tr(r.roomClassName)].filter(Boolean).join(' ')}
                    </span>
                  </div>
                </Td>
                <Td className="truncate text-sm text-fg-secondary">{tr(r.reason)}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag status={r.status} tone={CHECKOUT_TONES[r.status]} />
                    {r.overdue && <Tag tone="error">Overdue</Tag>}
                  </div>
                </Td>
                <Td>
                  <ChevronRight size={16} aria-hidden="true" className="text-fg-tertiary" />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="flex shrink-0 justify-end">
          <Pagination
            total={list.data?.total ?? 0}
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
