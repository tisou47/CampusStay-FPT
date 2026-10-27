import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Layers, Plus, RotateCcw, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { SlaBadge, StatusTag } from '@/components/ui/Tag'
import { countLines } from '@/lib/furniture'
import { formatDateTime, formatVnd } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// Statuses of requests already decided: no time left to show.
const DECIDED = ['Approved', 'Rejected', 'Cancelled', 'Set back', 'Declined', 'Expired']

// Term transition › Room Class changes (spec §6.11, D-04). A continuing resident (or a Manager) asks for another class
// of a Room for the next Term; every other continuing resident must agree; Staff of the Block check the furniture and
// decide by M4; a Manager sets the class back when the furniture did not follow (the only price difference left).
// GET /room-class-changes?termId&block&status → { items: [{ id, room, block, fromClass, toClass, requestedBy,
//   requesterRole, agreed, asked, status, submittedAt, dueAt, decidedAt }], total, window }
// GET /room-class-changes/:id → { item, termName, reason, fromPrice, toPrice, residents: [{ name, status }],
//   furniture: { enough, missing: [{ type, typeVi, quantity, available }], extra, reserved, removing }, decisionNote, decidedBy }
// POST /room-class-changes/:id/decision { decision, note } · POST /room-class-changes/:id/set-back { note } (Manager)
// POST /room-class-changes { termId, room, roomClassId, reason } (Manager, supply reasons)

const statuses = ['Awaiting consent', 'Waiting for Staff', 'Approved', 'Rejected', 'Cancelled', 'Set back']

function Detail({ id }) {
  const base = useRoleBase()
  const manager = base === '/manager'
  const { notify } = useToast()
  const [mode, setMode] = useState(null)
  const [note, setNote] = useState('')
  const query = useQuery(['room-class-changes', 'detail', id], ({ signal }) => api.roomClassChanges.get(id, { signal }))
  const act = useMutation(
    () =>
      mode === 'set-back'
        ? api.roomClassChanges.setBack(id, { note: note.trim() })
        : api.roomClassChanges.decide(id, { decision: mode, note: note.trim() || undefined }),
    {
      invalidates: ['room-class-changes', 'next-term-requests', 'renewal-overview'],
      onSuccess: (d) => {
        notify({ title: t('{id}: {status}', { id: d.item.id, status: tr(d.item.status) }), message: tr(d.decisionNote) })
        setMode(null)
        setNote('')
      },
      onError: () => {},
    },
  )
  return (
    <Card className="flex min-h-0 w-104 shrink-0 flex-col gap-3.5 overflow-y-auto">
      <QueryState query={query} compact>
        {(d) => {
          const open = d.item.status === 'Awaiting consent' || d.item.status === 'Waiting for Staff'
          const f = d.furniture
          return (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-fg-tertiary">{d.item.id}</span>
                  <h2 className="text-h3 font-semibold text-fg">{t('Room {room}', { room: d.item.room })}</h2>
                </div>
                <StatusTag status={d.item.status} />
              </div>
              <dl className="flex flex-col gap-2 text-base">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('Change')}</dt>
                  <dd className="text-fg">{tr(d.item.fromClass)} → {tr(d.item.toClass)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('Next-Term price per Bed')}</dt>
                  <dd className="text-fg">
                    {formatVnd(d.fromPrice)} → {formatVnd(d.toPrice)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('Asked by')}</dt>
                  <dd className="text-fg">
                    {d.item.requestedBy} · {tr(d.item.requesterRole)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('Decide by')}</dt>
                  <dd className="text-fg">{formatDateTime(d.item.dueAt)}</dd>
                </div>
              </dl>
              {d.reason && <Note>{d.reason}</Note>}
              <h3 className="text-base font-semibold text-fg">{t('Continuing residents')}</h3>
              <ul className="flex flex-col gap-1.5">
                {d.residents.map((r) => (
                  <li key={r.name} className="flex items-center justify-between text-base">
                    <span>{r.name}</span>
                    <StatusTag status={r.status} />
                  </li>
                ))}
              </ul>
              {f && (
                <>
                  <h3 className="text-base font-semibold text-fg">{t('Furniture')}</h3>
                  {f.missing.length > 0 && (
                    <p className="text-base text-fg-secondary">
                      {t('Missing: {items}', { items: countLines(f.missing) })}
                      {open && ` · ${t('in the Block store: {items}', { items: f.missing.map((m) => `${m.available}`).join(' · ') })}`}
                    </p>
                  )}
                  {f.extra.length > 0 && <p className="text-base text-fg-secondary">{t('To remove: {items}', { items: countLines(f.extra) })}</p>}
                  {!f.missing.length && !f.extra.length && <p className="text-base text-fg-secondary">{t('The Room already has what this class needs.')}</p>}
                  {f.reserved?.length > 0 && <p className="text-sm text-fg-tertiary">{t('Reserved: {codes}', { codes: f.reserved.join(', ') })}</p>}
                  {f.removing?.length > 0 && <p className="text-sm text-fg-tertiary">{t('Planned to the store: {codes}', { codes: f.removing.join(', ') })}</p>}
                  {open && !f.enough && <Alert type="warning" title="The Block store lacks furniture">{t('Bring the missing items to the store before approving, or reject the change.')}</Alert>}
                </>
              )}
              {d.decisionNote && !open && <Note>{tr(d.decisionNote)}</Note>}
              {open && (
                <div className="flex gap-2">
                  <Button variant="danger" icon={X} onClick={() => setMode('Rejected')}>
                    Reject
                  </Button>
                  <Button variant="primary" icon={Check} disabled={d.item.status !== 'Waiting for Staff'} onClick={() => setMode('Approved')}>
                    Approve
                  </Button>
                </div>
              )}
              {manager && d.item.status === 'Approved' && (
                <Button icon={RotateCcw} onClick={() => setMode('set-back')}>
                  Set the class back
                </Button>
              )}
              <Modal
                open={Boolean(mode)}
                onClose={() => setMode(null)}
                title={mode === 'Approved' ? t('Approve the change of Room {room}', { room: d.item.room }) : mode === 'set-back' ? t('Set Room {room} back to {cls}', { room: d.item.room, cls: tr(d.item.fromClass) }) : t('Reject the change of Room {room}', { room: d.item.room })}
                footer={
                  <>
                    <Button onClick={() => setMode(null)}>Cancel</Button>
                    <Button variant={mode === 'Approved' ? 'primary' : 'danger'} disabled={act.pending || (mode !== 'Approved' && !note.trim())} onClick={() => act.run()}>
                      {act.pending ? t('Saving…') : mode === 'Approved' ? t('Approve') : mode === 'set-back' ? t('Set back') : t('Reject')}
                    </Button>
                  </>
                }
              >
                {act.error && <Alert type="error" title="Could not save">{act.error.details?.fields?.note ?? act.error.message}</Alert>}
                {mode === 'Approved' && <p className="text-base text-fg-secondary">{t('The Room is {cls} from {term}; every next-Term fee of the Room uses its price. The missing items are reserved from the store and moved at the turnover.', { cls: tr(d.item.toClass), term: d.termName })}</p>}
                {mode === 'set-back' && <p className="text-base text-fg-secondary">{t('Unpaid next-Term fees of the Room are issued again at the old price; a paid one gets the difference charged or refunded.')}</p>}
                <Field label={mode === 'Approved' ? 'Note to the residents (optional)' : 'Why (the residents see it)'} required={mode !== 'Approved'}>
                  {(fid) => <Textarea id={fid} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
                </Field>
              </Modal>
            </>
          )
        }}
      </QueryState>
    </Card>
  )
}

function NewChange({ termId, onClose }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ room: '', roomClassId: '', reason: '' })
  const catalog = useQuery(['catalog', termId], ({ signal }) => api.catalog.get({ termId }, { signal }))
  const create = useMutation(() => api.roomClassChanges.create({ termId, ...form, room: form.room.trim().toUpperCase() }), {
    invalidates: ['room-class-changes', 'next-term-requests'],
    onSuccess: (r) => {
      notify({ title: 'Room Class change created', message: t('{id}: {status}', { id: r.id, status: tr(r.status) }) })
      onClose()
    },
    onError: () => {},
  })
  const fields = create.error?.details?.fields ?? {}
  return (
    <Modal
      open
      onClose={onClose}
      title="Change the Room Class of a Room"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={create.pending || !form.room.trim() || !form.roomClassId || !form.reason.trim()} onClick={() => create.run()}>
            {create.pending ? t('Saving…') : t('Create')}
          </Button>
        </>
      }
    >
      {create.error && !create.error.details?.fields && <Alert type="error" title="Could not create the change">{create.error.message}</Alert>}
      <Field label="Room" required error={fields.room}>
        {(id) => <Input id={id} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="A-306" />}
      </Field>
      <Field label="New Room Class" required error={fields.roomClassId}>
        {(id) => (
          <Select
            id={id}
            value={form.roomClassId}
            onChange={(e) => setForm({ ...form, roomClassId: e.target.value })}
            options={[{ value: '', label: 'Choose…', disabled: true }, ...(catalog.data?.roomClasses ?? []).map((c) => ({ value: c.id, label: tr(c.name) }))]}
          />
        )}
      </Field>
      <Field label="Why" required error={fields.reason}>
        {(id) => <Textarea id={id} rows={2} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}
      </Field>
      <Note>Continuing residents of the Room are asked to agree, as for a student's request.</Note>
    </Modal>
  )
}

export default function RoomClassChanges({ termId }) {
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const filters = { termId, block: scope.block, status: status || undefined, pageSize: 100 }
  const query = useQuery(['room-class-changes', filters], ({ signal }) => api.roomClassChanges.list(filters, { signal }))
  const items = query.data?.items ?? []
  const selectedId = params.get('id') ?? items[0]?.id
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Select
          wrapperClassName="w-60"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[{ value: '', label: 'Status: All' }, ...statuses.map((s) => ({ value: s, label: t('Status: {s}', { s: t(s) }) }))]}
        />
        {base === '/manager' && (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            Change a Room's class
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Table fill className="min-w-0 flex-1">
          <THead>
            <tr>
              <Th className="w-40">Request</Th>
              <Th className="w-24">Room</Th>
              <Th>Change</Th>
              <Th className="w-28">Consents</Th>
              <Th className="w-40">Status</Th>
              <Th className="w-36">Decide by</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={6} emptyIcon={Layers} emptyTitle="No Room Class changes" />
            {items.map((r) => (
              <Tr key={r.id} selected={r.id === selectedId} onClick={() => setParams({ termId, id: r.id })} className="[&>td]:h-13">
                <Td className="font-medium text-fg-brand">{r.id}</Td>
                <Td>{r.room}</Td>
                <Td>
                  {tr(r.fromClass)} → {tr(r.toClass)}
                </Td>
                <Td>{t('{n} of {total}', { n: r.agreed, total: r.asked })}</Td>
                <Td>
                  <StatusTag status={r.status} />
                </Td>
                <Td className="whitespace-nowrap">
                <span className="flex items-center gap-2">
                  {formatDateTime(r.dueAt)}
                  <SlaBadge dueAt={r.dueAt} done={DECIDED.includes(r.status)} warnHours={48} />
                </span>
              </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {selectedId ? (
          <Detail key={selectedId} id={selectedId} />
        ) : (
          <Card className="flex w-104 shrink-0 items-center justify-center">
            <EmptyBlock icon={Layers} title="Select a change" />
          </Card>
        )}
      </div>
      {creating && <NewChange termId={termId} onClose={() => setCreating(false)} />}
    </>
  )
}
