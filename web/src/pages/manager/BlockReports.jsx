import { useState } from 'react'
import { Banknote, Bed, Check, Download, FileText, UserX, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card, ProgressBar } from '@/components/ui/Display'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-RPT-10 Block Reports (Figma 70:1180)
// GET /reports/block?termId&block → { allocated, weekly: [{ label, value }], notCheckedIn, followUpBy }
// Exports: GET /exports/block-occupancy|block-collections|block-maintenance|block-residents?termId&block (.xlsx)

const reports = [
  { key: 'occupancy', icon: Bed, title: 'Occupancy', body: 'Beds by floor, room type and room tier' },
  { key: 'collections', icon: Banknote, title: 'Collections', body: 'Invoiced, collected, overdue, refunds' },
  { key: 'maintenance', icon: Wrench, title: 'Maintenance', body: 'Volume, SLA, top categories' },
  { key: 'residents', icon: FileText, title: 'Residents', body: 'Allocated students and check-in status' },
]

export default function BlockReports() {
  const { block, term } = useSession()
  const scope = useScopeQuery()
  const { notify, notifyError } = useToast()
  const query = useQuery(['reports', 'block', scope], ({ signal }) => api.reports.block(scope, { signal }))
  const d = query.data
  const exporting = useMutation((report) => api.exports.download(`block-${report.key}`, scope, `block-${block ?? 'all'}-${report.key}.xlsx`), {
    onSuccess: (_, report) => notify({ title: t('{report} report exported', { report: t(report.title) }), message: [block && t('Block {code}', { code: block }), term?.name].filter(Boolean).join(' · ') }),
    onError: (e) => notifyError(e, 'Export failed'),
  })
  const [exportingKey, setExportingKey] = useState(null)
  const top = Math.max(1, ...(d?.weekly ?? []).map((w) => w.value))
  const checkedIn = d?.allocated != null && d?.notCheckedIn != null ? d.allocated - d.notCheckedIn : null
  const share = checkedIn != null && d.allocated ? checkedIn / d.allocated : null

  return (
    <>
      <PageHeader title={block ? t('Reports · Block {code}', { code: block }) : 'Reports'} />

      {/* The exports: one compact card each, the download beside its name */}
      <section className="flex shrink-0 flex-col gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">{t('Excel exports')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {reports.map((r) => {
            const Glyph = r.icon
            const busy = exporting.pending && exportingKey === r.key
            return (
              <Card key={r.key} padding="sm" className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
                  <Glyph size={20} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold text-fg">{t(r.title)}</span>
                  <span className="line-clamp-2 text-sm text-fg-tertiary">{t(r.body)}</span>
                </span>
                <Button size="sm" icon={Download} iconSize={14} onClick={() => {
                    setExportingKey(r.key)
                    exporting.run(r)
                  }} disabled={exporting.pending} tip={t('Download {report} (.xlsx)', { report: t(r.title) })}>
                  {busy ? t('Exporting…') : '.xlsx'}
                </Button>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Check-in progress: where it stands on the left, week by week on the right */}
      <Card padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-h3 font-semibold text-fg">{t('Check-ins this term')}</h2>
          {d?.allocated != null && <span className="text-sm text-fg-tertiary">{t('of {n} allocated', { n: formatNumber(d.allocated) })}</span>}
        </div>
        <QueryState query={query} compact isEmpty={(x) => !x.weekly?.length} empty={<EmptyBlock title="No check-ins yet this term" />}>
          {(data) => (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <div className="flex flex-col gap-4 border-line p-5 lg:border-r">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-fg-secondary">{t('Checked in')}</span>
                  <span className="text-kpi font-semibold text-fg tabular">{checkedIn != null ? formatNumber(checkedIn) : '—'}</span>
                  {share != null && (
                    <>
                      <ProgressBar value={share * 100} max={100} tone={share >= 0.9 ? 'success' : 'accent'} className="mt-1" />
                      <span className="text-sm text-fg-tertiary">{t('{p} of the allocated students', { p: formatPercent(share, 0) })}</span>
                    </>
                  )}
                </div>
                {data.notCheckedIn != null && (
                  <div className={cx('flex flex-col gap-1 rounded-lg p-3', data.notCheckedIn ? 'bg-warning-bg' : 'bg-success-bg')}>
                    <span className={cx('flex items-center gap-1.5 text-sm font-medium', data.notCheckedIn ? 'text-warning-fg' : 'text-success-fg')}>
                      {data.notCheckedIn ? <UserX size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
                      {data.notCheckedIn ? t('Not checked in yet') : t('Everyone checked in')}
                    </span>
                    {data.notCheckedIn > 0 && <span className="text-h3 font-semibold text-fg tabular">{formatNumber(data.notCheckedIn)}</span>}
                    {data.notCheckedIn > 0 && data.followUpBy && <span className="text-sm text-fg-secondary">{t('Staff contact them before {date}.', { date: formatDate(data.followUpBy) })}</span>}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col gap-2 p-5">
                <span className="text-sm text-fg-secondary">{t('Checked in each week')}</span>
                <ul className="flex min-h-40 flex-1 items-end gap-2 border-b border-line-strong" aria-label={t('Checked-in residents by week')}>
                  {data.weekly.map((w) => (
                    <li key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={t('{week}: {n} checked in', { week: tr(w.label), n: formatNumber(w.value) })}>
                      {w.value > 0 && <span className="text-sm font-semibold text-fg tabular">{formatNumber(w.value)}</span>}
                      <span aria-hidden="true" className={cx('w-full max-w-12 rounded-t-md', w.value ? 'bg-accent' : 'h-1 bg-line')} style={w.value ? { height: `${Math.max(3, (w.value / top) * 85)}%` } : undefined} />
                    </li>
                  ))}
                </ul>
                <ul className="flex gap-2" aria-hidden="true">
                  {data.weekly.map((w) => (
                    <li key={w.label} className="min-w-0 flex-1 truncate text-center text-xs text-fg-tertiary">
                      {tr(w.label)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </QueryState>
      </Card>
    </>
  )
}
