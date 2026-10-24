import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Users, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Avatar, Card } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-AUTH-11 Users and Roles (Figma 63:2150)
// GET /admin/users?q&role&block&status&page&pageSize → { items: [{ id, name, email, role, scope, lastSignInAt, status }], total,
//   roles: [string], blocks: [string], scopeOptions: [string] }
// POST /admin/users (invite) · PUT /admin/users/:id
// GET /admin/permissions → { roles: [{ key, short }], rows: [{ action, allowed: [bool] }] }

const statusTone = { Active: 'success', Invited: 'warning', Disabled: 'neutral' }

function UserModal({ user, roles, scopes, onClose }) {
  const { notify } = useToast()
  const isNew = !user.id
  const [form, setForm] = useState({ name: user.name ?? '', email: user.email ?? '', role: user.role ?? roles[0] ?? '', scope: user.scope ?? scopes[0] ?? '', status: user.status ?? 'Invited' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(() => (isNew ? api.admin.users.invite({ name: form.name.trim(), email: form.email.trim(), role: form.role, scope: form.scope }) : api.admin.users.update(user.id, form)), {
    invalidates: ['admin-users'],
    onSuccess: () => {
      notify({ title: isNew ? t('Invite sent') : t('{name} updated', { name: form.name }), message: isNew ? t('{email} can sign in after accepting the invite.', { email: form.email }) : 'The change is written to the Audit Log.' })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Invite user' : t('Edit {name}', { name: user.name })}
      description={isNew ? 'They get an email with a sign-in link for their FPT account.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!form.name.trim() || !form.email.trim().endsWith('@fpt.edu.vn') || save.pending} onClick={() => save.run()}>
            {isNew ? t('Send invite') : t('Save')}
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <div className="flex gap-3">
        <Field label="Full name" className="flex-1">
          {(id) => <Input id={id} value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="FPT email" className="flex-1">
          {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} disabled={!isNew} placeholder="name@fpt.edu.vn" />}
        </Field>
      </div>
      <div className="flex gap-3">
        <Field label="Role" className="flex-1">
          {(id) => <Select id={id} value={form.role} onChange={set('role')} options={roles} />}
        </Field>
        {form.role === 'Staff' ? (
          <Field label="Block scope" className="flex-1">
            {(id) => <Select id={id} value={form.scope} onChange={set('scope')} options={scopes} />}
          </Field>
        ) : (
          <Field label="Block scope" helper="Managers and Admins work for every Block." className="flex-1">
            {(id) => <Input id={id} value={t('All Blocks')} disabled />}
          </Field>
        )}
      </div>
      {!isNew && (
        <Field label="Status" helper="Disabled users cannot sign in; their history stays in the Audit Log.">
          {(id) => <Select id={id} value={form.status} onChange={set('status')} options={['Active', 'Invited', 'Disabled']} />}
        </Field>
      )}
    </Modal>
  )
}

export default function UsersRoles() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [block, setBlock] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [editing, setEditing] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  const filters = { q: search, role, block, status, page, pageSize }
  const query = useQuery(['admin-users', filters], ({ signal }) => api.admin.users.list(filters, { signal }))
  const perms = useQuery(['admin-permissions'], ({ signal }) => api.admin.users.permissions(undefined, { signal }))
  const d = query.data
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Users and Roles"
        description="Staff, Manager and Admin accounts. Students sign in with FPT accounts and are not created here."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={!d}>
            Invite user
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-70" aria-label={t('Search')} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select wrapperClassName="w-44" aria-label={t('Role')} value={role} onChange={filter(setRole)} options={[{ value: '', label: 'Role: All' }, ...(d?.roles ?? []).map((r) => ({ value: r, label: t('Role: {r}', { r: t(r) }) }))]} />
        <Select wrapperClassName="w-35" aria-label={t('Block')} value={block} onChange={filter(setBlock)} options={[{ value: '', label: 'Block: All' }, ...(d?.blocks ?? []).map((b) => ({ value: b, label: t('Block: {b}', { b }) }))]} />
        <Select wrapperClassName="w-38" aria-label={t('Status')} value={status} onChange={filter(setStatus)} options={[{ value: '', label: 'Status: All' }, ...['Active', 'Invited', 'Disabled'].map((s) => ({ value: s, label: t('Status: {s}', { s: t(s) }) }))]} />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th>User</Th>
                <Th className="w-36">Role</Th>
                <Th className="w-28">Block scope</Th>
                <Th className="w-36">Last sign-in</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-12">
                  <span className="sr-only">{t('Actions')}</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={6} emptyIcon={Users} emptyTitle="No users match these filters" />
              {(d?.items ?? []).map((u) => (
                <Tr key={u.id} className="[&>td]:h-14">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} />
                      <TwoLine primary={u.name} secondary={u.email} />
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{t(u.role)}</Td>
                  <Td>{tr(u.scope)}</Td>
                  <Td className={u.lastSignInAt ? undefined : 'text-fg-tertiary'}>{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : '—'}</Td>
                  <Td>
                    <Tag tone={statusTone[u.status] ?? 'neutral'}>{u.status}</Tag>
                  </Td>
                  <Td>
                    <IconButton icon={Pencil} size="sm" aria-label={t('Edit {name}', { name: u.name })} onClick={() => setEditing(u)} />
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
        <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-2.5 overflow-y-auto">
          <h2 className="text-h3 font-semibold text-fg">{t('Role permissions')}</h2>
          <p className="text-sm text-fg-tertiary">{t('Fixed by role. Staff see their Blocks; Managers and Admins see every Block.')}</p>
          <QueryState query={perms} compact isEmpty={(p) => !p.rows?.length}>
            {(p) => (
              <table className="w-full text-base">
                <thead>
                  <tr className="bg-subtle text-sm font-medium text-fg-secondary">
                    <th scope="col" className="rounded-l-sm py-1.5 pl-1 text-left font-medium">
                      {t('Action')}
                    </th>
                    {p.roles.map((r, i) => (
                      <th key={r.key} scope="col" className={i === p.roles.length - 1 ? 'w-12 rounded-r-sm py-1.5 text-center font-medium' : 'w-12 py-1.5 text-center font-medium'}>
                        {tr(r.short)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((row) => (
                    <tr key={row.action}>
                      <th scope="row" className="py-1.5 text-left font-normal text-fg">
                        {tr(row.action)}
                      </th>
                      {row.allowed.map((ok, i) => (
                        <td key={i} className="text-center">
                          {ok ? <Check size={16} aria-label={t('Allowed')} className="mx-auto text-success" /> : <X size={16} aria-label={t('Not allowed')} className="mx-auto text-fg-disabled" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </QueryState>
        </Card>
      </div>
      {editing && <UserModal user={editing} roles={d?.roles ?? []} scopes={d?.scopeOptions ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}
