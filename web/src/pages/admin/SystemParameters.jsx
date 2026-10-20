import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { ConfigPage, useConfigForm } from './shared'

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
      <div className="flex min-h-0 items-stretch gap-4">
        {sections.map((s, si) => (
          <Card key={s.title} className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
            <h2 className="text-h3 font-semibold text-fg">{s.title}</h2>
            {s.fields.map((f) => {
              const bad = isBad(f)
              return (
                <Field key={f.key} label={f.label} helper={f.helper} error={bad ? 'Enter a whole number' : undefined}>
                  {(id) =>
                    f.options ? (
                      <Select id={id} value={f.value} onChange={(e) => setField(si, f.key, e.target.value)} options={f.options} />
                    ) : (
                      <Input id={id} value={f.value ?? ''} onChange={(e) => setField(si, f.key, e.target.value)} inputMode="numeric" invalid={bad} />
                    )
                  }
                </Field>
              )
            })}
          </Card>
        ))}
      </div>
    </ConfigPage>
  )
}
