import { useParams } from 'react-router'
import { BellRing, Clock, ClipboardList, ShieldCheck, TriangleAlert, UserCheck, UserX, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, Meter, MeterRows } from '@/components/ui/Charts'
import { Alert, Breadcrumb, Card } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { familyDayStatusLabel } from '@/lib/familyDayStatus'
import { statsBase } from './FamilyDayStats'

// SCR-VIS-07 Statistics of one Family Day — Staff of the Block, Managers, the Admin (contract A-70): registrations,
// guests registered and arrived, each time slot (places, arrivals, No-shows, guests who stayed late), when families
// came, the overdue procedure (reminders, students' confirmations). Final once a Manager closed the Family Day.
// GET /family-days/:id/stats → { id, block, title, area, status, complete, startsAt, endsAt, closedAt, capacity, booked,
//   registrations: { total, approved, cancelledByStudent, cancelledByManager },
//   guests: { registered, arrived, checkedOut, inside, noShow, notArrived, cancelled, overstayed },
//   overdue: { overstayed, reminded, studentsReminded, safetyConfirmed, closedWithoutConfirmation },
//   fillRate, attendanceRate, averageStayMinutes, slots: [{ id, startsAt, endsAt, capacity, booked, registrations,
//   guests, fillRate, attendanceRate, averageStayMinutes }], arrivalsByHour: [{ label, value }],
//   relationships: [{ label, value }], adults, minors }

const minutes = (m) => (m == null ? '—' : m >= 60 ? t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }) : t('{m} min', { m }))

function Section({ title, children, className }) {
  return (
    <Card className={['flex flex-col gap-4', className].filter(Boolean).join(' ')}>
      <h2 className="text-h3 font-semibold text-fg">{t(title)}</h2>
      {children}
    </Card>
  )
}

export default function FamilyDayStatsDetail() {
  const { id } = useParams()
  const { user } = useSession()
  const base = statsBase(user?.role)
  const query = useQuery(['family-day-stats', id], ({ signal }) => api.familyDays.stats(id, { signal }))
  const s = query.data

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Family Day statistics', to: `${base}/family-day-stats` }, { label: s?.title ?? '…' }]} />}
        title={s?.title ?? 'Family Day statistics'}
        badge={s && <StatusTag status={s.status}>{familyDayStatusLabel(s.status)}</StatusTag>}
        description={s ? t('Block {block} · {area} · {from} – {to}', { block: s.block, area: s.area, from: formatDateTime(s.startsAt), to: formatTime(s.endsAt) }) : undefined}
      />
      <QueryState query={query} isEmpty={() => false}>
        {(d) => (
          <div className="flex flex-col gap-4">
            {!d.complete && (
              <Alert type="info" title="Figures still change">
                {t('A Manager has not closed this Family Day yet: guests who have not come count as No-shows once their time slot is over, and the figures are final after closing.')}
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                icon={ClipboardList}
                label="Registrations"
                value={formatNumber(d.registrations.approved)}
                note={t('{n} cancelled', { n: formatNumber(d.registrations.cancelledByStudent + d.registrations.cancelledByManager) })}
              />
              <KpiTile icon={Users} label="Guests registered" value={formatNumber(d.guests.registered)} note={t('{booked} of {capacity} places ({rate}%)', { booked: formatNumber(d.booked), capacity: formatNumber(d.capacity), rate: d.fillRate })} />
              <KpiTile icon={UserCheck} label="Guests who came" value={formatNumber(d.guests.arrived)} valueTone="success" note={t('{rate}% of the guests registered', { rate: d.attendanceRate })} />
              <KpiTile icon={UserX} label="No-shows" value={formatNumber(d.guests.noShow)} valueTone={d.guests.noShow ? 'warning' : undefined} note={d.guests.notArrived ? t('{n} not arrived yet', { n: formatNumber(d.guests.notArrived) }) : undefined} />
            </div>

            <Section title="Time slots">
              <Table>
                <THead>
                  <tr>
                    <Th className="w-48">Time slot</Th>
                    <Th className="w-56">Places booked</Th>
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
                    <Th align="right">Average stay</Th>
                  </tr>
                </THead>
                <TBody>
                  {d.slots.map((slot) => (
                    <Tr key={slot.id} className="[&>td]:h-12">
                      <Td className="whitespace-nowrap">{`${formatDateTime(slot.startsAt)} – ${formatTime(slot.endsAt)}`}</Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Meter value={slot.booked} max={slot.capacity} tone="info" label="Places booked" className="w-24 shrink-0" />
                          <span className="whitespace-nowrap text-sm text-fg-secondary tabular">{t('{booked} / {capacity} ({rate}%)', { booked: formatNumber(slot.booked), capacity: formatNumber(slot.capacity), rate: slot.fillRate })}</span>
                        </div>
                      </Td>
                      <Td align="right">{formatNumber(slot.registrations)}</Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Meter value={slot.guests.arrived} max={slot.guests.registered} tone="success" label="Guests who came" className="w-24 shrink-0" />
                          <span className="whitespace-nowrap text-sm text-fg-secondary tabular">{t('{arrived} / {registered} ({rate}%)', { arrived: formatNumber(slot.guests.arrived), registered: formatNumber(slot.guests.registered), rate: slot.attendanceRate })}</span>
                        </div>
                      </Td>
                      <Td align="right">{formatNumber(slot.guests.noShow)}</Td>
                      <Td align="right">{formatNumber(slot.guests.overstayed)}</Td>
                      <Td align="right">{minutes(slot.averageStayMinutes)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="When families came">
                {d.arrivalsByHour.length ? (
                  <MeterRows rows={d.arrivalsByHour.map((h) => ({ label: h.label, value: h.value, tone: 'accent' }))} labelWidth="w-16" trackWidth="flex-1" />
                ) : (
                  <p className="text-base text-fg-secondary">{t('No guest has come in yet.')}</p>
                )}
                <p className="flex items-center gap-2 text-sm text-fg-secondary">
                  <Clock size={16} aria-hidden="true" />
                  {t('Average stay: {time}', { time: minutes(d.averageStayMinutes) })}
                </p>
              </Section>

              <Section title="Who came to visit">
                {d.relationships.length ? (
                  <MeterRows rows={d.relationships.map((r) => ({ label: tr(r.label), value: r.value, tone: 'info' }))} labelWidth="w-28" trackWidth="flex-1" />
                ) : (
                  <p className="text-base text-fg-secondary">{t('No guest is registered.')}</p>
                )}
                <p className="text-sm text-fg-secondary">{t('{adults} adults · {minors} under the adult age', { adults: formatNumber(d.adults), minors: formatNumber(d.minors) })}</p>
              </Section>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Registrations">
                <MeterRows
                  rows={[
                    { label: 'Live', value: d.registrations.approved, tone: 'success' },
                    { label: 'Cancelled by the student', value: d.registrations.cancelledByStudent, tone: 'neutral' },
                    { label: 'Cancelled by a Manager', value: d.registrations.cancelledByManager, tone: 'warning' },
                  ]}
                  max={Math.max(1, d.registrations.total)}
                  labelWidth="w-48"
                  trackWidth="flex-1"
                />
                <p className="text-sm text-fg-secondary">{t('{n} registrations in all · {guests} guests of cancelled registrations', { n: formatNumber(d.registrations.total), guests: formatNumber(d.guests.cancelled) })}</p>
              </Section>

              <Section title="Guests who stayed past their time slot">
                <div className="grid grid-cols-2 gap-3">
                  <KpiTile size="md" icon={TriangleAlert} label="Stayed late" value={formatNumber(d.overdue.overstayed)} valueTone={d.overdue.overstayed ? 'warning' : undefined} note={d.guests.inside ? t('{n} still inside', { n: formatNumber(d.guests.inside) }) : undefined} />
                  <KpiTile size="md" icon={BellRing} label="Reminded" value={formatNumber(d.overdue.reminded)} note={t('{n} students told', { n: formatNumber(d.overdue.studentsReminded) })} />
                  <KpiTile size="md" icon={ShieldCheck} label="Confirmed safe by the student" value={formatNumber(d.overdue.safetyConfirmed)} valueTone={d.overdue.safetyConfirmed ? 'success' : undefined} />
                  <KpiTile size="md" icon={UserX} label="Closed by a Manager without it" value={formatNumber(d.overdue.closedWithoutConfirmation)} />
                </div>
              </Section>
            </div>

            {d.closedAt && <p className="text-sm text-fg-secondary">{t('Closed on {time}.', { time: formatDateTime(d.closedAt) })}</p>}
          </div>
        )}
      </QueryState>
    </>
  )
}
