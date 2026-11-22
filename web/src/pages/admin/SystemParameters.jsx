import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { ConfigPage, useConfigForm } from './shared'
import { t, tr } from '@/i18n'

// SCR-CFG-08 System Parameters (Figma 71:3286), with the Deposit section (formerly SCR-CFG-04, its own page until
// 22/11/2026).
// GET /admin/system-parameters → { sections: [{ title, fields: [{ key, label, value, helper, options }] }] }
// PUT /admin/system-parameters (same shape). Number fields have no `options`; select fields list theirs.
// Deposit: GET|PUT /admin/fees → { depositPercent, depositHours, balanceDays, policyConfirmed, rules, … }; only
// depositPercent is edited here (the refund rules of the same resource are in Refunds, penalties and terminations).
// Each Term copies the Deposit when it is built and keeps it once published (ADR-20).

const DEPOSIT_ID = 'deposit'
const ROW = 'border-t border-line py-3 first-of-type:border-t-0'

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

export default function SystemParameters() {
  const { notify } = useToast()
  const { hash } = useLocation()
  const cfg = useConfigForm('system', api.admin.system, {
    onSaved: () => notify({ title: 'System parameters saved', message: 'New values apply to new sessions and invoices.' }),
  })
  const fees = useConfigForm('fees', api.admin.fees, {
    onSaved: () => notify({ title: 'Deposit saved', message: 'New terms copy it; students read the change in an announcement.' }),
  })
  const sections = cfg.draft?.sections ?? []
  const isBool = (f) => f.type === 'BOOL' || typeof f.value === 'boolean' || f.value === 'true' || f.value === 'false'
  const isDecimal = (f) => f.type === 'DECIMAL' || (!f.options && !isBool(f) && String(f.value ?? '').includes('.'))
  const isBad = (f) => {
    if (f.options || isBool(f)) return false
    const v = String(f.value ?? '').trim()
    return isDecimal(f) ? !/^\d+(\.\d+)?$/.test(v) : !/^\d+$/.test(v)
  }
  const depositBad = fees.draft != null && !/^\d+$/.test(String(fees.draft.depositPercent ?? '').trim())
  const depositChanged = fees.dirty
  const invalid = sections.some((s) => s.fields.some(isBad)) || depositBad
  const dirty = cfg.dirty || fees.dirty
  const saving = cfg.saving || fees.saving
  const savedValue = (si, key) => cfg.saved?.sections?.[si]?.fields?.find((f) => f.key === key)?.value
  const setField = (si, key, value) =>
    cfg.setValue(
      'sections',
      sections.map((s, i) => (i === si ? { ...s, fields: s.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : s)),
    )
  const save = () => {
    if (cfg.dirty) cfg.save()
    if (fees.dirty) fees.save()
  }
  const reset = () => {
    cfg.reset()
    fees.reset()
  }

  // /admin/fees lands here with #deposit: bring the Deposit section into view once it is drawn.
  const depositReady = Boolean(fees.draft && cfg.draft)
  useEffect(() => {
    if (hash === `#${DEPOSIT_ID}` && depositReady) document.getElementById(DEPOSIT_ID)?.scrollIntoView({ block: 'start' })
  }, [hash, depositReady])

  // The sections in the order shown: Pricing first, then the Deposit, then the rest as the server lists them.
  const nav = sections.map((s, si) => ({
    id: `params-${si}`,
    title: tr(s.title),
    count: s.fields.length,
    changed: s.fields.some((f) => String(f.value ?? '') !== String(savedValue(si, f.key) ?? '')),
  }))
  if (fees.draft) nav.splice(Math.min(1, nav.length), 0, { id: DEPOSIT_ID, title: t('Deposit'), count: 1, changed: depositChanged })

  const depositCard = fees.draft && (
    <Card key={DEPOSIT_ID} id={DEPOSIT_ID} className="flex shrink-0 scroll-mt-2 flex-col">
      <h2 className="pb-1 text-h3 font-semibold text-fg">{t('Deposit')}</h2>
      <Field className={ROW}>
        {(id) => (
          <ParamRow id={id} label="Deposit rate (% of term price)" helper="An application reaches a manager only after its deposit is paid. Each term can set its own rate in the wizard." changed={depositChanged}>
            <Input id={id} value={fees.draft.depositPercent ?? ''} onChange={fees.set('depositPercent')} inputMode="numeric" invalid={depositBad} className="text-right tabular" />
            {depositBad && <p className="text-sm text-error-fg">{t('Enter a whole number')}</p>}
          </ParamRow>
        )}
      </Field>
    </Card>
  )

  return (
    <ConfigPage
      form={cfg}
      title="System Parameters"
      actions={
        <>
          <Button onClick={reset} disabled={!dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!dirty || invalid || saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {fees.saveError && (
        <Alert type="error" title="Could not save the deposit" className="shrink-0">
          {fees.saveError.message}
        </Alert>
      )}
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
          {sections.length === 0 && depositCard}
          {sections.map((s, si) => [
            <Card key={s.title} id={`params-${si}`} className="flex shrink-0 scroll-mt-2 flex-col">
              <h2 className="pb-1 text-h3 font-semibold text-fg">{tr(s.title)}</h2>
              {s.fields.map((f) => {
                const bad = isBad(f)
                const changed = String(f.value ?? '') !== String(savedValue(si, f.key) ?? '')
                return (
                  <Field key={f.key} className={ROW}>
                    {(id) => (
                      <ParamRow id={id} label={f.label} helper={f.helper} changed={changed}>
                        {f.options ? (
                          <Select id={id} value={f.value} onChange={(e) => setField(si, f.key, e.target.value)} options={f.options} />
                        ) : isBool(f) ? (
                          <Select
                            id={id}
                            value={String(f.value)}
                            onChange={(e) => setField(si, f.key, e.target.value)}
                            options={[
                              { value: 'true', label: t('On') },
                              { value: 'false', label: t('Off') },
                            ]}
                          />
                        ) : (
                          <Input
                            id={id}
                            value={f.value ?? ''}
                            onChange={(e) => setField(si, f.key, e.target.value)}
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
            </Card>,
            si === 0 ? depositCard : null,
          ])}
        </div>
      </div>
    </ConfigPage>
  )
}
