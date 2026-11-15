import { useState } from 'react'
import { Contact, HeartHandshake, Home, Mail, Pencil, Phone, Plus, Save, Star, Trash2, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Tooltip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { t } from '@/i18n'
import { InfoTile, Panel } from './profileParts'

// The student's own contact details on My profile: phone and personal email, and emergency contacts
// (GET/PUT /students/me/contacts, …/emergency). Name, code, major and the other directory details stay read-only.

export function useContacts() {
  return useQuery(['contacts'], ({ signal }) => api.me.contacts(undefined, { signal }))
}

/** Every change answers with the whole contacts state, so the cached query is simply refreshed. */
function useContactMutation(fn, success) {
  const { notify } = useToast()
  return useMutation(fn, {
    invalidates: ['contacts', 'profile'],
    onSuccess: () => success && notify({ title: success }),
    onError: () => {},
  })
}

/* ------------------------------------------------------------------ contact information */

export function ContactPanel({ address }) {
  const query = useContacts()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ phone: '', personalEmail: '' })
  const save = useContactMutation((body) => api.me.saveContacts(body), 'Contact details saved')
  const c = query.data
  const errors = save.error?.fields ?? {}

  const start = () => {
    setDraft({ phone: c?.phone ?? '', personalEmail: c?.personalEmail ?? '' })
    setEditing(true)
  }
  const submit = async (e) => {
    e.preventDefault()
    if (await save.run({ phone: draft.phone, personalEmail: draft.personalEmail || null })) setEditing(false)
  }

  return (
    <Panel
      icon={Contact}
      title="Contact information"
      description="You can update this yourself."
      actions={
        c &&
        (editing ? (
          <>
            <Button variant="text" icon={X} iconSize={16} onClick={() => setEditing(false)} disabled={save.pending}>
              Cancel
            </Button>
            <Button variant="primary" icon={Save} iconSize={16} type="submit" form="contact-form" disabled={save.pending}>
              Save
            </Button>
          </>
        ) : (
          <Button icon={Pencil} iconSize={16} onClick={start}>
            Edit
          </Button>
        ))
      }
    >
      <QueryState query={query} compact>
        {() => (
          <form id="contact-form" onSubmit={submit} className="grid items-start gap-3 sm:grid-cols-2" noValidate>
            <InfoTile icon={Mail} label="Student email">
              {c.email}
            </InfoTile>
            {editing ? (
              <Field label="Phone number" error={errors.phone} required>
                {(id) => (
                  <Input
                    id={id}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    value={draft.phone}
                    invalid={Boolean(errors.phone)}
                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="0901 234 567"
                  />
                )}
              </Field>
            ) : (
              <InfoTile icon={Phone} label="Phone number">
                {c.phone || <Empty />}
              </InfoTile>
            )}
            {editing ? (
              <Field label="Personal email" error={errors.personalEmail} helper="Optional">
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="email"
                    value={draft.personalEmail}
                    invalid={Boolean(errors.personalEmail)}
                    onChange={(e) => setDraft((d) => ({ ...d, personalEmail: e.target.value }))}
                    placeholder="name@gmail.com"
                  />
                )}
              </Field>
            ) : (
              <InfoTile icon={Mail} label="Personal email">
                {c.personalEmail || <Empty />}
              </InfoTile>
            )}
            {address && (
              <InfoTile icon={Home} label="Current address">
                {address}
              </InfoTile>
            )}
          </form>
        )}
      </QueryState>
    </Panel>
  )
}

function Empty() {
  return <span className="font-normal text-fg-tertiary">{t('Not added yet')}</span>
}

/* ------------------------------------------------------------------ emergency contacts */

const blank = { name: '', relationship: '', phone: '' }

function EmergencyForm({ initial, relationships, pending, errors, onCancel, onSubmit }) {
  const [draft, setDraft] = useState(initial)
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(draft)
      }}
      className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary-subtle/40 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Full name" error={errors.name} required className="sm:col-span-1">
          {(id) => <Input id={id} autoFocus autoComplete="off" value={draft.name} invalid={Boolean(errors.name)} onChange={set('name')} />}
        </Field>
        <Field label="Relationship" error={errors.relationship} required>
          {(id) => (
            <Select
              id={id}
              value={draft.relationship}
              invalid={Boolean(errors.relationship)}
              onChange={set('relationship')}
              options={[{ value: '', label: t('Choose…'), disabled: true }, ...relationships.map((r) => ({ value: r.value, label: t(r.label) }))]}
            />
          )}
        </Field>
        <Field label="Phone number" error={errors.phone} required>
          {(id) => <Input id={id} type="tel" inputMode="tel" value={draft.phone} invalid={Boolean(errors.phone)} onChange={set('phone')} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="text" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" icon={Save} iconSize={16} disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}

function ContactCard({ contact, onEdit, onPrimary, onRemove, busy }) {
  const initials = contact.name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <li
      className={cx(
        'flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center',
        contact.primary ? 'border-primary/30 bg-primary-subtle/40' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-bold',
            contact.primary ? 'bg-primary text-fg-on-brand' : 'bg-subtle text-fg-secondary',
          )}
        >
          {initials}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold text-fg">{contact.name}</span>
            <span className="rounded-full bg-surface px-2 text-sm text-fg-secondary ring-1 ring-line">{t(contact.relationshipLabel)}</span>
            {contact.primary && (
              <span className="flex items-center gap-1 rounded-full bg-primary px-2 text-sm font-medium text-fg-on-brand">
                <Star size={12} aria-hidden="true" fill="currentColor" />
                {t('Called first')}
              </span>
            )}
          </div>
          <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex w-fit items-center gap-1.5 text-base text-fg-secondary hover:text-fg-link">
            <Phone size={14} aria-hidden="true" />
            {contact.phone}
          </a>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        {!contact.primary && (
          <Tooltip label={t('Call this person first')} side="top" align="end">
            <button
              type="button"
              disabled={busy}
              onClick={onPrimary}
              aria-label={t('Call this person first')}
              className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-warning-bg hover:text-warning disabled:opacity-50"
            >
              <Star size={16} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        <Tooltip label={t('Edit')} side="top" align="end">
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            aria-label={t('Edit')}
            className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50"
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={t('Remove')} side="top" align="end">
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={t('Remove')}
            className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-error-bg hover:text-error-fg disabled:opacity-50"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </li>
  )
}

export function EmergencyPanel() {
  const query = useContacts()
  const c = query.data
  // null: nothing open · 'new': the add form · an id: that contact's edit form
  const [open, setOpen] = useState(null)
  const [removing, setRemoving] = useState(null)
  const add = useContactMutation((body) => api.me.addEmergencyContact(body), 'Emergency contact added')
  const update = useContactMutation(({ id, body }) => api.me.updateEmergencyContact(id, body), 'Emergency contact saved')
  const primary = useContactMutation((id) => api.me.primaryEmergencyContact(id), 'They will be called first')
  const remove = useContactMutation((id) => api.me.removeEmergencyContact(id), 'Emergency contact removed')
  const busy = add.pending || update.pending || primary.pending || remove.pending
  const list = c?.emergencyContacts ?? []
  const full = c && list.length >= c.maxEmergencyContacts

  return (
    <Panel
      icon={HeartHandshake}
      title="Emergency contact"
      description="Who the dormitory calls if something happens to you. The first one is called first."
      actions={
        c && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-tertiary tabular">{`${list.length}/${c.maxEmergencyContacts}`}</span>
            <Button
              icon={Plus}
              iconSize={16}
              disabled={full || open === 'new' || busy}
              title={full ? t('You already have the most emergency contacts allowed.') : undefined}
              onClick={() => setOpen('new')}
            >
              Add contact
            </Button>
          </div>
        )
      }
    >
      <QueryState query={query} compact>
        {() => (
          <div className="flex flex-col gap-3">
            {list.length === 0 && open !== 'new' && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-subtle text-fg-brand">
                  <HeartHandshake size={22} aria-hidden="true" />
                </span>
                <p className="max-w-sm text-base text-fg-secondary">{t('Add at least one person the dormitory can call in an emergency.')}</p>
                <Button variant="primary" icon={Plus} iconSize={16} onClick={() => setOpen('new')}>
                  Add contact
                </Button>
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {list.map((x) =>
                open === x.id ? (
                  <li key={x.id}>
                    <EmergencyForm
                      initial={{ name: x.name, relationship: x.relationship, phone: x.phone }}
                      relationships={c.relationships}
                      pending={update.pending}
                      errors={update.error?.fields ?? {}}
                      onCancel={() => setOpen(null)}
                      onSubmit={async (body) => (await update.run({ id: x.id, body })) && setOpen(null)}
                    />
                  </li>
                ) : (
                  <ContactCard
                    key={x.id}
                    contact={x}
                    busy={busy}
                    onEdit={() => setOpen(x.id)}
                    onPrimary={() => primary.run(x.id)}
                    onRemove={() => setRemoving(x)}
                  />
                ),
              )}
            </ul>
            {open === 'new' && (
              <EmergencyForm
                initial={blank}
                relationships={c.relationships}
                pending={add.pending}
                errors={add.error?.fields ?? {}}
                onCancel={() => setOpen(null)}
                onSubmit={async (body) => (await add.run(body)) && setOpen(null)}
              />
            )}
            {(add.error || update.error || primary.error || remove.error) &&
              !Object.keys((add.error ?? update.error)?.fields ?? {}).length && (
                <p className="text-sm text-error-fg">{(add.error ?? update.error ?? primary.error ?? remove.error).summary ?? (add.error ?? update.error ?? primary.error ?? remove.error).message}</p>
              )}
          </div>
        )}
      </QueryState>
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this emergency contact?"
        description={removing ? t('{name} will no longer be called in an emergency.', { name: removing.name }) : null}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={Trash2}
              iconSize={16}
              disabled={remove.pending}
              onClick={async () => {
                if (await remove.run(removing.id)) setRemoving(null)
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </Panel>
  )
}
