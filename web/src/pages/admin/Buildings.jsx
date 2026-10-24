import { useState } from 'react'
import { Building, Check, Layers, Pencil, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-INV-01 Buildings and Structure (Figma 25:1593)
// GET /admin/buildings → { items: [{ id, name, gender, status, floors: [{ floor, roomClassName, twoBed, fourBed, sixBed, rooms, beds, closedRooms }] }],
//   genders: [string], floorOptions: [number], layoutNote }
// POST /admin/buildings { name, gender, status } · PUT /admin/buildings/:id
// POST /admin/buildings/:id/rooms/bulk { fromFloor, toFloor } → { created, skipped }
// GET /admin/buildings/:id/floors/:floor/rooms → { items: [{ code, roomTypeName, roomClassName, outOfService }] }

function BlockModal({ block, genders, onClose, onSaved }) {
  const { notify } = useToast()
  const isNew = !block.id
  const [form, setForm] = useState({ name: block.name ?? '', gender: block.gender ?? genders[0] ?? '', status: block.status ?? 'Active' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(() => (isNew ? api.admin.buildings.createBlock(form) : api.admin.buildings.updateBlock(block.id, form)), {
    invalidates: ['admin-buildings', 'inventory'],
    onSuccess: (res) => {
      notify({ title: t('Block {code} saved', { code: form.name }), message: isNew ? 'Use Bulk generate Rooms to create its Floors.' : 'Changes are written to the Audit Log.' })
      onSaved(res?.id ?? block.id)
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New Block' : t('Edit Block {code}', { code: block.name })}
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
      <Field label="Block name">{(id) => <Input id={id} value={form.name} onChange={set('name')} disabled={!isNew} placeholder="e.g. E" />}</Field>
      <div className="flex gap-3">
        <Field label="Gender" helper="The assignment engine only places students of this gender here." className="flex-1">
          {(id) => <Select id={id} value={form.gender} onChange={set('gender')} options={genders} />}
        </Field>
        <Field label="Status" className="flex-1">
          {(id) => <Select id={id} value={form.status} onChange={set('status')} options={['Active', 'Inactive']} />}
        </Field>
      </div>
    </Modal>
  )
}

function BulkModal({ block, floors, note, onClose }) {
  const { notify } = useToast()
  const [from, setFrom] = useState(String(floors[0] ?? ''))
  const [to, setTo] = useState(String(floors.at(-1) ?? ''))
  const run = useMutation(() => api.admin.buildings.bulkRooms(block.id, { fromFloor: Number(from), toFloor: Number(to) }), {
    invalidates: ['admin-buildings', 'inventory'],
    onSuccess: (res) => {
      notify({ title: 'Rooms generated', message: `${t('{n} Rooms created in Block {code}.', { n: formatNumber(res?.created), code: block.name })}${res?.skipped ? ` ${t('{n} Floors with Allocations were skipped.', { n: res.skipped })}` : ''}` })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Bulk generate Rooms · Block {code}', { code: block.name })}
      description="Creates the standard layout on every Floor in the range. Floors with Allocations are skipped."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Layers} onClick={() => run.run()} disabled={!from || !to || Number(from) > Number(to) || run.pending}>
            Generate
          </Button>
        </>
      }
    >
      {run.error && <Alert type="error" title="Could not generate Rooms">{run.error.message}</Alert>}
      <div className="flex gap-3">
        <Field label="From Floor" className="flex-1">
          {(id) => <Select id={id} value={from} onChange={(e) => setFrom(e.target.value)} options={floors.map(String)} />}
        </Field>
        <Field label="To Floor" className="flex-1">
          {(id) => <Select id={id} value={to} onChange={(e) => setTo(e.target.value)} options={floors.map(String)} />}
        </Field>
      </div>
      {note && <div className="rounded-lg border border-line bg-subtle p-4 text-base text-fg-secondary">{tr(note)}</div>}
    </Modal>
  )
}

function FloorDrawer({ block, floor, onClose }) {
  const query = useQuery(['admin-buildings', 'floor', block.id, floor.floor], ({ signal }) => api.admin.buildings.floorRooms(block.id, floor.floor, { signal }))
  return (
    <Drawer open width={560} onClose={onClose} title={t('Block {code} · Floor {n}', { code: block.name, n: floor.floor })} description={t('{rooms} Rooms · {beds} Beds', { rooms: formatNumber(floor.rooms), beds: formatNumber(floor.beds) })}>
      <QueryState query={query} compact>
        {(data) => (
          <Table>
            <THead>
              <tr>
                <Th>Room</Th>
                <Th>Room Type</Th>
                <Th>Room Class</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {data.items.map((r) => (
                <Tr key={r.code} className="[&>td]:h-10">
                  <Td className="font-medium">{r.code}</Td>
                  <Td>{r.roomTypeName}</Td>
                  <Td>{r.roomClassName}</Td>
                  <Td>{r.outOfService ? <Tag tone="error">Out of service</Tag> : <Tag tone="success">In service</Tag>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </QueryState>
    </Drawer>
  )
}

export default function Buildings() {
  const query = useQuery(['admin-buildings'], ({ signal }) => api.admin.buildings.list(undefined, { signal }))
  const blocks = query.data?.items ?? []
  const [selectedId, setSelectedId] = useState(null)
  const [modal, setModal] = useState(null)
  const [floorOpen, setFloorOpen] = useState(null)
  const block = blocks.find((b) => b.id === selectedId) ?? blocks[0]
  const floors = block?.floors ?? []

  return (
    <>
      <PageHeader
        title="Buildings"
        description="Blocks, Floors, Rooms and Beds. Room Type and Room Class are set per Room; bulk-generate a Floor layout to save time."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'block', block: {} })} disabled={!query.data}>
            New Block
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-75 shrink-0 flex-col gap-3 overflow-y-auto">
          <QueryState query={query} compact empty={<EmptyBlock icon={Building} title="No Blocks yet" />}>
            {(data) =>
              data.items.map((b) => {
                const active = b.id === block?.id
                const beds = (b.floors ?? []).reduce((n, f) => n + f.beds, 0)
                const rooms = (b.floors ?? []).reduce((n, f) => n + f.rooms, 0)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    aria-pressed={active}
                    className={cx(
                      'flex shrink-0 flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors',
                      active ? 'border-primary bg-brand-subtle inset-ring inset-ring-primary' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-h3 font-semibold text-fg">
                        <Building size={20} aria-hidden="true" className={active ? 'text-fg-brand' : 'text-fg-secondary'} />
                        {t('Block {code}', { code: b.name })}
                      </span>
                      {b.gender && <Tag>{b.gender}</Tag>}
                    </span>
                    <span className="text-sm text-fg-secondary">
                      {b.floors?.length ? t('{floors} residential Floors · {rooms} Rooms · {beds} Beds', { floors: b.floors.length, rooms: formatNumber(rooms), beds: formatNumber(beds) }) : t('No Floors yet')}
                    </span>
                  </button>
                )
              })
            }
          </QueryState>
        </div>
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {block ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-h3 font-semibold text-fg">{t('Block {code} · Floors', { code: block.name })}</h2>
                  {block.gender && <Tag>{block.gender}</Tag>}
                  <Tag tone={block.status === 'Active' ? 'success' : 'neutral'}>{block.status}</Tag>
                </div>
                <div className="flex gap-2">
                  <Button icon={Pencil} onClick={() => setModal({ type: 'block', block })}>
                    Edit Block
                  </Button>
                  <Button icon={Layers} onClick={() => setModal({ type: 'bulk', block })}>
                    Bulk generate Rooms
                  </Button>
                </div>
              </div>
              <Table fill>
                <THead>
                  <tr>
                    <Th className="w-24">Floor</Th>
                    <Th className="w-28">Room Class</Th>
                    <Th className="w-18" align="right">
                      2-bed
                    </Th>
                    <Th className="w-18" align="right">
                      4-bed
                    </Th>
                    <Th className="w-18" align="right">
                      6-bed
                    </Th>
                    <Th className="w-18" align="right">
                      Beds
                    </Th>
                    <Th>Status</Th>
                    <Th className="w-20">
                      <span className="sr-only">{t('Actions')}</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  <TableStatus query={query} colSpan={8} rows={floors} emptyTitle="No Floors yet" emptyText="Use Bulk generate Rooms to create the layout." />
                  {floors.map((f) => (
                    <Tr key={f.floor} className="[&>td]:h-10">
                      <Td className="font-medium">{t('Floor {n}', { n: f.floor })}</Td>
                      <Td>{f.roomClassName ?? '—'}</Td>
                      <Td align="right">{f.twoBed}</Td>
                      <Td align="right">{f.fourBed}</Td>
                      <Td align="right">{f.sixBed}</Td>
                      <Td align="right">{f.beds}</Td>
                      <Td>{f.closedRooms ? <Tag tone="warning">{t(f.closedRooms === 1 ? '{n} Room closed' : '{n} Rooms closed', { n: f.closedRooms })}</Tag> : <Tag tone="success">Active</Tag>}</Td>
                      <Td>
                        <Button variant="text" onClick={() => setFloorOpen(f)}>
                          Rooms
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </>
          ) : (
            <EmptyBlock icon={Building} title="Select a Block" />
          )}
        </Card>
      </div>

      {modal?.type === 'block' && (
        <BlockModal
          block={modal.block}
          genders={query.data?.genders ?? []}
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setModal(null)
            if (id) setSelectedId(id)
          }}
        />
      )}
      {modal?.type === 'bulk' && <BulkModal block={modal.block} floors={query.data?.floorOptions ?? []} note={query.data?.layoutNote} onClose={() => setModal(null)} />}
      {floorOpen && block && <FloorDrawer block={block} floor={floorOpen} onClose={() => setFloorOpen(null)} />}
    </>
  )
}
