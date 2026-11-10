import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useSession } from '@/app/session'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { DateTimeInput } from '@/components/ui/DatePicker'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { toDateTimeInput } from '@/lib/format'
import { t } from '@/i18n'

// The Family Day form (ADR-29): create a Draft or edit it. Times are whole hours in the browser's zone and go to the
// API as ISO instants; the server checks the rules (registration closes before the first time slot, slots do not
// overlap) and answers field errors such as "slots[1].startsAt".

const iso = (local) => (local ? new Date(local).toISOString() : null)
const emptySlot = { startsAt: '', endsAt: '', capacity: '50' }

function initial(day, block) {
  if (!day) {
    return { block: block ?? '', title: '', description: '', area: '', maxGuests: '3', opens: '', closes: '', slots: [{ ...emptySlot }] }
  }
  return {
    block: day.block,
    title: day.title,
    description: day.description ?? '',
    area: day.area,
    maxGuests: String(day.maxGuests),
    opens: toDateTimeInput(day.registrationOpensAt),
    closes: toDateTimeInput(day.registrationClosesAt),
    slots: day.slots.map((s) => ({ startsAt: toDateTimeInput(s.startsAt), endsAt: toDateTimeInput(s.endsAt), capacity: String(s.capacity) })),
  }
}

export function toBody(form) {
  return {
    block: form.block,
    title: form.title.trim(),
    description: form.description.trim() || null,
    area: form.area.trim(),
    maxGuests: Number(form.maxGuests) || null,
    registrationOpensAt: iso(form.opens),
    registrationClosesAt: iso(form.closes),
    slots: form.slots.map((s) => ({ startsAt: iso(s.startsAt), endsAt: iso(s.endsAt), capacity: Number(s.capacity) || null })),
  }
}

/** Modal with the Family Day form. `day` = the Draft being edited, or null for a new one. */
export function FamilyDayFormModal({ open, day, onClose, onSave, saving, error }) {
  const { blocks, block } = useSession()
  const [form, setForm] = useState(() => initial(day, block))
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setSlot = (i, key, value) => setForm((f) => ({ ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }))
  const fields = error?.details?.fields ?? {}

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title={day ? 'Edit the Family Day' : 'New Family Day'}
      description="Families meet residents in a common area of the Block: never in the Rooms, never overnight."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={() => onSave(toBody(form))}>
            {saving ? t('Saving…') : day ? t('Save changes') : t('Save as Draft')}
          </Button>
        </>
      }
    >
      {error && !error.details?.fields && <Alert type="error" title="Could not save">{error.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Block" required error={fields.block}>
          {(id) => (
            <Select
              id={id}
              value={form.block}
              onChange={(e) => set('block', e.target.value)}
              options={[{ value: '', label: 'Choose a Block' }, ...blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))]}
            />
          )}
        </Field>
        <Field label="Guests per student" required helper="From 1 to 10." error={fields.maxGuests}>
          {(id) => <Input id={id} type="number" min={1} max={10} value={form.maxGuests} onChange={(e) => set('maxGuests', e.target.value)} />}
        </Field>
      </div>
      <Field label="Title" required error={fields.title}>
        {(id) => <Input id={id} maxLength={120} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Family Day – Spring 2027" />}
      </Field>
      <Field label="Where families are received" required error={fields.area}>
        {(id) => <Input id={id} maxLength={200} value={form.area} onChange={(e) => set('area', e.target.value)} placeholder="Ground-floor lobby and courtyard of Block A" />}
      </Field>
      <Field label="Description for students" error={fields.description}>
        {(id) => <Textarea id={id} rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration opens" required error={fields.registrationOpensAt}>
          {(id) => <DateTimeInput id={id} value={form.opens} onChange={(e) => set('opens', e.target.value)} />}
        </Field>
        <Field label="Registration closes" required error={fields.registrationClosesAt}>
          {(id) => <DateTimeInput id={id} value={form.closes} onChange={(e) => set('closes', e.target.value)} />}
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-fg">{t('Time slots')}</h3>
          <Button size="sm" icon={Plus} disabled={form.slots.length >= 10} onClick={() => set('slots', [...form.slots, { ...emptySlot }])}>
            Add a time slot
          </Button>
        </div>
        {fields.slots && <p className="text-sm text-error-fg">{fields.slots}</p>}
        {form.slots.map((s, i) => (
          <div key={i} className="grid items-start gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_7rem_auto]">
            <Field label="Starts" required error={fields[`slots[${i}].startsAt`]}>
              {(id) => <DateTimeInput id={id} value={s.startsAt} onChange={(e) => setSlot(i, 'startsAt', e.target.value)} />}
            </Field>
            <Field label="Ends" required error={fields[`slots[${i}].endsAt`]}>
              {(id) => <DateTimeInput id={id} value={s.endsAt} onChange={(e) => setSlot(i, 'endsAt', e.target.value)} />}
            </Field>
            <Field label="Guests" required error={fields[`slots[${i}].capacity`]}>
              {(id) => <Input id={id} type="number" min={1} max={5000} value={s.capacity} onChange={(e) => setSlot(i, 'capacity', e.target.value)} />}
            </Field>
            <IconButton
              icon={Trash2}
              className="mt-7"
              aria-label={t('Remove the time slot')}
              disabled={form.slots.length === 1}
              onClick={() => set('slots', form.slots.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}
