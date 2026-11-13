import { useNavigate } from 'react-router'
import { ChartColumn, ClipboardList, TriangleAlert, UserCheck, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, Meter } from '@/components/ui/Charts'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { t } from '@/i18n'
import { familyDayStatusLabel } from '@/lib/familyDayStatus'

// SCR-VIS-06 Family Day statistics — Staff (their Blocks), Managers and the Admin (contract A-70). The Family Days that
// are over (Completed, or every time slot ended) with their figures and the totals; a row opens SCR-VIS-07.
// GET /family-day-stats?block → { totals: { familyDays, registrations, guestsRegistered, guestsArrived, noShow,
//   overstayed, attendanceRate }, items: [{ id, block, title, area, status, startsAt, endsAt, capacity, registrations,
//   guestsRegistered, guestsArrived, noShow, overstayed, attendanceRate }] }

export const statsBase = (role) => (role === 'manager' ? '/manager' : role === 'admin' ? '/admin' : '/staff')

export default function FamilyDayStats() {
  const { block } = useScopeQuery()
  const { user } = useSession()
  const navigate = useNavigate()
  const base = statsBase(user?.role)
  const query = useQuery(['family-day-stats', block], ({ signal }) => api.familyDays.overview({ block }, { signal }))
  const totals = query.data?.totals
  const items = query.data?.items ?? []

  return (
    <>
      <PageHeader title="Family Day statistics" description="Family Days that are over: registrations, guests registered and those who came, guests who stayed past their time slot." />

      <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile icon={ChartColumn} label="Family Days" value={formatNumber(totals?.familyDays)} />
        <KpiTile icon={ClipboardList} label="Registrations" value={formatNumber(totals?.registrations)} />
        <KpiTile
          icon={UserCheck}
          label="Guests who came"
          value={totals ? t('{arrived} / {registered}', { arrived: formatNumber(totals.guestsArrived), registered: formatNumber(totals.guestsRegistered) }) : '—'}
          note={totals ? t('{rate}% of the guests registered', { rate: totals.attendanceRate }) : undefined}
        />
        <KpiTile
          icon={TriangleAlert}
          label="Stayed past their time slot"
          value={formatNumber(totals?.overstayed)}
          valueTone={totals?.overstayed ? 'warning' : undefined}
          note={totals ? t('{n} No-shows', { n: formatNumber(totals.noShow) }) : undefined}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th>Family Day</Th>
            <Th className="w-20">Block</Th>
            <Th className="w-48">Time</Th>
            <Th className="w-28" align="right">
              Registrations
            </Th>
            <Th className="w-56">Guests who came</Th>
            <Th className="w-24" align="right">
              No-shows
            </Th>
            <Th className="w-28" align="right">
              Stayed late
            </Th>
            <Th className="w-36">Status</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={8} emptyIcon={Users} emptyTitle="No Family Day is over yet" />
          {items.map((d) => (
            <Tr key={d.id} className="[&>td]:h-12" onClick={() => navigate(`${base}/family-day-stats/${d.id}`)}>
              <Td>
                <TwoLine primary={d.title} secondary={d.area} />
              </Td>
              <Td>{d.block}</Td>
              <Td className="whitespace-nowrap">{d.startsAt ? `${formatDateTime(d.startsAt)} – ${formatTime(d.endsAt)}` : '—'}</Td>
              <Td align="right">{formatNumber(d.registrations)}</Td>
              <Td>
                <div className="flex items-center gap-3">
                  <Meter value={d.guestsArrived} max={d.guestsRegistered} tone="success" label="Guests who came" className="w-24 shrink-0" />
                  <span className="whitespace-nowrap text-sm text-fg-secondary tabular">
                    {t('{arrived} / {registered} ({rate}%)', { arrived: formatNumber(d.guestsArrived), registered: formatNumber(d.guestsRegistered), rate: d.attendanceRate })}
                  </span>
                </div>
              </Td>
              <Td align="right">{formatNumber(d.noShow)}</Td>
              <Td align="right">{formatNumber(d.overstayed)}</Td>
              <Td>
                <StatusTag status={d.status}>{familyDayStatusLabel(d.status)}</StatusTag>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </>
  )
}
