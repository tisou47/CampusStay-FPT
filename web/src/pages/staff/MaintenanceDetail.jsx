import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Check, Clock, MessageSquare, RotateCcw, SearchX, UserCheck, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Avatar, Breadcrumb, Card } from '@/components/ui/Display'
import { InfoTip } from '@/components/ui/Tooltip'
import { DatePicker, TimeRangePicker } from '@/components/ui/date-time'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { SlaBadge, StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { campusToday, formatDateTime } from '@/lib/format'
import { typeName } from '@/lib/furniture'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// SCR-MNT-11 Maintenance Detail (Figma 42:2739). Shared with the Manager portal.
// GET /maintenance-requests/:id (back-office view) → { id, title, status, room, bed, category, location, reportedAt,
//   reporter: { name, role }, urgency, priority, staffMayEnter, description, photos: [{ url, name }],
//   assignee: { id, name } | null, suggestedAssigneeId, visitWindow,
//   events: [{ who, role, at, text, message, internal }], roomSummary: { residents, capacity, otherOpen, pastThisTerm },
//   slaDueAt, furnitureItem: { id, assetCode, type, typeVi } | null, furnitureOptions: [{ id, assetCode, type, typeVi }] }
// PATCH /maintenance-requests/:id { priority, furnitureItemId, assigneeId, visitWindow, status }
// POST /maintenance-requests/:id/updates { message, internal }

const OPEN = ['Submitted', 'Assigned', 'In progress']

// One step of the request history, joined to the next by a rail; internal notes are tinted.
function Event({ event, last }) {
  return (
    <li className="relative flex items-start gap-3 pb-4 last:pb-0">
      {!last && <span aria-hidden="true" className="absolute top-10 bottom-1 left-4 w-px bg-line" />}
      <Avatar name={event.who} />
      <div className={cx('flex min-w-0 flex-1 flex-col gap-1', event.internal && 'rounded-md bg-warning-bg px-3 py-2')}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
          <span className="font-medium text-fg">{tr(event.text)}</span>
          {event.internal && <Tag dot={false}>Internal note</Tag>}
        </p>
        {event.message && <p className="text-base whitespace-pre-line text-fg">{event.message}</p>}
        <p className="text-sm text-fg-tertiary">
          {[event.who, event.role ? tr(event.role) : null, formatDateTime(event.at)].filter(Boolean).join(' · ')}
        </p>
      </div>
    </li>
  )
}

// The furniture item the request is about (spec §6.18): the item's history keeps the repair.
// A label over its value; every fact of the request card uses it, so the row lines up.
function Fact({ label, tip, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="flex items-center gap-1 text-sm whitespace-nowrap text-fg-tertiary">
        {t(label)}
        {tip && <InfoTip label={tip} />}
      </dt>
      <dd className="flex min-h-8 items-center text-base font-medium text-fg">{children}</dd>
    </div>
  )
}

function FurnitureItem({ r }) {
  const { notify, notifyError } = useToast()
  const save = useMutation((id) => api.maintenance.update(r.id, { furnitureItemId: id || null }), {
    invalidates: ['maintenance'],
    onSuccess: () => notify({ title: 'Furniture item saved', message: 'Its history keeps this repair.' }),
    onError: (e) => notifyError(e, 'Could not save'),
  })
  const options = [
    { value: '', label: t('Not about a furniture item') },
    ...(r.furnitureOptions ?? []).map((f) => ({ value: f.id, label: `${typeName(f)} · ${f.assetCode}` })),
  ]
  return (
    <Fact label="Furniture item" tip="The item's history lists this request when it is reported and resolved.">
      <Select
        aria-label={t('Furniture item')}
        value={r.furnitureItem?.id ?? ''}
        options={options}
        disabled={save.pending || r.status === 'Closed'}
        onChange={(e) => save.run(e.target.value)}
      />
    </Fact>
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
  // The person in charge does the work: other Staff take the request over first (Managers may act on any request).
  const { user } = useSession()
  const isStaff = user?.role === 'staff'
  const mine = r.assignee && String(r.assignee.id) === String(user?.id)
  const someoneElse = isStaff && r.assignee && !mine
  const setStatus = useMutation(
    (status) =>
      api.maintenance.update(r.id, {
        status,
        // Staff starting an unassigned request take it themselves; a Manager starts it for the chosen person.
        assigneeId: status === 'In progress' && !r.assignee ? (isStaff ? user.id : assigneeId || undefined) : undefined,
      }),
    {
      ...options,
      onSuccess: (_, status) => notify({ title: t('{id} is now {status}', { id: r.id, status: t(status) }), message: studentRequest ? t('{name} was notified.', { name: r.reporter.name }) : undefined }),
      onError: (e) => notifyError(e, 'Could not change the status'),
    },
  )
  const takeOver = useMutation(() => api.maintenance.update(r.id, { assigneeId: user.id }), {
    ...options,
    onSuccess: () => notify({ title: t('You are now in charge of {id}', { id: r.id }), message: t('{name} sees the change in the request history.', { name: r.assignee?.name ?? t('Your colleague') }) }),
    onError: (e) => notifyError(e, 'Could not take the request over'),
  })
  const post = useMutation(() => api.maintenance.addUpdate(r.id, { message: message.trim(), internal }), {
    ...options,
    onSuccess: () => {
      setMessage('')
      notify({ title: internal ? 'Internal note added' : 'Update posted', message: internal ? 'Only staff and managers can see it.' : t('{name} was notified.', { name: r.reporter?.name ?? t('The reporter') }) })
    },
    onError: (e) => notifyError(e, 'Could not post the update'),
  })
  const busy = save.pending || setStatus.pending || takeOver.pending
  // Where the problem is, always naming the room: "Room A-801 · Bed A", or "Balcony · Room A-801".
  const place = r.bed ? t('{room} · Bed {bed}', { room: r.room, bed: r.bed }) : r.room
  const where = !r.location || r.location === 'Room' ? t('Room {code}', { code: place }) : `${tr(r.location)} · ${t('Room {code}', { code: place })}`

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Maintenance', to: `${base}/maintenance` }, { label: r.id }]} />}
        title={
          <span className="block max-w-[34vw] truncate" title={r.title}>
            {r.title}
          </span>
        }
        badge={
          <span className="mr-6 flex shrink-0 items-center gap-2">
            <StatusTag status={r.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
            {[r.reporter?.name, r.reporter?.role ? tr(r.reporter.role) : null, formatDateTime(r.reportedAt)].filter(Boolean).join(' · ')}
            {r.urgency === 'Urgent' && <StatusTag status={r.urgency} tone="error" />}
          </span>
        }
        actions={
          <>
            {someoneElse && r.status !== 'Closed' ? (
              <Button variant="primary" icon={UserCheck} onClick={() => takeOver.run()} disabled={busy}>
                Take over
              </Button>
            ) : open ? (
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

      {someoneElse && r.status !== 'Closed' && (
        <Alert type="warning" title={t('{name} is in charge of this request', { name: r.assignee.name })} className="shrink-0">
          {t('Only the person in charge changes its status. If they are away or off duty, take it over: the request history shows who took it from whom.')}
        </Alert>
      )}
      {isStaff && mine && open && (
        <Alert type="info" title="You are in charge of this request" className="shrink-0">
          Start the work, keep the student updated and mark it resolved when it is fixed.
        </Alert>
      )}
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

      {/* One screen, two columns: the request and its conversation | what the desk decides.
          Only the update history scrolls, inside its card; narrow screens stack the columns. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
        <div className="flex min-h-0 flex-col gap-4">
          {/* What the student reported */}
          <Card className="flex shrink-0 flex-col gap-4">
            {r.description && <p className="rounded-md bg-subtle px-4 py-3 text-base whitespace-pre-line text-fg">{r.description}</p>}
            {r.photos?.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t('Photos')}>
                {r.photos.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-md border border-line bg-subtle">
                      <img src={p.url} alt={p.name ?? t('Photo')} className="size-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {/* One row: the three facts take their own width, the furniture item the rest; one label style throughout. */}
            <dl className="grid grid-cols-2 gap-x-10 gap-y-4 lg:grid-cols-[auto_auto_auto_minmax(240px,1fr)]">
              <Fact label="Where">{where}</Fact>
              <Fact label="Category">{tr(r.category) || '—'}</Fact>
              <Fact label="Entry when absent">{t(r.staffMayEnter === false ? 'Not allowed' : 'Allowed')}</Fact>
              <FurnitureItem r={r} />
            </dl>
          </Card>

          {/* The conversation: history scrolls, the composer stays at the bottom */}
          <Card className="flex min-h-[360px] flex-1 flex-col gap-3 xl:min-h-0">
            <h2 className="flex shrink-0 items-center gap-2 text-h3 font-semibold text-fg">
              <MessageSquare size={18} aria-hidden="true" className="text-fg-secondary" />
              {t('Updates')}
              <span className="text-sm font-normal text-fg-tertiary">{(r.events ?? []).length}</span>
            </h2>
            <ol className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
              {(r.events ?? []).map((e, i, all) => (
                <Event key={`${i}-${e.at}`} event={e} last={i === all.length - 1} />
              ))}
            </ol>
            <div className="flex shrink-0 items-end gap-3 border-t border-line pt-3">
              <Textarea
                aria-label={t('Update')}
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={internal || !studentRequest ? 'Write an internal note for staff…' : 'Write an update for the student…'}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Checkbox label="Internal note (hidden from the student)" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                <Button variant="primary" onClick={() => post.run()} disabled={!message.trim() || post.pending}>
                  Post update
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* 3 · What the desk decides */}
        <Card className="flex min-h-0 flex-col gap-3.5 self-start xl:max-h-full xl:overflow-y-auto">
          <h2 className="text-h3 font-semibold text-fg">{t('Handling')}</h2>
          {r.slaDueAt && open && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2 text-sm text-fg-secondary">
              <span className="flex min-w-0 items-center gap-2">
                <Clock size={16} aria-hidden="true" className="shrink-0" />
                {t('Due {date}', { date: formatDateTime(r.slaDueAt) })}
              </span>
              <SlaBadge dueAt={r.slaDueAt} />
            </div>
          )}
          <Field label="Priority" helper={studentRequest && r.urgency ? t('The student marked it {urgency}.', { urgency: tr(r.urgency) }) : undefined}>
            {(id) => <Select id={id} value={priority ?? ''} onChange={(e) => setPriority(e.target.value)} options={priorities} />}
          </Field>
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
          <VisitWindowField value={visit} onChange={setVisit} />
          <Button variant="primary" icon={Check} block onClick={() => save.run()} disabled={busy}>
            {studentRequest ? 'Save and notify student' : 'Save'}
          </Button>
        </Card>
      </div>
    </>
  )
}

// The visit window stays the text "dd/mm/yyyy hh:mm – hh:mm" the API stores; it is picked as a day and two whole
// hours. A window written another way is kept until a new day is chosen.
const WINDOW = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}) – (\d{2}:\d{2})$/
function VisitWindowField({ value, onChange }) {
  const m = WINDOW.exec(value ?? '')
  const day = m ? `${m[3]}-${m[2]}-${m[1]}` : ''
  const [from, to] = m ? [m[4], m[5]] : ['', '']
  const write = (d, a, b) => {
    if (!d) return onChange('')
    const [y, mo, dd] = d.split('-')
    const start = a || '08:00'
    const end = b && b > start ? b : `${String(Math.min(23, Number(start.slice(0, 2)) + 2)).padStart(2, '0')}:00`
    onChange(`${dd}/${mo}/${y} ${start} – ${end}`)
  }
  const min = campusToday()
  return (
    <Field label="Visit window" helper={value && !m ? t('Written as: {value}', { value }) : undefined}>
      {(id) => (
        <div className="flex flex-col gap-2">
          <DatePicker id={id} clearable value={day} minDate={min} onChange={(d) => write(d, from, to)} />
          <TimeRangePicker
            value={{ start: from, end: to }}
            disabled={!day}
            minTime="00:00"
            maxTime="23:00"
            onChange={({ start, end }) => write(day, start, end)}
          />
        </div>
      )}
    </Field>
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
          The request may belong to another block.
        </EmptyBlock>
      ) : (
        <ErrorState error={query.error} onRetry={query.reload} />
      )}
    </>
  )
}
