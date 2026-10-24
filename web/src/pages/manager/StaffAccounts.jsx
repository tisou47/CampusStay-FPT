import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Mail, Pencil, Plus, UserCog } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Avatar } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-AUTH-16 Staff accounts (spec §3, §11.2): Managers create Staff accounts and choose the Blocks each one works in.
// GET /staff-accounts?q&block&status&page&pageSize → { items: [{ id, name, email, title, blocks, status, lastSignInAt }],
//   total, blocks, statuses }
// POST /staff-accounts { name, email, title?, blocks } → { id } (invitation email, 72 hours)
// PUT /staff-accounts/:id { name?, title?, blocks?, status? } → item · POST /staff-accounts/:id/invitation → 204

function StaffModal({ person, blocks, onClose }) {
  const { notify } = useToast()
  const isNew = !person.id
  const [form, setForm] = useState({
    name: person.name ?? '',
    email: person.email ?? '',
    title: person.title ?? '',
    blocks: new Set(person.blocks ?? []),
    status: person.status ?? 'Invited',
  })
  const [fields, setFields] = useState({})
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setFields((f) => ({ ...f, [key]: undefined }))
  }
  const chosen = blocks.filter((b) => form.blocks.has(b))
  const save = useMutation(
    () =>
      isNew
        ? api.staffAccounts.create({ name: form.name.trim(), email: form.email.trim(), title: form.title.trim(), blocks: chosen })
        : api.staffAccounts.update(person.id, { name: form.name.trim(), title: form.title.trim(), blocks: chosen, status: form.status }),
    {
      invalidates: ['staff-accounts', 'block-staff'],
      onSuccess: () => {
        notify(
          isNew
            ? { title: t('Invitation sent'), message: t('{email} sets a password from the email link (valid 72 hours).', { email: form.email.trim() }) }
            : { title: t('{name} updated', { name: form.name.trim() }), message: 'The change is written to the Audit Log.' },
        )
        onClose()
      },
      onError: (err) => setFields(err.fields ?? {}),
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={isNew ? 'New Staff account' : t('Edit {name}', { name: person.name })}
      description={isNew ? 'The person gets an email to set a password. What they handle is set on Staff and workload.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!form.name.trim() || !form.email.trim() || !chosen.length || save.pending} onClick={() => save.run()}>
            {isNew ? t('Create and send invitation') : t('Save')}
          </Button>
        </>
      }
    >
      {save.error && !Object.keys(save.error.fields ?? {}).length && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <div className="flex gap-3">
        <Field label="Full name" required className="flex-1" error={fields.name}>
          {(id) => <Input id={id} value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="FPT email" required className="flex-1" error={fields.email}>
          {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} disabled={!isNew} placeholder="name@fpt.edu.vn" />}
        </Field>
      </div>
      <Field label="Job title" error={fields.title} helper="Shown to colleagues, e.g. Residence Life Officer.">
        {(id) => <Input id={id} value={form.title} onChange={set('title')} />}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium text-fg">{t('Blocks')}</legend>
        <div className="grid grid-cols-4 gap-x-4 gap-y-2">
          {blocks.map((b) => (
            <Checkbox
              key={b}
              label={t('Block {code}', { code: b })}
              checked={form.blocks.has(b)}
              onChange={() =>
                setForm((f) => {
                  const next = new Set(f.blocks)
                  if (next.has(b)) next.delete(b)
                  else next.add(b)
                  return { ...f, blocks: next }
                })
              }
            />
          ))}
        </div>
        {fields.blocks && <p className="text-sm text-error-fg">{tr(fields.blocks)}</p>}
      </fieldset>
      {!isNew && (
        <Field label="Status" helper="Disabled accounts cannot sign in. An invited account becomes Active when its owner sets a password." error={fields.status}>
          {(id) => (
            <Select
              id={id}
              value={form.status}
              onChange={set('status')}
              options={(person.status === 'Invited' ? ['Invited', 'Disabled'] : person.status === 'Disabled' ? ['Disabled', 'Active'] : ['Active', 'Disabled'])}
            />
          )}
        </Field>
      )}
    </Modal>
  )
}

export default function StaffAccounts() {
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [block, setBlock] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editing, setEditing] = useState(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const request = { q: search, block, status, page, pageSize }
  const query = useQuery(['staff-accounts', request], ({ signal }) => api.staffAccounts.list(request, { signal }))
  const d = query.data
  // Block staff › "New Staff account" opens the form here (?new=1).
  useEffect(() => {
    if (params.get('new') && d) {
      setEditing({})
      setParams({}, { replace: true })
    }
  }, [params, d, setParams])
  const resend = useMutation((person) => api.staffAccounts.resendInvitation(person.id), {
    onSuccess: (_, person) => notify({ title: t('Invitation sent again'), message: t('{email} gets a new link.', { email: person.email }) }),
    onError: (err) => notify({ type: 'error', title: t('Could not send the invitation'), message: err.message }),
  })

  return (
    <>
      <PageHeader
        title="Staff accounts"
        description="Staff of the dormitory and the Blocks they work in. Managers and Admins are managed by the Admin."
        actions={
          <Button variant="primary" icon={Plus} disabled={!d} onClick={() => setEditing({})}>
            New Staff account
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-70" aria-label={t('Search')} placeholder="Search name, email or title" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select wrapperClassName="w-35" aria-label={t('Block')} value={block} onChange={(e) => { setBlock(e.target.value); setPage(1) }} options={[{ value: '', label: 'Block: All' }, ...(d?.blocks ?? []).map((b) => ({ value: b, label: t('Block: {b}', { b }) }))]} />
        <Select wrapperClassName="w-38" aria-label={t('Status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={[{ value: '', label: 'Status: All' }, ...(d?.statuses ?? []).map((s) => ({ value: s, label: t('Status: {s}', { s: t(s) }) }))]} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th>Staff</Th>
              <Th className="w-56">Job title</Th>
              <Th className="w-32">Blocks</Th>
              <Th className="w-40">Last sign-in</Th>
              <Th className="w-28">Status</Th>
              <Th className="w-24">
                <span className="sr-only">{t('Actions')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={6} emptyIcon={UserCog} emptyTitle="No Staff accounts match these filters" />
            {(d?.items ?? []).map((p) => (
              <Tr key={p.id} className="[&>td]:h-14">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={p.name} />
                    <TwoLine primary={p.name} secondary={p.email} />
                  </div>
                </Td>
                <Td>{p.title ? tr(p.title) : '—'}</Td>
                <Td>{p.blocks.join(', ') || '—'}</Td>
                <Td className={p.lastSignInAt ? undefined : 'text-fg-tertiary'}>{p.lastSignInAt ? formatDateTime(p.lastSignInAt) : '—'}</Td>
                <Td>
                  <StatusTag status={p.status} />
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {p.status === 'Invited' && (
                      <IconButton icon={Mail} size="sm" aria-label={t('Send the invitation again to {name}', { name: p.name })} disabled={resend.pending} onClick={() => resend.run(p)} />
                    )}
                    <IconButton icon={Pencil} size="sm" aria-label={t('Edit {name}', { name: p.name })} onClick={() => setEditing(p)} />
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="flex shrink-0 justify-end">
          <Pagination
            total={d?.total ?? 0}
            page={page}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </div>
      </div>
      {editing && <StaffModal person={editing} blocks={d?.blocks ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}
