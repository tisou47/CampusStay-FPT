import { Fragment } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-RPT-01 Occupancy Report (Figma 72:2988)
// GET /reports/occupancy?termId → { asOf, roomClasses: [string], note,
//   summary: { capacity, rooms, blocks, allocated, checkedIn, notArrived, waitlisted, waitlistNote },
//   blocks: [{ block, rows: [{ roomTypeName, cells: [{ allocated, capacity }] }] }] }
// GET /exports/occupancy?termId (.csv)

const sum = (cells, key) => cells.reduce((n, c) => n + (c[key] ?? 0), 0)

export default function OccupancyReport() {
  const { term } = useSession()
  // The Manager's Term and Block selectors (top bar) choose what the report covers.
  const params = useScopeQuery()
  const { notifyError } = useToast()
  const query = useQuery(['reports', 'occupancy', params], ({ signal }) => api.reports.occupancy(params, { signal }))
  const d = query.data
  const s = d?.summary
  const exporting = useMutation(() => api.exports.download('occupancy', params, 'occupancy.csv'), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title="Occupancy report"
        description={[term?.name, d?.asOf && t('as of {date}', { date: formatDateTime(d.asOf) })].filter(Boolean).join(' · ')}
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={!d || exporting.pending}>
            Export CSV
          </Button>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Capacity" value={s ? t('{n} beds', { n: formatNumber(s.capacity) }) : '—'} note={s ? t('{rooms} rooms in {blocks} blocks', { rooms: formatNumber(s.rooms), blocks: s.blocks }) : null} />
        <KpiTile size="md" label="Allocated" value={formatNumber(s?.allocated)} note={s?.capacity ? t('{p} of capacity', { p: formatPercent(s.allocated / s.capacity) }) : null} />
        <KpiTile size="md" label="Checked in" value={formatNumber(s?.checkedIn)} note={s ? t('{n} not yet arrived', { n: formatNumber(s.notArrived) }) : null} />
        <KpiTile size="md" label="Waitlisted" value={formatNumber(s?.waitlisted)} note={s?.waitlistNote} />
      </div>
      <div className="flex shrink-0 items-start justify-between">
        <h2 className="text-h3 font-semibold text-fg">{t('Allocated / capacity by room type and room tier')}</h2>
        {d?.note && <span className="text-sm text-fg-tertiary">{tr(d.note)}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-line bg-surface">
        <QueryState query={query} isEmpty={(x) => !x.blocks?.length}>
          {(data) => (
            <Table size="sm" bare fill>
              <THead>
                <tr>
                  <Th className="w-30">Block</Th>
                  <Th className="w-28">Room type</Th>
                  {data.roomClasses.map((c) => (
                    <Th key={c} align="right">
                      {c}
                    </Th>
                  ))}
                  <Th align="right" className="w-35">
                    Total
                  </Th>
                </tr>
              </THead>
              <TBody>
                {data.blocks.map((b) => (
                  <Fragment key={b.block}>
                    {b.rows.map((row, i) => (
                      <Tr key={row.roomTypeName}>
                        <Td rowHeader>{i === 0 ? t('Block {code}', { code: b.block }) : <span className="sr-only">{t('Block {code}', { code: b.block })}</span>}</Td>
                        <Td>{tr(row.roomTypeName)}</Td>
                        {row.cells.map((c, j) => (
                          <Td key={data.roomClasses[j]} align="right" title={c.capacity ? t('{p} allocated', { p: formatPercent(c.allocated / c.capacity, 0) }) : undefined}>
                            {formatNumber(c.allocated)} / {formatNumber(c.capacity)}
                          </Td>
                        ))}
                        <Td align="right">
                          {formatNumber(sum(row.cells, 'allocated'))} / {formatNumber(sum(row.cells, 'capacity'))}
                        </Td>
                      </Tr>
                    ))}
                  </Fragment>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </div>
    </>
  )
}
