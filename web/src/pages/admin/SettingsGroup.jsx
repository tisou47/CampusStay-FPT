import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { t, tr } from '@/i18n'

// Admin configuration grouped by subject (spec §9, D-25): Deadlines and reminders; Refunds, penalties and
// terminations; Stay and renewal. Each setting says where it acts and from when it applies; a saved change is
// announced to every student.
// GET /admin/settings/:group → { group, title, appliesFrom, settings: [{ key, label, type (INT, BOOL), value, unit, min,
//   max, usedIn }] } · PUT /admin/settings/:group { values: { key: value } }

const UNITS = { hours: 'hours', days: 'days', months: 'months', '%': '%' }

/** Loads a group and keeps an editable copy; `save()` sends only what changed. */
export function useSettingsGroup(group, { onSaved } = {}) {
  const query = useQuery(['admin-settings', group], ({ signal }) => api.admin.settings(group).get(undefined, { signal }))
  const [values, setValues] = useState(null)
  const [fields, setFields] = useState({})
  useEffect(() => {
    if (query.data) setValues(Object.fromEntries(query.data.settings.map((s) => [s.key, s.value])))
  }, [query.data])
  const saved = query.data ? Object.fromEntries(query.data.settings.map((s) => [s.key, s.value])) : null
  const changed = values && saved ? Object.fromEntries(Object.entries(values).filter(([k, v]) => String(v) !== String(saved[k]))) : {}
  const mutation = useMutation(() => api.admin.settings(group).save({ values: changed }), {
    invalidates: ['admin-settings', 'admin-config'],
    onSuccess: (res) => {
      setFields({})
      onSaved?.(res)
    },
    onError: (err) => setFields(err.fields ?? {}),
  })
  return {
    query,
    values,
    fields,
    dirty: Object.keys(changed).length > 0,
    set: (key, value) => setValues((v) => ({ ...v, [key]: value })),
    reset: () => setValues(saved),
    save: mutation.run,
    saving: mutation.pending,
    error: mutation.error,
  }
}

/** One card of settings: label, where it acts, the value with its unit. */
export function SettingsList({ form }) {
  if (!form.query.data || !form.values) return form.query.error ? <ErrorState error={form.query.error} onRetry={form.query.reload} /> : <LoadingState />
  return (
    <ul className="flex flex-col divide-y divide-line">
      {form.query.data.settings.map((s) => (
        <li key={s.key} className="flex items-center gap-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base font-medium text-fg">{tr(s.label)}</span>
            {s.usedIn && <span className="text-sm text-fg-tertiary">{t('Used in: {place}', { place: tr(s.usedIn) })}</span>}
            {form.fields[s.key] && <span className="text-sm text-error-fg">{tr(form.fields[s.key])}</span>}
          </div>
          {s.type === 'BOOL' ? (
            <Switch aria-label={tr(s.label)} checked={Boolean(form.values[s.key])} onChange={(v) => form.set(s.key, v)} />
          ) : (
            <div className="flex w-44 shrink-0 items-center gap-2">
              <Input
                aria-label={tr(s.label)}
                inputMode="numeric"
                value={form.values[s.key] ?? ''}
                invalid={Boolean(form.fields[s.key])}
                onChange={(e) => form.set(s.key, e.target.value.replace(/\D/g, ''))}
                className="text-right"
              />
              {s.unit && <span className="w-14 shrink-0 text-sm text-fg-secondary">{t(UNITS[s.unit] ?? s.unit)}</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function AppliesFrom({ appliesFrom }) {
  return (
    <Alert title="When changes apply" className="shrink-0">
      {appliesFrom
        ? t('A Term keeps the values it opened with; a change applies from {term}, the next Term to open, and to work started from now on. Students read it in an announcement.', { term: appliesFrom })
        : t('A Term keeps the values it opened with; a change applies to the next Term you publish and to work started from now on. Students read it in an announcement.')}
    </Alert>
  )
}

/** A whole page for one group (Deadlines and reminders; Stay and renewal). */
export default function SettingsGroup({ group, title, description }) {
  const { notify } = useToast()
  const form = useSettingsGroup(group, { onSaved: () => notify({ title: t('{title} saved', { title: t(title) }), message: 'Students read the change in an announcement.' }) })
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button onClick={form.reset} disabled={!form.dirty}>
              Cancel
            </Button>
            <Button variant="primary" icon={Check} disabled={!form.dirty || form.saving} onClick={() => form.save()}>
              Save changes
            </Button>
          </>
        }
      />
      {form.error && !Object.keys(form.error.fields ?? {}).length && <Alert type="error" title="Could not save">{form.error.message}</Alert>}
      <Card className="shrink-0">
        <SettingsList form={form} />
      </Card>
      {form.query.data && <AppliesFrom appliesFrom={form.query.data.appliesFrom} />}
    </>
  )
}
