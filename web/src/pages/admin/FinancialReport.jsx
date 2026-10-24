import { useState } from 'react'
import { Download, Info } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Select } from '@/components/ui/Field'
import { QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-RPT-02 Financial Report (Figma 72:3428)
// GET /reports/financial?termId&block → { asOf, blocks: [string],
//   rows: [{ block, invoiced, collected, outstanding, refunded }],
//   summary: { invoiced, collected, outstanding, refunded, outstandingInvoices, overdueInvoices, refundCount } }
// GET /exports/financial?termId&block (.xlsx)

const columns = ['invoiced', 'collected', 'outstanding', 'refunded']
const rate = (r) => (r.invoiced ? formatPercent(r.collected / r.invoiced) : '—')

export default function FinancialReport() {
  const { term } = useSession()
  const { notifyError } = useToast()
  const [block, setBlock] = useState('')
  const params = { termId: term?.id, block: block || undefined }
  const query = useQuery(['reports', 'financial', params], ({ signal }) => api.finance.report(params, { signal }))
  const d = query.data
  const s = d?.summary
  const exporting = useMutation(() => api.exports.download('financial', params, 'financial.xlsx'), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title="Financial Report"
        description={`${t('Invoiced, collected and refunded amounts (VND)')}${term ? ` · ${term.name}` : ''}${d?.asOf ? ` · ${t('as of {date}', { date: formatDateTime(d.asOf) })}` : ''}`}
        actions={
          <>
            <Select aria-label={t('Block')} wrapperClassName="w-35" value={block} onChange={(e) => setBlock(e.target.value)} options={[{ value: '', label: 'All Blocks' }, ...(d?.blocks ?? []).map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))]} />
            <Button icon={Download} onClick={() => exporting.run()} disabled={!d || exporting.pending}>
              Export .xlsx
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Invoiced" value={formatNumber(s?.invoiced)} note="Deposits + balances + room changes + utilities" />
        <KpiTile size="md" label="Collected" value={formatNumber(s?.collected)} note={s ? rate(s) : null} />
        <KpiTile size="md" label="Outstanding" value={formatNumber(s?.outstanding)} note={s ? t('{n} Invoices, {overdue} overdue', { n: formatNumber(s.outstandingInvoices), overdue: formatNumber(s.overdueInvoices) }) : null} />
        <KpiTile size="md" label="Refunded" value={formatNumber(s?.refunded)} note={s ? t('{n} refunds', { n: formatNumber(s.refundCount) }) : null} />
      </div>
      <div className="flex min-h-0 shrink flex-col overflow-auto rounded-lg border border-line bg-surface">
        <QueryState query={query} isEmpty={(x) => !x.rows?.length}>
          {(data) => {
            const rows = data.rows.length > 1 ? [...data.rows, { block: 'Total', ...data.summary, isTotal: true }] : data.rows
            return (
              <table className="w-full border-separate border-spacing-0 text-base">
                <thead className="sticky top-0 z-10 bg-subtle">
                  <tr className="text-sm text-fg-secondary">
                    <th scope="col" className="w-40 border-b border-line px-4 py-2.5 text-left font-medium">
                      {t('Block')}
                    </th>
                    {['Invoiced', 'Collected', 'Outstanding', 'Refunded'].map((h) => (
                      <th key={h} scope="col" className="border-b border-line px-3 py-2.5 text-right font-medium">
                        {t(h)}
                      </th>
                    ))}
                    <th scope="col" className="w-35 border-b border-line px-4 py-2.5 text-right font-medium">
                      {t('Collection rate')}
                    </th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>*]:border-b-0">
                  {rows.map((r) => (
                    <tr key={r.block} className={cx('*:border-b *:border-line', r.isTotal && 'bg-subtle font-medium')}>
                      <th scope="row" className="px-4 py-3 text-left font-medium text-fg">
                        {r.isTotal ? t('Total') : data.blocks?.includes(r.block) ? t('Block {code}', { code: r.block }) : tr(r.block)}
                      </th>
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-3 text-right text-fg tabular">
                          {formatNumber(r[c])}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right text-fg tabular">{rate(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }}
        </QueryState>
      </div>
      <p className="flex shrink-0 items-start gap-2 text-sm text-fg-tertiary">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        {t('Outstanding = invoiced − collected; refunds are reported separately and do not reduce outstanding. Each Block matches the Manager finance view.')}
      </p>
    </>
  )
}
