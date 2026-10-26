import { useState } from 'react'
import { ArrowRightLeft, Search } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-ASG-21 Operational moves — Staff › Rooms (their Blocks) and Manager › Residents (every Block) (Change Spec v2
// phase 6, spec §6.13, D-14, D-31). Staff or a Manager move a student to another Bed of the same Term for a recorded
// reason; nothing is charged or refunded. A resident's move needs the meter readings of both Rooms; the old Room's door
// code changes and the new Room's code is released. The next-Term Bed follows unless the decider keeps it. After the
// next-Term fees only a Manager moves a next-Term Bed (an unpaid fee is issued again, a paid one needs the same price).
// GET /operational-moves/options?q (student code) | allocationId → { allocationId, student: { name, studentCode },
//   term: { id, name }, from: { room, bed, block, roomTypeName, roomClassName }, resident, nextTermAllocation,
//   feesIssued, nextTerm: { allocationId, term, place, state, fee } | null, beds: [{ bedId, room, bed, block, floor,
//   roomTypeName, roomClassName, roommates, termPrice }], reasons }
// POST /operational-moves { allocationId, bedId, reason, note, nextTerm: follow | keep, fromElectricity, fromWater,
//   toElectricity, toWater } → { allocationId, room, bed, nextTerm (Followed, Kept, None), note }
// GET /operational-moves?termId&block&page&pageSize → { items: [{ id, student, term, from, to, reason, note, nextTerm,
//   movedBy, movedAt }], total, reasons }

function MoveForm({ options, onDone, onLoadNext }) {
  const { notify } = useToast()
  const o = options
  const [bedId, setBedId] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [follow, setFollow] = useState('follow')
  const [read, setRead] = useState({ fromElectricity: '', fromWater: '', toElectricity: '', toWater: '' })
  const move = useMutation(
    () =>
      api.operationalMoves.move({
        allocationId: o.allocationId,
        bedId,
        reason,
        note: note.trim() || undefined,
        nextTerm: follow,
        ...(o.resident ? Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v === '' ? null : Number(v)])) : {}),
      }),
    {
      invalidates: ['operational-moves', 'inventory', 'turnover'],
      onSuccess: (r) => {
        notify({ title: t('Moved to {room} · Bed {bed}', { room: r.room, bed: r.bed }), message: tr(r.note) })
        onDone()
      },
      onError: () => {},
    },
  )
  const fields = move.error?.details?.fields ?? {}
  const bed = o.beds.find((b) => b.bedId === bedId)
  const reading = (key, label) => (
    <Field label={label} required error={fields[key]} className="flex-1">
      {(id) => <Input id={id} type="number" min="0" step="0.1" value={read[key]} onChange={(e) => setRead({ ...read, [key]: e.target.value })} />}
    </Field>
  )
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-h3 font-semibold text-fg">
            {o.student.name} · {o.student.studentCode}
          </h2>
          <p className="text-base text-fg-secondary">
            {o.nextTermAllocation ? t('Bed for {term}: ', { term: o.term.name }) : t('{term}: ', { term: o.term.name })}
            {o.from.room} · {t('Bed {bed}', { bed: o.from.bed })} · {tr(o.from.roomTypeName)} · {tr(o.from.roomClassName)}
          </p>
        </div>
        {o.resident ? <StatusTag status="Resident" /> : <StatusTag status={o.nextTermAllocation ? 'Moving in next Term' : 'Assigned – unpaid'} tone="info" />}
      </div>
      {move.error && !move.error.details?.fields && <Alert type="error" title="Could not move the student">{move.error.message}</Alert>}
      {o.nextTermAllocation && o.feesIssued && (
        <Alert type="warning" title="The next-Term fees are issued">
          {t('Only a Manager moves this Bed now: an unpaid fee is issued again for the new Bed, a paid one allows only a Bed of the same price.')}
        </Alert>
      )}
      <div className="flex flex-col gap-3 lg:flex-row">
        <Field label="New Bed" required error={fields.bedId} className="flex-1">
          {(id) => (
            <Select
              id={id}
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              options={[
                { value: '', label: 'Choose…', disabled: true },
                ...o.beds.map((b) => ({
                  value: b.bedId,
                  label: `${b.bedId} · ${tr(b.roomTypeName)} · ${tr(b.roomClassName)} · ${t(b.roommates === 1 ? '{n} roommate' : '{n} roommates', { n: b.roommates })}`,
                })),
              ]}
            />
          )}
        </Field>
        <Field label="Reason" required error={fields.reason} className="w-full lg:w-64">
          {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={[{ value: '', label: 'Choose…', disabled: true }, ...o.reasons]} />}
        </Field>
      </div>
      {bed?.termPrice != null && o.nextTermAllocation && <Note>{t('Next-Term price of this Bed: {price}', { price: formatVnd(bed.termPrice) })}</Note>}
      <Field label="Note" required={reason === 'Other'} error={fields.note}>
        {(id) => <Textarea id={id} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {o.resident && (
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium text-fg">{t('Meter readings now (both Rooms)')}</p>
          <div className="flex flex-col gap-3 lg:flex-row">
            {reading('fromElectricity', t('{room} electricity (kWh)', { room: o.from.room }))}
            {reading('fromWater', t('{room} water (m³)', { room: o.from.room }))}
            {reading('toElectricity', t('{room} electricity (kWh)', { room: bed?.room ?? t('New Room') }))}
            {reading('toWater', t('{room} water (m³)', { room: bed?.room ?? t('New Room') }))}
          </div>
        </div>
      )}
      {o.nextTerm && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium text-fg">
            {t('Bed for {term}: {room} · Bed {bed}', { term: o.nextTerm.term.name, room: o.nextTerm.place.room, bed: o.nextTerm.place.bed })}
          </legend>
          <Radio name="nextTerm" label="The next-Term Bed follows to the new Bed" checked={follow === 'follow'} onChange={() => setFollow('follow')} />
          <Radio name="nextTerm" label="Keep the next-Term Bed where it is" checked={follow === 'keep'} onChange={() => setFollow('keep')} />
          <Button variant="text" className="self-start" onClick={() => onLoadNext(o.nextTerm.allocationId)}>
            Move only the next-Term Bed instead
          </Button>
        </fieldset>
      )}
      <div className="flex justify-end gap-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" icon={ArrowRightLeft} disabled={!bedId || !reason || move.pending} onClick={() => move.run()}>
          {move.pending ? t('Moving…') : t('Move the student')}
        </Button>
      </div>
      <Note>Nothing is charged or refunded for an operational move. The student is told in the app.</Note>
    </Card>
  )
}

export default function OperationalMoves() {
  const scope = useScopeQuery()
  const [code, setCode] = useState('')
  const [target, setTarget] = useState(null)
  const [page, setPage] = useState(1)
  const options = useQuery(['operational-moves', 'options', target], ({ signal }) => api.operationalMoves.options(target, { signal }), { enabled: Boolean(target) })
  const filters = { block: scope.block, page, pageSize: 20 }
  const history = useQuery(['operational-moves', filters], ({ signal }) => api.operationalMoves.list(filters, { signal }))
  const items = history.data?.items ?? []
  return (
    <>
      <PageHeader title="Operational moves" description="Move a student to another Bed for an operational reason. Nothing is charged." />
      <form
        className="flex shrink-0 items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) setTarget({ q: code.trim().toUpperCase() })
        }}
      >
        <Field label="Student code" className="w-64">
          {(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SE190001" autoComplete="off" />}
        </Field>
        <Button type="submit" icon={Search} disabled={!code.trim()}>
          Find
        </Button>
      </form>
      {target && options.error && <Alert type="error" title="Cannot move this student" className="shrink-0">{options.error.message}</Alert>}
      {target && options.data && <MoveForm key={JSON.stringify(target)} options={options.data} onDone={() => setTarget(null)} onLoadNext={(allocationId) => setTarget({ allocationId })} />}
      <Table fill>
        <THead>
          <tr>
            <Th className="w-52">Student</Th>
            <Th className="w-40">Term</Th>
            <Th className="w-48">From → To</Th>
            <Th className="w-40">Reason</Th>
            <Th className="w-28">Next Term</Th>
            <Th>By</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={history} colSpan={6} emptyIcon={ArrowRightLeft} emptyTitle="No operational moves yet" />
          {items.map((m) => (
            <Tr key={m.id} className="[&>td]:h-13">
              <Td>
                <TwoLine primary={m.student.name} secondary={m.student.studentCode} />
              </Td>
              <Td>{m.term}</Td>
              <Td>
                {m.from} → {m.to}
              </Td>
              <Td>
                <TwoLine primary={tr(m.reason)} secondary={m.note} />
              </Td>
              <Td>{tr(m.nextTerm)}</Td>
              <Td>
                <TwoLine primary={m.movedBy} secondary={formatDateTime(m.movedAt)} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex shrink-0 justify-end">
        <Pagination total={history.data?.total ?? 0} page={page} pageSize={20} onChange={setPage} showSizeChanger={false} />
      </div>
    </>
  )
}
