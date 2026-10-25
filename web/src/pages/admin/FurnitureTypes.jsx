import { useState } from 'react'
import { Check, Package, Pencil, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Drawer } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-INV-14 Furniture types (Change Spec v2 phase 3, spec §6.19, §9 "Buildings and rooms").
// GET /admin/furniture-types → { items: [{ id, code, name, nameVi, category, definesClass, status, items }], categories }
// POST /admin/furniture-types { code, name, nameVi, category, definesClass, status } · PUT /admin/furniture-types/:id

function EditDrawer({ item, categories, onClose }) {
  const { notify } = useToast()
  const isNew = !item.id
  const [form, setForm] = useState({
    code: item.code ?? '',
    name: item.name ?? '',
    nameVi: item.nameVi ?? '',
    category: item.category ?? categories[0] ?? '',
    definesClass: item.definesClass ?? false,
    status: item.status ?? 'Active',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(() => (isNew ? api.admin.furnitureTypes.create(form) : api.admin.furnitureTypes.update(item.id, form)), {
    invalidates: ['admin-furniture-types', 'admin-requirements'],
    onSuccess: () => {
      notify({ title: t('{name} saved', { name: form.name.trim() }), message: isNew ? 'Register its items in Manager › Furniture.' : 'Changes are written to the Audit Log.' })
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
      <Checkbox
        label="Defines the Room Class"
        description="Room Classes can require it (air conditioner, fridge…). Standard types (bed, wardrobe) are in every Room and do not decide the class."
        checked={form.definesClass}
        onChange={(e) => setForm((x) => ({ ...x, definesClass: e.target.checked }))}
      />
    </Drawer>
  )
}

export default function FurnitureTypes() {
  const query = useQuery(['admin-furniture-types'], ({ signal }) => api.admin.furnitureTypes.list(undefined, { signal }))
  const [editing, setEditing] = useState(null)
  const items = query.data?.items ?? []
  return (
    <>
      <PageHeader
        title="Furniture types"
        description="Kinds of furniture the dormitory tracks. Types that define a Room Class are what the classes require (Room Classes)."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={!query.data}>
            New furniture type
          </Button>
        }
      />
      <Table fill>
        <THead>
          <tr>
            <Th className="w-24">Code</Th>
            <Th>Name</Th>
            <Th className="w-36">Category</Th>
            <Th className="w-48">Role</Th>
            <Th className="w-28" align="right">
              Items recorded
            </Th>
            <Th className="w-28">Status</Th>
            <Th className="w-24">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} rows={items} emptyIcon={Package} emptyTitle="No furniture types yet" />
          {items.map((x) => (
            <Tr key={x.id} className="[&>td]:h-12">
              <Td className="font-medium">{x.code}</Td>
              <Td>
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg">{x.name}</span>
                  <span className="text-sm text-fg-tertiary">{x.nameVi}</span>
                </div>
              </Td>
              <Td>{tr(x.category)}</Td>
              <Td>{x.definesClass ? <Tag tone="brand">Defines the Room Class</Tag> : <Tag>Standard</Tag>}</Td>
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
      {editing && <EditDrawer key={editing.id ?? 'new'} item={editing} categories={query.data?.categories ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}
