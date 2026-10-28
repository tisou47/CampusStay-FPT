import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { ConfigPage, useConfigForm } from './shared'
import { t, tr } from '@/i18n'

// SCR-CFG-08 System Parameters (Figma 71:3286)
// GET /admin/system-parameters → { sections: [{ title, fields: [{ key, label, value, helper, options }] }] }
// PUT /admin/system-parameters (same shape). Number fields have no `options`; select fields list theirs.

export default function SystemParameters() {
  const { notify } = useToast()
  const cfg = useConfigForm('system', api.admin.system, {
    onSaved: () => notify({ title: 'System parameters saved', message: 'New values apply to new sessions and Invoices.' }),
  })
  const sections = cfg.draft?.sections ?? []
  const isBad = (f) => !f.options && !/^\d+$/.test(String(f.value ?? '').trim())
  const invalid = sections.some((s) => s.fields.some(isBad))
  const savedValue = (si, key) => cfg.saved?.sections?.[si]?.fields?.find((f) => f.key === key)?.value
  const setField = (si, key, value) =>
    cfg.setValue(
      'sections',
      sections.map((s, i) => (i === si ? { ...s, fields: s.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : s)),
    )

  return (
    <ConfigPage
      form={cfg}
      title="System Parameters"
      description="Global values used across CampusStay. Every change is written to the Audit Log."
      actions={
        <>
          <Button onClick={cfg.reset} disabled={!cfg.dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!cfg.dirty || invalid || cfg.saving} onClick={() => cfg.save()}>
            Save
          </Button>
        </>
      }
    >
      {/* Sections listed on the left; on the right one scrolling list of cards, a setting per row (label and help on
          the left, the value on the right) so labels read on one or two lines instead of narrow columns. */}
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <nav aria-label={t('Sections')} className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto">
          {sections.map((s, si) => {
            const changed = s.fields.some((f) => String(f.value ?? '') !== String(savedValue(si, f.key) ?? ''))
            return (
              <a
                key={s.title}
                href={`#params-${si}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`params-${si}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-base text-fg-secondary hover:bg-subtle hover:text-fg"
              >
                <span className="truncate">{tr(s.title)}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-fg-tertiary">
                  {changed && <span aria-label={t('Changed')} className="inline-block size-2 rounded-full bg-primary" />}
                  {s.fields.length}
                </span>
              </a>
            )
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {sections.map((s, si) => (
            <Card key={s.title} id={`params-${si}`} className="flex shrink-0 scroll-mt-2 flex-col">
              <h2 className="pb-1 text-h3 font-semibold text-fg">{tr(s.title)}</h2>
              {s.fields.map((f) => {
                const bad = isBad(f)
                const changed = String(f.value ?? '') !== String(savedValue(si, f.key) ?? '')
                return (
                  <Field key={f.key} className="border-t border-line py-3 first-of-type:border-t-0">
                    {(id) => (
                      <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-start gap-6">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <label htmlFor={id} className="text-base font-medium text-fg">
                            {tr(f.label)}
                            {changed && <span className="ml-2 text-sm font-normal text-fg-brand">{t('Changed')}</span>}
                          </label>
                          {f.helper && <p className="text-sm text-fg-tertiary">{tr(f.helper)}</p>}
                        </div>
                        <div className="flex flex-col gap-1">
                          {f.options ? (
                            <Select id={id} value={f.value} onChange={(e) => setField(si, f.key, e.target.value)} options={f.options} />
                          ) : (
                            <Input id={id} value={f.value ?? ''} onChange={(e) => setField(si, f.key, e.target.value)} inputMode="numeric" invalid={bad} className="text-right tabular" />
                          )}
                          {bad && <p className="text-sm text-error-fg">{t('Enter a whole number')}</p>}
                        </div>
                      </div>
                    )}
                  </Field>
                )
              })}
            </Card>
          ))}
        </div>
      </div>
    </ConfigPage>
  )
}
