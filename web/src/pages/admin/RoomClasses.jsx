import { useState } from 'react'
import { Building2, Check, DoorOpen, Layers, Package, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Drawer } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { countLines, typeName } from '@/lib/furniture'
import { formatNumber, formatVnd } from '@/lib/format'
import { parseDecimal } from '@/lib/numbers'
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
  // An existing tier is renamed only while it is (or is being set) Inactive; setting it back to Active undoes the rename.
  const renamable = isNew || form.status === 'Inactive'
  const setStatus = (e) => {
    const status = e.target.value
    setForm((f) => ({ ...f, status, name: !isNew && status !== 'Inactive' ? item.name : f.name }))
  }
  const statusField = <Field label="Status">{(id) => <Select id={id} value={form.status} onChange={setStatus} options={['Active', 'Inactive']} />}</Field>
  const save = useMutation(
    () => {
      const body = { name: form.name.trim(), surchargeRate: (parseDecimal(form.surcharge) ?? 0) / 100, status: form.status }
      return isNew ? api.admin.roomClasses.create(body) : api.admin.roomClasses.update(item.id, body)
    },
    {
      invalidates: ['admin-room-classes', 'admin-room-types', 'catalog'],
      onSuccess: () => {
        notify({ title: t('{name} saved', { name: form.name.trim() }), message: 'Prices for terms that already opened registration do not change.' })
        onClose()
      },
      onError: () => {},
    },
  )
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New room tier' : t('Edit room tier · {name}', { name: item.name })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!form.name.trim() || save.pending || Number.isNaN(parseDecimal(form.surcharge))}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      {!isNew && statusField}
      <Field label="Name" helper={isNew ? undefined : renamable ? 'The tier is inactive, so its name can change.' : 'Set the status to Inactive to change the name.'}>
        {(id) => <Input id={id} value={form.name} onChange={set('name')} disabled={!renamable} placeholder="e.g. Deluxe" />}
      </Field>
      <Field label="Surcharge (%)" helper="Added to every room type base price for this class.">
        {(id) => <Input id={id} value={form.surcharge} onChange={set('surcharge')} inputMode="numeric" />}
      </Field>
      <p className="text-sm text-fg-tertiary">{t('Students see the furniture the class requires (Furniture in the list).')}</p>
      {isNew && statusField}
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
      description="Every room of this class must have these items; class-defining items beyond them are to be removed."
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
      {!rows.length && <p className="text-base text-fg-tertiary">{t('No furniture required: any room can have this class.')}</p>}
      <Button icon={Plus} onClick={() => setRows((list) => [...list, { typeId: unused[0].id, quantity: '1' }])} disabled={!unused.length} className="self-start">
        Add furniture
      </Button>
      <p className="text-sm text-fg-tertiary">{t('Only furniture types that define the room tier are listed (Furniture types).')}</p>
    </Drawer>
  )
}

/** "A 48 · B 24" (Rooms of the tier per Block this Term) → [{ block: 'A', rooms: 48 }, …]. */
const blocksOf = (usedIn) =>
  (usedIn ?? '')
    .split('·')
    .map((part) => part.trim().split(/\s+/))
    .filter(([block, n]) => block && n)
    .map(([block, n]) => ({ block, rooms: Number(n) || 0 }))

/**
 * All the Rooms of one tier in one Block, read from Manager › Room tiers by term (the API's default Term is the next
 * one, while the tier list counts the current Term, so the current Term is asked for when there is one).
 */
async function tierRooms(roomClassId, block, signal) {
  const get = (query) => api.inventory.roomClasses({ roomClassId, block, pageSize: 100, ...query }, { signal })
  let first = await get({ page: 1 })
  const current = first.terms?.find((x) => x.current)
  const termId = current && current.id !== first.term?.id ? current.id : undefined
  if (termId) first = await get({ page: 1, termId })
  const items = [...(first.items ?? [])]
  for (let page = 2; items.length < first.total; page++) {
    const next = await get({ page, termId })
    if (!next.items?.length) break
    items.push(...next.items)
  }
  return { term: first.term, items }
}

/** The Rooms of a tier, one Block at a time, grouped by floor. */
function TierRoomsDrawer({ tier, onClose }) {
  const blocks = blocksOf(tier.usedIn)
  const [block, setBlock] = useState(blocks[0]?.block)
  const [q, setQ] = useState('')
  const query = useQuery(['admin-tier-rooms', tier.id, block], ({ signal }) => tierRooms(tier.id, block, signal))
  const needle = q.trim().toLowerCase()
  const rooms = (query.data?.items ?? []).filter((r) => !needle || r.room.toLowerCase().includes(needle))
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)
  const offTier = (query.data?.items ?? []).filter((r) => r.conformance?.status === 'Does not match').length

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      title={t('Rooms · {name}', { name: tr(tier.name) })}
      description={query.data?.term ? t('{n} rooms in {term}', { n: formatNumber(tier.rooms), term: query.data.term.name }) : t('{n} rooms', { n: formatNumber(tier.rooms) })}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {blocks.length > 1 && (
        <div
          role="tablist"
          className="grid shrink-0 gap-2"
          style={{ gridTemplateColumns: `repeat(${blocks.length <= 5 ? blocks.length : Math.ceil(blocks.length / 2)}, minmax(0, 1fr))` }}
        >
          {blocks.map((b) => {
            const active = b.block === block
            return (
              <button
                key={b.block}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setBlock(b.block)}
                className={cx(
                  'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                  active ? 'border-primary bg-primary-subtle' : 'border-line hover:border-line-strong hover:bg-subtle',
                )}
              >
                <span className={cx('flex items-center gap-1.5 text-base font-medium whitespace-nowrap', active ? 'text-fg-brand' : 'text-fg')}>
                  <Building2 aria-hidden="true" size={16} />
                  {t('Block {code}', { code: b.block })}
                </span>
                <span className={cx('text-sm tabular', active ? 'text-fg-brand' : 'text-fg-tertiary')}>{formatNumber(b.rooms)}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search room code" wrapperClassName="flex-1" aria-label={t('Search room code')} />
        {offTier > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-warning-fg">
            <TriangleAlert aria-hidden="true" size={14} />
            {t('{n} rooms lack the furniture', { n: formatNumber(offTier) })}
          </span>
        )}
      </div>

      <QueryState query={query} compact skeleton="table" isEmpty={() => !rooms.length} empty={<EmptyBlock icon={DoorOpen} title={needle ? 'No room matches' : 'No rooms'} />}>
        {() => (
          <div className="flex flex-col gap-5">
            {floors.map((floor) => {
              const onFloor = rooms.filter((r) => r.floor === floor)
              return (
                <section key={floor} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-fg">{t('Floor {n}', { n: floor })}</h3>
                    <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-fg-secondary tabular">{t('{n} rooms', { n: formatNumber(onFloor.length) })}</span>
                    <span aria-hidden="true" className="h-px flex-1 bg-line" />
                  </div>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
                    {onFloor.map((r) => {
                      const off = r.conformance?.status === 'Does not match'
                      return (
                        <li
                          key={r.room}
                          title={off ? t('The room lacks furniture this tier requires') : undefined}
                          className={cx('flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2', off ? 'border-warning bg-warning-bg' : 'border-line bg-surface')}
                        >
                          <span className="flex items-center justify-between gap-1">
                            <span className="truncate text-base font-semibold text-fg tabular">{r.room}</span>
                            {off && <TriangleAlert aria-label={t('The room lacks furniture this tier requires')} size={14} className="shrink-0 text-warning-fg" />}
                          </span>
                          <span className="truncate text-sm text-fg-tertiary">{tr(r.roomType)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </QueryState>
    </Drawer>
  )
}

export default function RoomClasses() {
  const query = useQuery(['admin-room-classes'], ({ signal }) => api.admin.roomClasses.list(undefined, { signal }))
  const requirements = useQuery(['admin-requirements'], ({ signal }) => api.admin.requirements.list(undefined, { signal }))
  const required = Object.fromEntries((requirements.data?.items ?? []).map((r) => [r.roomClassId, r.requirements]))
  const [editing, setEditing] = useState(null)
  const [furnishing, setFurnishing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const items = query.data?.items ?? []
  const active = items.filter((c) => c.status === 'Active')
  const rate = query.data?.depositRate ?? 0

  return (
    <>
      <PageHeader
        title="Room tiers"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            New room tier
          </Button>
        }
      />
      <Table className="max-h-[45%] shrink-0">
        <THead>
          <tr>
            <Th className="w-35">Room tier</Th>
            <Th className="w-28" align="right">
              Surcharge
            </Th>
            <Th>Required furniture</Th>
            <Th className="w-44" align="right">
              Rooms this term
            </Th>
            <Th className="w-24">Status</Th>
            <Th className="w-48">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={Layers} emptyTitle="No room tiers yet" />
          {items.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium">{tr(c.name)}</Td>
              <Td align="right">+{Math.round(c.surchargeRate * 100)}%</Td>
              <Td className={required[c.id]?.length ? undefined : 'text-fg-tertiary'}>{required[c.id]?.length ? countLines(required[c.id]) : t('None')}</Td>
              <Td align="right" className="tabular">
                {c.rooms > 0 ? (
                  <Button variant="text" icon={DoorOpen} onClick={() => setViewing(c)} className="ml-auto" aria-label={t('View the {n} rooms of {name}', { n: formatNumber(c.rooms), name: tr(c.name) })}>
                    {t('{n} rooms', { n: formatNumber(c.rooms) })}
                  </Button>
                ) : (
                  <span className="text-fg-tertiary">{t('{n} rooms', { n: 0 })}</span>
                )}
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
          <h2 className="text-h3 font-semibold text-fg">{t('Price preview · Term price per bed (deposit {p}%)', { p: Math.round(rate * 100) })}</h2>
          <span className="text-sm text-fg-tertiary">{t('Computed from room types × room tiers × deposit rate. Read-only.')}</span>
        </div>
        <QueryState query={query} compact isEmpty={(d) => !d.roomTypes?.length || !active.length}>
          {(data) => (
            <Table fill>
              <THead>
                <tr>
                  <Th>Room type</Th>
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
      {viewing && <TierRoomsDrawer key={viewing.id} tier={viewing} onClose={() => setViewing(null)} />}
      {editing && <EditDrawer key={editing.id ?? 'new'} item={editing} onClose={() => setEditing(null)} />}
      {furnishing && (
        <RequirementsDrawer key={furnishing.id} roomClass={furnishing} current={required[furnishing.id] ?? []} types={requirements.data?.types ?? []} onClose={() => setFurnishing(null)} />
      )}
    </>
  )
}
