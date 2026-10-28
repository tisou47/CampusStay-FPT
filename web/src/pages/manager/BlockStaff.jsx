import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Route, ShieldCheck, UserCheck, UserPlus, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox, Switch } from '@/components/ui/Choice'
import { Alert, Avatar } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-AUTH-10 Block Staff (Figma 69:554)
// GET /block-staff?block → { items: [{ id, name, title, handles, blocks, open, resolved7d, onDuty }],
//   summary: { total, shared, averageOpen, onDuty, deskOnDuty }, handleOptions, roleOptions }
// PUT /block-staff/:id { handles, onDuty }. New accounts and their Blocks: Staff accounts (SCR-AUTH-16).

function EditModal({ person, handleOptions, onClose }) {
  const { notify } = useToast()
  const [handles, setHandles] = useState(new Set(person.handles))
  const [onDuty, setOnDuty] = useState(person.onDuty)
  const save = useMutation(() => api.blockStaff.update(person.id, { handles: handleOptions.filter((h) => handles.has(h)), onDuty }), {
    invalidates: ['block-staff', 'routing'],
    onSuccess: () => {
      notify({ title: t('{name} updated', { name: person.name }), message: 'Routing uses the new request types from now on.' })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={t('Edit {name}', { name: person.name })}
      description={`${tr(person.title)} · ${t('Blocks {codes}', { codes: person.blocks.join(', ') })}. ${t('Name, email and Blocks are set on Staff accounts.')}`}
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
      <Switch label="On duty today" checked={onDuty} onChange={setOnDuty} />
    </Modal>
  )
}


export default function BlockStaff() {
  const { block } = useSession()
  const query = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))
  const [editing, setEditing] = useState(null)
  const navigate = useNavigate()
  const s = query.data?.summary

  return (
    <>
      <PageHeader
        title={block ? t('Staff · Block {code}', { code: block }) : 'Staff'}
        description="Staff of the Blocks in your scope, the request types they handle and who is on duty. Staff start and end their own shift from the top bar; you can change it here."
        actions={
          <>
            <Button icon={Route} to="/manager/routing-rules">
              Routing and timers
            </Button>
            <Button icon={UserPlus} onClick={() => navigate('/manager/staff-accounts?new=1')}>
              New Staff account
            </Button>
          </>
        }
      />
      <div className="grid shrink-0 grid-cols-3 gap-4">
        {[
          { icon: Route, title: 'Who gets new requests', text: 'A new Maintenance or Room-Change Request goes to the person its routing rule names while they are on duty, else to the rule’s fallback.' },
          { icon: UserCheck, title: 'Who works on a request', text: 'Only the person in charge changes a request’s status. A colleague who covers takes it over first; the history keeps both names.' },
          { icon: ShieldCheck, title: 'What duty does not do', text: 'Off duty is not a lock: Staff keep access to their Blocks to look things up. To stop someone working, lock the account on Staff accounts.' },
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
        <KpiTile size="md" label="Staff" value={formatNumber(s?.total)} note={s?.shared ? t('{n} work in several Blocks', { n: s.shared }) : null} />
        <KpiTile size="md" label="Open requests per Staff" value={s?.averageOpen != null ? s.averageOpen.toFixed(1) : '—'} note="Average this week" />
        <KpiTile size="md" label="On duty today" value={s ? t('{n} of {total}', { n: s.onDuty, total: s.total }) : '—'} note={s?.deskOnDuty != null ? t('Check-in desk: {n}', { n: s.deskOnDuty }) : null} />
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
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={Users} emptyTitle="No Staff in these Blocks" />
          {(query.data?.items ?? []).map((p) => (
            <Tr key={p.id} className="[&>td]:h-14">
              <Td>
                <div className="flex items-center gap-2.5">
                  <Avatar name={p.name} />
                  <TwoLine primary={p.name} secondary={tr(p.title)} />
                </div>
              </Td>
              <Td>{p.handles.map((h) => tr(h)).join(', ') || '—'}</Td>
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
    </>
  )
}
