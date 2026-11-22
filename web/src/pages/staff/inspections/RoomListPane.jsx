import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'
import { KpiTabCard } from '../checkin-reports/components/ReportUI'
import { roomItems, summary } from './inspectionPrint'

const statusTone = { 'In progress': 'info', Done: 'success', 'To do': 'neutral', 'Not reachable': 'warning' }

export function RoomListPane({
  run,
  roomsQuery,
  allItems,
  items,
  roomFilter,
  onFilterChange,
  page,
  onPageChange,
}) {
  const navigate = useNavigate()

  const todoList = allItems.filter((r) => r.status === 'To do' || r.status === 'In progress')
  const doneList = allItems.filter((r) => r.status === 'Done' || r.status === 'Not reachable')
  const failedList = allItems.filter((r) =>
    (r.results ?? []).some((x) => x.result === 'Fail' || x.condition === 'Damaged' || x.condition === 'Missing'),
  )

  const kpiItems = [
    { key: 'all', label: 'All', count: allItems.length, hint: 'All rooms in this page of the run' },
    { key: 'todo', label: 'To do', count: todoList.length, hint: 'Rooms waiting for inspection or in progress' },
    { key: 'failed', label: 'Items failed', count: failedList.length, hint: 'Rooms with damaged, missing or failed items' },
    { key: 'done', label: 'Done', count: doneList.length, hint: 'Rooms already inspected or marked not reachable' },
  ]

  const openRoom = (roomCode) => {
    navigate(`/staff/inspections/${encodeURIComponent(run.id)}/rooms/${encodeURIComponent(roomCode)}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('Room queues')}
        className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface lg:grid-cols-4"
      >
        {kpiItems.map((item) => (
          <KpiTabCard
            key={item.key}
            item={item}
            selected={item.key === roomFilter}
            onSelect={() => onFilterChange(item.key)}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th>Room</Th>
              <Th>Result</Th>
              <Th>Meters</Th>
              <Th className="w-36">Status</Th>
              <Th className="w-44 text-right">Action</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={roomsQuery} colSpan={5} rows={items} emptyTitle="No rooms in this run" />
            {items.map((r) => {
              const isDone = r.status === 'Done' || r.status === 'Not reachable'
              return (
                <Tr
                  key={r.room}
                  tabIndex={0}
                  onClick={() => openRoom(r.room)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openRoom(r.room)
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-subtle/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&>td]:py-3"
                >
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-semibold text-fg">{r.room}</span>
                      <span className="text-xs text-fg-secondary">
                        {[tr(r.roomTypeName), tr(r.roomClassName)].filter(Boolean).join(' ')}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-sm text-fg-secondary">{summary(r, roomItems(run, r).length)}</Td>
                  <Td className="text-xs text-fg-secondary tabular">
                    {!r.metersNeeded ? (
                      <span className="text-fg-tertiary">—</span>
                    ) : r.meters?.electricity != null && r.meters?.water != null ? (
                      <span>
                        {formatNumber(r.meters.electricity)} kWh · {formatNumber(r.meters.water)} m³
                      </span>
                    ) : (
                      <span className="text-fg-tertiary">{t('Not entered')}</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Tag tone={statusTone[r.status] ?? 'neutral'}>{r.status}</Tag>
                      {r.inspectedAt && (
                        <span className="text-xs text-fg-tertiary tabular">{formatDateTime(r.inspectedAt)}</span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant={isDone ? 'secondary' : 'primary'}
                      onClick={(e) => {
                        e.stopPropagation()
                        openRoom(r.room)
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {isDone ? t('View details') : t('Inspect & fill')}
                        <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                      </span>
                    </Button>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
        <div className="flex shrink-0 justify-end">
          <Pagination total={roomsQuery.data?.total ?? 0} page={page} onChange={onPageChange} showSizeChanger={false} />
        </div>
      </div>
    </div>
  )
}
