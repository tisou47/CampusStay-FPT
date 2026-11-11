import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useSession } from '@/app/session'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { DatePickerField, DateTimePickerField, HourPickerField } from '@/components/ui/DateTimePicker'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { toDateTimeInput } from '@/lib/format'
import { t } from '@/i18n'

// The Family Day form (ADR-29): create a Draft or edit it. Times are whole hours in the browser's zone and go to the
// API as ISO instants; the server checks the rules (registration closes before the first time slot, slots do not
// overlap) and answers field errors such as "slots[1].startsAt". A Family Day never runs overnight, so a time slot is
// one day with a start and an end hour.

const iso = (local) => (local ? new Date(local).toISOString() : null)
const pad = (n) => String(n).padStart(2, '0')
const plusHours = (h, n) => (h ? `${pad(Math.min(23, Number(h.slice(0, 2)) + n))}:00` : '')

// Where families are received: one of the three common areas of a Block, never the Rooms. The text is stored on the
// Family Day as chosen. A Family Day saved earlier with another text keeps it as an extra choice ("other").
const AREAS = [
  { value: 'lobby', label: 'Ground-floor lobby of Block {code}' },
  { value: 'common-area', label: 'Common area of Block {code}' },
  { value: 'grounds', label: 'Grounds of Block {code}' },
]
const OTHER = 'other'
const areaText = (key, block) => t(AREAS.find((a) => a.value === key)?.label ?? '', { code: block })

function areaOf(text, block) {
  const found = AREAS.find((a) => areaText(a.value, block) === text)
  return found ? { areaKey: found.value, areaOther: '' } : { areaKey: text ? OTHER : '', areaOther: text ?? '' }
}

const emptySlot = { date: '', start: '', end: '', capacity: '50' }

function initial(day, block) {
  if (!day) {
    return { block: block ?? '', title: '', description: '', areaKey: '', areaOther: '', maxGuests: '3', opens: '', closes: '', slots: [{ ...emptySlot }] }
  }
  return {
    block: day.block,
    title: day.title,
    description: day.description ?? '',
    ...areaOf(day.area, day.block),
    maxGuests: String(day.maxGuests),
    opens: toDateTimeInput(day.registrationOpensAt),
    closes: toDateTimeInput(day.registrationClosesAt),
    slots: day.slots.map((s) => {
      const starts = toDateTimeInput(s.startsAt)
      return { date: starts.slice(0, 10), start: starts.slice(11, 16), end: toDateTimeInput(s.endsAt).slice(11, 16), capacity: String(s.capacity) }
    }),
  }
}

const at = (date, hour) => (date && hour ? `${date}T${hour}` : '')

export function toBody(form) {
  return {
    block: form.block,
    title: form.title.trim(),
    description: form.description.trim() || null,
    area: (!form.block ? '' : form.areaKey === OTHER ? form.areaOther : form.areaKey ? areaText(form.areaKey, form.block) : '').trim(),
    maxGuests: Number(form.maxGuests) || null,
    registrationOpensAt: iso(form.opens),
    registrationClosesAt: iso(form.closes),
    slots: form.slots.map((s) => ({ startsAt: iso(at(s.date, s.start)), endsAt: iso(at(s.date, s.end)), capacity: Number(s.capacity) || null })),
  }
}

/** Modal with the Family Day form. `day` = the Draft being edited, or null for a new one. */
export function FamilyDayFormModal({ open, day, onClose, onSave, saving, error }) {
  const { blocks, block } = useSession()
  // A Manager with one Block gets it chosen; the places are named after the chosen Block.
  const [form, setForm] = useState(() => initial(day, block ?? (blocks.length === 1 ? blocks[0] : '')))
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setSlot = (i, patch) => setForm((f) => ({ ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const fields = error?.details?.fields ?? {}
  const today = toDateTimeInput(new Date()).slice(0, 10)

  // A new time slot follows the last one: same day, starting when it ends, two hours long.
  const addSlot = () =>
    setForm((f) => {
      const last = f.slots[f.slots.length - 1]
      const start = last?.end || ''
      return { ...f, slots: [...f.slots, { ...emptySlot, date: last?.date ?? '', start, end: plusHours(start, 2), capacity: last?.capacity ?? '50' }] }
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
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
        {(id) => (
          <div className="flex flex-col gap-2">
            <Select
              id={id}
              value={form.block ? form.areaKey : ''}
              invalid={!!fields.area}
              disabled={!form.block}
              onChange={(e) => set('areaKey', e.target.value)}
            >
              {/* The prompt shows in the field until a place is chosen, never in the list. */}
              <option value="" disabled hidden>
                {form.block ? t('Choose where families are received') : t('Choose a Block first')}
              </option>
              {form.block &&
                AREAS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {areaText(a.value, form.block)}
                  </option>
                ))}
              {form.block && form.areaOther && <option value={OTHER}>{form.areaOther}</option>}
            </Select>
          </div>
        )}
      </Field>
      <Field label="Description for students" error={fields.description}>
        {(id) => <Textarea id={id} rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration opens" required error={fields.registrationOpensAt}>
          {(id) => <DateTimePickerField id={id} value={form.opens} min={today} invalid={!!fields.registrationOpensAt} onChange={(e) => set('opens', e.target.value)} />}
        </Field>
        <Field label="Registration closes" required error={fields.registrationClosesAt}>
          {(id) => (
            <DateTimePickerField
              id={id}
              value={form.closes}
              min={form.opens || today}
              invalid={!!fields.registrationClosesAt}
              onChange={(e) => set('closes', e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-fg">{t('Time slots')}</h3>
          <Button size="sm" icon={Plus} disabled={form.slots.length >= 10} onClick={addSlot}>
            Add a time slot
          </Button>
        </div>
        {fields.slots && <p className="text-sm text-error-fg">{fields.slots}</p>}
        {form.slots.map((s, i) => (
          <div key={i} className="grid items-start gap-3 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_5.5rem_auto]">
            <Field label="Day" required error={fields[`slots[${i}].startsAt`]}>
              {(id) => (
                <DatePickerField
                  id={id}
                  value={s.date}
                  min={form.closes?.slice(0, 10) || today}
                  invalid={!!fields[`slots[${i}].startsAt`]}
                  onChange={(date) => setSlot(i, { date })}
                />
              )}
            </Field>
            <Field label="From">
              {(id) => (
                <HourPickerField
                  id={id}
                  value={s.start}
                  placeholder="--:--"
                  onChange={(start) => setSlot(i, { start, end: s.end && s.end > start ? s.end : plusHours(start, 2) })}
                />
              )}
            </Field>
            <Field label="To" error={fields[`slots[${i}].endsAt`]}>
              {(id) => (
                <HourPickerField
                  id={id}
                  value={s.end}
                  after={s.start || null}
                  placeholder="--:--"
                  invalid={!!fields[`slots[${i}].endsAt`]}
                  onChange={(end) => setSlot(i, { end })}
                />
              )}
            </Field>
            <Field label="Guests" required error={fields[`slots[${i}].capacity`]}>
              {(id) => <Input id={id} type="number" min={1} max={5000} value={s.capacity} onChange={(e) => setSlot(i, { capacity: e.target.value })} />}
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
