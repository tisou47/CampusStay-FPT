import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox, Switch } from '@/components/ui/Choice'
import { Alert, Avatar } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatNumber } from '@/lib/format'

// SCR-AUTH-10 Block Staff (Figma 69:554)
// GET /block-staff?block → { items: [{ id, name, title, handles, blocks, open, resolved7d, onDuty }],
//   summary: { total, shared, averageOpen, onDuty, deskOnDuty }, handleOptions, roleOptions }
// PUT /block-staff/:id { handles, onDuty } · POST /staff-account-requests { name, email, role }

function EditModal({ person, handleOptions, onClose }) {
  const { notify } = useToast()
  const [handles, setHandles] = useState(new Set(person.handles))
  const [onDuty, setOnDuty] = useState(person.onDuty)
  const save = useMutation(() => api.blockStaff.update(person.id, { handles: handleOptions.filter((h) => handles.has(h)), onDuty }), {
    invalidates: ['block-staff', 'routing'],
    onSuccess: () => {
      notify({ title: `${person.name} updated`, message: 'Routing uses the new request types from now on.' })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`Edit ${person.name}`}
      description={`${person.title} · Blocks ${person.blocks.join(', ')}. Name, email and role are managed by Admin.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.run()} disabled={save.pending}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium text-fg">Handles</legend>
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
      <Switch label="On duty today" checked={onDuty} onChange={setOnDuty} />
    </Modal>
  )
}

function RequestAccountModal({ roles, onClose }) {
  const { notify } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles[0] ?? '')
  const send = useMutation(() => api.blockStaff.requestAccount({ name: name.trim(), email: email.trim(), role }), {
    onSuccess: () => {
      notify({ title: 'Request sent to Admin', message: `Admin will create the account for ${name.trim()}.` })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Request new Staff account"
      description="Admin creates the account and sends the sign-in link. You can set what the person handles once it exists."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || !email.trim().endsWith('@fpt.edu.vn') || send.pending} onClick={() => send.run()}>
            Send request
          </Button>
        </>
      }
    >
      {send.error && <Alert type="error" title="Could not send the request">{send.error.message}</Alert>}
      <Field label="Full name" required>
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="FPT email" required>
        {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@fpt.edu.vn" />}
      </Field>
      <Field label="Role">{(id) => <Select id={id} value={role} onChange={(e) => setRole(e.target.value)} options={roles} />}</Field>
    </Modal>
  )
}

export default function BlockStaff() {
  const { block } = useSession()
  const query = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))
  const [editing, setEditing] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const s = query.data?.summary

  return (
    <>
      <PageHeader
        title={block ? `Staff · Block ${block}` : 'Staff'}
        description="Staff who work in your Block and the request types they handle. Accounts are created by Admin."
        actions={
          <Button icon={UserPlus} onClick={() => setRequesting(true)}>
            Request new Staff account
          </Button>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Staff in the Block" value={formatNumber(s?.total)} note={s?.shared ? `${s.shared} shared with other Blocks` : null} />
        <KpiTile size="md" label="Open requests per Staff" value={s?.averageOpen != null ? s.averageOpen.toFixed(1) : '—'} note="Average this week" />
        <KpiTile size="md" label="On duty today" value={s ? `${s.onDuty} of ${s.total}` : '—'} note={s?.deskOnDuty != null ? `Check-in desk: ${s.deskOnDuty}` : null} />
      </div>
      <Table fill>
        <THead>
          <tr>
            <Th>Staff</Th>
            <Th className="w-80">Handles</Th>
            <Th className="w-24">Blocks</Th>
            <Th className="w-18">Open</Th>
            <Th className="w-36">Resolved (7 days)</Th>
            <Th className="w-24">On duty</Th>
            <Th className="w-20">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={Users} emptyTitle="No Staff in this Block" />
          {(query.data?.items ?? []).map((p) => (
            <Tr key={p.id} className="[&>td]:h-14">
              <Td>
                <div className="flex items-center gap-2.5">
                  <Avatar name={p.name} />
                  <TwoLine primary={p.name} secondary={p.title} />
                </div>
              </Td>
              <Td>{p.handles.join(', ') || '—'}</Td>
              <Td>{p.blocks.join(', ')}</Td>
              <Td>{p.open}</Td>
              <Td className={p.resolved7d == null ? 'text-fg-tertiary' : undefined}>{p.resolved7d ?? '—'}</Td>
              <Td>{p.onDuty ? <Tag tone="success">Today</Tag> : <Tag>Off</Tag>}</Td>
              <Td>
                <Button variant="text" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {editing && <EditModal person={editing} handleOptions={query.data?.handleOptions ?? editing.handles} onClose={() => setEditing(null)} />}
      {requesting && <RequestAccountModal roles={query.data?.roleOptions ?? []} onClose={() => setRequesting(false)} />}
    </>
  )
}
