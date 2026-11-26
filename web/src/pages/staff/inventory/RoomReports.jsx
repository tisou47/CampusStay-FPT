import { useNavigate } from 'react-router'
import { FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Tag } from '@/components/ui/Tag'
import { t, tr } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'

// A room's reports (user decision 25/11/2026), shared by Rooms and beds and the Room hub: report 1 (Staff's
// pre-arrival check), every other inspection saved for the room (Wi-Fi, fire safety …) and the students' check-in
// inventories, newest first. Staff and Managers open each one; students never see this list.
// GET /inspection-reports?room → { items: [{ runId, room, name, kind, checklistName, status, failed, inspector, inspectedAt }] }
// GET /handovers?room&status=All → { items: [{ id, bed, studentName, status, openedAt, submittedAt, finalizedAt }] }

export function useRoomReports(room) {
  const base = useRoleBase()
  const inspections = useQuery(['inspection-reports', 'room', room], ({ signal }) => api.inspections.reports({ room, pageSize: 50 }, { signal }), {
    enabled: Boolean(room),
  })
  const inventories = useQuery(['handovers', 'room', room], ({ signal }) => api.handover.list({ room, status: 'All', pageSize: 50 }, { signal }), {
    enabled: Boolean(room),
  })
  const rows = [
    ...(inspections.data?.items ?? []).map((r) => ({
      key: `i-${r.runId}`,
      at: r.inspectedAt ?? r.submittedAt,
      title: tr(r.name),
      meta: [r.runId, r.kind === 'Pre-arrival' ? t('Report 1') : tr(r.checklistName), r.inspector].filter(Boolean).join(' · '),
      tag:
        r.status === 'Unreachable' ? (
          <Tag tone="warning">{t('Unreachable')}</Tag>
        ) : (
          <Tag tone={r.failed > 0 ? 'error' : 'success'}>{t('{n} damaged items', { n: r.failed })}</Tag>
        ),
      to: `${base}/inspections/${r.runId}/rooms/${r.room}?from=room`,
    })),
    ...(inventories.data?.items ?? []).map((r) => ({
      key: `h-${r.id}`,
      // A student's own report: Rooms and beds shows it under that student's Bed.
      studentCode: r.studentCode,
      bed: r.bed,
      at: r.finalizedAt ?? r.submittedAt ?? r.openedAt,
      title: t('Check-in inventory · Bed {bed}', { bed: r.bed }),
      meta: [r.id, r.studentName].filter(Boolean).join(' · '),
      tag: <Tag tone={r.status === 'Final' ? 'success' : r.status === 'Submitted' ? 'warning' : 'neutral'}>{tr(r.status)}</Tag>,
      to: r.status === 'Final' ? `${base}/check-in/inventories/${r.id}/report/3?from=done` : `${base}/check-in/inventories/${r.id}?from=review`,
    })),
  ].sort((a, b) => new Date(b.at ?? 0) - new Date(a.at ?? 0))
  const loading = (inspections.loading && !inspections.data) || (inventories.loading && !inventories.data)
  return { rows, loading }
}

/** The list itself: one row per report, opening it. */
export function RoomReportList({ rows, loading, className = 'max-h-80' }) {
  const navigate = useNavigate()
  if (loading) return <p className="text-sm text-fg-tertiary">{t('Loading…')}</p>
  if (!rows.length) return <p className="text-sm text-fg-tertiary">{t('No reports for this room yet: check-in inventories and room inspections appear here once filed.')}</p>
  return (
    <ul className={`flex flex-col gap-2 overflow-y-auto ${className}`}>
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => navigate(r.to)}
            className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:bg-subtle"
          >
            <FileText size={18} aria-hidden="true" className="shrink-0 text-fg-brand" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-semibold text-fg">{r.title}</span>
              <span className="truncate text-sm text-fg-tertiary">{[r.meta, r.at && formatDateTime(r.at)].filter(Boolean).join(' · ')}</span>
            </span>
            {r.tag}
          </button>
        </li>
      ))}
    </ul>
  )
}
