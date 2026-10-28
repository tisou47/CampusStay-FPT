import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Steps } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { STEPS } from './TermWizard'
import { t } from '@/i18n'
import { DateInput } from '@/components/ui/DatePicker'

// SCR-CFG-23 New Term (spec §6.4): the General step of the wizard creates the Draft, then the wizard goes on with the
// Timeline. A Term from a Manager's request starts from Requests instead (Build the Term from this request).
// POST /admin/terms/drafts { name, stayStart, stayEnd } → { id }

/** New Term: the General step creates the Draft. */
export default function NewTerm() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', stayStart: '', stayEnd: '' })
  const [fields, setFields] = useState({})
  const create = useMutation(() => api.admin.terms.createDraft({ name: form.name.trim(), stayStart: form.stayStart || null, stayEnd: form.stayEnd || null }), {
    invalidates: ['admin-terms'],
    onSuccess: (res) => navigate(`/admin/terms/${res.id}?step=timeline`),
    onError: (err) => setFields(err.fields ?? {}),
  })
  return (
    <>
      <PageHeader
        title="New Term"
        description="Start with the name and the stay; the Draft is saved after each step."
        breadcrumb={
          <Link to="/admin/terms" className="flex items-center gap-1 text-sm text-fg-tertiary hover:text-fg">
            <ArrowLeft size={14} aria-hidden="true" />
            {t('Terms')}
          </Link>
        }
      />
      <Steps steps={STEPS.map((s) => s.label)} current={0} compact />
      <Card padding="lg" className="flex flex-col gap-4">
        {create.error && !Object.keys(create.error.fields ?? {}).length && <Alert type="error" title="Could not create the Term">{create.error.message}</Alert>}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Name" error={fields.name} helper="e.g. Spring 2027">
            {(id) => <Input id={id} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />}
          </Field>
          <Field label="Stay starts" error={fields.stayStart}>
            {(id) => <DateInput id={id} value={form.stayStart} onChange={(e) => setForm((f) => ({ ...f, stayStart: e.target.value }))} />}
          </Field>
          <Field label="Stay ends" error={fields.stayEnd}>
            {(id) => <DateInput id={id} value={form.stayEnd} onChange={(e) => setForm((f) => ({ ...f, stayEnd: e.target.value }))} />}
          </Field>
        </div>
        <p className="text-sm text-fg-tertiary">{t('Prices start from the Term before (or the default prices), the house rules from the Term before.')}</p>
        <div className="flex justify-end">
          <Button variant="primary" icon={ArrowRight} disabled={!form.name.trim() || create.pending} onClick={() => create.run()}>
            Save and continue
          </Button>
        </div>
      </Card>
    </>
  )
}
