import { useState } from 'react'
import { Check, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Drawer } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatNumber, formatVnd } from '@/lib/format'
import { t, tr, useI18n } from '@/i18n'

// SCR-INV-14 Furniture types (Change Spec v2 phase 3, spec §6.19, §9 "Buildings and rooms"; value: user decision 19/11/2026).
// GET /admin/furniture-types → { items: [{ id, code, name, nameVi, category, definesClass, status, use, price, items }],
//   categories, uses, conditions: [{ code, name, nameVi, percent }] (best first) }
// PUT /admin/furniture-conditions { items: [{ code (empty: new), name?, nameVi, percent }] } → 204 replaces the levels
// POST /admin/furniture-types { code, name, nameVi, category, definesClass, status, use, price } · PUT /admin/furniture-types/:id

// Digits only: "8.000.000" or "8000000" → 8000000; empty → null (no price yet).
const toPrice = (s) => {
  const digits = String(s ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : null
}

function EditDrawer({ item, categories, uses, onClose }) {
  const { notify } = useToast()
  const isNew = !item.id
  const [form, setForm] = useState({
    code: item.code ?? '',
    name: item.name ?? '',
    nameVi: item.nameVi ?? '',
    category: item.category ?? categories[0] ?? '',
    definesClass: item.definesClass ?? false,
    status: item.status ?? 'Active',
    use: item.use ?? '',
    price: item.price != null ? formatNumber(item.price) : '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const body = () => ({ ...form, use: form.use || undefined, price: toPrice(form.price) })
  const save = useMutation(() => (isNew ? api.admin.furnitureTypes.create(body()) : api.admin.furnitureTypes.update(item.id, body())), {
    invalidates: ['admin-furniture-types', 'admin-requirements'],
    onSuccess: () => {
      notify({ title: t('{name} saved', { name: form.name.trim() }), message: isNew ? 'Register its items in Manager › Furniture.' : 'Changes are written to the audit log.' })
      onClose()
    },
    onError: () => {},
  })
  const f = save.error?.fields ?? {}
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New furniture type' : t('Edit furniture type · {name}', { name: item.name })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!form.name.trim() || !form.nameVi.trim() || (isNew && !form.code.trim()) || save.pending}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.summary}</Alert>}
      <Field label="Code" helper="Starts every asset code, e.g. AC-000123. It cannot change later." error={f.code}>
        {(id) => <Input id={id} value={form.code} onChange={(e) => setForm((x) => ({ ...x, code: e.target.value.toUpperCase() }))} disabled={!isNew} placeholder="e.g. TV" />}
      </Field>
      <Field label="Name (English)" error={f.name}>
        {(id) => <Input id={id} value={form.name} onChange={set('name')} placeholder="e.g. Television" />}
      </Field>
      <Field label="Name (Vietnamese)" error={f.nameVi}>
        {(id) => <Input id={id} value={form.nameVi} onChange={set('nameVi')} placeholder="e.g. Ti vi" />}
      </Field>
      <div className="flex gap-3">
        <Field label="Category" className="flex-1" error={f.category}>
          {(id) => <Select id={id} value={form.category} onChange={set('category')} options={categories.map((c) => ({ value: c, label: tr(c) }))} />}
        </Field>
        <Field label="Status" className="flex-1">
          {(id) => <Select id={id} value={form.status} onChange={set('status')} options={['Active', 'Inactive']} />}
        </Field>
      </div>
      <div className="flex gap-3">
        <Field label="Used by" className="flex-1" helper="Personal: one per bed. Shared: the whole room uses it." error={f.use}>
          {(id) => (
            <Select
              id={id}
              value={form.use}
              onChange={set('use')}
              options={[...(isNew ? [{ value: '', label: t('By category') }] : []), ...uses.map((u) => ({ value: u, label: t(u === 'Personal' ? 'Personal' : 'Shared') }))]}
            />
          )}
        </Field>
        <Field label="Real price (₫)" className="flex-1" helper="The price of one new item. Empty: not set yet." error={f.price}>
          {(id) => <Input id={id} value={form.price} onChange={(e) => setForm((x) => ({ ...x, price: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="numeric" placeholder="e.g. 8.000.000" />}
        </Field>
      </div>
      <Checkbox
        label="Defines the room tier"
        description="Room tiers can require it (air conditioner, fridge…). Standard types (bed, wardrobe) are in every room and do not decide the class."
        checked={form.definesClass}
        onChange={(e) => setForm((x) => ({ ...x, definesClass: e.target.checked }))}
      />
    </Drawer>
  )
}

// Adds, renames, revalues and removes the condition levels; saved together, listed by value (best first).
function ConditionsDrawer({ conditions, onClose }) {
  const { notify } = useToast()
  const [rows, setRows] = useState(() => conditions.map((c) => ({ key: c.code, code: c.code, name: c.name ?? '', nameVi: c.nameVi, percent: String(c.percent) })))
  const setRow = (key, field, value) => setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  const add = () => setRows((list) => [...list, { key: `new-${Date.now()}`, code: null, name: '', nameVi: '', percent: '' }])
  const remove = (key) => setRows((list) => list.filter((r) => r.key !== key))
  const save = useMutation(
    () => api.admin.furnitureConditions.save({ items: rows.map((r) => ({ code: r.code, name: r.name.trim(), nameVi: r.nameVi.trim(), percent: Number(r.percent) })) }),
    {
      invalidates: ['admin-furniture-types'],
      onSuccess: () => {
        notify({ title: 'Condition levels saved', message: 'Changes are written to the audit log.' })
        onClose()
      },
      onError: () => {},
    },
  )
  const filled = rows.length > 0 && rows.every((r) => r.name.trim() && r.nameVi.trim() && r.percent !== '')
  return (
    <Drawer
      open
      width={520}
      onClose={onClose}
      title="Condition levels"
      description="What share of the real price an item is still worth in each condition. Levels are listed by value, best first."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!filled || save.pending}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.fields?.items ?? save.error.summary}</Alert>}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_32px] gap-2 text-sm font-medium text-fg-secondary">
          <span>{t('Name (Vietnamese)')}</span>
          <span>{t('Name (English)')}</span>
          <span>{t('Value (%)')}</span>
          <span className="sr-only">{t('Actions')}</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_32px] items-center gap-2">
            <Input aria-label={t('Name (Vietnamese)')} value={r.nameVi} onChange={(e) => setRow(r.key, 'nameVi', e.target.value)} placeholder="e.g. Scratched" />
            <Input aria-label={t('Name (English)')} value={r.name} onChange={(e) => setRow(r.key, 'name', e.target.value)} placeholder="e.g. Scratched" />
            <Input aria-label={t('Value (%)')} inputMode="numeric" value={r.percent} onChange={(e) => setRow(r.key, 'percent', e.target.value.replace(/\D/g, '').slice(0, 3))} />
            <IconButton icon={Trash2} aria-label={t('Remove level')} onClick={() => remove(r.key)} disabled={rows.length === 1 || HANDOVER_LEVELS.includes(r.code)} />
          </div>
        ))}
        <Button icon={Plus} onClick={add} className="self-start">
          Add level
        </Button>
      </div>
      <p className="mt-4 text-sm text-fg-secondary">
        {t('Inspections, check-in inventories and check-outs use the first four levels: Good is Intact, Worn is Partly damaged, Damaged is More than half damaged and Missing is Completely damaged. At check-out a student pays the share of the real price lost since their check-in inventory.')}
      </p>
    </Drawer>
  )
}

// Levels the room handover records its conditions on (backend Inventory.conditionLoss): they cannot be removed.
const HANDOVER_LEVELS = ['INTACT', 'PARTLY_DAMAGED', 'MOSTLY_DAMAGED', 'DESTROYED']

// The condition levels: what share of its real price an item in each is still worth. Chips wrap, so any number fits.
function ConditionsCard({ conditions, onEdit }) {
  const { lang } = useI18n()
  return (
    <Card padding="sm" className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-fg">{t('Condition levels')}</h2>
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {conditions.map((c) => (
            <li key={c.code} className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle py-1 pr-1 pl-3 text-sm">
              <span className="text-fg">{lang === 'vi' ? c.nameVi : c.name}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 font-semibold text-fg tabular">{c.percent} %</span>
            </li>
          ))}
        </ul>
        <Button size="sm" icon={Pencil} onClick={onEdit}>
          Edit levels
        </Button>
      </div>
      <p className="text-xs text-fg-secondary">
        {t('Share of the asset’s remaining usable value; the percentage lost compared to 100% is used to calculate compensation at check-out.')}
      </p>
    </Card>
  )
}

export default function FurnitureTypes() {
  const { lang } = useI18n()
  const query = useQuery(['admin-furniture-types'], ({ signal }) => api.admin.furnitureTypes.list(undefined, { signal }))
  const [editing, setEditing] = useState(null)
  const items = query.data?.items ?? []
  const conditions = query.data?.conditions ?? []
  const [levels, setLevels] = useState(false)
  return (
    <>
      <PageHeader
        title="Furniture types"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={!query.data}>
            New furniture type
          </Button>
        }
      />
      {conditions.length > 0 && <ConditionsCard conditions={conditions} onEdit={() => setLevels(true)} />}
      <Table fill>
        <THead>
          <tr>
            <Th className="w-24">Code</Th>
            <Th>Name</Th>
            <Th className="w-32">Category</Th>
            <Th className="w-28">Used by</Th>
            <Th className="w-48">Role</Th>
            <Th className="w-36" align="right">
              Real price
            </Th>
            <Th className="w-24" align="right">
              Items recorded
            </Th>
            <Th className="w-32">Status</Th>
            <Th className="w-24">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={9} rows={items} emptyIcon={Package} emptyTitle="No furniture types yet" />
          {items.map((x) => (
            <Tr key={x.id} className="[&>td]:h-12">
              <Td className="font-medium">{x.code}</Td>
              <Td>
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg">{lang === 'vi' ? x.nameVi : x.name}</span>
                  <span className="text-sm text-fg-tertiary">{lang === 'vi' ? x.name : x.nameVi}</span>
                </div>
              </Td>
              <Td>{tr(x.category)}</Td>
              <Td>{x.use === 'Shared' ? <Tag tone="info">Shared</Tag> : <Tag>Personal</Tag>}</Td>
              <Td>{x.definesClass ? <Tag tone="brand">Defines the room tier</Tag> : <Tag>Standard</Tag>}</Td>
              <Td align="right" className="tabular">
                {x.price != null ? formatVnd(x.price) : <span className="text-fg-tertiary">{t('Not set')}</span>}
              </Td>
              <Td align="right" className="tabular">
                {formatNumber(x.items)}
              </Td>
              <Td>
                <StatusTag status={x.status} />
              </Td>
              <Td>
                <Button variant="text" icon={Pencil} onClick={() => setEditing(x)}>
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {editing && <EditDrawer key={editing.id ?? 'new'} item={editing} categories={query.data?.categories ?? []} uses={query.data?.uses ?? ['Personal', 'Shared']} onClose={() => setEditing(null)} />}
      {levels && <ConditionsDrawer conditions={conditions} onClose={() => setLevels(false)} />}
    </>
  )
}
