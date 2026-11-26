import { useEffect, useState } from 'react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useUnsavedChanges } from '@/app/unsaved'

// Admin configuration grouped by subject (spec §9, D-25): Deadlines and reminders; Refunds, penalties and
// terminations; Stay and renewal. Each setting says where it acts and from when it applies; a saved change is
// announced to every student. Since 22/11/2026 every group is a section of System parameters (SystemParameters.jsx).
// GET /admin/settings/:group → { group, title, appliesFrom, settings: [{ key, label, type (INT, BOOL), value, unit, min,
//   max, usedIn }] } · PUT /admin/settings/:group { values: { key: value } }

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
  useUnsavedChanges(Object.keys(changed).length > 0)
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
