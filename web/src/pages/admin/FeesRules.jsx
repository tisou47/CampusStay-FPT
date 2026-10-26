import { Check } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { ConfigPage, useConfigForm } from './shared'
import { t } from '@/i18n'

// SCR-CFG-04 Prices and fees › Deposit (spec §9): the default Deposit of new Terms.
// Each Term copies the Deposit when it is built and keeps it once published (ADR-20); the payment windows are in
// Deadlines and reminders, the refund rules in Refunds, penalties and terminations. Since phase 5 every payment is a
// student's claim confirmed by a Manager and the door code needs the Balance paid (ADR-22): nothing to switch here.
// GET /admin/fees → { depositPercent, depositHours, balanceDays, policyConfirmed, rules, … }
// PUT /admin/fees (same shape)

export default function FeesRules() {
  const { notify } = useToast()
  const cfg = useConfigForm('fees', api.admin.fees, {
    onSaved: () => notify({ title: 'Deposit saved', message: 'New Terms copy it; students read the change in an announcement.' }),
  })
  const { draft } = cfg

  return (
    <ConfigPage
      form={cfg}
      title="Deposit"
      description="The Deposit new Terms start with."
      actions={
        <>
          <Button onClick={cfg.reset} disabled={!cfg.dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!cfg.dirty || cfg.saving} onClick={() => cfg.save()}>
            Save changes
          </Button>
        </>
      }
    >
      {draft && (
        <>
          <div className="flex shrink-0 items-stretch gap-4">
            <Card className="flex min-w-0 flex-1 flex-col gap-4">
              <h2 className="text-h3 font-semibold text-fg">{t('Deposit')}</h2>
              <Field label="Deposit rate (% of Term price)" helper="An Application reaches a Manager only after its Deposit is paid. Each Term can set its own rate in the wizard.">
                {(id) => <Input id={id} value={draft.depositPercent ?? ''} onChange={cfg.set('depositPercent')} inputMode="numeric" />}
              </Field>
            </Card>
            <Card className="flex min-w-0 flex-1 flex-col gap-2">
              <h2 className="text-h3 font-semibold text-fg">{t('Payment confirmation')}</h2>
              <p className="text-base text-fg-secondary">
                {t('Students transfer and press I have transferred; a Manager confirms each claim against the bank statement. The door code is released only once the Balance is paid.')}
              </p>
            </Card>
          </div>
          <Alert title="Where the other settings are" className="shrink-0">
            {t('The Deposit and Balance payment windows are in Deadlines and reminders; refund rules in Refunds, penalties and terminations; the Utility Deposit in Utility.')}
          </Alert>
        </>
      )}
    </ConfigPage>
  )
}
