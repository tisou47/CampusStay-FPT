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
import { ConfigPage, useConfigForm } from './shared'
import { AppliesFrom, SettingsList, useSettingsGroup } from './SettingsGroup'
import { t, tr } from '@/i18n'

// SCR-CFG-25 Refunds, penalties and terminations (spec §9, D-25): the refund rule of every trigger and the settings
// of Utility-debt terminations and late check-ins, on one screen.
// Refund rules: GET|PUT /admin/fees (rules: [{ id, when, refundPercent, approver, active }], approverOptions)
// Settings: GET|PUT /admin/settings/refunds

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

export default function RefundsTerminations() {
  const { notify } = useToast()
  const cfg = useConfigForm('fees', api.admin.fees)
  const settings = useSettingsGroup('refunds')
  const { draft } = cfg
  const [editing, setEditing] = useState(null)
  const dirty = cfg.dirty || settings.dirty
  const saving = cfg.saving || settings.saving

  function saveRule(rule) {
    const rules = rule.id ? draft.rules.map((r) => (r.id === rule.id ? rule : r)) : [...draft.rules, { ...rule, id: `new-${Date.now()}` }]
    cfg.setValue('rules', rules)
    setEditing(null)
  }

  // Both parts save one after the other; a failure stops with its message on screen.
  async function save() {
    if (cfg.dirty && !(await cfg.save())) return
    if (settings.dirty && !(await settings.save())) return
    notify({ title: 'Refunds, penalties and terminations saved', message: 'Students read the change in an announcement; it is written to the Audit Log.' })
  }

  return (
    <ConfigPage
      form={cfg}
      title="Refunds, penalties and terminations"
      description="How much is refunded when a stay or an Application ends, and when Utility debt ends a stay."
      actions={
        <>
          <Button
            onClick={() => {
              cfg.reset()
              settings.reset()
            }}
            disabled={!dirty}
          >
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!dirty || saving} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      {draft && (
        <>
          {settings.error && !Object.keys(settings.error.fields ?? {}).length && <Alert type="error" title="Could not save">{settings.error.message}</Alert>}
          <Card className="flex shrink-0 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-h3 font-semibold text-fg">{t('Refund rules')}</h2>
                <p className="text-sm text-fg-tertiary">{t('One rule per trigger; the approver decides the refunds that are not automatic.')}</p>
              </div>
              <Button icon={Plus} onClick={() => setEditing({})}>
                Add rule
              </Button>
            </div>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th className="w-44" align="right">
                    Refund of paid amount
                  </Th>
                  <Th className="w-40">Approved by</Th>
                  <Th className="w-20">Active</Th>
                  <Th className="w-24">
                    <span className="sr-only">{t('Actions')}</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {(draft.rules ?? []).map((r) => (
                  <Tr key={r.id} className="[&>td]:h-12">
                    <Td>{tr(r.when)}</Td>
                    <Td align="right" className="font-medium">
                      {r.refundPercent}%
                    </Td>
                    <Td>{tr(r.approver)}</Td>
                    <Td>
                      <Switch
                        aria-label={t('{rule} active', { rule: tr(r.when) })}
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
          <Card className="flex shrink-0 flex-col gap-1">
            <h2 className="text-h3 font-semibold text-fg">{t('Terminations and late check-ins')}</h2>
            <SettingsList form={settings} />
          </Card>
          {!draft.policyConfirmed ? (
            <Alert type="warning" title="Refund policy not confirmed" className="shrink-0" action={<Button onClick={() => cfg.save({ policyConfirmed: true })} disabled={cfg.saving}>Confirm policy</Button>}>
              Confirm the percentages and approvers once the dormitory has approved its refund policy.
            </Alert>
          ) : (
            settings.query.data && <AppliesFrom appliesFrom={settings.query.data.appliesFrom} />
          )}
          {editing && <RuleModal rule={editing} approvers={draft.approverOptions ?? []} onClose={() => setEditing(null)} onSave={saveRule} />}
        </>
      )}
    </ConfigPage>
  )
}
