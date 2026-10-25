import { useState } from 'react'
import { Megaphone, Pin, PinOff, Plus, Send, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox, Switch } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-NTF-22 Announcements (spec §6.5, D-08): news on the students' board. Staff write to the residents of their
// Blocks; Managers and the Admin to any audience. The system writes one for every published Term and every money or
// policy change. Each announcement is stored once with a read state per student.
// GET /announcements?q&category&page&pageSize → { items: [{ id, category, audience, blocks, term, title, body, changes,
//   pinned, shownFrom, shownUntil, active, source, createdBy, createdAt, reads, canEdit }], total }
// GET /announcements/options → { categories, audiences, blocks, terms } · POST /announcements · PUT /announcements/:id

export const categoryTone = { Registration: 'brand', Finance: 'warning', Rules: 'info', Operations: 'neutral' }

function NewAnnouncement({ options, onClose }) {
  const { notify } = useToast()
  const [form, setForm] = useState({
    category: options.categories[0] ?? '',
    audience: options.audiences[0] ?? '',
    blocks: new Set(options.audiences.length === 1 && options.blocks.length === 1 ? options.blocks : []),
    termId: options.terms[0]?.id ?? '',
    title: '',
    body: '',
    pinned: false,
    shownUntil: '',
  })
  const [fields, setFields] = useState({})
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setFields((f) => ({ ...f, [key]: undefined }))
  }
  const create = useMutation(
    () =>
      api.announcements.create({
        category: form.category,
        audience: form.audience,
        blocks: options.blocks.filter((b) => form.blocks.has(b)),
        termId: form.audience === 'Applicants of a Term' ? form.termId : null,
        title: form.title.trim(),
        body: form.body.trim(),
        pinned: form.pinned,
        shownUntil: form.shownUntil ? new Date(form.shownUntil).toISOString() : null,
      }),
    {
      invalidates: ['announcements'],
      onSuccess: () => {
        notify({ title: 'Announcement published', message: 'Students read it on their board and in the bell.' })
        onClose()
      },
      onError: (err) => setFields(err.fields ?? {}),
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title="New announcement"
      description="It stays as you write it in both languages."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Send} disabled={!form.title.trim() || !form.body.trim() || create.pending} onClick={() => create.run()}>
            Publish
          </Button>
        </>
      }
    >
      {create.error && !Object.keys(create.error.fields ?? {}).length && <Alert type="error" title="Could not publish">{create.error.message}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Category" error={fields.category}>
          {(id) => <Select id={id} value={form.category} options={options.categories} onChange={(e) => set('category', e.target.value)} />}
        </Field>
        <Field label="Who reads it" error={fields.audience}>
          {(id) => <Select id={id} value={form.audience} options={options.audiences} onChange={(e) => set('audience', e.target.value)} />}
        </Field>
      </div>
      {form.audience === 'Residents of Blocks' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-medium text-fg">{t('Blocks')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {options.blocks.map((b) => (
              <Checkbox
                key={b}
                label={t('Block {code}', { code: b })}
                checked={form.blocks.has(b)}
                onChange={() => {
                  const next = new Set(form.blocks)
                  if (next.has(b)) next.delete(b)
                  else next.add(b)
                  set('blocks', next)
                }}
              />
            ))}
          </div>
          {fields.blocks && <p className="text-sm text-error-fg">{tr(fields.blocks)}</p>}
        </fieldset>
      )}
      {form.audience === 'Applicants of a Term' && (
        <Field label="Term" error={fields.termId}>
          {(id) => <Select id={id} value={form.termId} options={options.terms.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => set('termId', e.target.value)} />}
        </Field>
      )}
      <Field label="Title" error={fields.title}>
        {(id) => <Input id={id} value={form.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <Field label="Text" error={fields.body}>
        {(id) => <Textarea id={id} rows={6} value={form.body} onChange={(e) => set('body', e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 items-end gap-4">
        <Field label="Shown until" helper="Empty: until you end it." error={fields.shownUntil}>
          {(id) => <Input id={id} type="datetime-local" value={form.shownUntil} onChange={(e) => set('shownUntil', e.target.value)} />}
        </Field>
        <div className="flex items-center gap-3 pb-1.5">
          <Switch aria-label={t('Pin at the top of the board')} checked={form.pinned} onChange={(v) => set('pinned', v)} />
          <span className="text-base text-fg">{t('Pin at the top of the board')}</span>
        </div>
      </div>
    </Modal>
  )
}

export default function Announcements() {
  const { notifyError } = useToast()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [writing, setWriting] = useState(false)
  const options = useQuery(['announcement-options'], ({ signal }) => api.announcements.options(undefined, { signal }))
  const query = useQuery(['announcements', q, category, page, pageSize], ({ signal }) =>
    api.announcements.list({ q: q.trim() || undefined, category: category || undefined, page, pageSize }, { signal }),
  )
  const change = useMutation((id, body) => api.announcements.change(id, body), { invalidates: ['announcements'], onError: (e) => notifyError(e, 'Could not change the announcement') })
  const items = query.data?.items ?? []

  return (
    <>
      <PageHeader
        title="Announcements"
        description="News on the students' board: written here, and by the system for every published Term and every money or policy change."
        actions={
          <Button variant="primary" icon={Plus} disabled={!options.data} onClick={() => setWriting(true)}>
            New announcement
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-80" placeholder="Search titles" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select
          wrapperClassName="w-48"
          aria-label={t('Category')}
          value={category}
          options={[{ value: '', label: 'All categories' }, ...(options.data?.categories ?? [])]}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
        />
      </div>
      <Table fill>
        <THead>
          <tr>
            <Th>Announcement</Th>
            <Th className="w-36">Category</Th>
            <Th className="w-56">Who reads it</Th>
            <Th className="w-48">Shown</Th>
            <Th className="w-20" align="right">
              Read by
            </Th>
            <Th className="w-28">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={Megaphone} emptyTitle="No announcements yet" />
          {items.map((a) => (
            <Tr key={a.id}>
              <Td>
                <TwoLine primary={a.title} secondary={`${tr(a.source)}${a.createdBy ? ` · ${a.createdBy}` : ''} · ${formatDateTime(a.createdAt)}`} />
              </Td>
              <Td>
                <Tag tone={categoryTone[a.category] ?? 'neutral'}>{a.category}</Tag>
              </Td>
              <Td>
                {tr(a.audience)}
                {a.blocks?.length ? ` · ${a.blocks.join(', ')}` : ''}
                {a.term ? ` · ${a.term}` : ''}
              </Td>
              <Td>
                {a.active ? (
                  <span className="flex items-center gap-1.5">
                    {a.pinned && <Pin size={14} aria-label={t('Pinned')} className="text-fg-brand" />}
                    <span>{a.shownUntil ? t('Until {date}', { date: formatDateTime(a.shownUntil) }) : t('Shown')}</span>
                  </span>
                ) : (
                  <Tag>Ended</Tag>
                )}
              </Td>
              <Td align="right">{a.reads}</Td>
              <Td>
                {a.canEdit && a.active && (
                  <div className="flex justify-end gap-1">
                    <IconButton icon={a.pinned ? PinOff : Pin} aria-label={a.pinned ? t('Unpin') : t('Pin')} onClick={() => change.run(a.id, { pinned: !a.pinned })} />
                    <IconButton icon={X} aria-label={t('End now')} onClick={() => change.run(a.id, { end: true })} />
                  </div>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <Pagination total={query.data?.total ?? 0} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1) }} noun={['announcement', 'announcements']} />
      {writing && options.data && <NewAnnouncement options={options.data} onClose={() => setWriting(false)} />}
    </>
  )
}
