import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { useOneBlock } from '@/components/layout/BlockPicker'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { t, tr } from '@/i18n'

// SCR-REQ-20 Request Routing Rules (Figma 69:949)
// GET /routing-rules?block → { rules: [{ id, type, scope, condition, assigneeId, assigneeName, fallbackId, fallbackName, active }],
//   staff: [{ id, name }], types, categories, gaps: [{ ruleId, title, message }],
//   timers: { urgent, normal, roomChange }, timerOptions: { urgent: [], normal: [], roomChange: [] } }
// POST /routing-rules · PUT /routing-rules/:id · PUT /routing-rules/timers

function RuleModal({ rule, data, block, onClose }) {
  const { notify } = useToast()
  const isNew = !rule.id
  const [form, setForm] = useState({
    type: rule.type ?? data.types?.[0] ?? '',
    scope: rule.scope ?? data.categories?.[0] ?? '',
    condition: rule.condition ?? '',
    assigneeId: rule.assigneeId ?? '',
    fallbackId: rule.fallbackId ?? '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = useMutation(() => (isNew ? api.routing.create({ ...form, block, active: true }) : api.routing.save(rule.id, { ...form, active: true })), {
    invalidates: ['routing', 'dashboard'],
    onSuccess: () => {
      const name = data.staff.find((s) => s.id === form.assigneeId)?.name
      notify({ title: isNew ? 'Rule added' : 'Rule saved', message: name ? t('New {scope} requests go to {name}.', { scope: tr(form.scope), name }) : undefined })
      onClose()
    },
    onError: () => {},
  })
  const staffOptions = data.staff.map((s) => ({ value: s.id, label: s.name }))
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add routing rule' : 'Edit routing rule'}
      description="New requests that match go straight to the assignee; the fallback gets them when the assignee is off duty."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.run()} disabled={!form.assigneeId || save.pending}>
            {isNew ? 'Add rule' : 'Save rule'}
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save the rule">{save.error.message}</Alert>}
      <div className="flex gap-3">
        <Field label="Request type" className="flex-1">
          {(id) => <Select id={id} value={form.type} onChange={set('type')} options={data.types ?? []} disabled={!isNew} />}
        </Field>
        <Field label="Category" className="flex-1">
          {(id) => <Select id={id} value={form.scope} onChange={set('scope')} options={data.categories ?? []} disabled={!isNew} />}
        </Field>
      </div>
      <Field label="Condition" helper="Optional, for example Floors 2–13.">
        {(id) => <Input id={id} value={form.condition} onChange={set('condition')} />}
      </Field>
      <div className="flex gap-3">
        <Field label="Assign to" required className="flex-1">
          {(id) => <Select id={id} value={form.assigneeId} onChange={set('assigneeId')} options={[{ value: '', label: 'Choose…', disabled: true }, ...staffOptions]} />}
        </Field>
        <Field label="Fallback" className="flex-1">
          {(id) => <Select id={id} value={form.fallbackId} onChange={set('fallbackId')} options={[{ value: '', label: 'None' }, ...staffOptions.filter((s) => s.value !== form.assigneeId)]} />}
        </Field>
      </div>
    </Modal>
  )
}

export default function RoutingRules() {
  const { block, picker } = useOneBlock()
  const { notify, notifyError } = useToast()
  const query = useQuery(['routing', block], ({ signal }) => api.routing.get({ block: block ?? undefined }, { signal }), { enabled: Boolean(block) })
  const data = query.data
  const [editing, setEditing] = useState(null)
  const toggle = useMutation((r, active) => api.routing.save(r.id, { active }), {
    invalidates: ['routing'],
    onSuccess: (_, r, active) => notify({ type: 'info', title: active ? 'Rule turned on' : 'Rule turned off', message: `${tr(r.type)} · ${tr(r.scope)}` }),
    onError: (e) => notifyError(e, 'Could not change the rule'),
  })
  const saveTimer = useMutation((timers) => api.routing.saveTimers({ block, ...timers }), {
    invalidates: ['routing'],
    onSuccess: () => notify({ title: 'Timer saved' }),
    onError: (e) => notifyError(e, 'Could not save the timer'),
  })
  const timers = data?.timers ?? {}

  return (
    <>
      <PageHeader
        title={block ? t('Routing rules · Block {code}', { code: block }) : 'Routing rules'}
        description="Who receives each new request automatically. Unmatched requests go to the Block queue for manual assignment."
        actions={
          <>
            {picker}
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={!data}>
              Add rule
            </Button>
          </>
        }
      />
      {(data?.gaps ?? []).map((g) => (
        <Alert
          key={g.ruleId ?? g.title}
          type="warning"
          title={g.title}
          className="shrink-0"
          action={g.ruleId && <Button onClick={() => setEditing(data.rules.find((r) => r.id === g.ruleId) ?? {})}>Fix rule</Button>}
        >
          {tr(g.message)}
        </Alert>
      ))}
      <Table fill>
        <THead>
          <tr>
            <Th className="w-16">Order</Th>
            <Th className="w-48">Request type</Th>
            <Th>Condition</Th>
            <Th className="w-56">Assign to</Th>
            <Th className="w-44">Fallback</Th>
            <Th className="w-18">Active</Th>
            <Th className="w-18">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} rows={data?.rules} emptyTitle="No routing rules yet" emptyText="Every new request waits for manual assignment." />
          {(data?.rules ?? []).map((r, i) => (
            <Tr key={r.id} className="[&>td]:h-15">
              <Td>{i + 1}</Td>
              <Td>
                <TwoLine primary={tr(r.type)} secondary={tr(r.scope)} />
              </Td>
              <Td className={r.condition ? undefined : 'text-fg-tertiary'}>{r.condition || '—'}</Td>
              <Td className={r.assigneeName ? 'whitespace-nowrap' : 'text-fg-tertiary'}>{r.assigneeName ?? 'Not set'}</Td>
              <Td className={r.fallbackName ? 'whitespace-nowrap' : 'text-fg-tertiary'}>{r.fallbackName ?? '—'}</Td>
              <Td>
                <Switch
                  aria-label={t('Rule {n} active', { n: i + 1 })}
                  checked={r.active}
                  disabled={toggle.pending}
                  onChange={(on) => (on && !r.assigneeId ? setEditing(r) : toggle.run(r, on))}
                />
              </Td>
              <Td>
                <Button variant="text" onClick={() => setEditing(r)}>
                  Edit
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card className="flex shrink-0 flex-col gap-3">
        <h2 className="text-h3 font-semibold text-fg">{t('Time limits')}</h2>
        <p className="text-sm text-fg-tertiary">{t('A request that is not resolved in time shows in Overdue requests for every Manager. Limits come from Admin; you can only make them stricter.')}</p>
        <div className="flex gap-4">
          {[
            ['urgent', 'Urgent: escalate after'],
            ['normal', 'Normal: escalate after'],
            ['roomChange', 'Room change: decide within'],
          ].map(([key, label]) => (
            <Field key={key} label={label} className="flex-1">
              {(id) => (
                <Select
                  id={id}
                  value={timers[key] ?? ''}
                  options={data?.timerOptions?.[key] ?? [timers[key]].filter(Boolean)}
                  disabled={!data || saveTimer.pending}
                  onChange={(e) => saveTimer.run({ ...timers, [key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      </Card>

      {editing && data && <RuleModal rule={editing} data={data} block={block} onClose={() => setEditing(null)} />}
    </>
  )
}
