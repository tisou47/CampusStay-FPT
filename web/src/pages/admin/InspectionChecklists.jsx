import { useEffect, useState } from 'react'
import { CircleCheck, Pencil, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-CFG-21 Inspection Checklists (Figma 100:4252)
// GET /inspection-checklists → { items: [{ id, name, version, status: 'Active'|'Draft'|'Archived', updatedAt, archivedAt,
//   items: [{ label, category, severity }], replaced: [{ version, itemCount }] }], categories: [string], severities: [string] }
// POST /inspection-checklists { name } → { id } · POST /inspection-checklists/:id/publish { items } · POST /inspection-checklists/:id/archive
// Severity of a failed item sets the priority of the Maintenance Request it creates.

function ItemModal({ item, categories, severities, onClose, onSave, onRemove }) {
  const [form, setForm] = useState(item.value)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Modal
      open
      onClose={onClose}
      title={item.index == null ? 'Add item' : t('Edit item {n}', { n: item.index + 1 })}
      description="Staff mark each item Pass or Fail. A failed item creates a Maintenance Request in this category."
      footer={
        <>
          {onRemove && (
            <Button variant="danger-text" className="mr-auto" onClick={onRemove}>
              Remove item
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.label.trim()} onClick={() => onSave({ ...form, label: form.label.trim() })}>
            {item.index == null ? t('Add item') : t('Save item')}
          </Button>
        </>
      }
    >
      <Field label="Item">{(id) => <Input id={id} value={form.label} onChange={set('label')} placeholder="e.g. Ceiling fan works" autoFocus />}</Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Maintenance category">{(id) => <Select id={id} value={form.category} onChange={set('category')} options={categories} />}</Field>
        <Field label="Severity if failed" helper="Sets the priority of the request">
          {(id) => <Select id={id} value={form.severity} onChange={set('severity')} options={severities} />}
        </Field>
      </div>
    </Modal>
  )
}

function Editor({ checklist, categories, severities, onArchived }) {
  const { notify, notifyError } = useToast()
  const [items, setItems] = useState(checklist.items ?? [])
  useEffect(() => setItems(checklist.items ?? []), [checklist])
  const [editing, setEditing] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const dirty = JSON.stringify(items) !== JSON.stringify(checklist.items ?? [])
  const isDraft = checklist.status === 'Draft'
  const nextVersion = isDraft ? checklist.version : checklist.version + 1

  const publish = useMutation(() => api.inspections.publishChecklist(checklist.id, { items }), {
    invalidates: ['admin-checklists', 'inspection-schedules'],
    onSuccess: () => notify({ title: t('{name} v{n} published', { name: checklist.name, n: nextVersion }), message: 'New inspection runs use it. Runs already started keep their version.' }),
    onError: (e) => notifyError(e, 'Could not publish'),
  })
  const archive = useMutation(() => api.inspections.archiveChecklist(checklist.id), {
    invalidates: ['admin-checklists', 'inspection-schedules'],
    onSuccess: () => {
      setArchiving(false)
      notify({ type: 'info', title: t('{name} archived', { name: checklist.name }), message: 'It stays in the list for reference.' })
      onArchived()
    },
    onError: (e) => notifyError(e, 'Could not archive'),
  })

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">
          {checklist.name} · v{checklist.version}
          {dirty && <span className="font-normal text-fg-tertiary"> {t('(edited)')}</span>}
        </h2>
        <p className="text-sm text-fg-secondary">
          {isDraft ? t('Add the items, then publish so Managers can schedule it.') : t('Editing creates v{next}. Runs already started keep v{current}.', { next: nextVersion, current: checklist.version })}
        </p>
      </div>
      <Table fill>
        <THead>
          <tr>
            <Th className="w-12">#</Th>
            <Th>Item</Th>
            <Th className="w-45">Maintenance category</Th>
            <Th className="w-35">Severity if failed</Th>
            <Th className="w-12">
              <span className="sr-only">{t('Edit')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {items.map((item, i) => (
            <Tr key={`${item.label}-${i}`} className="group [&>td]:h-10">
              <Td className="tabular">{i + 1}</Td>
              <Td>{item.label}</Td>
              <Td>{tr(item.category)}</Td>
              <Td>{tr(item.severity)}</Td>
              <Td>
                <IconButton icon={Pencil} size="sm" aria-label={t('Edit {name}', { name: item.label })} onClick={() => setEditing({ index: i, value: item })} className="opacity-60 group-hover:opacity-100" />
              </Td>
            </Tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>
                <EmptyBlock title="No items yet">Add the first one.</EmptyBlock>
              </td>
            </tr>
          )}
        </TBody>
      </Table>
      <div className="flex shrink-0 items-start justify-between gap-2">
        <Button icon={Plus} onClick={() => setEditing({ index: null, value: { label: '', category: categories[0] ?? '', severity: severities[severities.length - 2] ?? severities[0] ?? '' } })}>
          Add item
        </Button>
        <div className="flex gap-2">
          {dirty ? (
            <Button onClick={() => setItems(checklist.items ?? [])}>Discard changes</Button>
          ) : (
            <Button onClick={() => setArchiving(true)} disabled={isDraft}>
              Archive
            </Button>
          )}
          <Button variant="primary" disabled={(!dirty && !isDraft) || items.length === 0 || publish.pending} onClick={() => publish.run()}>
            {t('Publish v{n}', { n: nextVersion })}
          </Button>
        </div>
      </div>

      {editing && (
        <ItemModal
          item={editing}
          categories={categories}
          severities={severities}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            setItems(editing.index == null ? [...items, value] : items.map((x, i) => (i === editing.index ? value : x)))
            setEditing(null)
          }}
          onRemove={
            editing.index == null
              ? undefined
              : () => {
                  setItems(items.filter((_, i) => i !== editing.index))
                  setEditing(null)
                }
          }
        />
      )}
      <Modal
        open={archiving}
        onClose={() => setArchiving(false)}
        title={t('Archive {name}?', { name: checklist.name })}
        description="Managers can no longer schedule it. Scheduled runs that use it keep working until they finish."
        footer={
          <>
            <Button onClick={() => setArchiving(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => archive.run()} disabled={archive.pending}>
              Archive
            </Button>
          </>
        }
      />
    </Card>
  )
}

export default function InspectionChecklists() {
  const { notify } = useToast()
  const query = useQuery(['admin-checklists'], ({ signal }) => api.inspections.checklists(undefined, { signal }))
  const all = query.data?.items ?? []
  const active = all.filter((c) => c.status !== 'Archived')
  const archived = [
    ...all.flatMap((c) => (c.replaced ?? []).map((r) => ({ key: `${c.id}-v${r.version}`, name: c.name, version: r.version, count: r.itemCount, note: t('replaced') }))),
    ...all.filter((c) => c.status === 'Archived').map((c) => ({ key: c.id, name: c.name, version: c.version, count: c.items?.length ?? 0, note: t('archived {date}', { date: formatDate(c.archivedAt) }) })),
  ]
  const [selectedId, setSelectedId] = useState(null)
  const selected = active.find((c) => c.id === selectedId) ?? active[0]
  const [creating, setCreating] = useState(null)
  const exists = creating && all.some((c) => c.name.toLowerCase() === creating.trim().toLowerCase())
  const create = useMutation(() => api.inspections.createChecklist({ name: creating.trim() }), {
    invalidates: ['admin-checklists'],
    onSuccess: (res) => {
      setCreating(null)
      if (res?.id) setSelectedId(res.id)
      notify({ title: 'Draft checklist created', message: 'Add its items, then publish.' })
    },
    onError: () => {},
  })

  return (
    <>
      <PageHeader
        title="Inspection checklists"
        description="Checklists used by Staff when Managers schedule inspections. Failed items create Maintenance Requests."
        actions={
          <Button variant="primary" onClick={() => setCreating('')}>
            New checklist
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-100 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-subtle px-4 text-sm font-medium text-fg-secondary">
            <span className="flex-1">{t('Checklist')}</span>
            <span className="w-15">{t('Items')}</span>
            <span className="w-22.5">{t('Status')}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState query={query} compact empty={<EmptyBlock icon={CircleCheck} title="No checklists yet" />}>
              {() => (
                <ul>
                  {active.map((c) => {
                    const on = c.id === selected?.id
                    return (
                      <li key={c.id} className="border-b border-line">
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setSelectedId(c.id)}
                          className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors', on ? 'bg-primary-subtle' : 'hover:bg-subtle')}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-base font-medium text-fg">{c.name}</span>
                            <span className="text-sm text-fg-tertiary">
                              v{c.version} · {c.status === 'Draft' ? t('not published') : t('updated {date}', { date: formatDate(c.updatedAt) })}
                            </span>
                          </span>
                          <span className="w-15 text-base text-fg tabular">{c.items?.length ?? 0}</span>
                          <span className="w-22.5">
                            <Tag tone={c.status === 'Active' ? 'success' : 'warning'}>{c.status}</Tag>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                  {archived.map((c) => (
                    <li key={c.key} className="flex items-center gap-3 border-b border-line px-4 py-2.5">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-base font-medium text-fg">{c.name}</span>
                        <span className="text-sm text-fg-tertiary">
                          v{c.version} · {c.note}
                        </span>
                      </span>
                      <span className="w-15 text-base text-fg tabular">{c.count}</span>
                      <span className="w-22.5">
                        <Tag>Archived</Tag>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </div>
        </div>

        {selected ? (
          <Editor key={`${selected.id}-${selected.version}`} checklist={selected} categories={query.data?.categories ?? []} severities={query.data?.severities ?? []} onArchived={() => setSelectedId(null)} />
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={CircleCheck} title="Select a checklist" />
          </Card>
        )}
      </div>

      <Modal
        open={creating != null}
        onClose={() => setCreating(null)}
        title="New checklist"
        description="It starts as a draft with no items. Managers can schedule it once it is published."
        footer={
          <>
            <Button onClick={() => setCreating(null)}>Cancel</Button>
            <Button variant="primary" disabled={!creating?.trim() || exists || create.pending} onClick={() => create.run()}>
              Create checklist
            </Button>
          </>
        }
      >
        {create.error && <Alert type="error" title="Could not create">{create.error.message}</Alert>}
        <Field label="Checklist name" error={exists ? 'A checklist with this name already exists' : undefined}>
          {(id) => <Input id={id} value={creating ?? ''} onChange={(e) => setCreating(e.target.value)} placeholder="e.g. Water heaters" autoFocus />}
        </Field>
      </Modal>
    </>
  )
}
