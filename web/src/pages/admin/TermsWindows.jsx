import { useEffect, useState } from 'react'
import { Calendar, Check, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { EmptyBlock, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, toDateInput, toDateTimeInput } from '@/lib/format'
import { FormSection } from './shared'

// SCR-CFG-01 Terms and Windows (Figma 24:2)
// GET /admin/terms → { items: [{ id, name, status, stayStart, stayEnd, registrationOpensAt, registrationClosesAt, resultsPublishedAt,
//   roommateHours, depositHours, balanceDueAt, checkInStart, checkInEnd, checkOutBy }] }
// POST /admin/terms · PUT /admin/terms/:id · POST /admin/terms/:id/publish

const tone = { 'Registration open': 'success', Draft: 'neutral', Published: 'info', 'In stay': 'info', Closed: 'neutral' }

// Field key → input type (contract C-02): "date" fields are calendar days sent as YYYY-MM-DD (the value of
// <input type="date"> as is); "datetime" fields end in "At" and are sent as ISO instants in UTC.
const fields = {
  name: 'text',
  stayStart: 'date',
  stayEnd: 'date',
  registrationOpensAt: 'datetime',
  registrationClosesAt: 'datetime',
  resultsPublishedAt: 'datetime',
  roommateHours: 'number',
  depositHours: 'number',
  balanceDueAt: 'datetime',
  checkInStart: 'date',
  checkInEnd: 'date',
  checkOutBy: 'date',
}

const toForm = (t) =>
  Object.fromEntries(Object.entries(fields).map(([k, type]) => [k, type === 'date' ? toDateInput(t[k]) : type === 'datetime' ? toDateTimeInput(t[k]) : t[k] ?? '']))
// An empty field is sent as null, never 0: the server then uses its default (an empty "Deposit payment"
// takes the default payment window of Admin › Fees, contract C-11) or names the missing field.
const toValue = (type, value) => {
  if (value === '' || value == null) return null
  if (type === 'number') return Number(value)
  return type === 'datetime' ? new Date(value).toISOString() : value
}
const toBody = (f) => Object.fromEntries(Object.entries(fields).map(([k, type]) => [k, toValue(type, f[k])]))

function TermForm({ term, onCreated }) {
  const { notify } = useToast()
  const isNew = !term.id
  const initial = toForm(term)
  const [form, setForm] = useState(initial)
  useEffect(() => setForm(toForm(term)), [term])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const options = { invalidates: ['admin-terms', 'terms'] }
  const save = useMutation(() => (isNew ? api.admin.terms.create(toBody(form)) : api.admin.terms.update(term.id, toBody(form))), {
    ...options,
    onSuccess: (res) => {
      notify({ title: `${form.name} saved`, message: 'Changes are written to the Audit Log.' })
      if (isNew && res?.id) onCreated(res.id)
    },
    onError: () => {},
  })
  const publish = useMutation(
    async () => {
      const saved = isNew ? await api.admin.terms.create(toBody(form)) : await api.admin.terms.update(term.id, toBody(form))
      return api.admin.terms.publish(saved?.id ?? term.id)
    },
    { ...options, onSuccess: () => notify({ title: `${form.name} published`, message: 'Students see the Term and its windows in the app.' }), onError: () => {} },
  )
  const field = (key, label, helper) => (
    <Field label={label} helper={helper}>
      {(id) => (
        <Input
          id={id}
          type={fields[key] === 'datetime' ? 'datetime-local' : fields[key] === 'date' ? 'date' : fields[key] === 'number' ? 'number' : 'text'}
          value={form[key]}
          onChange={set(key)}
        />
      )}
    </Field>
  )
  const error = save.error ?? publish.error
  const draft = isNew || term.status === 'Draft'

  return (
    <Card padding="lg" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-3">
        <h2 className="text-h2 font-semibold text-fg">{form.name || 'New Term'}</h2>
        <Tag tone={tone[term.status] ?? 'neutral'}>{term.status ?? 'Draft'}</Tag>
      </div>
      {error && <Alert type="error" title="Could not save the Term">{error.message}</Alert>}
      <FormSection title="Term">
        {field('name', 'Name')}
        {field('stayStart', 'Stay starts')}
        {field('stayEnd', 'Stay ends')}
      </FormSection>
      <FormSection title="Registration">
        {field('registrationOpensAt', 'Opens')}
        {field('registrationClosesAt', 'Closes')}
        {field('resultsPublishedAt', 'Assignment results')}
      </FormSection>
      <FormSection title="Payment windows">
        {field('roommateHours', 'Roommate confirmation (hours)')}
        {field('depositHours', 'Deposit payment (hours)', 'Leave empty to use the default payment window of Fees and Rules.')}
        {field('balanceDueAt', 'Balance due')}
      </FormSection>
      <FormSection title="Check-in and check-out">
        {field('checkInStart', 'Check-in from')}
        {field('checkInEnd', 'Check-in until')}
        {field('checkOutBy', 'Check-out by')}
      </FormSection>
      {term.status === 'Registration open' ? (
        <Alert type="warning" title="Registration is open for this Term">
          Changes apply to new Applications only. Existing deposit deadlines keep their original time.
        </Alert>
      ) : draft ? (
        <Alert title="Draft Term">Students do not see this Term until you publish it.{form.registrationOpensAt ? ` Registration then opens on ${formatDateTime(form.registrationOpensAt)}.` : ''}</Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        {draft && (
          <Button onClick={() => publish.run()} disabled={!form.name.trim() || publish.pending}>
            Save and publish
          </Button>
        )}
        <Button onClick={() => setForm(initial)} disabled={!dirty}>
          Cancel
        </Button>
        <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!dirty || !form.name.trim() || save.pending}>
          Save changes
        </Button>
      </div>
    </Card>
  )
}

export default function TermsWindows() {
  const query = useQuery(['admin-terms'], ({ signal }) => api.admin.terms.list(undefined, { signal }))
  const items = query.data?.items ?? []
  const [selectedId, setSelectedId] = useState(null)
  const selected = selectedId === 'new' ? { status: 'Draft' } : items.find((t) => t.id === selectedId) ?? items[0]

  return (
    <>
      <PageHeader
        title="Terms and Windows"
        description="Term cycles and every registration, payment and check-in window. Students see these dates in the app."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setSelectedId('new')}>
            New Term
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Table fill className="w-125 shrink-0 grow-0">
          <THead>
            <tr>
              <Th className="w-30">Term</Th>
              <Th>Stay dates</Th>
              <Th className="w-40">Status</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={3} emptyIcon={Calendar} emptyTitle="No Terms yet" />
            {items.map((t) => (
              <Tr key={t.id} selected={t.id === selected?.id} onClick={() => setSelectedId(t.id)}>
                <Td className="font-medium whitespace-nowrap">{t.name}</Td>
                <Td className="whitespace-nowrap">
                  {formatDate(t.stayStart)} – {formatDate(t.stayEnd)}
                </Td>
                <Td>
                  <Tag tone={tone[t.status] ?? 'neutral'}>{t.status}</Tag>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {selected ? (
          <TermForm
            key={selected.id ?? 'new'}
            term={selected}
            onCreated={(id) => {
              setSelectedId(id)
              invalidate('terms')
            }}
          />
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={Calendar} title="Select a Term" />
          </Card>
        )}
      </div>
    </>
  )
}
