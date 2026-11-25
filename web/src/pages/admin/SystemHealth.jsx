import { Activity, HardDrive, Mail, RefreshCw, ServerCrash } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { StaleNotice, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime, formatDuration, formatNumber, formatRelative } from '@/lib/format'
import { byteSize } from '@/lib/numbers'
import { t } from '@/i18n'

// Admin › System › System health (wave 4 G1, backend D2). Nothing here names a person.
// GET /admin/system/health → { checkedAt, jobs: [{ job, lastStartedAt, lastFinishedAt, ok, running, errorClass, errorCode,
//   failedLast24h }], serverErrorsLastHour, uploads: { files, bytes }, emailOutbox: { pending, failed, oldestPendingAt } }
// ok is null while a run is in progress; serverErrorsLastHour counts the 5xx answers of the server that answered.

function JobStatus({ job }) {
  if (job.running || job.ok == null) return <Tag tone="info">{t('Running')}</Tag>
  return job.ok ? <Tag tone="success">{t('OK')}</Tag> : <Tag tone="error">{t('Failed')}</Tag>
}

const size = (bytes) => {
  const { value, unit } = byteSize(bytes)
  return `${formatNumber(value, { decimals: unit === 'B' ? 0 : 1 })} ${unit}`
}

/** Most jobs take seconds: "2,4 s" under a minute, else "3 min" / "1h 5 min". */
const duration = (ms) => (ms < 60_000 ? `${formatNumber(Math.max(0, ms) / 1000, { decimals: 1 })} s` : formatDuration(ms))

export default function SystemHealth() {
  const query = useQuery(['system-health'], ({ signal }) => api.admin.health(undefined, { signal }))
  const d = query.data
  const jobs = d?.jobs ?? []
  const failing = jobs.filter((j) => j.ok === false).length
  return (
    <>
      <PageHeader
        title="System health"
        description={d?.checkedAt ? t('Scheduled jobs, server errors, uploaded files and the email queue. Checked {time}.', { time: formatDateTime(d.checkedAt) }) : 'Scheduled jobs, server errors, uploaded files and the email queue.'}
        actions={
          <Button icon={RefreshCw} onClick={() => query.reload()} disabled={query.loading}>
            Refresh
          </Button>
        }
      />
      <StaleNotice query={query} />
      {d && (
          <div className="flex shrink-0 gap-3">
            <KpiTile
              icon={Activity}
              label="Scheduled jobs"
              value={formatNumber(jobs.length)}
              note={failing ? t('{n} failed on their last run', { n: failing }) : t('All last runs succeeded')}
              noteTone={failing ? 'error' : 'success'}
            />
            <KpiTile
              icon={ServerCrash}
              label="Server errors (last hour)"
              tip="5xx answers of the server that answered this page. Each one is in the server log."
              value={formatNumber(d.serverErrorsLastHour ?? 0)}
              valueTone={d.serverErrorsLastHour ? 'error' : undefined}
            />
            <KpiTile icon={HardDrive} label="Uploaded files" value={size(d.uploads?.bytes)} note={t('{n} files', { n: formatNumber(d.uploads?.files ?? 0) })} />
            <KpiTile
              icon={Mail}
              label="Email queue"
              value={formatNumber(d.emailOutbox?.pending ?? 0)}
              note={
                d.emailOutbox?.failed
                  ? t('{n} failed', { n: formatNumber(d.emailOutbox.failed) })
                  : d.emailOutbox?.oldestPendingAt
                    ? t('Oldest waiting since {time}', { time: formatRelative(d.emailOutbox.oldestPendingAt) })
                    : t('Nothing waiting')
              }
              noteTone={d.emailOutbox?.failed ? 'error' : 'secondary'}
            />
          </div>
      )}
      <Table fill>
        <THead>
          <tr>
            <Th>Job</Th>
            <Th className="w-32">Status</Th>
            <Th className="w-48">Last started</Th>
            <Th className="w-32" align="right">
              Duration
            </Th>
            <Th className="w-36" align="right">
              Failures (24 h)
            </Th>
            <Th className="w-64">Error</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} rows={jobs} colSpan={6} emptyIcon={Activity} emptyTitle="No job has run yet" emptyText="Jobs appear here after their first run." />
          {jobs.map((j) => (
            <Tr key={j.job}>
              <Td className="font-mono text-sm">{j.job}</Td>
              <Td>
                <JobStatus job={j} />
              </Td>
              <Td className="tabular">{j.lastStartedAt ? formatDateTime(j.lastStartedAt) : '—'}</Td>
              <Td align="right" className="tabular">
                {j.lastStartedAt && j.lastFinishedAt ? duration(new Date(j.lastFinishedAt) - new Date(j.lastStartedAt)) : '—'}
              </Td>
              <Td align="right" className={j.failedLast24h ? 'font-medium text-error-fg tabular' : 'tabular'}>
                {formatNumber(j.failedLast24h ?? 0)}
              </Td>
              <Td className="font-mono text-sm text-fg-secondary">{[j.errorClass, j.errorCode].filter(Boolean).join(' · ') || '—'}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </>
  )
}
