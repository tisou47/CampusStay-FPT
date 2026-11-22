import { useState } from 'react'
import { ChevronRight, Eye, Megaphone, Pin, PinOff, Plus, Send, X } from 'lucide-react'
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
import { cx } from '@/lib/cx'
import { formatDateTime, fromDateTimeInput } from '@/lib/format'
import { t, tr } from '@/i18n'
import { DateTimePicker } from '@/components/ui/date-time'

// SCR-NTF-22 Announcements (spec §6.5, D-08): news on the students' board. Staff write to the residents of their
// Blocks; Managers and the Admin to any audience. The system writes one for every published Term and every money or
// policy change. Each announcement is stored once with a read state per student.
// GET /announcements?q&category&page&pageSize → { items: [{ id, category, audience, blocks, term, title, body, changes,
//   pinned, shownFrom, shownUntil, active, source, createdBy, createdAt, reads, canEdit }], total }
// GET /announcements/options → { categories, audiences, blocks, terms } · POST /announcements · PUT /announcements/:id

export const categoryTone = { Registration: 'brand', Finance: 'warning', Rules: 'info', Operations: 'neutral' }

// Pages of the student portal an announcement may open from the board ("Open"). The API accepts /student paths only.
const studentPages = [
  { value: '/student/applications', label: 'My applications' },
  { value: '/student/room', label: 'My room' },
  { value: '/student/invoices', label: 'My invoices' },
  { value: '/student/requests', label: 'My requests' },
  { value: '/student/requests/maintenance/new', label: 'New maintenance request' },
  { value: '/student/family-days', label: 'Family Days' },
  { value: '/student/round-2-offer', label: 'Round 2 offer' },
]

const TITLE_MAX = 120

/** The announcement as a student sees it opened on the board (Student Home), updated as the form is typed. */
function BoardPreview({ form, linkLabel }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <span className="flex flex-wrap items-center gap-1.5">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
        {form.pinned && <Pin size={13} aria-label={t('Pinned')} className="text-fg-brand" />}
        <Tag tone={categoryTone[form.category] ?? 'neutral'} dot={false}>
          {form.category}
        </Tag>
        <span className={cx('line-clamp-2 text-sm font-medium', form.title.trim() ? 'text-fg' : 'text-fg-tertiary')}>{form.title.trim() || t('Title of the announcement')}</span>
      </span>
      <span className="text-xs text-fg-tertiary">{t('Just now')}</span>
      <p className={cx('line-clamp-6 text-sm whitespace-pre-wrap', form.body.trim() ? 'text-fg-secondary' : 'text-fg-tertiary')}>{form.body.trim() || t('The text students read when they open it.')}</p>
      {linkLabel && (
        <span className="flex items-center gap-1 text-xs font-medium text-fg-link">
          {t('Open')}
          <ChevronRight size={14} aria-hidden="true" />
          <span className="font-normal text-fg-tertiary">({linkLabel})</span>
        </span>
      )}
    </div>
  )
}

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
    link: '',
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
        shownUntil: form.shownUntil ? fromDateTimeInput(form.shownUntil) : null,
        link: form.link || null,
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
  const linkOptions = [
    { value: '', label: t('No link') },
    ...options.terms.map((x) => ({ value: `/student/registration-periods/${x.id}`, label: t('Registration period · {term}', { term: x.name }) })),
    ...studentPages.map((p) => ({ value: p.value, label: t(p.label) })),
  ]
  const linkLabel = form.link ? linkOptions.find((o) => o.value === form.link)?.label : null
  const missingBlocks = form.audience === 'Residents of Blocks' && form.blocks.size === 0

  return (
    <Modal
      open
      onClose={onClose}
      width={980}
      title="New announcement"
      footer={
        <>
          <span className="mr-auto text-sm text-fg-tertiary">{t('It stays as you write it in both languages.')}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Send} disabled={!form.title.trim() || !form.body.trim() || missingBlocks || create.pending} onClick={() => create.run()}>
            Publish
          </Button>
        </>
      }
    >
      {create.error && !Object.keys(create.error.fields ?? {}).length && <Alert type="error" title="Could not publish">{create.error.message}</Alert>}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_20rem]">
        {/* What it says */}
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-base font-medium text-fg">{t('Category')}</legend>
            <div className="flex flex-wrap gap-2">
              {options.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={form.category === c}
                  onClick={() => set('category', c)}
                  className={cx(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    form.category === c ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line text-fg-secondary hover:border-line-strong hover:text-fg',
                  )}
                >
                  {t(c)}
                </button>
              ))}
            </div>
            {fields.category && <p className="text-sm text-error-fg">{tr(fields.category)}</p>}
          </fieldset>
          <Field label="Title" required hint={`${form.title.length}/${TITLE_MAX}`} error={fields.title}>
            {(id) => <Input id={id} maxLength={TITLE_MAX} placeholder={t('For example: Water cut in Block A on Saturday morning')} value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Field label="Text" required error={fields.body}>
            {(id) => <Textarea id={id} rows={8} placeholder={t('What happens, when, and what students should do.')} value={form.body} onChange={(e) => set('body', e.target.value)} />}
          </Field>
          <Field label="Link on the board" helper="Students see “Open” under the announcement and go to this page." error={fields.link}>
            {(id) => <Select id={id} value={form.link} onChange={(e) => set('link', e.target.value)} options={linkOptions} />}
          </Field>
        </div>

        {/* Who reads it, how long, and how it looks */}
        <div className="flex min-w-0 flex-col gap-4 rounded-xl bg-subtle/50 p-4">
          <Field label="Who reads it" error={fields.audience}>
            {(id) => <Select id={id} value={form.audience} options={options.audiences} onChange={(e) => set('audience', e.target.value)} />}
          </Field>
          {form.audience === 'Residents of Blocks' && (
            <fieldset className="-mt-2 flex flex-col gap-2">
              <legend className="sr-only">{t('Blocks')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {options.blocks.map((b) => {
                  const on = form.blocks.has(b)
                  return (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = new Set(form.blocks)
                        if (on) next.delete(b)
                        else next.add(b)
                        set('blocks', next)
                      }}
                      className={cx('min-w-9 rounded-md border px-2 py-1 text-sm font-medium', on ? 'border-primary bg-surface text-fg-brand' : 'border-line bg-surface text-fg-tertiary hover:text-fg')}
                    >
                      {b}
                    </button>
                  )
                })}
              </div>
              {(fields.blocks || missingBlocks) && <p className="text-sm text-error-fg">{fields.blocks ? tr(fields.blocks) : t('Choose at least one block.')}</p>}
            </fieldset>
          )}
          {form.audience === 'Applicants of a Term' && (
            <Field label="Term" error={fields.termId}>
              {(id) => <Select id={id} value={form.termId} options={options.terms.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => set('termId', e.target.value)} />}
            </Field>
          )}
          <Field label="Shown until" helper="Empty: until you end it." error={fields.shownUntil}>
            {(id) => <DateTimePicker id={id} clearable minTime="00:00" maxTime="23:00" value={form.shownUntil} onChange={(v) => set('shownUntil', v)} />}
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <span className="flex flex-col">
              <span className="text-base font-medium text-fg">{t('Pin at the top of the board')}</span>
              <span className="text-sm text-fg-tertiary">{t('Stays first until it ends.')}</span>
            </span>
            <Switch aria-label={t('Pin at the top of the board')} checked={form.pinned} onChange={(v) => set('pinned', v)} />
          </label>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-fg-secondary">
              <Eye size={15} aria-hidden="true" />
              {t('Preview on the students’ board')}
            </span>
            <BoardPreview form={form} linkLabel={linkLabel} />
          </div>
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
