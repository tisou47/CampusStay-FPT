import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Bed, Check, RotateCcw, SearchX, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Avatar, Breadcrumb, Card, Facts } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// SCR-MNT-11 Maintenance Detail (Figma 42:2739). Shared with the Manager portal.
// GET /maintenance-requests/:id (back-office view) → { id, title, status, room, bed, category, location, reportedAt,
//   reporter: { name, role }, urgency, priority, staffMayEnter, description, photos: [{ url, name }],
//   assignee: { id, name } | null, suggestedAssigneeId, visitWindow,
//   events: [{ who, role, at, text, message, internal }], roomSummary: { residents, capacity, otherOpen, pastThisTerm } }
// PATCH /maintenance-requests/:id { priority, assigneeId, visitWindow, status }
// POST /maintenance-requests/:id/updates { message, internal }

const OPEN = ['Submitted', 'Assigned', 'In progress']

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{t(label)}</dt>
      <dd className="font-medium text-fg">{children}</dd>
    </div>
  )
}

function Event({ event }) {
  return (
    <li className="flex items-start gap-3">
      <Avatar name={event.who} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-base font-medium text-fg">{tr(event.text)}</p>
        {event.message && <p className="text-base text-fg-secondary">{event.message}</p>}
        <p className="flex items-center gap-2 text-sm text-fg-tertiary">
          {formatDateTime(event.at)}
          {event.role ? ` · ${tr(event.role)}` : ''}
          {event.internal && <Tag dot={false}>Internal note</Tag>}
        </p>
      </div>
    </li>
  )
}

function RequestDetail({ r, staff, priorities }) {
  const base = useRoleBase()
  const { notify, notifyError } = useToast()
  const [priority, setPriority] = useState(r.priority)
  const [assigneeId, setAssigneeId] = useState(r.assignee?.id ?? r.suggestedAssigneeId ?? '')
  const [visit, setVisit] = useState(r.visitWindow ?? '')
  const [message, setMessage] = useState('')
  const [internal, setInternal] = useState(false)
  useEffect(() => {
    setPriority(r.priority)
    setAssigneeId(r.assignee?.id ?? r.suggestedAssigneeId ?? '')
    setVisit(r.visitWindow ?? '')
  }, [r])

  const studentRequest = r.reporter?.role === 'student'
  const open = OPEN.includes(r.status)
  const options = { invalidates: ['maintenance', 'dashboard'] }

  const save = useMutation(() => api.maintenance.update(r.id, { priority, assigneeId: assigneeId || null, visitWindow: visit.trim() || null }), {
    ...options,
    onSuccess: () => notify({ title: studentRequest ? 'Saved and student notified' : 'Saved', message: studentRequest ? t('{name} gets an in-app notification and an email.', { name: r.reporter.name }) : t('{id} was updated.', { id: r.id }) }),
    onError: (e) => notifyError(e, 'Could not save'),
  })
  const setStatus = useMutation((status) => api.maintenance.update(r.id, { status, assigneeId: status === 'In progress' && !r.assignee ? assigneeId || undefined : undefined }), {
    ...options,
    onSuccess: (_, status) => notify({ title: t('{id} is now {status}', { id: r.id, status: t(status) }), message: studentRequest ? t('{name} was notified.', { name: r.reporter.name }) : undefined }),
    onError: (e) => notifyError(e, 'Could not change the status'),
  })
  const post = useMutation(() => api.maintenance.addUpdate(r.id, { message: message.trim(), internal }), {
    ...options,
    onSuccess: () => {
      setMessage('')
      notify({ title: internal ? 'Internal note added' : 'Update posted', message: internal ? 'Only Staff and Managers can see it.' : t('{name} was notified.', { name: r.reporter?.name ?? t('The reporter') }) })
    },
    onError: (e) => notifyError(e, 'Could not post the update'),
  })
  const busy = save.pending || setStatus.pending

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Maintenance', to: `${base}/maintenance` }, { label: r.id }]} />}
        title={r.title}
        badge={<StatusTag status={r.status} />}
        actions={
          <>
            <Button to={`${base}/maintenance`}>Back to queue</Button>
            {open ? (
              <>
                <Button variant={r.status === 'In progress' ? 'primary' : 'default'} icon={Check} onClick={() => setStatus.run('Resolved')} disabled={busy}>
                  Mark resolved
                </Button>
                {r.status !== 'In progress' && (
                  <Button variant="primary" icon={Wrench} onClick={() => setStatus.run('In progress')} disabled={busy}>
                    Start work
                  </Button>
                )}
              </>
            ) : (
              <Button icon={RotateCcw} onClick={() => setStatus.run(r.assignee ? 'Assigned' : 'Submitted')} disabled={busy}>
                Reopen
              </Button>
            )}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          {r.status === 'Resolved' && studentRequest && (
            <Alert title={t('Waiting for {name} to confirm the fix', { name: r.reporter.name })} className="shrink-0">
              The request closes when the student confirms, or automatically after a few days.
            </Alert>
          )}
          {r.status === 'Closed' && (
            <Alert type="success" title="Closed" className="shrink-0">
              The student confirmed that the issue is fixed.
            </Alert>
          )}

          <Card className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Request')}</h2>
            <Facts
              dense
              items={[
                ['Room', r.bed ? t('{room} · Bed {bed}', { room: r.room, bed: r.bed }) : r.room],
                ['Category', tr(r.category) || '—'],
                ['Where', tr(r.location) || '—'],
              ]}
            />
            <Facts
              dense
              items={[
                ['Reported by', `${r.reporter?.name ?? '—'} · ${formatDateTime(r.reportedAt)}`],
                [studentRequest ? 'Student urgency' : 'Urgency', tr(r.urgency) || '—'],
                ['Entry when absent', r.staffMayEnter === false ? 'Not allowed' : 'Allowed'],
              ]}
            />
            {r.description && <p className="text-base text-fg">{r.description}</p>}
            {r.photos?.length > 0 && (
              <ul className="flex gap-3" aria-label={t('Photos')}>
                {r.photos.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-md border border-line bg-subtle">
                      <img src={p.url} alt={p.name ?? t('Photo')} className="size-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex min-h-60 flex-1 flex-col gap-3">
            <h2 className="shrink-0 text-h3 font-semibold text-fg">{t('Updates')}</h2>
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {(r.events ?? []).map((e, i) => (
                <Event key={`${i}-${e.at}`} event={e} />
              ))}
            </ul>
            <Textarea
              aria-label={t('Update')}
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={internal || !studentRequest ? 'Write an internal note for Staff…' : 'Write an update for the student…'}
              className="shrink-0"
            />
            <div className="flex shrink-0 items-center justify-between gap-4">
              <Checkbox label="Internal note (hidden from the student)" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <Button onClick={() => post.run()} disabled={!message.trim() || post.pending}>
                Post update
              </Button>
            </div>
          </Card>
        </div>

        <div className="flex w-90 shrink-0 flex-col gap-4 overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-3.5">
            <h2 className="text-h3 font-semibold text-fg">{t('Assignment')}</h2>
            <Field label="Priority">{(id) => <Select id={id} value={priority ?? ''} onChange={(e) => setPriority(e.target.value)} options={priorities} />}</Field>
            <Field label="Assignee">
              {(id) => (
                <Select
                  id={id}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  options={[{ value: '', label: 'Unassigned' }, ...staff.map((m) => ({ value: m.id, label: m.skills?.length ? `${m.name} · ${tr(m.skills[0])}` : m.name }))]}
                />
              )}
            </Field>
            <Field label="Visit window">{(id) => <Input id={id} value={visit} onChange={(e) => setVisit(e.target.value)} placeholder="dd/mm/yyyy hh:mm – hh:mm" />}</Field>
            <Button variant="primary" icon={Check} block onClick={() => save.run()} disabled={busy}>
              {studentRequest ? 'Save and notify student' : 'Save'}
            </Button>
          </Card>

          <Card className="flex shrink-0 flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-base font-medium text-fg">
                <Bed size={16} aria-hidden="true" className="text-fg-secondary" />
                {t('Room {code}', { code: r.room })}
              </p>
              <Button variant="text" to={`${base}/inventory?room=${r.room}`}>
                Open Room
              </Button>
            </div>
            <dl className="flex flex-col gap-2.5">
              <Row label="Residents">{r.roomSummary ? t('{n} of {total}', { n: r.roomSummary.residents, total: r.roomSummary.capacity }) : '—'}</Row>
              <Row label="Other open requests">{r.roomSummary?.otherOpen ?? '—'}</Row>
              <Row label="Past requests (this Term)">{r.roomSummary?.pastThisTerm ?? '—'}</Row>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}

export default function MaintenanceDetail() {
  const { id } = useParams()
  const base = useRoleBase()
  const query = useQuery(['maintenance', id], ({ signal }) => api.maintenance.get(id, { signal }))
  const options = useQuery(['maintenance-options', 'staff'], ({ signal }) => api.maintenance.options({ for: 'staff' }, { signal }))

  if (query.data) return <RequestDetail r={query.data} staff={options.data?.staff ?? []} priorities={options.data?.priorities ?? [query.data.priority].filter(Boolean)} />
  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: 'Maintenance', to: `${base}/maintenance` }, { label: id }]} />} title={id} />
      {query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={SearchX} title={t('{id} was not found', { id })} action={<Button to={`${base}/maintenance`}>Back to queue</Button>}>
          The request may belong to another Block.
        </EmptyBlock>
      ) : (
        <ErrorState error={query.error} onRetry={query.reload} />
      )}
    </>
  )
}
