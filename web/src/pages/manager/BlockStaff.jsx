import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRightLeft, CalendarDays, ClipboardList, History, Pencil, Route, UserPlus, Send, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Avatar } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-AUTH-10 Manager › Staff and workload (Figma 69:554)
// GET /block-staff?block → { items: [{ id, name, title, handles, blocks, open, openByType: { Maintenance, Room change,
//   Inspection }, overdue, oldestOpenAt, resolved7d, onDuty, overloaded }],
//   summary: { total, shared, averageOpen, onDuty, deskOnDuty, open, overdue, overloaded, maxOpen },
//   queue: [{ type, label, count, link }], handleOptions, roleOptions }
// PUT /block-staff/:id { handles }. Duty follows sign-in and sign-out (nobody sets it by hand).
// GET /block-staff/:id/work → { items, total } · POST /block-staff/:id/work/reassign { items, toStaffId, note } → { moved }.
// New accounts and their Blocks: Staff accounts (SCR-AUTH-16).

const KINDS = ['Maintenance', 'Room change', 'Inspection']
const HOUR = 3600 * 1000

/** Hours since the oldest open item was opened, "—" when the person has none. */
function oldest(at) {
  if (!at) return '—'
  return t('{n} h', { n: Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / HOUR)) })
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** "Mon–Fri 07:00–15:00 · Sat 07:00–12:00": shifts with the same hours grouped. */
function shiftSummary(shifts) {
  if (!shifts?.length) return null
  const groups = new Map()
  for (const s of shifts) {
    const key = `${s.start}–${s.end}`
    groups.set(key, [...(groups.get(key) ?? []), s.weekday])
  }
  return [...groups.entries()]
    .map(([span, days]) => {
      const sorted = [...days].sort((a, b) => a - b)
      const run = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
      const label = run ? `${t(WEEKDAYS[sorted[0] - 1])}–${t(WEEKDAYS[sorted.at(-1) - 1])}` : sorted.map((d) => t(WEEKDAYS[d - 1])).join(', ')
      return `${label} ${span}`
    })
    .join(' · ')
}

/** What Staff handle, grouped as the Staff menu, with the screens each kind covers. */
const HANDLE_GROUPS = [
  {
    title: 'Desk',
    items: [
      { label: 'Check-in and check-out desk', covers: 'Check-in, check-out, late check-ins' },
      { label: 'Family Day guests', covers: 'Passes, guest check-in and check-out' },
    ],
  },
  {
    title: 'Residents',
    items: [
      { label: 'Room changes, swaps and moves', covers: 'Room-change requests, swaps, operational moves' },
      { label: 'Term transition requests', covers: 'Extensions and ends of stay for next Term' },
    ],
  },
  { title: 'Rooms', items: [{ label: 'Rooms, door codes and furniture', covers: 'Rooms out of service, door codes, furniture' }] },
  {
    title: 'Operations',
    items: [
      { label: 'Maintenance', covers: 'Maintenance requests' },
      { label: 'Inspections', covers: 'Inspection runs' },
      { label: 'Meter readings', covers: 'Meter readings and meter cuts' },
    ],
  },
]

function EditModal({ person, handleOptions, onClose }) {
  const { notify } = useToast()
  const [handles, setHandles] = useState(new Set(person.handles))
  const toggle = (h) =>
    setHandles((s) => {
      const next = new Set(s)
      if (next.has(h)) next.delete(h)
      else next.add(h)
      return next
    })
  const isStaff = person.role === 'Staff'
  // Shifts are edited on Work schedule only (user decision 25/11/2026): this dialog shows them and links there.
  const save = useMutation(
    () => api.blockStaff.update(person.id, { handles: handleOptions.filter((h) => handles.has(h)) }),
    {
      invalidates: ['block-staff', 'routing', 'staff-activity'],
      onSuccess: () => {
        notify({ title: t('{name} updated', { name: person.name }), message: 'Routing uses the new request types from now on.' })
        onClose()
      },
      onError: () => {},
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={t('Edit {name}', { name: person.name })}
      description={`${tr(person.title)} · ${t('Blocks {codes}', { codes: person.blocks.join(', ') })}. ${t('Name, email and blocks are set on staff accounts.')}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.run()} disabled={save.pending}>
            Save
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium text-fg">{t('Handles')}</legend>
        <p className="text-sm text-fg-secondary">{t('Work outside these kinds asks the person to confirm and is marked in the staff activity log.')}</p>
        <div className="flex flex-col gap-3">
          {HANDLE_GROUPS.map((g) => {
            const items = g.items.filter((i) => handleOptions.includes(i.label))
            if (!items.length) return null
            return (
              <div key={g.title} className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-fg-secondary">{t(g.title)}</p>
                {items.map((i) => (
                  <div key={i.label} className="flex flex-col">
                    <Checkbox label={i.label} checked={handles.has(i.label)} onChange={() => toggle(i.label)} />
                    <span className="pl-6 text-xs text-fg-tertiary">{t(i.covers)}</span>
                  </div>
                ))}
              </div>
            )
          })}
          {handleOptions
            .filter((h) => !HANDLE_GROUPS.some((g) => g.items.some((i) => i.label === h)))
            .map((h) => (
              <Checkbox key={h} label={h} checked={handles.has(h)} onChange={() => toggle(h)} />
            ))}
        </div>
      </fieldset>
      {isStaff && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-subtle/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-medium text-fg">{t('Work shifts')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={CalendarDays} to="/manager/staff-schedule?view=this-week" onClick={onClose}>
                This week’s schedule
              </Button>
              <Button size="sm" to="/manager/staff-schedule?view=default" onClick={onClose}>
                Default weekly shifts
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-fg-secondary">{t('This week')}</dt>
            <dd className="text-fg">{shiftSummary(person.weekShifts) ?? t('No shift this week')}</dd>
            <dt className="text-fg-secondary">{t('Default weekly shifts')}</dt>
            <dd className="text-fg">{shiftSummary(person.shifts) ?? t('None set')}</dd>
          </dl>
          <p className="text-xs text-fg-tertiary">{t('Shifts are changed on Work schedule: a week planned there replaces the default weekly shifts for that week.')}</p>
        </section>
      )}
      <p className="text-sm text-fg-secondary">
        {t(person.onDuty ? 'On duty now' : 'Off duty now')} · {t('Duty follows sign-in: signing in starts the shift, signing out ends it.')}
      </p>
    </Modal>
  )
}

/** One person's open work, with the receiver and note to move the items ticked. */
function WorkDrawer({ person, staff, onClose }) {
  const { notify } = useToast()
  const work = useQuery(['block-staff', 'work', person.id], ({ signal }) => api.blockStaff.work(person.id, { signal }))
  const [selected, setSelected] = useState(new Set())
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const items = work.data?.items ?? []
  const key = (i) => `${i.type}:${i.id}`

  // What the receiver needs for the items ticked (all of them while none is ticked): to work in their Blocks and to
  // handle their kinds of work, as the server checks. Who fits comes first, on duty first, then the least loaded;
  // the others are listed with the reason and cannot be chosen.
  const chosen = selected.size ? items.filter((i) => selected.has(key(i))) : items
  const needBlocks = [...new Set(chosen.map((i) => i.block).filter(Boolean))]
  const needHandles = [...new Set(chosen.map((i) => i.handle).filter(Boolean))]
  const receivers = useMemo(
    () =>
      staff
        .filter((s) => s.id !== person.id)
        .map((s) => {
          const missingBlocks = needBlocks.filter((b) => !s.blocks.includes(b))
          const missingHandles = needHandles.filter((h) => !s.handles.includes(h))
          return { ...s, missingBlocks, missingHandles, fits: !missingBlocks.length && !missingHandles.length }
        })
        .sort((a, b) => b.fits - a.fits || b.onDuty - a.onDuty || a.open - b.open || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff, person.id, needBlocks.join(), needHandles.join()],
  )
  const fitting = receivers.filter((s) => s.fits)
  // A receiver chosen before the ticks changed may no longer fit: then nobody is chosen.
  const receiver = receivers.find((s) => s.id === to && s.fits)
  const why = (s) =>
    [
      s.missingBlocks.length ? t('not in Block {list}', { list: s.missingBlocks.join(', ') }) : null,
      s.missingHandles.length ? t('does not handle {list}', { list: s.missingHandles.map(tr).join(', ') }) : null,
    ]
      .filter(Boolean)
      .join('; ')

  const move = useMutation(
    () =>
      api.blockStaff.reassign(person.id, {
        items: items.filter((i) => selected.has(key(i))).map((i) => ({ type: i.type, id: i.id })),
        toStaffId: receiver?.id,
        note: note.trim(),
      }),
    {
      invalidates: ['block-staff', 'routing', 'maintenance', 'dashboard'],
      onSuccess: (result) => {
        notify({ title: t('{n} items moved to {name}', { n: result.moved, name: receiver?.name ?? '' }), message: 'They were told in the app.' })
        setSelected(new Set())
        setNote('')
      },
      onError: () => {},
    },
  )

  const toggle = (k) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const allTicked = items.length > 0 && items.every((i) => selected.has(key(i)))

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      title={t('Work of {name}', { name: person.name })}
      description={t('{n} open items. Tick the ones to move, choose who takes them and say why.', { n: items.length })}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={ArrowRightLeft} onClick={() => move.run()} disabled={move.pending || selected.size === 0 || !receiver || !note.trim()}>
            {t('Reassign selected ({n})', { n: selected.size })}
          </Button>
        </>
      }
    >
      {move.error && <Alert type="error" title="Could not move the work">{move.error.message}</Alert>}
      {work.error && <Alert type="error" title="Could not load the work">{work.error.message}</Alert>}
      {work.loading && <p className="text-base text-fg-secondary">{t('Loading…')}</p>}
      {!work.loading && !work.error && items.length === 0 && <p className="text-base text-fg-secondary">{t('{name} holds no open work.', { name: person.name })}</p>}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <Checkbox label="Select all" checked={allTicked} indeterminate={!allTicked && selected.size > 0} onChange={() => setSelected(allTicked ? new Set() : new Set(items.map(key)))} />
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {items.map((i) => (
              <li key={key(i)} className="flex items-start gap-3 p-3">
                <Checkbox aria-label={t('Select {code}', { code: i.code })} checked={selected.has(key(i))} onChange={() => toggle(key(i))} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={i.link} className="text-base font-medium text-fg-brand hover:underline">
                      {i.type === 'Inspection' ? t('Inspection {date}', { date: i.code }) : i.code}
                    </Link>
                    <Tag dot={false}>{i.type}</Tag>
                    {i.overdue && <Tag tone="error">Overdue</Tag>}
                  </div>
                  <p className="truncate text-base text-fg">{tr(i.title)}</p>
                  <p className="text-sm text-fg-secondary">
                    {[i.roomCode ? t('Room {code}', { code: i.roomCode }) : null, tr(i.status), i.dueAt ? t('Due {when}', { when: formatDateTime(i.dueAt) }) : null, t('Open for {age}', { age: oldest(i.openedAt) })]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Field
            label="Move to"
            required
            helper={
              needBlocks.length || needHandles.length
                ? t('{n} can take {what}: they work in Block {blocks} and handle {handles}.', {
                    n: fitting.length,
                    what: selected.size ? t('the work ticked') : t('this work'),
                    blocks: needBlocks.join(', ') || '—',
                    handles: needHandles.map(tr).join(', ') || '—',
                  })
                : 'The receiver must work in the item’s Block and handle its kind of work.'
            }
          >
            {(id) => (
              <Select
                id={id}
                value={receiver?.id ?? ''}
                onChange={(e) => setTo(e.target.value)}
                options={[
                  { value: '', label: fitting.length ? t('Choose a staff member') : t('Nobody fits this work') },
                  ...receivers.map((s) => ({
                    value: s.id,
                    disabled: !s.fits,
                    label: s.fits
                      ? `${s.name} · ${t('{n} open', { n: s.open })} · ${t(s.onDuty ? 'On duty' : 'Off duty')}`
                      : `${s.name} — ${why(s)}`,
                  })),
                ]}
              />
            )}
          </Field>
          {fitting.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-fg-secondary">{t('Suggested:')}</span>
              {fitting.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTo(s.id)}
                  className={cx(
                    'rounded-full border px-2.5 py-0.5 text-sm transition-colors',
                    receiver?.id === s.id ? 'border-primary bg-primary-subtle font-medium text-fg-brand' : 'border-line text-fg hover:bg-subtle',
                  )}
                >
                  {s.name} · {t('{n} open', { n: s.open })}
                  {s.onDuty ? ` · ${t('On duty')}` : ''}
                </button>
              ))}
            </div>
          )}
          <Field label="Why do you move this work?" required error={move.error?.fields?.note} helper="The receiver reads it; the Audit Log keeps it.">
            {(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
      )}
    </Drawer>
  )
}

/**
 * Next week's schedule handover: shifts repeat every week, and the Manager sends next week's schedule to the Staff of
 * the Blocks (each one is told their shifts). On Sunday the Managers are reminded while a Block's schedule is not sent.
 */
function WeekHandover({ block }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['week-schedule', block], ({ signal }) => api.weekSchedule.next({ block: block ?? undefined }, { signal }))
  const send = useMutation(() => api.weekSchedule.send({ block: block ?? undefined }), {
    invalidates: ['week-schedule'],
    onSuccess: (r) => notify({ title: t('Schedule sent to {n} staff', { n: r.notified }), message: t('Blocks {codes}', { codes: r.blocks.join(', ') }) }),
    onError: (e) => notifyError(e, 'Could not send the schedule'),
  })
  const w = query.data
  if (!w) return null
  const week = `${formatDate(w.start)} – ${formatDate(w.end)}`
  const pending = w.pendingBlocks.length > 0
  const reminder =
    w.reminderDay >= 1 && w.reminderDay <= 7
      ? t('Managers are reminded on {day} at {hour}.', { day: t(FULL_DAYS[w.reminderDay - 1]), hour: `${String(w.reminderHour).padStart(2, '0')}:00` })
      : t('The reminder is off (Admin › System parameters).')
  return (
    <Alert
      type={pending ? 'warning' : 'success'}
      title={pending ? t('Next week ({week}): schedule not sent yet', { week }) : t('Next week ({week}): schedule sent', { week })}
      action={
        <div className="flex gap-2">
          <Button icon={CalendarDays} to="/manager/staff-schedule">
            Plan next week
          </Button>
          <Button variant={pending ? 'primary' : 'secondary'} icon={Send} onClick={() => send.run()} disabled={send.pending}>
            {pending ? 'Send next week’s schedule' : 'Send again'}
          </Button>
        </div>
      }
    >
      {pending
        ? `${t('Check each person’s shifts and work, then send: every Staff member is told their shifts. Not sent: Blocks {list}.', { list: w.pendingBlocks.join(', ') })} ${reminder}`
        : t('Sent by {by} on {at}.', { by: w.sentBy, at: formatDateTime(w.sentAt) })}
    </Alert>
  )
}

export default function BlockStaff() {
  const { block } = useSession()
  const query = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const navigate = useNavigate()
  const s = query.data?.summary
  const queue = query.data?.queue ?? []
  const waiting = queue.reduce((n, q) => n + q.count, 0)
  const staff = query.data?.items ?? []
  // Who needs attention first: overdue work, then the most open work, then by name.
  const sorted = [...staff].sort((a, b) => (b.overdue ?? 0) - (a.overdue ?? 0) || (b.open ?? 0) - (a.open ?? 0) || a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader
        title={block ? t('Staff and workload · Block {code}', { code: block }) : 'Staff and workload'}
        actions={
          <>
            <Button icon={Route} to="/manager/routing-rules">
              Routing and timers
            </Button>
            <Button icon={UserPlus} onClick={() => navigate('/manager/staff-accounts?new=1')}>
              New staff account
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="On duty now" value={s ? t('{n} of {total}', { n: s.onDuty, total: s.total }) : '—'} note={s?.deskOnDuty != null ? t('Check-in desk: {n}', { n: s.deskOnDuty }) : null} />
        <KpiTile size="md" label="Open (staff)" value={formatNumber(s?.open)} note={s?.averageOpen != null ? t('Now · {n} per person', { n: s.averageOpen.toFixed(1) }) : 'Now'} />
        <KpiTile
          size="md"
          label="Overdue"
          value={formatNumber(s?.overdue)}
          valueTone={s?.overdue ? 'error' : undefined}
          note={s ? t('{n} overloaded (more than {max} open)', { n: s.overloaded, max: s.maxOpen }) : null}
          noteTone={s?.overloaded ? 'warning' : 'secondary'}
        />
        <KpiTile size="md" label="Waiting in the Block" value={formatNumber(waiting)} note={queue.length ? null : 'Nothing waits without an owner'}>
          {queue.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm">
              {queue.map((q) => (
                <li key={q.type}>
                  <Link to={q.link} className="text-fg-brand hover:underline">
                    {t('{label}: {n}', { label: tr(q.label), n: q.count })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </KpiTile>
      </div>
      <WeekHandover block={block} />
      <Table fill className="min-h-[420px] shrink-0" tableClassName="table-fixed">
        <THead>
          <tr>
            <Th>Staff</Th>
            <Th className="w-[21%]">Handles</Th>
            <Th className="w-[19%]">Open work</Th>
            <Th className="w-[10%] text-right">Resolved (7 days)</Th>
            <Th className="w-[17%]">Duty and shift</Th>
            <Th className="w-28">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={Users} emptyTitle="No staff in these blocks" />
          {sorted.map((p) => {
            const kinds = KINDS.filter((k) => p.openByType?.[k] > 0)
            return (
              <Tr key={p.id} className="[&>td]:h-16">
                <Td>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={p.name} />
                    <button type="button" onClick={() => setViewing(p)} className="min-w-0 text-left hover:underline">
                      <TwoLine primary={p.name} secondary={`${t('Blocks {codes}', { codes: p.blocks.join(', ') })} · ${tr(p.title)}`} />
                    </button>
                    {p.overloaded && <Tag tone="warning">Overloaded</Tag>}
                  </div>
                </Td>
                <Td>
                  {p.handles.length ? (
                    <p className="line-clamp-2 text-sm text-fg-secondary" title={p.handles.map(tr).join(', ')}>
                      {p.handles.map(tr).join(', ')}
                    </p>
                  ) : (
                    <span className="text-fg-tertiary">{t('Nothing yet')}</span>
                  )}
                </Td>
                <Td>
                  {p.open > 0 ? (
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-fg tabular">{t('{n} open', { n: p.open })}</span>
                        {p.overdue > 0 && <Tag tone="error">{t('{n} overdue', { n: p.overdue })}</Tag>}
                      </div>
                      <span className="truncate text-sm text-fg-tertiary">
                        {[...kinds.map((k) => `${t(k)} ${p.openByType[k]}`), p.oldestOpenAt && t('oldest {age}', { age: oldest(p.oldestOpenAt) })].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-fg-tertiary">{t('No open work')}</span>
                  )}
                </Td>
                <Td className="text-right tabular">{p.resolved7d ?? '—'}</Td>
                <Td>
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    {p.onDuty ? <Tag tone="success">On duty</Tag> : <Tag>Off</Tag>}
                    {p.role === 'Staff' &&
                      (p.weekShifts?.length ? (
                        <span className="max-w-full truncate text-sm text-fg-secondary" title={shiftSummary(p.weekShifts)}>
                          {p.inShift ? t('In shift') : t('Outside shift')} · {shiftSummary(p.weekShifts)}
                        </span>
                      ) : (
                        <span className="text-sm text-warning-fg">{t('No shift this week')}</span>
                      ))}
                  </div>
                </Td>
                <Td>
                  <div className="flex justify-end gap-0.5">
                    <IconButton icon={ClipboardList} aria-label={t('Work')} onClick={() => setViewing(p)} />
                    {p.role === 'Staff' && <IconButton icon={History} aria-label={t('Activity')} onClick={() => navigate(`/manager/staff-activity?staff=${p.id}`)} />}
                    <IconButton icon={Pencil} aria-label={t('Edit')} onClick={() => setEditing(p)} />
                  </div>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
      {editing && <EditModal person={editing} handleOptions={query.data?.handleOptions ?? editing.handles} onClose={() => setEditing(null)} />}
      {viewing && <WorkDrawer person={viewing} staff={staff} onClose={() => setViewing(null)} />}
    </>
  )
}
