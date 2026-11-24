import { useState } from 'react'
import { ArrowRightLeft, BedDouble, ListChecks, Search } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, FilterSelect, Input, Textarea } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import { BedPickerModal } from './moves/BedPickerModal'

// SCR-ASG-21 Operational moves — Staff › Rooms (their Blocks) and Manager › Residents (every Block) (Change Spec v2
// phase 6, spec §6.13, D-14, D-31). Staff or a Manager move a student to another Bed of the same Term for a recorded
// reason; nothing is charged or refunded. A resident's move needs the meter readings of both Rooms; the old Room's door
// code changes and the new Room's code is released. The next-Term Bed follows unless the decider keeps it. After the
// next-Term fees only a Manager moves a next-Term Bed (an unpaid fee is issued again, a paid one needs the same price).
// GET /operational-moves/options?q (student code) | allocationId → { allocationId, student: { name, studentCode },
//   term: { id, name }, from: { room, bed, block, roomTypeName, roomClassName }, resident, nextTermAllocation,
//   feesIssued, nextTerm: { allocationId, term, place, state, fee } | null, beds: [{ bedId, room, bed, block, floor,
//   roomTypeName, roomClassName, roommates, termPrice }], reasons, meters: { [room]: { date, electricity, water } } }
// POST /operational-moves { allocationId, bedId, reason, note, nextTerm: follow | keep, fromElectricity, fromWater,
//   toElectricity, toWater } → { allocationId, room, bed, nextTerm (Followed, Kept, None), note }
// GET /operational-moves?termId&block&page&pageSize → { items: [{ id, student, term, from, to, reason, note, nextTerm,
//   movedBy, movedAt }], total, reasons }

function MoveForm({ options, onDone, onCancel, onLoadNext }) {
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
  const [picking, setPicking] = useState(false)
  const fields = move.error?.details?.fields ?? {}
  const bed = o.beds.find((b) => b.bedId === bedId)
  const meters = o.meters ?? {}
  // The Room's latest reading under each field, so Staff compare instead of looking it up; lower is flagged.
  const reading = (key, label, room, kind, unit) => {
    const last = room ? meters[room] : null
    const previous = last?.[kind]
    const lower = previous != null && read[key] !== '' && Number(read[key]) < Number(previous)
    return (
      <Field
        label={label}
        required
        error={fields[key] ?? (lower ? t('Lower than the last reading ({value} {unit})', { value: formatNumber(previous, { decimals: 1 }), unit }) : undefined)}
        helper={
          previous != null
            ? t('Last reading: {value} {unit} · {date}', { value: formatNumber(previous, { decimals: 1 }), unit, date: formatDate(last.date) })
            : room
              ? t('No earlier reading')
              : undefined
        }
        className="flex-1"
      >
        {(id) => (
          <Input
            id={id}
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            placeholder={previous != null ? String(previous) : undefined}
            value={read[key]}
            onChange={(e) => setRead({ ...read, [key]: e.target.value })}
          />
        )}
      </Field>
    )
  }
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
        {o.resident ? <StatusTag status="Resident" /> : <StatusTag status={o.nextTermAllocation ? 'Moving in next term' : 'Assigned – unpaid'} tone="info" />}
      </div>
      {move.error && !move.error.details?.fields && <Alert type="error" title="Could not move the student">{move.error.message}</Alert>}
      {o.nextTermAllocation && o.feesIssued && (
        <Alert type="warning" title="The next-term fees are issued">
          {t('Only a manager moves this bed now: an unpaid fee is issued again for the new bed, a paid one allows only a bed of the same price.')}
        </Alert>
      )}
      <div className="flex flex-col gap-3 lg:flex-row">
        <Field label="New bed" required error={fields.bedId} className="flex-1">
          {(id) =>
            bed ? (
              <div id={id} className="flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-md border border-primary bg-primary-subtle/40 px-3 py-1">
                <span className="flex min-w-0 items-center gap-2 text-base text-fg">
                  <BedDouble size={16} aria-hidden="true" className="shrink-0 text-fg-brand" />
                  <span className="font-medium">{t('{room} · Bed {bed}', { room: bed.room, bed: bed.bed })}</span>
                  <span className="truncate text-fg-secondary">
                    · {tr(bed.roomTypeName)} · {tr(bed.roomClassName)} · {t(bed.roommates === 1 ? '{n} roommate' : '{n} roommates', { n: bed.roommates })}
                  </span>
                </span>
                <Button variant="text" size="sm" onClick={() => setPicking(true)}>
                  Change
                </Button>
              </div>
            ) : (
              <Button id={id} icon={ListChecks} className="justify-start" disabled={o.beds.length === 0} onClick={() => setPicking(true)}>
                {o.beds.length === 0 ? t('No free bed to move to') : t('View suggested beds ({n} free)', { n: o.beds.length })}
              </Button>
            )
          }
        </Field>
        <Field label="Reason" required error={fields.reason} className="w-full lg:w-64">
          {() => (
            <FilterSelect
              aria-label={t('Reason')}
              value={reason}
              onChange={setReason}
              options={[{ value: '', label: 'Choose…' }, ...o.reasons.map((r) => ({ value: r, label: tr(r) }))]}
            />
          )}
        </Field>
      </div>
      {picking && (
        <BedPickerModal open onClose={() => setPicking(false)} beds={o.beds} from={o.from} value={bedId} onChange={setBedId} showPrice={o.nextTermAllocation} />
      )}
      {bed?.termPrice != null && o.nextTermAllocation && <Note>{t('Next-term price of this bed: {price}', { price: formatVnd(bed.termPrice) })}</Note>}
      <Field label="Note" required={reason === 'Other'} error={fields.note}>
        {(id) => <Textarea id={id} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {o.resident && (
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium text-fg">{t('Meter readings now (both rooms)')}</p>
          <div className="flex flex-col gap-3 lg:flex-row">
            {reading('fromElectricity', t('{room} electricity (kWh)', { room: o.from.room }), o.from.room, 'electricity', 'kWh')}
            {reading('fromWater', t('{room} water (m³)', { room: o.from.room }), o.from.room, 'water', 'm³')}
            {reading('toElectricity', t('{room} electricity (kWh)', { room: bed?.room ?? t('New room') }), bed?.room, 'electricity', 'kWh')}
            {reading('toWater', t('{room} water (m³)', { room: bed?.room ?? t('New room') }), bed?.room, 'water', 'm³')}
          </div>
        </div>
      )}
      {o.nextTerm && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium text-fg">
            {t('Bed for {term}: {room} · Bed {bed}', { term: o.nextTerm.term.name, room: o.nextTerm.place.room, bed: o.nextTerm.place.bed })}
          </legend>
          <Radio name="nextTerm" label="The next-term bed follows to the new bed" checked={follow === 'follow'} onChange={() => setFollow('follow')} />
          <Radio name="nextTerm" label="Keep the next-term bed where it is" checked={follow === 'keep'} onChange={() => setFollow('keep')} />
          <Button variant="text" className="self-start" onClick={() => onLoadNext(o.nextTerm.allocationId)}>
            Move only the next-term bed instead
          </Button>
        </fieldset>
      )}
      <div className="flex justify-end gap-3">
        <Button onClick={onCancel}>Cancel</Button>
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
  const searching = Boolean(target) && options.loading
  return (
    <>
      <PageHeader compact title="Room transfers" tip="Transfer a student to another room or bed within the same term (maintenance, safety, conflict…). No fee." />
      <form
        className="flex shrink-0 items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const q = code.trim().toUpperCase()
          if (q) setTarget({ q })
        }}
      >
        <Field label="Student code" className="w-64">
          {(id) => (
            <Input
              id={id}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter the student code"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" icon={Search} disabled={!code.trim() || searching}>
          {searching ? t('Finding…') : t('Find')}
        </Button>
      </form>
      {target && options.error && <Alert type="error" title="Cannot move this student" className="shrink-0">{options.error.message}</Alert>}
      {target && options.data && (
        <MoveForm
          key={JSON.stringify(target)}
          options={options.data}
          onDone={() => {
            setTarget(null)
            setCode('')
          }}
          onCancel={() => setTarget(null)}
          onLoadNext={(allocationId) => setTarget({ allocationId })}
        />
      )}
      <Table fill>
        <THead>
          <tr>
            <Th className="w-52">Student</Th>
            <Th className="w-40">Term</Th>
            <Th className="w-48">From → To</Th>
            <Th className="w-40">Reason</Th>
            <Th className="w-28">Next term</Th>
            <Th>By</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={history} colSpan={6} emptyIcon={ArrowRightLeft} emptyTitle="No room transfers yet" />
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
