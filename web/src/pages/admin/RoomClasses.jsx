import { useState } from 'react'
import { Check, Layers, Pencil, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Drawer } from '@/components/ui/Overlay'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatNumber, formatVnd } from '@/lib/format'

// SCR-CFG-03 Room Classes (Figma 25:837)
// GET /admin/room-classes → { items: [{ id, name, surchargeRate, amenities: [string], floors, rooms, status }],
//   roomTypes: [{ id, name, basePrice }], depositRate }
// POST /admin/room-classes · PUT /admin/room-classes/:id

function EditDrawer({ item, onClose }) {
  const { notify } = useToast()
  const isNew = !item.id
  const [form, setForm] = useState({
    name: item.name ?? '',
    surcharge: item.surchargeRate != null ? String(Math.round(item.surchargeRate * 100)) : '',
    amenities: (item.amenities ?? []).join('\n'),
    status: item.status ?? 'Active',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(
    () => {
      const body = { name: form.name.trim(), surchargeRate: (Number(form.surcharge) || 0) / 100, amenities: form.amenities.split('\n').map((a) => a.trim()).filter(Boolean), status: form.status }
      return isNew ? api.admin.roomClasses.create(body) : api.admin.roomClasses.update(item.id, body)
    },
    {
      invalidates: ['admin-room-classes', 'admin-room-types', 'catalog'],
      onSuccess: () => {
        notify({ title: `${form.name.trim()} saved`, message: 'Prices for Terms that already opened registration do not change.' })
        onClose()
      },
      onError: () => {},
    },
  )
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New Room Class' : `Edit Room Class · ${item.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!form.name.trim() || save.pending}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={set('name')} disabled={!isNew} placeholder="e.g. Deluxe" />}</Field>
      <Field label="Surcharge (%)" helper="Added to every Room Type base price for this class.">
        {(id) => <Input id={id} value={form.surcharge} onChange={set('surcharge')} inputMode="numeric" />}
      </Field>
      <Field label="Amenities" helper="One per line. Students see this list when they choose a Room Class.">
        {(id) => <Textarea id={id} rows={4} value={form.amenities} onChange={set('amenities')} />}
      </Field>
      <Field label="Status">{(id) => <Select id={id} value={form.status} onChange={set('status')} options={['Active', 'Inactive']} />}</Field>
    </Drawer>
  )
}

export default function RoomClasses() {
  const query = useQuery(['admin-room-classes'], ({ signal }) => api.admin.roomClasses.list(undefined, { signal }))
  const [editing, setEditing] = useState(null)
  const items = query.data?.items ?? []
  const active = items.filter((c) => c.status === 'Active')
  const rate = query.data?.depositRate ?? 0

  return (
    <>
      <PageHeader
        title="Room Classes"
        description="Amenity levels. Each Room Class adds a surcharge (%) to the Room Type base price."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            New Room Class
          </Button>
        }
      />
      <Table className="max-h-[45%] shrink-0">
        <THead>
          <tr>
            <Th className="w-35">Room Class</Th>
            <Th className="w-28" align="right">
              Surcharge
            </Th>
            <Th>Amenities</Th>
            <Th className="w-35">Floors</Th>
            <Th className="w-22" align="right">
              Rooms
            </Th>
            <Th className="w-24">Status</Th>
            <Th className="w-24">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={Layers} emptyTitle="No Room Classes yet" />
          {items.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium">{c.name}</Td>
              <Td align="right">+{Math.round(c.surchargeRate * 100)}%</Td>
              <Td>{(c.amenities ?? []).join(' · ')}</Td>
              <Td>{c.floors ?? '—'}</Td>
              <Td align="right" className="tabular">
                {formatNumber(c.rooms)}
              </Td>
              <Td>
                <StatusTag status={c.status} />
              </Td>
              <Td>
                <Button variant="text" icon={Pencil} onClick={() => setEditing(c)}>
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-4">
          <h2 className="text-h3 font-semibold text-fg">Price preview · Term price per Bed (deposit {Math.round(rate * 100)}%)</h2>
          <span className="text-sm text-fg-tertiary">Computed from Room Types × Room Classes × deposit rate. Read-only.</span>
        </div>
        <QueryState query={query} compact isEmpty={(d) => !d.roomTypes?.length || !active.length}>
          {(data) => (
            <Table fill>
              <THead>
                <tr>
                  <Th>Room Type</Th>
                  {active.map((c) => (
                    <Th key={c.id} align="right">
                      {c.name} (+{Math.round(c.surchargeRate * 100)}%)
                    </Th>
                  ))}
                </tr>
              </THead>
              <TBody>
                {data.roomTypes.map((t) => (
                  <Tr key={t.id}>
                    <Td className="py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-fg">{t.name}</span>
                        <span className="text-sm text-fg-tertiary">base {formatVnd(t.basePrice)}</span>
                      </div>
                    </Td>
                    {active.map((c) => {
                      const price = t.basePrice * (1 + c.surchargeRate)
                      return (
                        <Td key={c.id} align="right" className="py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-fg tabular">{formatVnd(price)}</span>
                            <span className="text-sm text-fg-tertiary tabular">deposit {formatVnd(price * rate)}</span>
                          </div>
                        </Td>
                      )
                    })}
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </QueryState>
      </Card>
      {editing && <EditDrawer key={editing.id ?? 'new'} item={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
