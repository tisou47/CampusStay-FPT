import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Bed, Check, Pencil, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Drawer } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatNumber, formatVnd } from '@/lib/format'

// SCR-CFG-02 Room Types (Figma 24:520) with the Edit drawer (Figma 24:859).
// GET /admin/room-types → { items: [{ id, name, beds, basePrice, roommateSelection: 'auto'|'mutual', rooms, status, hasAllocations }],
//   roomClasses: [{ id, name, surchargeRate }], totals: { rooms, beds } }
// POST /admin/room-types · PUT /admin/room-types/:id

const parse = (s) => Number(String(s).replace(/\D/g, '')) || 0
const selectionLabel = { auto: 'Auto-matched', mutual: 'Allowed (mutual invite)' }

function EditDrawer({ type, roomClasses, onClose }) {
  const { notify } = useToast()
  const isNew = !type.id
  const [form, setForm] = useState({
    name: type.name ?? '',
    beds: String(type.beds ?? ''),
    basePrice: type.basePrice != null ? formatNumber(type.basePrice) : '',
    roommateSelection: type.roommateSelection ?? 'auto',
    status: type.status ?? 'Active',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const base = parse(form.basePrice)
  const beds = Number(form.beds) || 0
  const save = useMutation(
    () => {
      const body = { name: form.name.trim(), beds, basePrice: base, roommateSelection: beds === 2 ? form.roommateSelection : 'auto', status: form.status }
      return isNew ? api.admin.roomTypes.create(body) : api.admin.roomTypes.update(type.id, body)
    },
    {
      invalidates: ['admin-room-types', 'admin-room-classes', 'catalog'],
      onSuccess: () => {
        notify({ title: `${form.name.trim()} saved`, message: 'New prices apply to Terms that have not opened registration yet.' })
        onClose()
      },
      onError: () => {},
    },
  )
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New Room Type' : `Edit Room Type · ${type.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!form.name.trim() || !base || !beds || save.pending} onClick={() => save.run()}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="e.g. 8-bed" />}</Field>
      <Field label="Beds per Room" helper={type.hasAllocations ? 'Cannot change while Rooms of this type have active Allocations.' : undefined}>
        {(id) => <Input id={id} value={form.beds} onChange={set('beds')} disabled={type.hasAllocations} inputMode="numeric" />}
      </Field>
      <Field label="Base price per Bed / Term (VND)">
        {(id) => <Input id={id} value={form.basePrice} onChange={set('basePrice')} onBlur={() => setForm((f) => ({ ...f, basePrice: f.basePrice ? formatNumber(parse(f.basePrice)) : '' }))} inputMode="numeric" />}
      </Field>
      <Field label="Roommate selection" helper="Only Room Types with 2 Beds can allow mutual invite.">
        {(id) => (
          <Select
            id={id}
            value={beds === 2 ? form.roommateSelection : 'auto'}
            onChange={set('roommateSelection')}
            options={[
              { value: 'auto', label: selectionLabel.auto },
              { value: 'mutual', label: selectionLabel.mutual, disabled: beds !== 2 },
            ]}
          />
        )}
      </Field>
      <Field label="Status">{(id) => <Select id={id} value={form.status} onChange={set('status')} options={['Active', 'Inactive']} />}</Field>
      {roomClasses.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle p-4 text-base">
          <p className="font-medium text-fg">Term price per Bed with Room Class</p>
          {roomClasses.map((c) => (
            <div key={c.id} className="flex justify-between">
              <span className="text-fg-secondary">
                {c.name} +{Math.round(c.surchargeRate * 100)}%
              </span>
              <span className="font-medium text-fg tabular">{formatVnd(Math.round(base * (1 + c.surchargeRate)))}</span>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}

export default function RoomTypes() {
  const [params, setParams] = useSearchParams()
  const query = useQuery(['admin-room-types'], ({ signal }) => api.admin.roomTypes.list(undefined, { signal }))
  const items = query.data?.items ?? []
  const editId = params.get('edit')
  const editing = editId === 'new' ? {} : items.find((t) => t.id === editId)

  return (
    <>
      <PageHeader
        title="Room Types"
        description="Number of Beds per Room and the base price per Bed for one Term. Room Class surcharges are added on top."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setParams({ edit: 'new' })}>
            New Room Type
          </Button>
        }
      />
      <Table fill>
        <THead>
          <tr>
            <Th className="w-40">Room Type</Th>
            <Th className="w-30">Beds per Room</Th>
            <Th className="w-50" align="right">
              Base price per Bed / Term
            </Th>
            <Th className="w-50">Roommate selection</Th>
            <Th className="w-24" align="right">
              Rooms
            </Th>
            <Th className="w-24" align="right">
              Beds
            </Th>
            <Th>Status</Th>
            <Th className="w-24">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={8} emptyIcon={Bed} emptyTitle="No Room Types yet" />
          {items.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium">{t.name}</Td>
              <Td>{t.beds}</Td>
              <Td align="right" className="tabular">
                {formatVnd(t.basePrice)}
              </Td>
              <Td>{selectionLabel[t.roommateSelection] ?? t.roommateSelection}</Td>
              <Td align="right" className="tabular">
                {formatNumber(t.rooms)}
              </Td>
              <Td align="right" className="tabular">
                {formatNumber((t.rooms ?? 0) * t.beds)}
              </Td>
              <Td>
                <StatusTag status={t.status} />
              </Td>
              <Td>
                <Button variant="text" icon={Pencil} onClick={() => setParams({ edit: t.id })}>
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {query.data?.totals && (
        <p className="flex shrink-0 gap-2 text-base">
          <span className="text-fg-secondary">Total capacity</span>
          <span className="font-medium text-fg">
            {formatNumber(query.data.totals.rooms)} Rooms · {formatNumber(query.data.totals.beds)} Beds
          </span>
        </p>
      )}
      <Alert title="Price changes apply to future Terms" className="shrink-0">
        A Term that has opened registration keeps the prices it opened with, so issued Invoices never change.
      </Alert>
      {editing && <EditDrawer key={editId} type={editing} roomClasses={query.data?.roomClasses ?? []} onClose={() => setParams({})} />}
    </>
  )
}
