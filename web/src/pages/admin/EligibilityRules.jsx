import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Tag } from '@/components/ui/Tag'
import { ConfigPage, ReorderList, SettingSwitch, useConfigForm } from './shared'
import { t, tr } from '@/i18n'

// SCR-CFG-05 Rules › Who may apply (spec §6.17, D-06): each check as a sentence with the students who fail it now,
// and who is placed first when Beds are short (priority groups with their members). A Term keeps the rules it
// opened with (ADR-20).
// GET /admin/eligibility → { criteria: [{ key, title, note, on, failing }], fixed: [{ key, title, note, failing }],
//   groups: [{ id, title, note, applied }], appliesFromTermName, students }
// PUT /admin/eligibility (same shape; new groups have no id)

const failing = (n) => (n == null ? null : n === 0 ? t('No student fails this now') : t(n === 1 ? '{n} student fails this now' : '{n} students fail this now', { n }))

export default function EligibilityRules() {
  const { notify } = useToast()
  const cfg = useConfigForm('eligibility', api.admin.eligibility, {
    onSaved: (res) => notify({ title: 'Eligibility rules saved', message: t('They apply from {term}.', { term: res?.appliesFromTermName ?? t('the next Term that opens') }) }),
  })
  const { draft } = cfg
  const [adding, setAdding] = useState(false)
  const [group, setGroup] = useState({ title: '', note: '' })

  return (
    <ConfigPage
      form={cfg}
      title="Who may apply"
      description="The checks every Application passes, and who is placed first when Beds are short."
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
              <h2 className="text-h3 font-semibold text-fg">{t('A student may apply when…')}</h2>
              <p className="text-sm text-fg-tertiary">
                {t('Every check that is on must pass; they are checked again when the Application is sent. Counted over {n} students of the directory.', { n: draft.students ?? 0 })}
              </p>
              {(draft.fixed ?? []).map((c) => (
                <div key={c.key} className="flex items-center gap-3 py-1.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-base font-medium text-fg">{tr(c.title)}</p>
                    <p className="text-sm text-fg-tertiary">{tr(c.note)}</p>
                    {failing(c.failing) && <p className="text-sm font-medium text-fg-secondary">{failing(c.failing)}</p>}
                  </div>
                  <Tag dot={false}>Always on</Tag>
                </div>
              ))}
              {(draft.criteria ?? []).map((c) => (
                <div key={c.key} className="flex flex-col gap-0.5 py-1.5">
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
                  {c.on && failing(c.failing) && <p className="text-sm font-medium text-fg-secondary">{failing(c.failing)}</p>}
                </div>
              ))}
            </Card>
            <Card className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-h3 font-semibold text-fg">{t('Who is placed first when Beds are short?')}</h2>
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  Add group
                </Button>
              </div>
              <p className="text-sm text-fg-tertiary">{t('Students of a higher group get a Bed first; then the earlier Deposit. Use the arrows to reorder.')}</p>
              <ReorderList
                label="Priority groups"
                items={(draft.groups ?? []).map((g) => ({ ...g, extra: g.applied != null ? t(g.applied === 1 ? '{n} student in this group' : '{n} students in this group', { n: g.applied }) : null }))}
                onChange={(groups) => cfg.setValue('groups', groups.map(({ extra: _extra, ...g }) => g))}
              />
            </Card>
          </div>
          <Alert type="warning" title="Changes apply from the next Term that opens" className="shrink-0">
            A Term keeps the rules it opened with: publishing a Term copies these rules into it. Disability status is sensitive data: only the group flag is stored, never the reason.
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
