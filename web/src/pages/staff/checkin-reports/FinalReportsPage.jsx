import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ChevronRight, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { FilterSelect, SearchInput } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { t, tr } from '@/i18n'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { severityOf } from './checkinReports'
import { SeverityBadge } from './components/Badges'

// Every report kept for the rooms, in one place (user decision 25/11/2026): the students' check-in inventories
// (report 2), the rooms' final reports, report 1 (Staff's pre-arrival check) and every other inspection, one option per
// checklist the Admin published (Wi-Fi, fire safety …). It reads the live data, so a report shows as soon as it is
// filed or saved.
// GET /handovers?block&status&comparison&q&page&pageSize → { items, total }
// GET /inspection-reports?block&kind&checklist&q&page&pageSize → { items, total, checklists: [{ key, name, reports }] }

const STATUS_TONE = {
  Final: 'success',
  Submitted: 'warning',
  Verifying: 'info',
  Draft: 'neutral',
  Cancelled: 'error',
}

const STUDENT_STATUSES = ['All', 'Draft', 'Submitted', 'Verifying', 'Final', 'Late report']

/** A search box whose text is sent after a short pause. */
function useDebounced(value, delay = 300) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setOut(value.trim()), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return out
}

function Count({ n, label }) {
  return (
    <span className="rounded-full bg-subtle px-3 py-1 text-sm font-medium whitespace-nowrap text-fg-secondary tabular">
      {label ?? t('{n} reports', { n: formatNumber(n) })}
    </span>
  )
}

// finalOnly: the rooms' final reports (the inventories that are final); otherwise every student check-in inventory.
function StudentReports({ finalOnly = false, typeSelect }) {
  const navigate = useNavigate()
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [text, setText] = useState('')
  const q = useDebounced(text)
  const [chosenStatus, setStatus] = useState('All')
  const status = finalOnly ? 'Final' : chosenStatus
  const [comparison, setComparison] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => setPage(1), [q, status, comparison])

  const query = useQuery(['handovers', 'list', scope, status, comparison, q, page, pageSize], ({ signal }) =>
    api.handover.list({ ...scope, status, comparison: comparison || undefined, q: q || undefined, page, pageSize }, { signal }),
  )
  const rows = [...(query.data?.items ?? [])].sort((a, b) => {
    const timeA = Date.parse(a.finalizedAt ?? a.submittedAt ?? a.openedAt ?? '') || 0
    const timeB = Date.parse(b.finalizedAt ?? b.submittedAt ?? b.openedAt ?? '') || 0
    return timeB - timeA
  })

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
        <SearchInput wrapperClassName="w-80 max-w-full" aria-label={t('Search')} placeholder="Student code, name, room or report ID" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {typeSelect}
          {!finalOnly && (
            <FilterSelect label="Status" value={chosenStatus} onChange={setStatus} options={STUDENT_STATUSES.map((s) => ({ value: s, label: s }))} />
          )}
          <FilterSelect
            label="Comparison"
            value={comparison}
            onChange={setComparison}
            options={[
              { value: '', label: 'All' },
              { value: 'Matched', label: 'Matched' },
              { value: 'Minor', label: 'Minor difference' },
              { value: 'Major', label: 'Major difference' },
            ]}
          />
          <Count n={query.data?.total ?? 0} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill tableClassName="table-fixed min-w-[1000px]">
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
            <TableStatus query={query} colSpan={7} rows={rows} emptyIcon={FileText} emptyTitle="No reports found" />
            {rows.map((r) => {
              const severity = severityOf(r.comparison)
              const at = r.finalizedAt ?? r.submittedAt ?? r.openedAt
              return (
                <Tr key={r.id} onClick={() => openReport(r)} className="cursor-pointer [&>td]:h-15.5">
                  <Td className="font-mono text-sm font-medium whitespace-nowrap text-fg">{r.id}</Td>
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
                    <Tag tone={STATUS_TONE[r.status] ?? 'neutral'}>{tr(r.status)}</Tag>
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
                  <Td className="text-sm text-fg-secondary tabular">{at ? formatDateTime(at) : '—'}</Td>
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

// The inspection reports: report 1 (kind Pre-arrival) or the reports of one published checklist.
// Grouped by inspection run first so the user sees each Run clearly and clicks into a Run to view individual rooms.
function InspectionReports({ kind, checklist, typeSelect }) {
  const navigate = useNavigate()
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [params, setParams] = useSearchParams()
  const selectedRunId = params.get('run') || null
  const [text, setText] = useState('')
  const q = useDebounced(text)
  const [runStatus, setRunStatus] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => setPage(1), [q, runStatus, roomFilter, selectedRunId])

  const query = useQuery(['inspection-reports', scope, kind, checklist, q], ({ signal }) =>
    api.inspections.reports({ ...scope, kind, checklist, q: q || undefined, page: 1, pageSize: 100 }, { signal }),
  )
  const allItems = query.data?.items ?? []

  // Group room reports into runs, preserving newest-first order
  const runsMap = new Map()
  for (const r of allItems) {
    let run = runsMap.get(r.runId)
    const time = Date.parse(r.inspectedAt ?? r.submittedAt ?? '') || 0
    if (!run) {
      run = {
        runId: r.runId,
        name: r.name,
        kind: r.kind,
        checklistName: r.checklistName,
        inspector: r.inspector,
        submitted: r.submitted,
        latestAt: r.inspectedAt ?? r.submittedAt,
        latestTime: time,
        totalFailed: 0,
        damagedRooms: 0,
        unreachableRooms: 0,
        rooms: [],
      }
      runsMap.set(r.runId, run)
    }
    run.rooms.push(r)
    run.totalFailed += Number(r.failed ?? 0)
    if (r.failed > 0) run.damagedRooms += 1
    if (r.status === 'Unreachable') run.unreachableRooms += 1
    if (time > run.latestTime) {
      run.latestTime = time
      run.latestAt = r.inspectedAt ?? r.submittedAt
    }
    if (!run.inspector && r.inspector) run.inspector = r.inspector
  }

  const allRuns = [...runsMap.values()]
    .filter((run) => {
      if (runStatus === 'sent') return Boolean(run.submitted)
      if (runStatus === 'open') return !run.submitted
      return true
    })
    .sort((a, b) => b.latestTime - a.latestTime)

  const setRunId = (id) => {
    const next = new URLSearchParams(params)
    if (id) next.set('run', id)
    else next.delete('run')
    setParams(next, { replace: true })
  }

  const activeRun = selectedRunId ? runsMap.get(selectedRunId) : null

  if (selectedRunId && activeRun) {
    const filteredRooms = activeRun.rooms.filter((r) => {
      if (roomFilter === 'damaged') return r.failed > 0 || r.status === 'Unreachable'
      if (roomFilter === 'clean') return r.failed === 0 && r.status !== 'Unreachable'
      return true
    })
    const pagedRooms = filteredRooms.slice((page - 1) * pageSize, page * pageSize)

    return (
      <>
        <PageHeader
          breadcrumb={
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => setRunId(null)}>
                {t('Back')}
              </Button>
              <nav aria-label={t('Breadcrumb')} className="flex flex-wrap items-center gap-1.5 text-sm text-fg-secondary">
                <button type="button" onClick={() => setRunId(null)} className="cursor-pointer hover:text-fg-brand">
                  {t('Final reports')}
                </button>
                <span aria-hidden="true">/</span>
                <button type="button" onClick={() => setRunId(null)} className="cursor-pointer hover:text-fg-brand">
                  {t('Dormitory reports')}
                </button>
                <span aria-hidden="true">/</span>
                <span className="font-mono font-semibold text-fg">{activeRun.runId}</span>
              </nav>
            </div>
          }
          title={`${activeRun.runId} · ${tr(activeRun.name)}`}
          description={activeRun.checklistName ? tr(activeRun.checklistName) : undefined}
          badge={
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="info" dot={false}>
                {t('{n} rooms', { n: activeRun.rooms.length })}
              </Tag>
              {activeRun.totalFailed > 0 ? (
                <Tag tone="error">{t('{n} damaged items', { n: activeRun.totalFailed })}</Tag>
              ) : (
                <Tag tone="success">{t('{n} damaged items', { n: 0 })}</Tag>
              )}
              {activeRun.submitted ? <Tag tone="success">{t('Sent')}</Tag> : <Tag tone="neutral">{t('Run in progress')}</Tag>}
            </div>
          }
        />

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <SearchInput wrapperClassName="w-80 max-w-full" aria-label={t('Search')} placeholder="Room or run code" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <FilterSelect
              label="Result"
              value={roomFilter}
              onChange={setRoomFilter}
              options={[
                { value: '', label: 'All' },
                { value: 'damaged', label: 'Có mục hư hỏng' },
                { value: 'clean', label: '0 mục hư hỏng' },
              ]}
            />
            <Count n={filteredRooms.length} label={t('{n} rooms', { n: formatNumber(filteredRooms.length) })} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <InspectionReportTable query={query} items={pagedRooms} onOpen={(r) => navigate(`${base}/inspections/${r.runId}/rooms/${r.room}?from=reports`)} />
          <div className="flex shrink-0 justify-end">
            <Pagination
              total={filteredRooms.length}
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

  const pagedRuns = allRuns.slice((page - 1) * pageSize, page * pageSize)

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <SearchInput wrapperClassName="w-80 max-w-full" aria-label={t('Search')} placeholder="Room or run code" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {typeSelect}
          <FilterSelect
            label="Status"
            value={runStatus}
            onChange={setRunStatus}
            options={[
              { value: '', label: 'All' },
              { value: 'open', label: 'Run in progress' },
              { value: 'sent', label: 'Sent' },
            ]}
          />
          <Count n={allRuns.length} label={`${formatNumber(allRuns.length)} đợt · ${formatNumber(allItems.length)} phòng`} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill tableClassName="table-fixed min-w-[1000px]">
          <THead>
            <tr>
              <Th className="w-28">{t('Run')}</Th>
              <Th>{t('Inspection')}</Th>
              <Th className="w-40">{t('Rooms')}</Th>
              <Th className="w-48">{t('Result')}</Th>
              <Th className="w-44">{t('Inspected by')}</Th>
              <Th className="w-40">{t('Inspected')}</Th>
              <Th className="w-36">{t('Sent to managers')}</Th>
              <Th className="w-10">
                <span className="sr-only">{t('Open')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={8} rows={pagedRuns} emptyIcon={FileText} emptyTitle="No inspection reports yet" />
            {pagedRuns.map((run) => {
              const roomPreview = run.rooms
                .slice(0, 3)
                .map((r) => r.room)
                .join(', ')
              const moreRooms = run.rooms.length > 3 ? ` +${run.rooms.length - 3}` : ''
              return (
                <Tr key={run.runId} onClick={() => setRunId(run.runId)} className="cursor-pointer [&>td]:h-14">
                  <Td className="font-mono text-sm font-bold whitespace-nowrap text-fg-brand">{run.runId}</Td>
                  <Td>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-fg" title={tr(run.name)}>
                        {tr(run.name)}
                      </span>
                      <span className="truncate text-xs text-fg-secondary">{tr(run.checklistName ?? run.kind)}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold text-fg tabular">{t('{n} rooms', { n: run.rooms.length })}</span>
                      <span className="truncate text-xs text-fg-tertiary tabular">
                        {roomPreview}
                        {moreRooms}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {run.totalFailed > 0 ? (
                        <Tag tone="error">{t('{n} damaged items', { n: run.totalFailed })}</Tag>
                      ) : (
                        <Tag tone="success">{t('{n} damaged items', { n: 0 })}</Tag>
                      )}
                      {run.unreachableRooms > 0 && <Tag tone="warning">{t('Unreachable')}</Tag>}
                    </div>
                  </Td>
                  <Td className="truncate">{run.inspector ?? '—'}</Td>
                  <Td className="text-sm text-fg-secondary tabular">{run.latestAt ? formatDateTime(run.latestAt) : '—'}</Td>
                  <Td>{run.submitted ? <Tag tone="success">{t('Sent')}</Tag> : <Tag tone="neutral">{t('Run in progress')}</Tag>}</Td>
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
            total={allRuns.length}
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

/** The inspection reports as a table. */
export function InspectionReportTable({ query, items, onOpen, showRoom = true }) {
  return (
    <Table fill tableClassName="table-fixed min-w-[1180px]">
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
                <span className="truncate font-medium text-fg" title={tr(r.name)}>{tr(r.name)}</span>
                <span className="truncate text-xs text-fg-secondary">{tr(r.checklistName ?? r.kind)}</span>
              </div>
            </Td>
            <Td>
              {r.status === 'Unreachable' ? (
                <Tag tone="warning">{t('Unreachable')}</Tag>
              ) : r.failed > 0 ? (
                <Tag tone="error">{t('{n} damaged items', { n: r.failed })}</Tag>
              ) : (
                <Tag tone="success">{t('{n} damaged items', { n: 0 })}</Tag>
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

export default function FinalReportsPage() {
  const scope = useScopeQuery()
  const [params, setParams] = useSearchParams()
  // Every checklist the Admin published is a report type of its own (with how many reports used it).
  const options = useQuery(['inspection-reports', 'checklists', scope], ({ signal }) => api.inspections.reports({ ...scope, pageSize: 1 }, { signal }))
  const checklists = options.data?.checklists ?? []
  // Two groups (user decision 26/11/2026), so a report is easy to find: what the students filed (their check-in
  // inventories and the rooms' final reports) and what the dormitory filed (report 1 and every other inspection).
  const studentTypes = [
    { value: 'student', label: t('Student check-in inventories') },
    { value: 'final', label: t('Final room reports') },
  ]
  const dormTypes = [
    { value: 'report1', label: t('Report 1 · Staff pre-arrival check') },
    ...checklists.map((c) => ({ value: `cl:${c.key}`, label: `${tr(c.name)} (${formatNumber(c.reports)})` })),
  ]
  const asked = params.get('type') ?? 'student'
  const type = asked.startsWith('cl:') || [...studentTypes, ...dormTypes].some((x) => x.value === asked) ? asked : 'student'
  const group = studentTypes.some((x) => x.value === type) ? 'student' : 'dorm'
  const setType = (v) => setParams(v === 'student' ? {} : { type: v }, { replace: true })
  const typeSelect = (
    <FilterSelect label="Report type" value={type} onChange={setType} options={group === 'student' ? studentTypes : dormTypes} />
  )
  const groups = [
    {
      key: 'student',
      label: 'Student reports',
    },
    {
      key: 'dorm',
      label: 'Dormitory reports',
    },
  ]
  const inRunDetail = group === 'dorm' && Boolean(params.get('run'))
  return (
    <>
      {!inRunDetail && (
        <>
          <PageHeader
            title="Final reports"
            tip="Every report kept for the rooms, updated as soon as one is filed: the students' check-in inventories, the rooms' final reports, report 1 and each inspection the Admin configured. Students see only their own inventory and their room's final report."
          />
          <Tabs
            label={t('Report group')}
            value={group}
            onChange={(g) => g !== group && setType(g === 'student' ? 'student' : 'report1')}
            items={groups.map((g) => ({ key: g.key, label: g.label }))}
          />
        </>
      )}
      {type === 'student' && <StudentReports key="student" typeSelect={typeSelect} />}
      {type === 'final' && <StudentReports key="final" finalOnly typeSelect={typeSelect} />}
      {type === 'report1' && <InspectionReports key="report1" kind="Pre-arrival" typeSelect={typeSelect} />}
      {type.startsWith('cl:') && <InspectionReports key={type} checklist={type.slice(3)} typeSelect={typeSelect} />}
    </>
  )
}
