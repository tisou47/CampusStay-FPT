import { useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { ConfigPage, SettingSwitch, useConfigForm } from './shared'

// SCR-CFG-04 Fees, Deposit and Refund Rules (Figma 25:1221)
// GET /admin/fees → { depositPercent, depositHours, balanceDays, blockCheckIn, manualConfirm, policyConfirmed,
//   rules: [{ id, when, refundPercent, approver, active }], approverOptions: [string] }
// PUT /admin/fees (same shape)

function RuleModal({ rule, approvers, onClose, onSave }) {
  const [form, setForm] = useState({ when: '', refundPercent: 0, approver: approvers[0] ?? '', active: true, ...rule })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Modal
      open
      onClose={onClose}
      title={rule.id ? 'Edit refund rule' : 'Add refund rule'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!String(form.when).trim()} onClick={() => onSave({ ...form, refundPercent: Number(form.refundPercent) || 0 })}>
            Save rule
          </Button>
        </>
      }
    >
      <Field label="When">{(id) => <Input id={id} value={form.when} onChange={set('when')} placeholder="e.g. Student cancels during the stay" />}</Field>
      <div className="flex gap-3">
        <Field label="Refund of paid amount (%)" className="flex-1">
          {(id) => <Input id={id} value={form.refundPercent} onChange={set('refundPercent')} inputMode="numeric" />}
        </Field>
        <Field label="Approved by" className="flex-1">
          {(id) => <Select id={id} value={form.approver} onChange={set('approver')} options={approvers} />}
        </Field>
      </div>
    </Modal>
  )
}

export default function FeesRules() {
  const { notify } = useToast()
  const cfg = useConfigForm('fees', api.admin.fees, {
    onSaved: () => notify({ title: 'Fees and refund rules saved', message: 'They apply to Invoices issued from now on and are written to the Audit Log.' }),
  })
  const { draft } = cfg
  const [editing, setEditing] = useState(null)

  function saveRule(rule) {
    const rules = rule.id ? draft.rules.map((r) => (r.id === rule.id ? rule : r)) : [...draft.rules, { ...rule, id: `new-${Date.now()}` }]
    cfg.setValue('rules', rules)
    setEditing(null)
  }

  return (
    <ConfigPage
      form={cfg}
      title="Fees and Refunds"
      description="Deposit, balance and refund rules used for every Invoice."
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
              <h2 className="text-h3 font-semibold text-fg">Deposit</h2>
              <Field label="Deposit rate (% of Term price)" helper="An Application reaches Staff only after its deposit is paid.">
                {(id) => <Input id={id} value={draft.depositPercent ?? ''} onChange={cfg.set('depositPercent')} inputMode="numeric" />}
              </Field>
              <Field label="Default payment window (hours)" helper="Each Term can override this in Terms and Windows.">
                {(id) => <Input id={id} value={draft.depositHours ?? ''} onChange={cfg.set('depositHours')} inputMode="numeric" />}
              </Field>
            </Card>
            <Card className="flex min-w-0 flex-1 flex-col gap-4">
              <h2 className="text-h3 font-semibold text-fg">Balance</h2>
              <Field label="Balance due (days after Allocation)">{(id) => <Input id={id} value={draft.balanceDays ?? ''} onChange={cfg.set('balanceDays')} inputMode="numeric" />}</Field>
              <SettingSwitch
                title="Block check-in while the balance is unpaid"
                description="Check-in Desk shows a hard stop for unpaid students."
                checked={Boolean(draft.blockCheckIn)}
                onChange={(v) => cfg.setValue('blockCheckIn', v)}
              />
              <SettingSwitch
                title="Allow manual payment confirmation by Staff"
                description="Fallback when VietQR auto-confirmation fails."
                checked={Boolean(draft.manualConfirm)}
                onChange={(v) => cfg.setValue('manualConfirm', v)}
              />
            </Card>
          </div>
          <Card className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between">
              <h2 className="text-h3 font-semibold text-fg">Refund rules</h2>
              <Button icon={Plus} onClick={() => setEditing({})}>
                Add rule
              </Button>
            </div>
            <Table fill>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th className="w-50" align="right">
                    Refund of paid amount
                  </Th>
                  <Th className="w-56">Approved by</Th>
                  <Th className="w-20">Active</Th>
                  <Th className="w-24">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {(draft.rules ?? []).map((r) => (
                  <Tr key={r.id} className="[&>td]:h-12">
                    <Td>{r.when}</Td>
                    <Td align="right" className="font-medium">
                      {r.refundPercent}%
                    </Td>
                    <Td>{r.approver}</Td>
                    <Td>
                      <Switch
                        aria-label={`${r.when} active`}
                        checked={r.active}
                        onChange={(v) =>
                          cfg.setValue(
                            'rules',
                            draft.rules.map((x) => (x.id === r.id ? { ...x, active: v } : x)),
                          )
                        }
                      />
                    </Td>
                    <Td>
                      <Button variant="text" icon={Pencil} onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                    </Td>
                  </Tr>
                ))}
                {!draft.rules?.length && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyBlock title="No refund rules yet" />
                    </td>
                  </tr>
                )}
              </TBody>
            </Table>
          </Card>
          {!draft.policyConfirmed ? (
            <Alert type="warning" title="Refund policy not confirmed" className="shrink-0" action={<Button onClick={() => cfg.save({ policyConfirmed: true })} disabled={cfg.saving}>Confirm policy</Button>}>
              Confirm the percentages and approvers once the dormitory has approved its refund policy.
            </Alert>
          ) : (
            <Alert type="success" title="Refund policy confirmed" className="shrink-0">
              Changes are logged in the Audit Log.
            </Alert>
          )}
          {editing && <RuleModal rule={editing} approvers={draft.approverOptions ?? []} onClose={() => setEditing(null)} onSave={saveRule} />}
        </>
      )}
    </ConfigPage>
  )
}
