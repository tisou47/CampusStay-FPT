import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { formatNumber, formatVnd } from '@/lib/format'
import { ConfigPage, useConfigForm } from './shared'

// SCR-CFG-20 Utility (Figma 100:3830 — utility part).
// GET /admin/utility → { priceKwh, priceM3, readingDay, paymentDueDays, rounding, overdueReminder, estimateMonthly, monthsHeld,
//   blockChangesWhenOverdue, options: { readingDays, paymentDueDays, rounding, overdueReminder } }
// PUT /admin/utility (same shape). Meter Readings and utility Invoices use these values.

const toNumber = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

function Head({ title, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-h3 font-semibold text-fg">{title}</h2>
      <p className="text-sm text-fg-secondary">{children}</p>
    </div>
  )
}

export default function UtilitySettings() {
  const { notify } = useToast()
  const cfg = useConfigForm('utility', api.admin.utility, {
    onSaved: () => notify({ title: 'Utility settings saved', message: 'Meter Readings use the new values from the next billing period.' }),
  })
  const { draft } = cfg
  const o = draft?.options ?? {}

  const amount = (key, label, min = 1) => {
    const value = draft?.[key]
    const bad = toNumber(value) < min
    return (
      <Field label={label} error={bad ? `Enter ${min} or more` : undefined}>
        {(id) => (
          <Input
            id={id}
            value={value == null ? '' : formatNumber(toNumber(value))}
            onChange={(e) => cfg.setValue(key, toNumber(e.target.value))}
            inputMode="numeric"
            invalid={bad}
          />
        )}
      </Field>
    )
  }
  const select = (key, label, options = []) => (
    <Field label={label}>{(id) => <Select id={id} value={draft?.[key] ?? ''} onChange={cfg.set(key)} options={options.length ? options : [draft?.[key]].filter(Boolean)} />}</Field>
  )
  const invalid = draft && (toNumber(draft.priceKwh) < 1 || toNumber(draft.priceM3) < 1 || toNumber(draft.estimateMonthly) < 1 || toNumber(draft.monthsHeld) < 2)

  return (
    <ConfigPage
      form={cfg}
      title="Utility"
      description="Rules for monthly utility Invoices and the Utility Deposit. Changes apply from the next billing period."
      actions={
        <>
          <Button onClick={cfg.reset} disabled={!cfg.dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!cfg.dirty || invalid || cfg.saving} onClick={() => cfg.save()}>
            Save changes
          </Button>
        </>
      }
    >
      {draft && (
        <div className="flex min-h-0 items-stretch gap-4">
          <Card className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
            <Head title="Utility billing">One meter per Room. Each segment is split equally among its residents.</Head>
            <div className="grid grid-cols-2 gap-4">
              {amount('priceKwh', 'Electricity price (VND/kWh)')}
              {amount('priceM3', 'Water price (VND/m³)')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {select('readingDay', 'Monthly reading day', o.readingDays)}
              {select('paymentDueDays', 'Payment due', o.paymentDueDays)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {select('rounding', 'Rounding of each share', o.rounding)}
              {select('overdueReminder', 'Overdue reminder', o.overdueReminder)}
            </div>
          </Card>
          <Card className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
            <Head title="Utility Deposit">A guarantee held until check-out. It never pays monthly Invoices.</Head>
            <div className="grid grid-cols-2 gap-4">
              {amount('estimateMonthly', 'Estimated monthly utility per Student')}
              {amount('monthsHeld', 'Months held (minimum 2)', 2)}
            </div>
            <div className="flex items-start justify-between text-base">
              <span className="text-fg-secondary">Utility Deposit per Student</span>
              <span className="font-medium text-fg-brand tabular">{invalid ? '—' : formatVnd(toNumber(draft.estimateMonthly) * toNumber(draft.monthsHeld))}</span>
            </div>
            <Checkbox
              label="Block room changes and swaps while a utility Invoice is overdue"
              checked={Boolean(draft.blockChangesWhenOverdue)}
              onChange={(e) => cfg.setValue('blockChangesWhenOverdue', e.target.checked)}
            />
          </Card>
        </div>
      )}
    </ConfigPage>
  )
}
