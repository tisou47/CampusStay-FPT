import { Fragment } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { QueryState } from '@/components/ui/States'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'

// SCR-RPT-01 Occupancy Report (Figma 72:2988)
// GET /reports/occupancy?termId → { asOf, roomClasses: [string], note,
//   summary: { capacity, rooms, blocks, allocated, checkedIn, notArrived, waitlisted, waitlistNote },
//   blocks: [{ block, rows: [{ roomTypeName, cells: [{ allocated, capacity }] }] }] }
// GET /exports/occupancy?termId (.xlsx)

const sum = (cells, key) => cells.reduce((n, c) => n + (c[key] ?? 0), 0)

export default function OccupancyReport() {
  const { term } = useSession()
  const { notifyError } = useToast()
  const query = useQuery(['reports', 'occupancy', term?.id], ({ signal }) => api.reports.occupancy({ termId: term?.id }, { signal }))
  const d = query.data
  const s = d?.summary
  const exporting = useMutation(() => api.exports.download('occupancy', { termId: term?.id }, 'occupancy.xlsx'), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title="Occupancy Report"
        description={`Allocated Beds out of capacity${term ? ` · ${term.name}` : ''}${d?.asOf ? ` · as of ${formatDateTime(d.asOf)}` : ''}`}
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={!d || exporting.pending}>
            Export .xlsx
          </Button>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Capacity" value={s ? `${formatNumber(s.capacity)} Beds` : '—'} note={s ? `${formatNumber(s.rooms)} Rooms in ${s.blocks} Blocks` : null} />
        <KpiTile size="md" label="Allocated" value={formatNumber(s?.allocated)} note={s?.capacity ? `${formatPercent(s.allocated / s.capacity)} of capacity` : null} />
        <KpiTile size="md" label="Checked in" value={formatNumber(s?.checkedIn)} note={s ? `${formatNumber(s.notArrived)} not yet arrived` : null} />
        <KpiTile size="md" label="Waitlisted" value={formatNumber(s?.waitlisted)} note={s?.waitlistNote} />
      </div>
      <div className="flex shrink-0 items-start justify-between">
        <h2 className="text-h3 font-semibold text-fg">Allocated / capacity by Room Type and Room Class</h2>
        {d?.note && <span className="text-sm text-fg-tertiary">{d.note}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-line bg-surface">
        <QueryState query={query} isEmpty={(x) => !x.blocks?.length}>
          {(data) => (
            <table className="w-full border-separate border-spacing-0 text-base">
              <thead className="sticky top-0 z-10 bg-subtle">
                <tr className="text-sm text-fg-secondary">
                  <th scope="col" className="w-30 border-b border-line px-4 py-2 text-left font-medium">
                    Block
                  </th>
                  <th scope="col" className="w-28 border-b border-line px-3 py-2 text-left font-medium">
                    Room Type
                  </th>
                  {data.roomClasses.map((c) => (
                    <th key={c} scope="col" className="border-b border-line px-3 py-2 text-right font-medium">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="w-35 border-b border-line px-4 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>*]:border-b-0">
                {data.blocks.map((b) => (
                  <Fragment key={b.block}>
                    {b.rows.map((row, i) => (
                      <tr key={row.roomTypeName} className="*:border-b *:border-line">
                        <th scope="row" className="px-4 py-1.75 text-left font-medium text-fg">
                          {i === 0 ? `Block ${b.block}` : <span className="sr-only">Block {b.block}</span>}
                        </th>
                        <td className="px-3 py-1.75 text-fg">{row.roomTypeName}</td>
                        {row.cells.map((c, j) => (
                          <td key={data.roomClasses[j]} className="px-3 py-1.75 text-right text-fg tabular" title={c.capacity ? `${formatPercent(c.allocated / c.capacity, 0)} allocated` : undefined}>
                            {formatNumber(c.allocated)} / {formatNumber(c.capacity)}
                          </td>
                        ))}
                        <td className="px-4 py-1.75 text-right text-fg tabular">
                          {formatNumber(sum(row.cells, 'allocated'))} / {formatNumber(sum(row.cells, 'capacity'))}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </QueryState>
      </div>
    </>
  )
}
