import { useEffect, useState } from 'react'
import { Bell, Check, Eye, Mail } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'

// SCR-CFG-07 Notification Templates (Figma 71:2940)
// GET /admin/notification-templates → { items: [{ key, event, push, inApp, titleEn, titleVi, body, variables: [string] }],
//   sampleValues: { [variable]: string } }
// PUT /admin/notification-templates/:key · POST /admin/notification-templates/:key/test (sends to the signed-in Admin)

const MAX_PUSH = 160
const channels = (t) => [t.push && 'Push', t.inApp && 'In-app'].filter(Boolean).join(' · ') || 'Off'

function Editor({ template, sample }) {
  const { notify, notifyError } = useToast()
  const [form, setForm] = useState(template)
  useEffect(() => setForm(template), [template])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const fill = (text) => String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => sample?.[k] ?? m)
  const tooLong = form.body.length > MAX_PUSH
  const save = useMutation(() => api.admin.templates.save(form.key, form), {
    invalidates: ['admin-templates'],
    onSuccess: () => notify({ title: 'Template saved', message: `${form.event} uses the new text from now on.` }),
    onError: () => {},
  })
  const test = useMutation(() => api.admin.templates.test(form.key, form), {
    onSuccess: () => notify({ type: 'info', title: 'Test sent', message: 'Check your phone and the Notification Center.' }),
    onError: (e) => notifyError(e, 'Could not send the test'),
  })

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-h2 font-semibold text-fg">{form.event}</h2>
        <div className="flex items-center gap-3">
          <Switch label="Push" checked={form.push} onChange={(v) => setForm((f) => ({ ...f, push: v }))} className="flex-row-reverse text-fg-secondary" />
          <Switch label="In-app" checked={form.inApp} onChange={(v) => setForm((f) => ({ ...f, inApp: v }))} className="flex-row-reverse text-fg-secondary" />
        </div>
      </div>
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <Field label="Title (EN)">{(id) => <Input id={id} value={form.titleEn} onChange={set('titleEn')} />}</Field>
      <Field label="Title (VI)">{(id) => <Input id={id} value={form.titleVi} onChange={set('titleVi')} />}</Field>
      <Field label="Message (EN)" helper={`Max ${MAX_PUSH} characters for push · ${form.body.length}/${MAX_PUSH}`} error={tooLong ? `Too long for push: ${form.body.length}/${MAX_PUSH} characters` : undefined}>
        {(id) => <Input id={id} value={form.body} onChange={set('body')} invalid={tooLong} />}
      </Field>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-fg-tertiary">Variables:</span>
        {(form.variables ?? []).map((v) => (
          <button
            key={v}
            type="button"
            title="Add to the message"
            onClick={() => setForm((f) => ({ ...f, body: `${f.body} {${v}}` }))}
            className="rounded-sm bg-subtle px-2 py-0.5 text-sm font-medium text-fg-secondary hover:bg-gray-200"
          >{`{${v}}`}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-subtle p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg-tertiary">
          <Eye size={16} aria-hidden="true" />
          Push preview (Android)
        </p>
        <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface p-3">
          <p className="text-base font-medium text-fg">{fill(form.titleEn)}</p>
          <p className="text-sm text-fg-secondary">{fill(form.body)}</p>
        </div>
      </div>
      <p className="text-sm text-fg-tertiary">Privacy: templates may use the inviter’s name only, never student codes or personal details of others.</p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => test.run()} disabled={test.pending}>
          Send test to me
        </Button>
        <Button variant="primary" icon={Check} disabled={tooLong || save.pending} onClick={() => save.run()}>
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

  return (
    <>
      <PageHeader
        title="Notification Templates"
        description="Messages sent on each event. Push goes to the Android app; in-app appears in the web Notification Center."
        actions={
          <Button icon={Mail} to="/admin/notifications/send">
            Send email
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card padding="none" className="flex min-h-0 w-95 shrink-0 flex-col overflow-y-auto p-2">
          <QueryState query={query} compact empty={<EmptyBlock icon={Bell} title="No templates" />}>
            {(data) =>
              data.items.map((t) => {
                const active = t.key === selected?.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSelectedKey(t.key)}
                    aria-pressed={active}
                    className={cx('flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors', active ? 'bg-primary-subtle' : 'hover:bg-subtle')}
                  >
                    <Bell size={16} aria-hidden="true" className={cx('shrink-0', active ? 'text-fg-brand' : 'text-fg-secondary')} />
                    <span className="flex min-w-0 flex-col">
                      <span className={cx('text-base font-medium', active ? 'text-fg-brand' : 'text-fg')}>{t.event}</span>
                      <span className="text-sm text-fg-tertiary">{channels(t)}</span>
                    </span>
                  </button>
                )
              })
            }
          </QueryState>
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
