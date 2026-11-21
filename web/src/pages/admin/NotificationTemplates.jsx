import { useEffect, useState } from 'react'
import { Bell, Check, Eye } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, SearchInput, Textarea } from '@/components/ui/Field'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { getLang, t, tr } from '@/i18n'

// SCR-CFG-07 Notification Templates (Figma 71:2940)
// GET /admin/notification-templates → { items: [{ key, event, push, inApp, titleEn, titleVi, body, bodyVi, variables: [string] }],
//   sampleValues: { [variable]: string } }
// PUT /admin/notification-templates/:key · POST /admin/notification-templates/:key/test (sends to the signed-in Admin)

const MAX_PUSH = 160
const channels = (tpl) => [tpl.push && t('Push'), tpl.inApp && t('In-app')].filter(Boolean).join(' · ') || t('Off')

/** Groups of the list, by the template's key; the first match wins, the rest go to Other. */
const GROUPS = [
  ['Applications and assignment', /^(APPLICATION_|ALLOCATION_|ROOMMATE_|ROUND2_|WAITLIST|STUDENT_VERIF)/],
  ['Payments', /^(DEPOSIT_|INVOICE_|PAYMENT_|BALANCE_|REFUND_|NEXT_TERM_FEE|UTILITY_)/],
  ['Check-in, check-out and room handover', /^(CHECK_IN|CHECK_OUT|DAMAGE_|DOOR_CODE_|LATE_CHECK_IN|RESIDENT_MOVED)/],
  ['Requests and term transition', /^(ROOM_CHANGE_|ROOM_CLASS_|SWAP_|NEXT_TERM_|RENEWAL_|REQUESTS_WINDOW|STAY_|END_OF_STAY|TERMINATION_)/],
  ['Maintenance and inspections', /^(MAINTENANCE_|INSPECTION_|ESCALATION_|METER_)/],
  ['Terms', /^TERM_/],
  ['Family Day', /^FAMILY_DAY_/],
  ['Staff', /^(WEEK_SCHEDULE_|WORK_)/],
]
const groupOf = (key) => GROUPS.find(([, re]) => re.test(key))?.[0] ?? 'Other'
/** Lower case without Vietnamese marks, so "thanh toan" finds "Thanh toán". */
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

function Editor({ template, sample }) {
  const { notify, notifyError } = useToast()
  const [form, setForm] = useState(template)
  useEffect(() => setForm(template), [template])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // Templates write their values as {{name}} (the server's format).
  const fill = (text) => String(text ?? '').replace(/\{\{(\w+)\}\}/g, (m, k) => (sample?.[k] != null ? tr(sample[k]) : m))
  const tooLong = form.body.length > MAX_PUSH
  const tooLongVi = (form.bodyVi ?? '').length > MAX_PUSH
  const vi = getLang() === 'vi'
  const save = useMutation(() => api.admin.templates.save(form.key, form), {
    invalidates: ['admin-templates'],
    onSuccess: () => notify({ title: 'Template saved', message: t('{event} uses the new text from now on.', { event: tr(form.event) }) }),
    onError: () => {},
  })
  const test = useMutation(() => api.admin.templates.test(form.key, form), {
    onSuccess: () => notify({ type: 'info', title: 'Test sent', message: 'Check your phone and the notification center.' }),
    onError: (e) => notifyError(e, 'Could not send the test'),
  })

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-h2 font-semibold text-fg">{tr(form.event)}</h2>
        <div className="flex items-center gap-3">
          <Switch label="Push" checked={form.push} onChange={(v) => setForm((f) => ({ ...f, push: v }))} className="flex-row-reverse text-fg-secondary" />
          <Switch label="In-app" checked={form.inApp} onChange={(v) => setForm((f) => ({ ...f, inApp: v }))} className="flex-row-reverse text-fg-secondary" />
        </div>
      </div>
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <Field label="Title (EN)">{(id) => <Input id={id} value={form.titleEn} onChange={set('titleEn')} />}</Field>
      <Field label="Title (VI)">{(id) => <Input id={id} value={form.titleVi} onChange={set('titleVi')} />}</Field>
      <Field label="Message (EN)" helper={t('Max {max} characters for push · {n}/{max}', { max: MAX_PUSH, n: form.body.length })} error={tooLong ? t('Too long for push: {n}/{max} characters', { n: form.body.length, max: MAX_PUSH }) : undefined}>
        {(id) => <Textarea id={id} rows={3} value={form.body} onChange={set('body')} invalid={tooLong} />}
      </Field>
      <Field label="Message (VI)" helper={t('Max {max} characters for push · {n}/{max}', { max: MAX_PUSH, n: (form.bodyVi ?? '').length })} error={tooLongVi ? t('Too long for push: {n}/{max} characters', { n: (form.bodyVi ?? '').length, max: MAX_PUSH }) : undefined}>
        {(id) => <Textarea id={id} rows={3} value={form.bodyVi ?? ''} onChange={set('bodyVi')} invalid={tooLongVi} />}
      </Field>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-fg-tertiary">{t('Variables:')}</span>
        {(form.variables ?? []).map((v) => (
          <button
            key={v}
            type="button"
            title={t('Add to the message')}
            onClick={() => setForm((f) => (vi ? { ...f, bodyVi: `${f.bodyVi ?? ''} {{${v}}}` } : { ...f, body: `${f.body} {{${v}}}` }))}
            className="rounded-sm bg-subtle px-2 py-0.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-line hover:text-fg"
          >{`{{${v}}}`}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg-tertiary">
          <Eye size={16} aria-hidden="true" />
          {t('Push preview (Android)')}
        </p>
        <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface p-3">
          <p className="text-base font-medium text-fg">{fill(vi ? form.titleVi : form.titleEn)}</p>
          <p className="text-sm text-fg-secondary">{fill(vi ? form.bodyVi : form.body)}</p>
        </div>
      </div>
      <p className="text-sm text-fg-tertiary">{t('Each person gets the language of their account. Privacy: templates may use the inviter’s name only, never student codes or personal details of others.')}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => test.run()} disabled={test.pending}>
          Send test to me
        </Button>
        <Button variant="primary" icon={Check} disabled={tooLong || tooLongVi || !(form.bodyVi ?? '').trim() || save.pending} onClick={() => save.run()}>
          Save template
        </Button>
      </div>
    </Card>
  )
}

export default function NotificationTemplates() {
  const query = useQuery(['admin-templates'], ({ signal }) => api.admin.templates.list(undefined, { signal }))
  const items = query.data?.items ?? []
  const [selectedKey, setSelectedKey] = useState(null)
  const selected = items.find((t) => t.key === selectedKey) ?? items[0]
  const [q, setQ] = useState('')
  const needle = fold(q.trim())
  const shown = needle ? items.filter((x) => fold(tr(x.event)).includes(needle) || fold(x.key).includes(needle.replace(/\s+/g, '_'))) : items
  // In the order of GROUPS, Other last; each group keeps the server's order.
  const groups = [...GROUPS.map(([label]) => label), 'Other']
    .map((label) => [label, shown.filter((x) => groupOf(x.key) === label)])
    .filter(([, list]) => list.length > 0)

  return (
    <>
      <PageHeader title="Notification Templates" description="Push and in-app messages sent on each event." />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card padding="none" className="flex min-h-0 w-95 shrink-0 flex-col">
          <div className="shrink-0 border-b border-line p-2">
            <SearchInput aria-label={t('Search templates')} placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <QueryState query={query} compact empty={<EmptyBlock icon={Bell} title="No templates" />}>
              {() =>
                groups.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-fg-tertiary">{t('No template matches this search')}</p>
                ) : (
                  groups.map(([label, list]) => (
                    <div key={label} className="flex flex-col gap-0.5 pb-2">
                      <p className="px-3 pt-2 pb-1 text-sm font-semibold text-fg-tertiary">
                        {t(label)} <span className="font-normal tabular">({list.length})</span>
                      </p>
                      {list.map((x) => {
                        const active = x.key === selected?.key
                        return (
                          <button
                            key={x.key}
                            type="button"
                            onClick={() => setSelectedKey(x.key)}
                            aria-pressed={active}
                            className={cx('flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors', active ? 'bg-primary-subtle' : 'hover:bg-subtle')}
                          >
                            <Bell size={16} aria-hidden="true" className={cx('shrink-0', active ? 'text-fg-brand' : 'text-fg-secondary')} />
                            <span className="flex min-w-0 flex-col">
                              <span className={cx('text-base font-medium', active ? 'text-fg-brand' : 'text-fg')}>{tr(x.event)}</span>
                              <span className="text-sm text-fg-tertiary">{channels(x)}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))
                )
              }
            </QueryState>
          </div>
        </Card>
        {selected ? (
          <Editor key={selected.key} template={selected} sample={query.data?.sampleValues} />
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={Bell} title="Select a template" />
          </Card>
        )}
      </div>
    </>
  )
}
