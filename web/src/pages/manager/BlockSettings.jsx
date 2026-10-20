import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatDate } from '@/lib/format'

// SCR-CFG-20 Block Settings (Figma 70:1488)
// GET /block-settings?block → { deskOpens, deskCloses, visitFrom, visitUntil, quiet, houseRules, editedAt, editedBy,
//   limits: { visitWindow, quietStartsBy }, quietOptions }
// PUT /block-settings { block, deskOpens, deskCloses, visitFrom, visitUntil, quiet, houseRules }

const fields = ['deskOpens', 'deskCloses', 'visitFrom', 'visitUntil', 'quiet', 'houseRules']

const halfHours = (from, to) => {
  const out = []
  for (let m = from * 60; m <= to * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`)
  return out
}

function Form({ saved, block }) {
  const { notify } = useToast()
  const pick = (s) => Object.fromEntries(fields.map((k) => [k, s[k] ?? '']))
  const [form, setForm] = useState(pick(saved))
  useEffect(() => setForm(pick(saved)), [saved])
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(saved))
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const save = useMutation(() => api.blockSettings.save({ block, ...form }), {
    invalidates: ['block-settings'],
    onSuccess: () => notify({ title: 'Block settings saved', message: 'Residents see the new hours and house rules in My Room on web and Android.' }),
    onError: () => {},
  })
  const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list)

  return (
    <>
      <PageHeader
        title={block ? `Block settings · Block ${block}` : 'Block settings'}
        description="Local rules for your Block. Values must stay inside the limits set by Admin."
        actions={
          <>
            <Button onClick={() => setForm(pick(saved))} disabled={!dirty}>
              Cancel
            </Button>
            <Button variant="primary" icon={Check} onClick={() => save.run()} disabled={!dirty || save.pending}>
              Save
            </Button>
          </>
        }
      />
      {save.error && (
        <Alert type="error" title="Could not save" className="shrink-0">
          {save.error.message}
        </Alert>
      )}
      <div className="flex min-h-0 shrink items-stretch gap-4">
        <Card className="flex min-w-0 flex-1 flex-col gap-3.5">
          <h2 className="text-h3 font-semibold text-fg">Front desk and visits</h2>
          <div className="flex gap-4">
            <Field label="Desk opens" className="flex-1">
              {(id) => <Select id={id} value={form.deskOpens} onChange={set('deskOpens')} options={withCurrent(halfHours(6, 9), form.deskOpens)} />}
            </Field>
            <Field label="Desk closes" className="flex-1">
              {(id) => <Select id={id} value={form.deskCloses} onChange={set('deskCloses')} options={withCurrent(halfHours(18, 23), form.deskCloses)} />}
            </Field>
          </div>
          <div className="flex gap-4">
            <Field label="Visitor hours from" className="flex-1">
              {(id) => <Select id={id} value={form.visitFrom} onChange={set('visitFrom')} options={withCurrent(halfHours(7, 10), form.visitFrom)} />}
            </Field>
            <Field label="Visitor hours until" helper={saved.limits?.visitWindow ? `Admin limit: ${saved.limits.visitWindow}` : undefined} className="flex-1">
              {(id) => <Select id={id} value={form.visitUntil} onChange={set('visitUntil')} options={withCurrent(halfHours(17, 21), form.visitUntil)} />}
            </Field>
          </div>
          <Field label="Quiet hours" helper={saved.limits?.quietStartsBy ? `Admin limit: must start by ${saved.limits.quietStartsBy}` : undefined}>
            {(id) => <Select id={id} value={form.quiet} onChange={set('quiet')} options={withCurrent(saved.quietOptions ?? [], form.quiet)} />}
          </Field>
        </Card>
        <Card className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 className="text-h3 font-semibold text-fg">House rules shown to residents</h2>
          <Textarea aria-label="House rules" rows={6} value={form.houseRules} onChange={set('houseRules')} className="min-h-0 flex-1" />
          <p className="text-sm text-fg-tertiary">
            Shown in My Room (web and Android).
            {saved.editedAt ? ` Last edited ${formatDate(saved.editedAt)}${saved.editedBy ? ` by ${saved.editedBy}` : ''}.` : ''}
          </p>
        </Card>
      </div>
      <Alert title="What you cannot change here" className="shrink-0">
        Prices, Room Types, Room Classes, refund rules and check-in windows are set by Admin for all Blocks.
      </Alert>
    </>
  )
}

export default function BlockSettings() {
  const { block } = useSession()
  const query = useQuery(['block-settings', block], ({ signal }) => api.blockSettings.get({ block: block ?? undefined }, { signal }))
  if (query.data) return <Form saved={query.data} block={block} />
  return (
    <>
      <PageHeader title="Block settings" />
      {query.loading ? <LoadingState /> : <ErrorState error={query.error} onRetry={query.reload} />}
    </>
  )
}
