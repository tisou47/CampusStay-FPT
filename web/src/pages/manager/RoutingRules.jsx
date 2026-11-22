import { useState } from 'react'
import { ArrowRightLeft, Plus, Route, Siren, Timer, TriangleAlert, Users, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { useOneBlock } from '@/components/layout/BlockPicker'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert, Card, ProgressBar } from '@/components/ui/Display'
import { InfoTip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-REQ-20 Request Routing Rules (Figma 69:949)
// GET /routing-rules?block → { rules: [{ id, type, scope, condition, assigneeId, assigneeName, fallbackId, fallbackName, active }],
//   staff: [{ id, name, onDuty, open, resolvedWeek }], types, categories, gaps: [{ ruleId, title, message }],
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
  const gaps = data?.gaps ?? []
  const maxOpen = Math.max(1, ...(data?.staff ?? []).map((s) => s.open))

  return (
    <>
      <PageHeader
        title={block ? t('Routing rules · Block {code}', { code: block }) : 'Routing rules'}
        actions={
          <>
            {picker}
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})} disabled={!data}>
              Add rule
            </Button>
          </>
        }
      />
      {/* One screen: the rules on the left (what is not covered on top, the table scrolls inside), the time limits and
          the workload of the staff on the right. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card padding="none" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Route size={18} aria-hidden="true" className="text-fg-brand" />
              <h2 className="text-h3 font-semibold text-fg">{t('Who gets new requests')}</h2>
              {data && <Tag dot={false}>{t('{n} rules', { n: formatNumber(data.rules.length) })}</Tag>}
            </div>
            <span className="text-sm text-fg-tertiary">{t('Matched from the top; the first rule that fits wins.')}</span>
          </div>

          {gaps.length > 0 && (
            <div className="flex shrink-0 flex-col gap-2 border-b border-warning/30 bg-warning-bg/60 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-warning-fg">
                <TriangleAlert size={16} aria-hidden="true" />
                {t('Not covered: new requests of these kinds wait unassigned in the queue.')}
              </p>
              <ul className="flex flex-wrap gap-2">
                {gaps.map((g) => (
                  <li key={g.ruleId ?? g.title}>
                    <button
                      type="button"
                      onClick={() => setEditing(g.ruleId ? data.rules.find((r) => r.id === g.ruleId) ?? {} : {})}
                      title={tr(g.message)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-surface px-3 py-1 text-sm font-medium text-fg hover:border-warning"
                    >
                      {tr(g.title)}
                      <span className="text-fg-brand">{g.ruleId ? t('Fix') : t('Add rule')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Table fill bare>
            <THead>
              <tr>
                <Th className="w-12">#</Th>
                <Th className="w-48">Request type</Th>
                <Th>Condition</Th>
                <Th className="w-52">Assign to</Th>
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
                <Tr key={r.id} className={cx('[&>td]:h-14', !r.active && 'opacity-60')}>
                  <Td className="text-fg-tertiary tabular">{i + 1}</Td>
                  <Td>
                    <TwoLine primary={tr(r.type)} secondary={tr(r.scope)} />
                  </Td>
                  <Td className={r.condition ? undefined : 'text-fg-tertiary'}>{r.condition || t('Any')}</Td>
                  <Td className={r.assigneeName ? 'font-medium whitespace-nowrap' : 'text-warning-fg'}>{r.assigneeName ?? t('Not set')}</Td>
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
        </Card>

        <div className="flex min-h-0 flex-col gap-4 xl:overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Timer size={18} aria-hidden="true" className="text-fg-brand" />
              <h2 className="text-h3 font-semibold text-fg">{t('Time limits')}</h2>
              <InfoTip label={t('Limits come from admin; you can only make them stricter. Every request shows the time it has left.')} />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {[
                ['urgent', Siren, 'Urgent maintenance', 'Finished within; then every manager sees it in Overdue requests.'],
                ['normal', Wrench, 'Normal maintenance', 'Finished within; then every manager sees it in Overdue requests.'],
                ['roomChange', ArrowRightLeft, 'Room change', 'Decided within; then it shows in Overdue requests.'],
              ].map(([key, Glyph, label, after]) => (
                <li key={key} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
                    <Glyph size={16} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-medium text-fg">{t(label)}</span>
                    <span className="text-sm text-fg-tertiary">{t(after)}</span>
                  </span>
                  <Select
                    aria-label={t(label)}
                    wrapperClassName="w-28 shrink-0"
                    value={timers[key] ?? ''}
                    options={data?.timerOptions?.[key] ?? [timers[key]].filter(Boolean)}
                    disabled={!data || saveTimer.pending}
                    onChange={(e) => saveTimer.run({ ...timers, [key]: e.target.value })}
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Users size={18} aria-hidden="true" className="text-fg-brand" />
              <h2 className="text-h3 font-semibold text-fg">{t('Staff and workload')}</h2>
              <InfoTip label={t('Open work of each staff member of the block, and what they finished in the last 7 days.')} />
            </div>
            <ul className="flex flex-col gap-2.5">
              {(data?.staff ?? []).map((s) => (
                <li key={s.id} className="flex flex-col gap-1">
                  <span className="flex items-center justify-between gap-3 text-base">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cx('size-2 shrink-0 rounded-full', s.onDuty ? 'bg-success' : 'bg-fg-tertiary/50')} aria-hidden="true" />
                      <span className="truncate font-medium text-fg">{s.name}</span>
                      {!s.onDuty && <span className="shrink-0 text-sm text-fg-tertiary">{t('Off duty')}</span>}
                    </span>
                    <span className="shrink-0 text-sm text-fg-secondary tabular">{t('{open} open · {done} done', { open: formatNumber(s.open), done: formatNumber(s.resolvedWeek) })}</span>
                  </span>
                  <ProgressBar value={s.open} max={maxOpen} tone={s.open >= maxOpen && s.open > 0 ? 'warning' : 'accent'} className="ml-4 h-1.5" />
                </li>
              ))}
              {data && data.staff.length === 0 && <li className="text-base text-fg-tertiary">{t('No staff in this block yet')}</li>}
            </ul>
          </Card>
        </div>
      </div>

      {editing && data && <RuleModal rule={editing} data={data} block={block} onClose={() => setEditing(null)} />}
    </>
  )
}
