import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Ellipsis } from 'lucide-react'
import { useMutation, useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { IconButton } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

/**
 * Editable copy of one Admin configuration resource ({ get, save } from api.admin).
 * `draft` is null until the saved values arrive; `save(extra)` PUTs the draft (merged with extra).
 */
export function useConfigForm(name, resource, { onSaved } = {}) {
  const query = useQuery(['admin-config', name], ({ signal }) => resource.get(undefined, { signal }))
  const [draft, setDraft] = useState(null)
  useEffect(() => {
    if (query.data) setDraft(query.data)
  }, [query.data])
  const saved = query.data
  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved))
  const mutation = useMutation((extra = {}) => resource.save({ ...draft, ...extra }), {
    invalidates: ['admin-config', 'dashboard', 'catalog'],
    onSuccess: (result) => onSaved?.(result),
    onError: () => {},
  })
  return {
    query,
    draft,
    saved,
    dirty,
    set: (field) => (e) => setDraft((d) => ({ ...d, [field]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e })),
    setValue: (field, value) => setDraft((d) => ({ ...d, [field]: value })),
    reset: () => setDraft(saved),
    save: mutation.run,
    saving: mutation.pending,
    saveError: mutation.error,
  }
}

/** Page header plus the loading / error state of a config form; renders children once the draft is ready. */
export function ConfigPage({ form, title, description, actions, children }) {
  return (
    <>
      <PageHeader title={title} description={description} actions={form.draft ? actions : null} />
      {form.saveError && (
        <Alert type="error" title="Could not save" className="shrink-0">
          {form.saveError.message}
        </Alert>
      )}
      {form.draft ? children : form.query.error ? <ErrorState error={form.query.error} onRetry={form.query.reload} /> : <LoadingState />}
    </>
  )
}

/** Form section: Label/Base secondary heading over a row of fields (Admin forms). */
export function FormSection({ title, columns = 3, className, children }) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {title && <p className="text-base font-medium text-fg-secondary">{tr(title)}</p>}
      <div className={cx('grid gap-4', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3', columns === 4 && 'grid-cols-4')}>{children}</div>
    </div>
  )
}

/** Setting with a title, a one-line explanation and a switch on the right. */
export function SettingSwitch({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-base font-medium text-fg">{tr(title)}</p>
        {description && <p className="text-sm text-fg-tertiary">{tr(description)}</p>}
      </div>
      <Switch aria-label={tr(title)} checked={checked} onChange={onChange} />
    </div>
  )
}

/** Ordered list with move up/down controls (priority groups, processing order). */
export function ReorderList({ items, onChange, label }) {
  const move = (i, dir) => {
    const next = [...items]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    onChange(next)
  }
  return (
    <ol className="flex flex-col gap-2.5" aria-label={tr(label)}>
      {items.map((item, i) => (
        <li key={item.id ?? item.title} className="flex items-center gap-3 rounded-md bg-subtle px-3 py-2">
          <Ellipsis size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
          <span className="text-base font-medium text-fg-secondary">{i + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-medium text-fg">{tr(item.title)}</span>
            {item.note && <span className="text-sm text-fg-tertiary">{tr(item.note)}</span>}
          </div>
          {item.extra != null && <span className="text-sm whitespace-nowrap text-fg-secondary">{tr(item.extra)}</span>}
          <IconButton icon={ArrowUp} size="sm" aria-label={t('Move {item} up', { item: tr(item.title) })} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30" />
          <IconButton icon={ArrowDown} size="sm" aria-label={t('Move {item} down', { item: tr(item.title) })} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30" />
        </li>
      ))}
    </ol>
  )
}
