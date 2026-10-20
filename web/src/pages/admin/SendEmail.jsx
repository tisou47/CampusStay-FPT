import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Card, Divider } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { ErrorState, LoadingState, Spinner } from '@/components/ui/States'
import { formatNumber } from '@/lib/format'
import { ConfigPage } from './shared'

// SCR-NTF-21 Send Email (Figma 100:4658)
// GET /admin/emails/options → { templates: [{ key, name, subject }], groups: [{ key, label }], blocks: [string], genders: [string],
//   channels: [{ value, label }], sendTimes: [{ value, label }] }
// POST /admin/emails/preview { mode, studentCode, termId, group, block, gender, templateKey, subject } →
//   { count, preview: { recipientName, subject, lines: [string] } | null }
// POST /admin/emails { …same, channel, sendAt } → { queued }

export default function SendEmail() {
  const { term, terms } = useSession()
  const { notify } = useToast()
  const options = useQuery(['admin-email-options'], ({ signal }) => api.admin.emails.options(undefined, { signal }))
  const o = options.data
  const [form, setForm] = useState({ mode: 'bulk', studentCode: '', termId: '', group: '', block: '', gender: '', templateKey: '', subject: '', channel: '', sendAt: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const [confirming, setConfirming] = useState(false)

  // Defaults once the options arrive.
  useEffect(() => {
    if (!o) return
    setForm((f) => ({
      ...f,
      termId: f.termId || term?.id || '',
      group: f.group || o.groups?.[0]?.key || '',
      templateKey: f.templateKey || o.templates?.[0]?.key || '',
      subject: f.subject || o.templates?.[0]?.subject || '',
      channel: f.channel || o.channels?.[0]?.value || '',
      sendAt: f.sendAt || o.sendTimes?.[0]?.value || '',
    }))
  }, [o, term])

  // Recipient count and preview follow the form, after a short pause.
  const [debounced, setDebounced] = useState(form)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(form), 400)
    return () => clearTimeout(t)
  }, [form])
  const recipients = { mode: debounced.mode, studentCode: debounced.studentCode || undefined, termId: debounced.termId, group: debounced.group, block: debounced.block || undefined, gender: debounced.gender || undefined, templateKey: debounced.templateKey, subject: debounced.subject }
  const ready = Boolean(debounced.templateKey) && (debounced.mode === 'bulk' ? Boolean(debounced.group) : Boolean(debounced.studentCode.trim()))
  const preview = useQuery(['admin-email-preview', recipients], ({ signal }) => api.admin.emails.preview(recipients, { signal }), { enabled: ready })
  const count = preview.data?.count

  const send = useMutation(() => api.admin.emails.send({ ...recipients, channel: form.channel, sendAt: form.sendAt }), {
    onSuccess: (res) => {
      setConfirming(false)
      notify({ title: form.sendAt === 'now' ? 'Email queued' : 'Email scheduled', message: `${formatNumber(res?.queued ?? count)} recipients. Written to the Audit Log.` })
    },
    onError: () => {},
  })

  const p = preview.data?.preview
  const form_ = { draft: o ? form : null, query: options, saveError: null }

  return (
    <ConfigPage
      form={form_}
      title="Send email"
      description="Send a template to one Student or to a filtered group. Every send is written to the Audit Log."
      actions={
        <>
          <Button to="/admin/notifications">Templates</Button>
          <Button variant="primary" icon={Send} onClick={() => setConfirming(true)} disabled={!ready || !count}>
            Send email
          </Button>
        </>
      }
    >
      {o && (
        <div className="flex min-h-0 flex-1 items-stretch gap-4">
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
            <h2 className="text-h3 font-semibold text-fg">Recipients</h2>
            <div className="flex gap-6" role="radiogroup" aria-label="Recipients">
              <Radio name="mode" label="One Student" checked={form.mode === 'one'} onChange={() => setForm((f) => ({ ...f, mode: 'one' }))} />
              <Radio name="mode" label="Bulk by filter" checked={form.mode === 'bulk'} onChange={() => setForm((f) => ({ ...f, mode: 'bulk' }))} />
            </div>
            {form.mode === 'one' ? (
              <Field label="Student code" helper="The email goes to the student’s FPT address and the app.">
                {(id) => <Input id={id} value={form.studentCode} onChange={set('studentCode')} placeholder="e.g. SE190421" />}
              </Field>
            ) : (
              <>
                <div className="flex gap-4">
                  <Field label="Term" className="flex-1">
                    {(id) => <Select id={id} value={form.termId} onChange={set('termId')} options={terms.map((t) => ({ value: t.id, label: t.name }))} />}
                  </Field>
                  <Field label="Group" className="flex-1">
                    {(id) => <Select id={id} value={form.group} onChange={set('group')} options={(o.groups ?? []).map((g) => ({ value: g.key, label: g.label }))} />}
                  </Field>
                </div>
                <div className="flex gap-4">
                  <Field label="Block" className="flex-1">
                    {(id) => <Select id={id} value={form.block} onChange={set('block')} options={[{ value: '', label: 'All Blocks' }, ...(o.blocks ?? []).map((b) => ({ value: b, label: `Block ${b}` }))]} />}
                  </Field>
                  <Field label="Gender" className="flex-1">
                    {(id) => <Select id={id} value={form.gender} onChange={set('gender')} options={[{ value: '', label: 'All' }, ...(o.genders ?? [])]} />}
                  </Field>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-base">
              <span className="text-fg-secondary">Matching Students</span>
              <span className="flex items-center gap-2 font-medium text-fg tabular">
                {preview.loading && <Spinner size={16} />}
                {ready ? formatNumber(count) : '—'}
              </span>
            </div>
            <Divider />
            <h2 className="text-h3 font-semibold text-fg">Message</h2>
            <Field label="Template">
              {(id) => (
                <Select
                  id={id}
                  value={form.templateKey}
                  onChange={(e) => {
                    const t = o.templates.find((x) => x.key === e.target.value)
                    setForm((f) => ({ ...f, templateKey: e.target.value, subject: t?.subject ?? f.subject }))
                  }}
                  options={(o.templates ?? []).map((t) => ({ value: t.key, label: t.name }))}
                />
              )}
            </Field>
            <Field label="Subject">{(id) => <Input id={id} value={form.subject} onChange={set('subject')} />}</Field>
            <div className="flex gap-4">
              <Field label="Channel" className="flex-1">
                {(id) => <Select id={id} value={form.channel} onChange={set('channel')} options={o.channels ?? []} />}
              </Field>
              <Field label="Send" className="flex-1">
                {(id) => <Select id={id} value={form.sendAt} onChange={set('sendAt')} options={o.sendTimes ?? []} />}
              </Field>
            </div>
          </Card>
          <Card className="flex min-h-0 w-105 shrink-0 flex-col gap-2.5 overflow-y-auto">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-h3 font-semibold text-fg">{p?.recipientName ? `Preview for ${p.recipientName}` : 'Preview'}</h2>
              <p className="text-sm text-fg-secondary">Variables filled from the first recipient</p>
            </div>
            {!ready ? (
              <p className="text-base text-fg-secondary">Choose the recipients and a template to see the preview.</p>
            ) : preview.data === undefined && preview.loading ? (
              <LoadingState />
            ) : preview.error ? (
              <ErrorState error={preview.error} onRetry={preview.reload} compact />
            ) : p ? (
              <div className="flex flex-col gap-2 rounded-md bg-subtle p-4">
                <p className="text-base font-medium text-fg">{p.subject}</p>
                {(p.lines ?? []).map((line, i) => (
                  <p key={i} className="text-sm text-fg-secondary">
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-base text-fg-secondary">No Student matches these filters.</p>
            )}
            <p className="text-sm text-fg-tertiary">Bulk sends are queued and delivered in batches. Students who unsubscribed from email still get the in-app notification.</p>
          </Card>
        </div>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Send to ${formatNumber(count)} ${count === 1 ? 'Student' : 'Students'}?`}
        description="You cannot recall an email once it is delivered."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" icon={Send} onClick={() => send.run()} disabled={send.pending}>
              Send email
            </Button>
          </>
        }
      >
        {send.error && <Alert type="error" title="Could not send">{send.error.message}</Alert>}
      </Modal>
    </ConfigPage>
  )
}
