import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRightLeft, ClipboardList, Route, ShieldCheck, UserCheck, UserPlus, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox, Switch } from '@/components/ui/Choice'
import { Alert, Avatar } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-AUTH-10 Manager › Staff and workload (Figma 69:554)
// GET /block-staff?block → { items: [{ id, name, title, handles, blocks, open, openByType: { Maintenance, Room change,
//   Inspection }, overdue, oldestOpenAt, resolved7d, onDuty, overloaded }],
//   summary: { total, shared, averageOpen, onDuty, deskOnDuty, open, overdue, overloaded, maxOpen },
//   queue: [{ type, label, count, link }], handleOptions, roleOptions }
// PUT /block-staff/:id { handles, onDuty, note } (note required when onDuty changes).
// GET /block-staff/:id/work → { items, total } · POST /block-staff/:id/work/reassign { items, toStaffId, note } → { moved }.
// New accounts and their Blocks: Staff accounts (SCR-AUTH-16).

const KINDS = ['Maintenance', 'Room change', 'Inspection']
const HOUR = 3600 * 1000

/** Hours since the oldest open item was opened, "—" when the person has none. */
function oldest(at) {
  if (!at) return '—'
  return t('{n} h', { n: Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / HOUR)) })
}

function EditModal({ person, handleOptions, onClose }) {
  const { notify } = useToast()
  const [handles, setHandles] = useState(new Set(person.handles))
  const [onDuty, setOnDuty] = useState(person.onDuty)
  const [note, setNote] = useState('')
  const dutyChanged = onDuty !== person.onDuty
  const save = useMutation(
    () => api.blockStaff.update(person.id, { handles: handleOptions.filter((h) => handles.has(h)), onDuty, note: dutyChanged ? note.trim() : undefined }),
    {
      invalidates: ['block-staff', 'routing'],
      onSuccess: () => {
        notify({ title: t('{name} updated', { name: person.name }), message: 'Routing uses the new request types from now on.' })
        onClose()
      },
      onError: () => {},
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={t('Edit {name}', { name: person.name })}
      description={`${tr(person.title)} · ${t('Blocks {codes}', { codes: person.blocks.join(', ') })}. ${t('Name, email and blocks are set on staff accounts.')}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.run()} disabled={save.pending || (dutyChanged && !note.trim())}>
            Save
          </Button>
        </>
      }
    >
      {save.error && !save.error.fields?.note && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium text-fg">{t('Handles')}</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {handleOptions.map((h) => (
            <Checkbox
              key={h}
              label={h}
              checked={handles.has(h)}
              onChange={() =>
                setHandles((s) => {
                  const next = new Set(s)
                  if (next.has(h)) next.delete(h)
                  else next.add(h)
                  return next
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <Switch label="On duty now" checked={onDuty} onChange={setOnDuty} />
      {dutyChanged && (
        <Field label="Why do you change their duty?" required error={save.error?.fields?.note} helper="Kept in the Audit Log.">
          {(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      )}
    </Modal>
  )
}

/** One person's open work, with the receiver and note to move the items ticked. */
function WorkDrawer({ person, staff, onClose }) {
  const { notify } = useToast()
  const work = useQuery(['block-staff', 'work', person.id], ({ signal }) => api.blockStaff.work(person.id, { signal }))
  const [selected, setSelected] = useState(new Set())
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const items = work.data?.items ?? []
  const key = (i) => `${i.type}:${i.id}`

  // Receivers: the others of the list, on duty first, then the least loaded.
  const receivers = useMemo(
    () =>
      staff
        .filter((s) => s.id !== person.id)
        .sort((a, b) => (a.onDuty === b.onDuty ? a.open - b.open || a.name.localeCompare(b.name) : a.onDuty ? -1 : 1)),
    [staff, person.id],
  )
  const receiver = receivers.find((s) => s.id === to)

  const move = useMutation(
    () =>
      api.blockStaff.reassign(person.id, {
        items: items.filter((i) => selected.has(key(i))).map((i) => ({ type: i.type, id: i.id })),
        toStaffId: to,
        note: note.trim(),
      }),
    {
      invalidates: ['block-staff', 'routing', 'maintenance', 'dashboard'],
      onSuccess: (result) => {
        notify({ title: t('{n} items moved to {name}', { n: result.moved, name: receiver?.name ?? '' }), message: 'They were told in the app.' })
        setSelected(new Set())
        setNote('')
      },
      onError: () => {},
    },
  )

  const toggle = (k) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const allTicked = items.length > 0 && items.every((i) => selected.has(key(i)))

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      title={t('Work of {name}', { name: person.name })}
      description={t('{n} open items. Tick the ones to move, choose who takes them and say why.', { n: items.length })}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={ArrowRightLeft} onClick={() => move.run()} disabled={move.pending || selected.size === 0 || !to || !note.trim()}>
            {t('Reassign selected ({n})', { n: selected.size })}
          </Button>
        </>
      }
    >
      {move.error && <Alert type="error" title="Could not move the work">{move.error.message}</Alert>}
      {work.error && <Alert type="error" title="Could not load the work">{work.error.message}</Alert>}
      {work.loading && <p className="text-base text-fg-secondary">{t('Loading…')}</p>}
      {!work.loading && !work.error && items.length === 0 && <p className="text-base text-fg-secondary">{t('{name} holds no open work.', { name: person.name })}</p>}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <Checkbox label="Select all" checked={allTicked} indeterminate={!allTicked && selected.size > 0} onChange={() => setSelected(allTicked ? new Set() : new Set(items.map(key)))} />
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {items.map((i) => (
              <li key={key(i)} className="flex items-start gap-3 p-3">
                <Checkbox aria-label={t('Select {code}', { code: i.code })} checked={selected.has(key(i))} onChange={() => toggle(key(i))} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={i.link} className="text-base font-medium text-fg-brand hover:underline">
                      {i.type === 'Inspection' ? t('Inspection {date}', { date: i.code }) : i.code}
                    </Link>
                    <Tag dot={false}>{i.type}</Tag>
                    {i.overdue && <Tag tone="error">Overdue</Tag>}
                  </div>
                  <p className="truncate text-base text-fg">{tr(i.title)}</p>
                  <p className="text-sm text-fg-secondary">
                    {[i.roomCode ? t('Room {code}', { code: i.roomCode }) : null, tr(i.status), i.dueAt ? t('Due {when}', { when: formatDateTime(i.dueAt) }) : null, t('Open for {age}', { age: oldest(i.openedAt) })]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Field label="Move to" required helper="The receiver must work in the item's Block and handle its kind of work.">
            {(id) => (
              <Select
                id={id}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                options={[
                  { value: '', label: t('Choose a staff member') },
                  ...receivers.map((s) => ({ value: s.id, label: `${s.name} · ${t('{n} open', { n: s.open })} · ${t(s.onDuty ? 'On duty' : 'Off duty')}` })),
                ]}
              />
            )}
          </Field>
          <Field label="Why do you move this work?" required error={move.error?.fields?.note} helper="The receiver reads it; the Audit Log keeps it.">
            {(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
      )}
    </Drawer>
  )
}

export default function BlockStaff() {
  const { block } = useSession()
  const query = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const navigate = useNavigate()
  const s = query.data?.summary
  const queue = query.data?.queue ?? []
  const waiting = queue.reduce((n, q) => n + q.count, 0)
  const staff = query.data?.items ?? []

  return (
    <>
      <PageHeader
        title={block ? t('Staff and workload · Block {code}', { code: block }) : 'Staff and workload'}
        description="Staff of the blocks in your scope, the work each person holds and who is on duty. Open a person's work to move it to someone else. Staff start and end their own shift from the top bar; you can change it here."
        actions={
          <>
            <Button icon={Route} to="/manager/routing-rules">
              Routing and timers
            </Button>
            <Button icon={UserPlus} onClick={() => navigate('/manager/staff-accounts?new=1')}>
              New staff account
            </Button>
          </>
        }
      />
      <div className="grid shrink-0 grid-cols-3 gap-4">
        {[
          { icon: Route, title: 'Who gets new requests', text: 'A new maintenance or room-change request goes to the person its routing rule names while they are on duty, else to the rule’s fallback.' },
          { icon: UserCheck, title: 'Who works on a request', text: 'Only the person in charge changes a request’s status. A colleague who covers takes it over first; the history keeps both names.' },
          { icon: ShieldCheck, title: 'What duty does not do', text: 'Off duty is not a lock: staff keep access to their blocks to look things up. To stop someone working, lock the account on staff accounts.' },
        ].map((x) => (
          <div key={x.title} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5">
            <x.icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-brand" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-base font-medium text-fg">{t(x.title)}</p>
              <p className="text-sm text-fg-secondary">{t(x.text)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="On duty now" value={s ? t('{n} of {total}', { n: s.onDuty, total: s.total }) : '—'} note={s?.deskOnDuty != null ? t('Check-in desk: {n}', { n: s.deskOnDuty }) : null} />
        <KpiTile size="md" label="Open (staff)" value={formatNumber(s?.open)} note={s?.averageOpen != null ? t('Now · {n} per person', { n: s.averageOpen.toFixed(1) }) : 'Now'} />
        <KpiTile
          size="md"
          label="Overdue"
          value={formatNumber(s?.overdue)}
          valueTone={s?.overdue ? 'error' : undefined}
          note={s ? t('{n} overloaded (more than {max} open)', { n: s.overloaded, max: s.maxOpen }) : null}
          noteTone={s?.overloaded ? 'warning' : 'secondary'}
        />
        <KpiTile size="md" label="Waiting in the Block" value={formatNumber(waiting)} note={queue.length ? null : 'Nothing waits without an owner'}>
          {queue.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm">
              {queue.map((q) => (
                <li key={q.type}>
                  <Link to={q.link} className="text-fg-brand hover:underline">
                    {t('{label}: {n}', { label: tr(q.label), n: q.count })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </KpiTile>
      </div>
      <Table fill>
        <THead>
          <tr>
            <Th>Staff</Th>
            <Th className="w-64">Handles</Th>
            {KINDS.map((k) => (
              <Th key={k} className="w-28 text-right">
                {k}
              </Th>
            ))}
            <Th className="w-24 text-right">Overdue</Th>
            <Th className="w-24 text-right">Oldest</Th>
            <Th className="w-32 text-right">Resolved (7 days)</Th>
            <Th className="w-24">Duty</Th>
            <Th className="w-36">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={11} emptyIcon={Users} emptyTitle="No staff in these blocks" />
          {staff.map((p) => (
            <Tr key={p.id} className="[&>td]:h-14">
              <Td>
                <div className="flex items-center gap-2.5">
                  <Avatar name={p.name} />
                  <button type="button" onClick={() => setViewing(p)} className="min-w-0 text-left hover:underline">
                    <TwoLine primary={p.name} secondary={`${tr(p.title)} · ${t('Blocks {codes}', { codes: p.blocks.join(', ') })}`} />
                  </button>
                  {p.overloaded && <Tag tone="warning">Overloaded</Tag>}
                </div>
              </Td>
              <Td>{p.handles.map((h) => tr(h)).join(', ') || '—'}</Td>
              {KINDS.map((k) => (
                <Td key={k} className="text-right tabular">
                  {p.openByType?.[k] ?? 0}
                </Td>
              ))}
              <Td className="text-right tabular">{p.overdue > 0 ? <Tag tone="error">{String(p.overdue)}</Tag> : 0}</Td>
              <Td className={p.oldestOpenAt ? 'text-right tabular' : 'text-right text-fg-tertiary'}>{oldest(p.oldestOpenAt)}</Td>
              <Td className="text-right tabular">{p.resolved7d ?? '—'}</Td>
              <Td>{p.onDuty ? <Tag tone="success">On duty</Tag> : <Tag>Off</Tag>}</Td>
              <Td>
                <div className="flex gap-1">
                  <Button variant="text" icon={ClipboardList} onClick={() => setViewing(p)}>
                    Work
                  </Button>
                  <Button variant="text" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {editing && <EditModal person={editing} handleOptions={query.data?.handleOptions ?? editing.handles} onClose={() => setEditing(null)} />}
      {viewing && <WorkDrawer person={viewing} staff={staff} onClose={() => setViewing(null)} />}
    </>
  )
}
