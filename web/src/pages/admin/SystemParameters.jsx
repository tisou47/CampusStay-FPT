import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatNumber, formatVnd } from '@/lib/format'
import { useSettingsGroup } from './SettingsGroup'
import { ConfigPage, useConfigForm } from './shared'
import { t, tr } from '@/i18n'

// SCR-CFG-08 System Parameters (Figma 71:3286). Since 22/11/2026 it also holds the settings of the former Deposit
// (SCR-CFG-04), Utility (SCR-CFG-20) and Deadlines and reminders (SCR-CFG-24) pages and the terminations and late
// check-ins of Refunds, penalties and terminations (SCR-CFG-25), each still read and saved through its own resource:
// GET|PUT /admin/system-parameters → { sections: [{ title, fields: [{ key, label, value, helper, options, type }] }] }
//   Number fields have no `options`; select fields list theirs.
// GET|PUT /admin/fees → { depositPercent, … }: only depositPercent is edited here (the refund rules of the same
//   resource are in Refunds, penalties and terminations). Each Term copies the Deposit when it is built (ADR-20).
// GET|PUT /admin/utility → { priceKwh, priceM3, readingDay, paymentDueDays, rounding, overdueReminder,
//   estimateMonthly, monthsHeld, blockChangesWhenOverdue, options: { readingDays, paymentDueDays, rounding,
//   overdueReminder } }: Meter Readings and utility Invoices use these values from the next billing period.
// GET /admin/settings/deadlines and /admin/settings/refunds → { appliesFrom, settings: [{ key, label, type, value, unit, min, max, usedIn }] };
//   PUT { values: { key: value } } with only what changed (SettingsGroup.jsx).

const ROW = 'border-t border-line py-3 first-of-type:border-t-0'
const digitsOf = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0
const ON_OFF = [
  { value: 'true', label: 'On' },
  { value: 'false', label: 'Off' },
]

/** One setting: label and help on the left, the value on the right. */
function ParamRow({ id, label, helper, changed, children }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-start gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-base font-medium text-fg">
          {tr(label)}
          {changed && <span className="ml-2 text-sm font-normal text-fg-brand">{t('Changed')}</span>}
        </label>
        {helper && <p className="text-sm text-fg-tertiary">{tr(helper)}</p>}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

/**
 * The one shape the page edits another resource through: { ready, draft, value(key), saved(key), set(key, value),
 * dirty, saving, saveError, save(), reset(), serverError(key) }.
 */
function fromConfig(form) {
  return {
    ready: Boolean(form.draft),
    draft: form.draft,
    value: (key) => form.draft?.[key],
    saved: (key) => form.saved?.[key],
    set: (key, value) => form.setValue(key, value),
    dirty: form.dirty,
    saving: form.saving,
    saveError: form.saveError,
    save: () => form.save(),
    reset: form.reset,
    serverError: () => null,
  }
}

/** A settings group (GET|PUT /admin/settings/:group, SettingsGroup.jsx): PUT sends only the values that changed. */
function fromGroup(group) {
  const saved = Object.fromEntries((group.query.data?.settings ?? []).map((s) => [s.key, s.value]))
  return {
    ready: Boolean(group.query.data && group.values),
    draft: group.values,
    value: (key) => group.values?.[key],
    saved: (key) => saved[key],
    set: group.set,
    dirty: group.dirty,
    saving: group.saving,
    saveError: group.error,
    save: () => group.save(),
    reset: group.reset,
    serverError: (key) => group.fields[key],
  }
}

/**
 * A field of another resource. kind: 'int' (whole number from min to max), 'money' (whole ₫ shown with separators,
 * ≥ min), 'select' (options from the resource), 'bool' (On/Off).
 */
function extraError(field, value) {
  if (field.kind === 'int') {
    const whole = /^\d+$/.test(String(value ?? '').trim())
    if (whole && Number(value) >= (field.min ?? 0) && (field.max == null || Number(value) <= field.max)) return null
    if (field.max != null) return t('Enter a number from {min} to {max}', { min: field.min ?? 0, max: field.max })
    return field.min ? t('Enter {n} or more', { n: field.min }) : t('Enter a whole number')
  }
  if (field.kind === 'money') return digitsOf(value) >= (field.min ?? 1) ? null : t('Enter {n} or more', { n: field.min ?? 1 })
  return null
}

function ExtraInput({ id, field, form }) {
  const value = form.value(field.key)
  const bad = Boolean(extraError(field, value) || form.serverError(field.key))
  if (field.kind === 'select') {
    const options = field.options?.(form.draft) ?? []
    return <Select id={id} value={value == null ? '' : String(value)} onChange={(e) => form.set(field.key, e.target.value)} options={options.length ? options : [String(value ?? '')]} />
  }
  if (field.kind === 'bool') {
    return <Select id={id} value={String(Boolean(value))} onChange={(e) => form.set(field.key, e.target.value === 'true')} options={ON_OFF.map((o) => ({ ...o, label: t(o.label) }))} />
  }
  if (field.kind === 'money') {
    return (
      <Input id={id} value={value == null ? '' : formatNumber(digitsOf(value))} onChange={(e) => form.set(field.key, digitsOf(e.target.value))} inputMode="numeric" invalid={bad} className="text-right tabular" />
    )
  }
  return (
    <Input
      id={id}
      value={value ?? ''}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        form.set(field.key, digits === '' ? '' : Number(digits))
      }}
      inputMode="numeric"
      invalid={bad}
      className="text-right tabular"
    />
  )
}

export default function SystemParameters() {
  const { notify } = useToast()
  const { hash } = useLocation()
  const cfg = useConfigForm('system', api.admin.system, {
    onSaved: () => notify({ title: 'System parameters saved', message: 'New values apply to new sessions and invoices.' }),
  })
  const feesForm = useConfigForm('fees', api.admin.fees, {
    onSaved: () => notify({ title: 'Deposit saved', message: 'New terms copy it; students read the change in an announcement.' }),
  })
  const utilityForm = useConfigForm('utility', api.admin.utility, {
    onSaved: () => notify({ title: 'Utility settings saved', message: 'Meter readings use the new values from the next billing period.' }),
  })
  const deadlinesGroup = useSettingsGroup('deadlines', {
    onSaved: () => notify({ title: t('{title} saved', { title: t('Deadlines and reminders') }), message: 'Students read the change in an announcement.' }),
  })
  const terminationsGroup = useSettingsGroup('refunds', {
    onSaved: () => notify({ title: t('{title} saved', { title: t('Terminations and late check-ins') }), message: 'Students read the change in an announcement.' }),
  })
  const deposit = fromConfig(feesForm)
  const utility = fromConfig(utilityForm)
  const deadlines = fromGroup(deadlinesGroup)
  const terminations = fromGroup(terminationsGroup)
  const forms = [fromConfig(cfg), deposit, utility, deadlines, terminations]

  /** A settings group's own list: label, limits and where each setting acts. */
  const groupFields = (group) =>
    (group.query.data?.settings ?? []).map((s) => ({
      key: s.key,
      kind: s.type === 'BOOL' ? 'bool' : 'int',
      min: s.min,
      max: s.max,
      label: s.label,
      helper: s.usedIn ? t('Used in: {place}', { place: tr(s.usedIn) }) : null,
    }))
  /** When a group's changes apply (as the group pages said it). */
  const appliesNote = (group) => (
    <p className="border-t border-line pt-3 text-sm text-fg-tertiary">
      {group.query.data?.appliesFrom
        ? t('A term keeps the values it opened with; a change applies from {term}, the next term to open, and to work started from now on. Students read it in an announcement.', { term: group.query.data.appliesFrom })
        : t('A term keeps the values it opened with; a change applies to the next term you publish and to work started from now on. Students read it in an announcement.')}
    </p>
  )

  /** Sections from other resources, each shown after the System parameters section titled `after`. */
  const extras = [
    {
      id: 'deposit',
      after: 'Pricing',
      title: 'Deposit',
      form: deposit,
      fields: [{ key: 'depositPercent', kind: 'int', min: 1, label: 'Deposit rate (% of term price)', helper: 'An application reaches a manager only after its deposit is paid. Each term can set its own rate in the wizard.' }],
    },
    {
      id: 'utility-billing',
      after: 'Utility',
      title: 'Utility billing',
      form: utility,
      fields: [
        { key: 'priceKwh', kind: 'money', min: 1, label: 'Electricity price (₫/kWh)', helper: 'One meter per room. Each segment is split equally among its residents.' },
        { key: 'priceM3', kind: 'money', min: 1, label: 'Water price (₫/m³)' },
        { key: 'readingDay', kind: 'select', label: 'Monthly reading day', options: (d) => d?.options?.readingDays },
        { key: 'paymentDueDays', kind: 'select', label: 'Payment due', options: (d) => d?.options?.paymentDueDays },
        { key: 'rounding', kind: 'select', label: 'Rounding of each share', options: (d) => d?.options?.rounding },
        { key: 'overdueReminder', kind: 'select', label: 'Overdue reminder', options: (d) => d?.options?.overdueReminder },
      ],
    },
    {
      id: 'utility-deposit',
      after: 'Utility',
      title: 'Utility deposit',
      form: utility,
      fields: [
        { key: 'estimateMonthly', kind: 'money', min: 1, label: 'Estimated monthly utility per student', helper: 'A guarantee held until check-out. It never pays monthly invoices.' },
        { key: 'monthsHeld', kind: 'int', min: 2, label: 'Months held (minimum 2)' },
        { key: 'blockChangesWhenOverdue', kind: 'bool', label: 'Block room changes and swaps while a utility invoice is overdue' },
      ],
      footer: (d) => {
        const ok = digitsOf(d.estimateMonthly) >= 1 && Number(d.monthsHeld) >= 2
        return (
          <div className="flex items-center justify-between gap-6 border-t border-line pt-3 text-base">
            <span className="text-fg-secondary">{t('Utility deposit per student')}</span>
            <span className="font-semibold text-fg-brand tabular">{ok ? formatVnd(digitsOf(d.estimateMonthly) * Number(d.monthsHeld)) : '—'}</span>
          </div>
        )
      },
    },
    {
      id: 'terminations',
      after: 'Utility',
      title: 'Terminations and late check-ins',
      form: terminations,
      fields: groupFields(terminationsGroup),
      footer: () => appliesNote(terminationsGroup),
    },
    {
      id: 'deadlines',
      after: 'Payments',
      title: 'Deadlines and reminders',
      form: deadlines,
      fields: groupFields(deadlinesGroup),
      footer: () => appliesNote(deadlinesGroup),
    },
  ].filter((x) => x.form.ready)

  const sections = cfg.draft?.sections ?? []
  const isBool = (f) => f.type === 'BOOL' || typeof f.value === 'boolean' || f.value === 'true' || f.value === 'false'
  const isDecimal = (f) => f.type === 'DECIMAL' || (!f.options && !isBool(f) && String(f.value ?? '').includes('.'))
  const isBad = (f) => {
    if (f.options || isBool(f)) return false
    const v = String(f.value ?? '').trim()
    return isDecimal(f) ? !/^\d+(\.\d+)?$/.test(v) : !/^\d+$/.test(v)
  }
  const extraChanged = (x, key) => String(x.form.value(key) ?? '') !== String(x.form.saved(key) ?? '')
  const invalid = sections.some((s) => s.fields.some(isBad)) || extras.some((x) => x.fields.some((f) => extraError(f, x.form.value(f.key))))
  const dirty = forms.some((f) => f.dirty)
  const saving = forms.some((f) => f.saving)
  // A group's field errors show under their fields; anything else shows on top.
  const saveErrors = [
    [deposit, 'Could not save the deposit'],
    [utility, 'Could not save the utility settings'],
    [deadlines, 'Could not save the deadlines and reminders'],
    [terminations, 'Could not save the terminations and late check-ins'],
  ].filter(([f]) => f.saveError && !([deadlines, terminations].includes(f) && Object.keys(f.saveError.fields ?? {}).length))
  const savedValue = (si, key) => cfg.saved?.sections?.[si]?.fields?.find((f) => f.key === key)?.value
  const setField = (si, key, value) =>
    cfg.setValue(
      'sections',
      sections.map((s, i) => (i === si ? { ...s, fields: s.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : s)),
    )

  // The cards in the order shown: each server section, then the extras anchored to it; extras whose anchor is
  // missing go last.
  const order = []
  sections.forEach((s, si) => {
    order.push({ type: 'system', si, section: s })
    extras.filter((x) => x.after === s.title).forEach((x) => order.push({ type: 'extra', extra: x }))
  })
  extras.filter((x) => !sections.some((s) => s.title === x.after)).forEach((x) => order.push({ type: 'extra', extra: x }))
  const nav = order.map((o) =>
    o.type === 'system'
      ? {
          id: `params-${o.si}`,
          title: tr(o.section.title),
          count: o.section.fields.length,
          changed: o.section.fields.some((f) => String(f.value ?? '') !== String(savedValue(o.si, f.key) ?? '')),
        }
      : { id: o.extra.id, title: t(o.extra.title), count: o.extra.fields.length, changed: o.extra.fields.some((f) => extraChanged(o.extra, f.key)) },
  )

  // Old links (/admin/fees, /admin/utility, /admin/deadlines) land here with a #section: bring it into view once it is drawn.
  const ready = forms.every((f) => f.ready)
  useEffect(() => {
    if (hash && ready) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash, ready])

  return (
    <ConfigPage
      form={cfg}
      title="System Parameters"
      actions={
        <>
          <Button onClick={() => forms.forEach((f) => f.reset())} disabled={!dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!dirty || invalid || saving} onClick={() => forms.forEach((f) => f.dirty && f.save())}>
            Save
          </Button>
        </>
      }
    >
      {saveErrors.map(([f, title]) => (
        <Alert key={title} type="error" title={title} className="shrink-0">
          {f.saveError.message}
        </Alert>
      ))}
      {/* Sections listed on the left; on the right one scrolling list of cards, a setting per row (label and help on
          the left, the value on the right) so labels read on one or two lines instead of narrow columns. */}
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <nav aria-label={t('Sections')} className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto">
          {nav.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-base text-fg-secondary hover:bg-subtle hover:text-fg"
            >
              <span className="truncate">{s.title}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-fg-tertiary">
                {s.changed && <span aria-label={t('Changed')} className="inline-block size-2 rounded-full bg-primary" />}
                {s.count}
              </span>
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {order.map((o) =>
            o.type === 'system' ? (
              <Card key={`params-${o.si}`} id={`params-${o.si}`} className="flex shrink-0 scroll-mt-2 flex-col">
                <h2 className="pb-1 text-h3 font-semibold text-fg">{tr(o.section.title)}</h2>
                {o.section.fields.map((f) => {
                  const bad = isBad(f)
                  const changed = String(f.value ?? '') !== String(savedValue(o.si, f.key) ?? '')
                  return (
                    <Field key={f.key} className={ROW}>
                      {(id) => (
                        <ParamRow id={id} label={f.label} helper={f.helper} changed={changed}>
                          {f.options ? (
                            <Select id={id} value={f.value} onChange={(e) => setField(o.si, f.key, e.target.value)} options={f.options} />
                          ) : isBool(f) ? (
                            <Select id={id} value={String(f.value)} onChange={(e) => setField(o.si, f.key, e.target.value)} options={ON_OFF.map((x) => ({ ...x, label: t(x.label) }))} />
                          ) : (
                            <Input
                              id={id}
                              value={f.value ?? ''}
                              onChange={(e) => setField(o.si, f.key, e.target.value)}
                              inputMode={isDecimal(f) ? 'decimal' : 'numeric'}
                              invalid={bad}
                              className="text-right tabular"
                            />
                          )}
                          {bad && <p className="text-sm text-error-fg">{t(isDecimal(f) ? 'Enter a valid number' : 'Enter a whole number')}</p>}
                        </ParamRow>
                      )}
                    </Field>
                  )
                })}
              </Card>
            ) : (
              <Card key={o.extra.id} id={o.extra.id} className="flex shrink-0 scroll-mt-2 flex-col">
                <h2 className="pb-1 text-h3 font-semibold text-fg">{t(o.extra.title)}</h2>
                {o.extra.fields.map((f) => {
                  const server = o.extra.form.serverError(f.key)
                  const error = extraError(f, o.extra.form.value(f.key)) ?? (server ? tr(server) : null)
                  return (
                    <Field key={f.key} className={ROW}>
                      {(id) => (
                        <ParamRow id={id} label={f.label} helper={f.helper} changed={extraChanged(o.extra, f.key)}>
                          <ExtraInput id={id} field={f} form={o.extra.form} />
                          {error && <p className="text-sm text-error-fg">{error}</p>}
                        </ParamRow>
                      )}
                    </Field>
                  )
                })}
                {o.extra.footer?.(o.extra.form.draft)}
              </Card>
            ),
          )}
        </div>
      </div>
    </ConfigPage>
  )
}
