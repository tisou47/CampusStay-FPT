import { useState } from 'react'
import { ArrowRightLeft, DoorOpen, Gauge, KeyRound, LogOut, Sofa } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// Term transition › Turnover (spec §5.1 M9, §6.16): between the current Term's check-out day and the next Term's
// check-in start leavers check out at the desk, movers move to their next-Term Bed (they live there once its door code
// is released to them), and every Room whose residents change needs a meter reading and a new door code. Rooms whose
// furniture does not match their next-Term class are a Manager's task (set the class back or finish the moves).
// GET /turnover?termId&block → { term, previousTerm, checkOutBy, checkInStart, counts: { leavers, checkedOut, overdue,
//   movers, staying, arriving, rooms, codesToSet, notMatching }, leavers: [{ allocationId, student: { name, studentCode },
//   room, bed, block, status (To check out, Checked out, Overdue) }], movers: [{ student, from, to, fee, moved }],
//   rooms: [{ room, block, leaving, arriving, doorCodeReady, roomClass, matches, lastMeterCut }] }
// POST /turnover/meter-cuts { room, electricity, water } → 204

function MeterCut({ room, onClose }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ electricity: '', water: '' })
  const save = useMutation(() => api.renewals.meterCut({ room: room.room, electricity: Number(form.electricity), water: Number(form.water) }), {
    invalidates: ['turnover'],
    onSuccess: () => {
      notify({ title: 'Meter reading saved', message: t('Room {room}: the month is split between those who leave and those who arrive.', { room: room.room }) })
      onClose()
    },
    onError: () => {},
  })
  const fields = save.error?.details?.fields ?? {}
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Meter reading · Room {room}', { room: room.room })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.pending || form.electricity === '' || form.water === ''} onClick={() => save.run()}>
            {save.pending ? t('Saving…') : t('Save reading')}
          </Button>
        </>
      }
    >
      {save.error && !save.error.details?.fields && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <Field label="Electricity (kWh)" required error={fields.electricity}>
        {(id) => <Input id={id} type="number" min="0" step="0.1" value={form.electricity} onChange={(e) => setForm({ ...form, electricity: e.target.value })} />}
      </Field>
      <Field label="Water (m³)" required error={fields.water}>
        {(id) => <Input id={id} type="number" min="0" step="0.1" value={form.water} onChange={(e) => setForm({ ...form, water: e.target.value })} />}
      </Field>
    </Modal>
  )
}

export default function Turnover({ termId }) {
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [reading, setReading] = useState(null)
  const filters = { termId, block: scope.block }
  const query = useQuery(['turnover', filters], ({ signal }) => api.renewals.turnover(filters, { signal }))
  return (
    <QueryState query={query} isEmpty={() => false}>
      {(d) => (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <p className="shrink-0 text-base text-fg-secondary">
            {t('Leavers of {previous} check out by {checkOut}; {term} check-in starts on {checkIn}.', {
              previous: d.previousTerm.name,
              checkOut: formatDate(d.checkOutBy),
              term: d.term.name,
              checkIn: formatDate(d.checkInStart),
            })}
          </p>
          <div className="flex shrink-0 flex-wrap gap-4">
            <KpiTile size="md" icon={LogOut} label="Leavers" value={`${formatNumber(d.counts.checkedOut)} / ${formatNumber(d.counts.leavers)}`} note="Checked out / all" valueTone={d.counts.overdue ? 'error' : undefined} />
            <KpiTile size="md" icon={ArrowRightLeft} label="Movers" value={formatNumber(d.counts.movers)} note={t('{n} stay in their Room', { n: formatNumber(d.counts.staying) })} />
            <KpiTile size="md" icon={DoorOpen} label="Arriving" value={formatNumber(d.counts.arriving)} note="New students of the next Term" />
            <KpiTile size="md" icon={KeyRound} label="Codes to set" value={formatNumber(d.counts.codesToSet)} note={t('{n} Rooms change residents', { n: formatNumber(d.counts.rooms) })} valueTone={d.counts.codesToSet ? 'warning' : undefined} />
            <KpiTile size="md" icon={Sofa} label="Furniture to fix" value={formatNumber(d.counts.notMatching)} note="Rooms not matching their class" valueTone={d.counts.notMatching ? 'warning' : undefined} />
          </div>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <Card padding="none" className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between px-4 pt-3">
                <h2 className="text-h3 font-semibold text-fg">{t('Leavers')}</h2>
                <Button variant="text" to={`${base}/check-out`}>
                  Open the check-out desk
                </Button>
              </div>
              <Table>
                <THead>
                  <tr>
                    <Th>Student</Th>
                    <Th className="w-32">Bed</Th>
                    <Th className="w-36">Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {d.leavers.length === 0 && (
                    <Tr>
                      <Td colSpan={3} className="text-fg-secondary">
                        {t('Nobody leaves.')}
                      </Td>
                    </Tr>
                  )}
                  {d.leavers.map((l) => (
                    <Tr key={l.allocationId}>
                      <Td>
                        <TwoLine primary={l.student.name} secondary={l.student.studentCode} />
                      </Td>
                      <Td>
                        {l.room}-{l.bed}
                      </Td>
                      <Td>
                        <StatusTag status={l.status} tone={l.status === 'To check out' ? 'warning' : undefined} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
            <Card padding="none" className="flex min-w-0 flex-1 flex-col">
              <h2 className="px-4 pt-3 text-h3 font-semibold text-fg">{t('Movers')}</h2>
              <Table>
                <THead>
                  <tr>
                    <Th>Student</Th>
                    <Th className="w-48">From → To</Th>
                    <Th className="w-36">Next-Term fee</Th>
                  </tr>
                </THead>
                <TBody>
                  {d.movers.length === 0 && (
                    <Tr>
                      <Td colSpan={3} className="text-fg-secondary">
                        {t('Nobody changes Room.')}
                      </Td>
                    </Tr>
                  )}
                  {d.movers.map((m) => (
                    <Tr key={`${m.student.studentCode}-${m.to}`}>
                      <Td>
                        <TwoLine primary={m.student.name} secondary={m.student.studentCode} />
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          {m.from} → {m.to}
                          {m.moved && <Tag tone="success">Moved</Tag>}
                        </span>
                      </Td>
                      <Td>{m.fee ? <StatusTag status={m.fee} /> : <span className="text-fg-tertiary">{t('Not issued')}</span>}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>
          <Card padding="none" className="flex shrink-0 flex-col">
            <h2 className="px-4 pt-3 text-h3 font-semibold text-fg">{t('Rooms whose residents change')}</h2>
            <Table>
              <THead>
                <tr>
                  <Th className="w-24">Room</Th>
                  <Th className="w-28">Leaving</Th>
                  <Th className="w-28">Arriving</Th>
                  <Th className="w-36">Door code</Th>
                  <Th>Room Class next Term</Th>
                  <Th className="w-56">Meter reading</Th>
                </tr>
              </THead>
              <TBody>
                {d.rooms.length === 0 && (
                  <Tr>
                    <Td colSpan={6} className="text-fg-secondary">
                      {t('No Room changes residents.')}
                    </Td>
                  </Tr>
                )}
                {d.rooms.map((r) => (
                  <Tr key={r.room}>
                    <Td className="font-medium">{r.room}</Td>
                    <Td>{formatNumber(r.leaving)}</Td>
                    <Td>{formatNumber(r.arriving)}</Td>
                    <Td>
                      <StatusTag status={r.doorCodeReady ? 'Ready' : 'Change needed'} />
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        {tr(r.roomClass)}
                        <StatusTag status={r.matches ? 'Matches' : 'Does not match'} />
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-fg-secondary">{r.lastMeterCut ? formatDate(r.lastMeterCut) : t('None yet')}</span>
                        <Button size="sm" icon={Gauge} onClick={() => setReading(r)}>
                          Record reading
                        </Button>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
          {reading && <MeterCut room={reading} onClose={() => setReading(null)} />}
        </div>
      )}
    </QueryState>
  )
}
