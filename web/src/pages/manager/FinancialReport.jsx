import { Download, Info } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
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
  // The Manager's Term and Block selectors (top bar) choose what the report covers.
  const params = useScopeQuery()
  const query = useQuery(['reports', 'financial', params], ({ signal }) => api.finance.report(params, { signal }))
  const d = query.data
  const s = d?.summary
  const exporting = useMutation(() => api.exports.download('financial', params, 'financial.xlsx'), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title="Financial report"
        actions={
          <>
            <Button icon={Download} onClick={() => exporting.run()} disabled={!d || exporting.pending}>
              Export .xlsx
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Invoiced" value={formatNumber(s?.invoiced)} note="Deposits + balances + room changes + utilities" />
        <KpiTile size="md" label="Collected" value={formatNumber(s?.collected)} note={s ? rate(s) : null} />
        <KpiTile size="md" label="Outstanding" value={formatNumber(s?.outstanding)} note={s ? t('{n} invoices, {overdue} overdue', { n: formatNumber(s.outstandingInvoices), overdue: formatNumber(s.overdueInvoices) }) : null} />
        <KpiTile size="md" label="Refunded" value={formatNumber(s?.refunded)} note={s ? t('{n} refunds', { n: formatNumber(s.refundCount) }) : null} />
      </div>
      <div className="flex min-h-0 shrink flex-col overflow-auto rounded-lg border border-line bg-surface">
        <QueryState query={query} isEmpty={(x) => !x.rows?.length}>
          {(data) => {
            const rows = data.rows.length > 1 ? [...data.rows, { block: 'Total', ...data.summary, isTotal: true }] : data.rows
            return (
              <Table bare fill>
                <THead>
                  <tr>
                    <Th className="w-40">Block</Th>
                    {['Invoiced', 'Collected', 'Outstanding', 'Refunded'].map((h) => (
                      <Th key={h} align="right">
                        {h}
                      </Th>
                    ))}
                    <Th align="right" className="w-35">
                      Collection rate
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <Tr key={r.block} className={cx(r.isTotal && 'bg-subtle font-medium')}>
                      <Td rowHeader>{r.isTotal ? t('Total') : data.blocks?.includes(r.block) ? t('Block {code}', { code: r.block }) : tr(r.block)}</Td>
                      {columns.map((c) => (
                        <Td key={c} align="right">
                          {formatNumber(r[c])}
                        </Td>
                      ))}
                      <Td align="right">{rate(r)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )
          }}
        </QueryState>
      </div>
      <p className="flex shrink-0 items-start gap-2 text-sm text-fg-tertiary">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        {t('Outstanding = invoiced − collected; refunds are reported separately and do not reduce outstanding. Each block matches the manager finance view.')}
      </p>
    </>
  )
}
