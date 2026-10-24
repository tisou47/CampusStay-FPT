import { Banknote, Bed, Download, FileText, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { formatDate, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-RPT-10 Block Reports (Figma 70:1180)
// GET /reports/block?termId&block → { allocated, weekly: [{ label, value }], notCheckedIn, followUpBy }
// Exports: GET /exports/block-occupancy|block-collections|block-maintenance|block-residents?termId&block (.xlsx)

const reports = [
  { key: 'occupancy', icon: Bed, title: 'Occupancy', body: 'Beds by Floor, Room Type and Room Class' },
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
  const top = Math.max(1, d?.allocated ?? 0, ...(d?.weekly ?? []).map((w) => w.value))

  return (
    <>
      <PageHeader
        title={block ? t('Reports · Block {code}', { code: block }) : 'Reports'}
        description={`${term ? `${term.name} · ` : ''}${t('Data refreshes nightly. Exports are .xlsx and include the Blocks in your scope.')}`}
      />

      <div className="flex shrink-0 items-stretch gap-4">
        {reports.map((r) => {
          const Glyph = r.icon
          return (
            <Card key={r.key} padding="sm" className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
                <Glyph size={20} aria-hidden="true" className="text-fg-brand" />
                {t(r.title)}
              </h2>
              <p className="text-sm text-fg-secondary">{t(r.body)}</p>
              <Button icon={Download} onClick={() => exporting.run(r)} disabled={exporting.pending} className="mt-auto">
                Export .xlsx
              </Button>
            </Card>
          )
        })}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-start justify-between">
          <h2 className="text-h3 font-semibold text-fg">{t('Checked-in residents by week')}</h2>
          {d?.allocated != null && <span className="text-sm text-fg-tertiary">{t('of {n} allocated', { n: formatNumber(d.allocated) })}</span>}
        </div>
        <QueryState query={query} compact isEmpty={(x) => !x.weekly?.length} empty={<EmptyBlock title="No check-ins yet this Term" />}>
          {(data) => (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <ul className="flex min-h-0 flex-1 items-end gap-10 px-6 pt-2" aria-label={t('Checked-in residents by week')}>
                {data.weekly.map((w) => (
                  <li key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={t('{week}: {n} checked in', { week: tr(w.label), n: formatNumber(w.value) })}>
                    <span className="text-base font-medium text-fg tabular">{formatNumber(w.value)}</span>
                    <span aria-hidden="true" className={w.value ? 'w-14 rounded-t-sm bg-accent' : 'h-0.5 w-14 rounded-t-sm bg-line'} style={w.value ? { height: `${Math.max(2, (w.value / top) * 80)}%` } : undefined} />
                    <span className="text-sm whitespace-nowrap text-fg-secondary">{tr(w.label)}</span>
                  </li>
                ))}
              </ul>
              <div className="h-px w-full shrink-0 bg-line-strong" />
              {data.notCheckedIn != null && (
                <p className="shrink-0 text-sm text-fg-tertiary">
                  {t('{n} allocated students have not checked in yet.', { n: formatNumber(data.notCheckedIn) })}
                  {data.followUpBy ? ` ${t('Staff contact them before {date}.', { date: formatDate(data.followUpBy) })}` : ''}
                </p>
              )}
            </div>
          )}
        </QueryState>
      </Card>
    </>
  )
}
