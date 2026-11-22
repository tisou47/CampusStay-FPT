import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertTriangle, ArrowRight, ClipboardCheck, Gauge, LogOut } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Avatar } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'
import { DeskModeSwitch } from '../CheckInDesk'
import { KpiTabs, ProgressSegmentBar } from '../checkin-reports/components/ReportUI'
import { CHECKOUT_TONES, RoomReadingsModal } from './checkOutShared'

const STATUS_TABS = [
  { key: 'Pending', label: 'Pending', hint: 'Leavers waiting at the check-out desk' },
  { key: 'Draft', label: 'Draft', hint: 'Meter readings or condition saved as draft' },
  { key: 'Overdue', label: 'Overdue', hint: 'Past the check-out deadline and still holding a bed' },
  { key: 'Checked out', label: 'Checked out', hint: 'Completed check-out and settlement' },
  { key: 'All', label: 'All', hint: 'All leavers in the current scope' },
]

export default function CheckOutOverviewPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const scope = useScopeQuery()

  const status = STATUS_TABS.some((x) => x.key === params.get('status')) ? params.get('status') : 'Pending'
  const [q, setQ] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [reason, setReason] = useState(params.get('reason') ?? '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [readingsOpen, setReadingsOpen] = useState(false)

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
      if (nextStatus === 'Pending') next.delete('status')
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

  return (
    <>
      <PageHeader
        compact
        title="Check-out desk"
        description={
          list.data
            ? [
                list.data.date && formatDate(list.data.date),
                t('{n} allocations in Pending check-out.', { n: formatNumber(list.data.pendingCount) }),
                list.data.checkOutBy && t('Check out by {date}', { date: formatDate(list.data.checkOutBy) }),
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Allocations in Pending check-out.'
        }
        actions={
          <>
            <Button icon={Gauge} onClick={() => setReadingsOpen(true)}>
              Readings by room
            </Button>
            <DeskModeSwitch mode="out" />
            {firstActionable && (
              <Button
                variant="primary"
                icon={ClipboardCheck}
                onClick={() => navigate(`/staff/check-out/${firstActionable.allocationId}`)}
              >
                {t('Start check-out ({n})', { n: formatNumber(pendingCount) })}
              </Button>
            )}
          </>
        }
      />
      <RoomReadingsModal open={readingsOpen} onClose={() => setReadingsOpen(false)} scope={scope} />

      <ProgressSegmentBar
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

      <KpiTabs
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
            wrapperClassName="w-80"
            aria-label={t('Search')}
            placeholder="Search student code or room"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            wrapperClassName="w-60"
            aria-label={t('Reason')}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Reason: All' },
              ...(list.data?.reasons ?? []).map((r) => ({ value: r, label: t('Reason: {r}', { r: tr(r) }) })),
            ]}
          />
        </div>

        {overdueCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-error-bg px-3 py-1 text-sm font-medium text-error-fg"
            title={t('They still hold their bed. Managers see them on their dashboard.')}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {t('{n} leavers are past the check-out date', { n: formatNumber(overdueCount) })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th>Student</Th>
              <Th>Room · Bed</Th>
              <Th>Reason</Th>
              <Th className="w-40">Status</Th>
              <Th className="w-44 text-right">Action</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={list} colSpan={5} emptyIcon={LogOut} emptyTitle="No allocations match these filters" />
            {items.map((r) => (
              <Tr
                key={r.allocationId}
                tabIndex={0}
                onClick={() => navigate(`/staff/check-out/${r.allocationId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/staff/check-out/${r.allocationId}`)
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-subtle/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&>td]:py-3"
              >
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
                    <span className="font-medium text-fg tabular">{t('{room} · Bed {bed}', { room: r.room, bed: r.bed })}</span>
                    <span className="text-xs text-fg-secondary">
                      {[tr(r.roomTypeName), tr(r.roomClassName)].filter(Boolean).join(' ')}
                    </span>
                  </div>
                </Td>
                <Td className="text-sm text-fg-secondary">{tr(r.reason)}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusTag status={r.status} tone={CHECKOUT_TONES[r.status]} />
                    {r.overdue && <Tag tone="error">Overdue</Tag>}
                  </div>
                </Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant={r.status === 'Checked out' ? 'secondary' : 'primary'}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/staff/check-out/${r.allocationId}`)
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {r.status === 'Checked out' ? t('View details') : t('Process check-out')}
                      <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  </Button>
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
