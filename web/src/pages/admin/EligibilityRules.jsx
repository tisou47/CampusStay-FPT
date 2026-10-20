import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { ConfigPage, ReorderList, SettingSwitch, useConfigForm } from './shared'

// SCR-CFG-05 Eligibility Rules (Figma 71:2607)
// GET /admin/eligibility → { criteria: [{ key, title, note, on }], groups: [{ id, title, note, applied }], appliesFromTermName }
// PUT /admin/eligibility (same shape; new groups have no id)

export default function EligibilityRules() {
  const { notify } = useToast()
  const cfg = useConfigForm('eligibility', api.admin.eligibility, {
    onSaved: (res) => notify({ title: 'Eligibility rules saved', message: `They apply from ${res?.appliesFromTermName ?? 'the next Term that opens'}.` }),
  })
  const { draft } = cfg
  const [adding, setAdding] = useState(false)
  const [group, setGroup] = useState({ title: '', note: '' })

  return (
    <ConfigPage
      form={cfg}
      title="Eligibility Rules"
      description="Who can apply each Term, and who is processed first when Beds run short."
      actions={
        <>
          <Button onClick={cfg.reset} disabled={!cfg.dirty}>
            Cancel
          </Button>
          <Button variant="primary" icon={Check} disabled={!cfg.dirty || cfg.saving} onClick={() => cfg.save()}>
            Save
          </Button>
        </>
      }
    >
      {draft && (
        <>
          <div className="flex min-h-0 flex-1 items-stretch gap-4">
            <Card className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto">
              <h2 className="text-h3 font-semibold text-fg">Who can apply</h2>
              <p className="text-sm text-fg-tertiary">All active criteria must pass. Checked against FPT student records on submit.</p>
              {(draft.criteria ?? []).map((c) => (
                <div key={c.key} className="py-1.5">
                  <SettingSwitch
                    title={c.title}
                    description={c.on ? c.note : 'Off'}
                    checked={c.on}
                    onChange={(on) =>
                      cfg.setValue(
                        'criteria',
                        draft.criteria.map((x) => (x.key === c.key ? { ...x, on } : x)),
                      )
                    }
                  />
                </div>
              ))}
            </Card>
            <Card className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-h3 font-semibold text-fg">Priority groups</h2>
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  Add group
                </Button>
              </div>
              <p className="text-sm text-fg-tertiary">Higher groups are processed first by the assignment engine. Use the arrows to reorder.</p>
              <ReorderList
                label="Priority groups"
                items={(draft.groups ?? []).map((g) => ({ ...g, extra: g.applied != null ? `${g.applied} applied` : null }))}
                onChange={(groups) => cfg.setValue('groups', groups.map(({ extra: _extra, ...g }) => g))}
              />
            </Card>
          </div>
          <Alert type="warning" title="Changes apply from the next Term that opens" className="shrink-0">
            A Term keeps the rules it opened with. Disability status is sensitive data: only the group flag is stored, never the reason.
          </Alert>
          <Modal
            open={adding}
            onClose={() => setAdding(false)}
            title="Add priority group"
            footer={
              <>
                <Button onClick={() => setAdding(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={!group.title.trim()}
                  onClick={() => {
                    const groups = [...(draft.groups ?? [])]
                    groups.splice(Math.max(0, groups.length - 1), 0, { title: group.title.trim(), note: group.note.trim() || 'List uploaded per Term' })
                    cfg.setValue('groups', groups)
                    setGroup({ title: '', note: '' })
                    setAdding(false)
                  }}
                >
                  Add group
                </Button>
              </>
            }
          >
            <Field label="Group name">{(id) => <Input id={id} value={group.title} onChange={(e) => setGroup((g) => ({ ...g, title: e.target.value }))} placeholder="e.g. Students from remote provinces" />}</Field>
            <Field label="Source" helper="Where the system reads membership from.">
              {(id) => <Input id={id} value={group.note} onChange={(e) => setGroup((g) => ({ ...g, note: e.target.value }))} placeholder="e.g. List from Student Affairs, uploaded per Term" />}
            </Field>
          </Modal>
        </>
      )}
    </ConfigPage>
  )
}
