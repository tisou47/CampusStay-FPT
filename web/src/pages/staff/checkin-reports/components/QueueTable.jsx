import { useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/Choice'
import { Avatar } from '@/components/ui/Display'
import { ErrorState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tooltip } from '@/components/ui/Tooltip'
import { t } from '@/i18n'
import { formatDateTime, formatDuration } from '@/lib/format'
import { differences, diffText, severityOf, useReport } from '../checkinReports'
import { SeverityBadge } from './Badges'

// The rows whose differences are read one by one (GET /handovers/:id) for the "Differs from the record" column.
// TODO(api): GET /handovers has no summary of the differences; with one, this column needs no extra request.
const SUMMARY_ROWS = 30

function DiffSummary({ id }) {
  const { query, diff } = useReport(id)
  if (query.loading) return <span aria-hidden="true" className="block h-3.5 w-48 animate-pulse rounded bg-subtle" />
  if (!diff) return <span className="text-fg-tertiary">—</span>
  const list = differences(diff)
  if (!list.length) return <span className="text-fg-tertiary">{t('Same as the record')}</span>
  const text = list.slice(0, 2).map(diffText).join(' · ')
  return (
    <span className="line-clamp-2 text-sm text-fg" title={list.map(diffText).join('\n')}>
      {text}
      {list.length > 2 && <span className="text-fg-secondary"> {t('+{n} more', { n: list.length - 2 })}</span>}
    </span>
  )
}

function Waiting({ row }) {
  if (row.visitAt) return <span className="tabular-nums">{formatDateTime(row.visitAt)}</span>
  const since = row.submittedAt ?? row.openedAt
  if (!since) return <span className="text-fg-tertiary">—</span>
  return <span title={formatDateTime(since)}>{formatDuration(Date.now() - new Date(since).getTime())}</span>
}

function SkeletonRows({ cols, rows = 5 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i} aria-hidden="true">
      {Array.from({ length: cols }, (__, j) => (
        <td key={j} className="h-15.5 border-b border-line px-4">
          <span className="block h-3.5 w-3/4 animate-pulse rounded bg-subtle" />
        </td>
      ))}
    </tr>
  ))
}

/**
 * The queue: student, Room · Bed, what differs, severity, waiting time or visit, a chevron. A whole row opens the
 * student's reports. With `selection` the rows take a checkbox (only minor ones: a major difference is read alone).
 */
export function QueueTable({ query, rows, base, from, empty, selection, waitingLabel = 'Waiting', summaries = true }) {
  const navigate = useNavigate()
  const open = (id) => navigate(`${base}/${id}/report/2?from=${from}`)
  const cols = selection ? 7 : 6
  return (
    <Table fill tableClassName="table-fixed">
      <THead>
        <tr>
          {selection && (
            <Th className="w-10">
              <Checkbox
                aria-label={t('Select every minor difference')}
                checked={selection.allSelected}
                indeterminate={selection.someSelected && !selection.allSelected}
                onChange={(e) => selection.toggleAll(e.target.checked)}
                disabled={!selection.selectable}
              />
            </Th>
          )}
          <Th className="w-64">{t('Student')}</Th>
          <Th className="w-36">{t('Room · Bed')}</Th>
          <Th>{t('Differs from the record')}</Th>
          <Th className="w-40">{t('Severity')}</Th>
          <Th className="w-36">{t(waitingLabel)}</Th>
          <Th className="w-10">
            <span className="sr-only">{t('Open')}</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {query.loading && !rows.length && <SkeletonRows cols={cols} />}
        {query.error && !rows.length && (
          <tr>
            <td colSpan={cols} className="p-6">
              <ErrorState error={query.error} onRetry={query.reload} compact />
            </td>
          </tr>
        )}
        {!query.loading && !query.error && !rows.length && (
          <tr>
            <td colSpan={cols} className="p-0">
              {empty}
            </td>
          </tr>
        )}
        {rows.map((r, index) => {
          const severity = severityOf(r.comparison)
          const major = severity === 'major'
          return (
            <Tr key={r.id} onClick={() => open(r.id)} className="cursor-pointer [&>td]:h-15.5">
              {selection && (
                <Td onClick={(e) => e.stopPropagation()}>
                  {major ? (
                    <Tooltip label={t('A major difference is read one by one')}>
                      <Checkbox aria-label={t('Select {name}', { name: r.studentName })} disabled checked={false} onChange={() => {}} />
                    </Tooltip>
                  ) : (
                    <Checkbox aria-label={t('Select {name}', { name: r.studentName })} checked={selection.isSelected(r.id)} onChange={() => selection.toggle(r.id)} />
                  )}
                </Td>
              )}
              <Td>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={r.studentName} size={32} />
                  <span className="flex min-w-0 flex-col">
                    <a
                      href={`${base}/${r.id}?from=${from}`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        open(r.id)
                      }}
                      className="truncate font-medium text-fg hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {r.studentName}
                    </a>
                    <span className="text-xs text-fg-secondary tabular-nums">{r.studentCode}</span>
                  </span>
                </div>
              </Td>
              <Td>
                <span className="flex flex-col">
                  <span className="font-medium tabular-nums">{r.room}</span>
                  <span className="text-xs text-fg-secondary">{t('Bed {bed}', { bed: r.bed })}</span>
                </span>
              </Td>
              <Td wrap>{summaries && index < SUMMARY_ROWS ? <DiffSummary id={r.id} /> : <span className="text-fg-tertiary">—</span>}</Td>
              <Td>
                <SeverityBadge severity={severity} fallback={r.lateReport ? t('Late report') : r.status} />
              </Td>
              <Td className="text-sm text-fg-secondary">
                <Waiting row={r} />
              </Td>
              <Td>
                <ChevronRight size={16} aria-hidden="true" className="text-fg-tertiary" />
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}
