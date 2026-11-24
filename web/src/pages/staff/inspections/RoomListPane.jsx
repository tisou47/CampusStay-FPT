import { ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { Tabs } from '@/components/ui/Tabs'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'
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
      <Tabs label={t('Room queues')} value={roomFilter} onChange={onFilterChange} items={kpiItems} />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill tableClassName="table-fixed">
          <THead>
            <tr>
              <Th className="w-[34%]">Room</Th>
              <Th className="w-[38%]">Result</Th>
              <Th>Status</Th>
              <Th className="w-10">
                <span className="sr-only">{t('Open')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={roomsQuery} colSpan={4} rows={items} emptyTitle="No rooms in this run" />
            {items.map((r) => (
              <Tr key={r.room} onClick={() => openRoom(r.room)} className="cursor-pointer [&>td]:py-3">
                <Td>
                  <div className="flex flex-col">
                    <span className="font-semibold text-fg">{r.room}</span>
                    <span className="truncate text-xs text-fg-secondary">
                      {[tr(r.roomTypeName), tr(r.roomClassName)].filter(Boolean).join(' ')}
                    </span>
                  </div>
                </Td>
                <Td className="truncate text-sm text-fg-secondary">{summary(r, roomItems(run, r).length)}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <Tag tone={statusTone[r.status] ?? 'neutral'}>{r.status}</Tag>
                    {r.inspectedAt && (
                      <span className="text-xs text-fg-tertiary tabular">{formatDateTime(r.inspectedAt)}</span>
                    )}
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
          <Pagination total={roomsQuery.data?.total ?? 0} page={page} onChange={onPageChange} showSizeChanger={false} />
        </div>
      </div>
    </div>
  )
}
