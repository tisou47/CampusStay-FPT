import { useState } from 'react'
import { Check, Layers, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Drawer } from '@/components/ui/Overlay'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { countLines, typeName } from '@/lib/furniture'
import { formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-CFG-03 Room Classes (Figma 25:837)
// GET /admin/room-classes → { items: [{ id, name, surchargeRate, usedIn, rooms, status }],
//   roomTypes: [{ id, name, basePrice }], depositRate }   (usedIn, rooms: Rooms of the class in the current Term, B-04)
// POST /admin/room-classes · PUT /admin/room-classes/:id
// GET /admin/room-class-requirements → { items: [{ roomClassId, roomClass, status, requirements: [{ typeId, type, typeVi,
//   quantity }] }], types: [{ id, name, nameVi }] } · PUT /admin/room-class-requirements/:roomClassId { items: [{ typeId, quantity }] }

function EditDrawer({ item, onClose }) {
  const { notify } = useToast()
  const isNew = !item.id
  const [form, setForm] = useState({
    name: item.name ?? '',
    surcharge: item.surchargeRate != null ? String(Math.round(item.surchargeRate * 100)) : '',
    status: item.status ?? 'Active',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(
    () => {
      const body = { name: form.name.trim(), surchargeRate: (Number(form.surcharge) || 0) / 100, status: form.status }
      return isNew ? api.admin.roomClasses.create(body) : api.admin.roomClasses.update(item.id, body)
    },
    {
      invalidates: ['admin-room-classes', 'admin-room-types', 'catalog'],
      onSuccess: () => {
        notify({ title: t('{name} saved', { name: form.name.trim() }), message: 'Prices for Terms that already opened registration do not change.' })
        onClose()
      },
      onError: () => {},
    },
  )
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New Room Class' : t('Edit Room Class · {name}', { name: item.name })}
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
      <p className="text-sm text-fg-tertiary">{t('Students see the furniture the class requires (Furniture in the list).')}</p>
      <Field label="Status">{(id) => <Select id={id} value={form.status} onChange={set('status')} options={['Active', 'Inactive']} />}</Field>
    </Drawer>
  )
}

function RequirementsDrawer({ roomClass, current, types, onClose }) {
  const { notify } = useToast()
  const [rows, setRows] = useState(() => current.map((r) => ({ typeId: r.typeId, quantity: String(r.quantity) })))
  const unused = types.filter((x) => !rows.some((r) => r.typeId === x.id))
  const setRow = (i, key) => (e) => setRows((list) => list.map((r, k) => (k === i ? { ...r, [key]: e.target.value } : r)))
  const save = useMutation(() => api.admin.requirements.save(roomClass.id, { items: rows.map((r) => ({ typeId: r.typeId, quantity: Number(r.quantity) || 0 })) }), {
    invalidates: ['admin-requirements', 'room-classes', 'inventory'],
    onSuccess: () => {
      notify({ title: t('{name} saved', { name: tr(roomClass.name) }), message: 'Room furniture is checked against the new list at once.' })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Drawer
      open
      onClose={onClose}
      title={t('Required furniture · {name}', { name: tr(roomClass.name) })}
      description="Every Room of this class must have these items; class-defining items beyond them are to be removed."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={save.pending}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      {rows.map((r, i) => (
        <div key={r.typeId} className="flex items-end gap-2">
          <Field label={i === 0 ? 'Furniture type' : undefined} className="flex-1">
            {(id) => <Select id={id} value={r.typeId} onChange={setRow(i, 'typeId')} options={types.filter((x) => x.id === r.typeId || !rows.some((o) => o.typeId === x.id)).map((x) => ({ value: x.id, label: typeName(x) }))} />}
          </Field>
          <Field label={i === 0 ? 'Quantity' : undefined} className="w-24">
            {(id) => <Input id={id} value={r.quantity} inputMode="numeric" onChange={setRow(i, 'quantity')} />}
          </Field>
          <Button variant="danger-text" icon={Trash2} aria-label={t('Remove')} onClick={() => setRows((list) => list.filter((_, k) => k !== i))} />
        </div>
      ))}
      {!rows.length && <p className="text-base text-fg-tertiary">{t('No furniture required: any Room can have this class.')}</p>}
      <Button icon={Plus} onClick={() => setRows((list) => [...list, { typeId: unused[0].id, quantity: '1' }])} disabled={!unused.length} className="self-start">
        Add furniture
      </Button>
      <p className="text-sm text-fg-tertiary">{t('Only furniture types that define the Room Class are listed (Furniture types).')}</p>
    </Drawer>
  )
}

export default function RoomClasses() {
  const query = useQuery(['admin-room-classes'], ({ signal }) => api.admin.roomClasses.list(undefined, { signal }))
  const requirements = useQuery(['admin-requirements'], ({ signal }) => api.admin.requirements.list(undefined, { signal }))
  const required = Object.fromEntries((requirements.data?.items ?? []).map((r) => [r.roomClassId, r.requirements]))
  const [editing, setEditing] = useState(null)
  const [furnishing, setFurnishing] = useState(null)
  const items = query.data?.items ?? []
  const active = items.filter((c) => c.status === 'Active')
  const rate = query.data?.depositRate ?? 0

  return (
    <>
      <PageHeader
        title="Room Classes"
        description="Amenity levels defined by the furniture they require. Each adds a surcharge (%) to the Room Type base price; each Room has its class per Term."
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
            <Th>Required furniture</Th>
            <Th className="w-44" align="right">
              Rooms this Term
            </Th>
            <Th className="w-24">Status</Th>
            <Th className="w-48">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={Layers} emptyTitle="No Room Classes yet" />
          {items.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium">{tr(c.name)}</Td>
              <Td align="right">+{Math.round(c.surchargeRate * 100)}%</Td>
              <Td className={required[c.id]?.length ? undefined : 'text-fg-tertiary'}>{required[c.id]?.length ? countLines(required[c.id]) : t('None')}</Td>
              <Td align="right" className="tabular">
                <div className="flex flex-col items-end gap-0.5 py-1">
                  <span className="font-medium text-fg">{formatNumber(c.rooms)}</span>
                  {c.usedIn && <span className="text-sm text-fg-tertiary">{c.usedIn}</span>}
                </div>
              </Td>
              <Td>
                <StatusTag status={c.status} />
              </Td>
              <Td>
                <div className="flex gap-1">
                  <Button variant="text" icon={Package} onClick={() => setFurnishing(c)} disabled={!requirements.data}>
                    Furniture
                  </Button>
                  <Button variant="text" icon={Pencil} onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-4">
          <h2 className="text-h3 font-semibold text-fg">{t('Price preview · Term price per Bed (deposit {p}%)', { p: Math.round(rate * 100) })}</h2>
          <span className="text-sm text-fg-tertiary">{t('Computed from Room Types × Room Classes × deposit rate. Read-only.')}</span>
        </div>
        <QueryState query={query} compact isEmpty={(d) => !d.roomTypes?.length || !active.length}>
          {(data) => (
            <Table fill>
              <THead>
                <tr>
                  <Th>Room Type</Th>
                  {active.map((c) => (
                    <Th key={c.id} align="right">
                      {tr(c.name)} (+{Math.round(c.surchargeRate * 100)}%)
                    </Th>
                  ))}
                </tr>
              </THead>
              <TBody>
                {data.roomTypes.map((rt) => (
                  <Tr key={rt.id}>
                    <Td className="py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-fg">{tr(rt.name)}</span>
                        <span className="text-sm text-fg-tertiary">{t('base {amount}', { amount: formatVnd(rt.basePrice) })}</span>
                      </div>
                    </Td>
                    {active.map((c) => {
                      const price = rt.basePrice * (1 + c.surchargeRate)
                      return (
                        <Td key={c.id} align="right" className="py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-fg tabular">{formatVnd(price)}</span>
                            <span className="text-sm text-fg-tertiary tabular">{t('deposit {amount}', { amount: formatVnd(price * rate) })}</span>
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
      {furnishing && (
        <RequirementsDrawer key={furnishing.id} roomClass={furnishing} current={required[furnishing.id] ?? []} types={requirements.data?.types ?? []} onClose={() => setFurnishing(null)} />
      )}
    </>
  )
}
