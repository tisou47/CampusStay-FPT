import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { useOneBlock } from '@/components/layout/BlockPicker'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatDate } from '@/lib/format'
import { t } from '@/i18n'

// SCR-CFG-20 Block house rules (Figma 70:1488; review R-08: one card, desk hours dropped as check-in and check-out
// become self-service; a save without them keeps the stored ones)
// GET /block-settings?block → { visitFrom, visitUntil, quiet, houseRules, editedAt, editedBy,
//   limits: { visitWindow, quietStartsBy }, quietOptions }
// PUT /block-settings { block, visitFrom, visitUntil, quiet, houseRules }

const fields = ['visitFrom', 'visitUntil', 'quiet', 'houseRules']

const halfHours = (from, to) => {
  const out = []
  for (let m = from * 60; m <= to * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`)
  return out
}

function Form({ saved, block, picker }) {
  const { notify } = useToast()
  const pick = (s) => Object.fromEntries(fields.map((k) => [k, s[k] ?? '']))
  const [form, setForm] = useState(pick(saved))
  useEffect(() => setForm(pick(saved)), [saved])
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(saved))
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const save = useMutation(() => api.blockSettings.save({ block, ...form }), {
    invalidates: ['block-settings'],
    onSuccess: () => notify({ title: 'House rules saved', message: 'Residents see the new hours and house rules in My Room on web and Android.' }),
    onError: () => {},
  })
  const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list)

  return (
    <>
      <PageHeader
        title={block ? t('House rules · Block {code}', { code: block }) : 'Block house rules'}
        description="Visiting hours, quiet hours and the rules residents of this Block follow, inside the limits set by Admin."
        actions={
          <>
            {picker}
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
      <Card className="flex min-h-0 shrink flex-col gap-3.5">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Visitor hours from">
            {(id) => <Select id={id} value={form.visitFrom} onChange={set('visitFrom')} options={withCurrent(halfHours(7, 10), form.visitFrom)} />}
          </Field>
          <Field label="Visitor hours until" helper={saved.limits?.visitWindow ? t('Admin limit: {value}', { value: saved.limits.visitWindow }) : undefined}>
            {(id) => <Select id={id} value={form.visitUntil} onChange={set('visitUntil')} options={withCurrent(halfHours(17, 21), form.visitUntil)} />}
          </Field>
          <Field label="Quiet hours" helper={saved.limits?.quietStartsBy ? t('Admin limit: must start by {time}', { time: saved.limits.quietStartsBy }) : undefined}>
            {(id) => <Select id={id} value={form.quiet} onChange={set('quiet')} options={withCurrent(saved.quietOptions ?? [], form.quiet)} />}
          </Field>
        </div>
        <Field label="House rules" className="flex min-h-0 flex-1 flex-col">
          {(id) => <Textarea id={id} rows={8} value={form.houseRules} onChange={set('houseRules')} className="min-h-0 flex-1" />}
        </Field>
        <p className="text-sm text-fg-tertiary">
          {t('Shown in My Room (web and Android).')}
          {saved.editedAt ? ` ${saved.editedBy ? t('Last edited {date} by {name}.', { date: formatDate(saved.editedAt), name: saved.editedBy }) : t('Last edited {date}.', { date: formatDate(saved.editedAt) })}` : ''}
        </p>
      </Card>
      <Alert title="What you cannot change here" className="shrink-0">
        Prices, Room Types, Room Classes, refund rules and check-in windows are set by Admin for all Blocks.
      </Alert>
    </>
  )
}

export default function BlockSettings() {
  const { block, picker } = useOneBlock()
  const query = useQuery(['block-settings', block], ({ signal }) => api.blockSettings.get({ block: block ?? undefined }, { signal }), { enabled: Boolean(block), keepPrevious: false })
  if (query.data) return <Form saved={query.data} block={block} picker={picker} />
  return (
    <>
      <PageHeader title="Block house rules" actions={picker} />
      {query.loading ? <LoadingState /> : <ErrorState error={query.error} onRetry={query.reload} />}
    </>
  )
}
