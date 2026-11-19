import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRightLeft, ClipboardList, History, Pencil, Route, ShieldCheck, UserCheck, UserPlus, Send, Users, X } from 'lucide-react'
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

const PRESETS = [
  { key: 'morning', label: 'Morning', start: '07:00', end: '15:00' },
  { key: 'afternoon', label: 'Afternoon', start: '15:00', end: '23:00' },
  { key: 'night', label: 'Night', start: '23:00', end: '07:00' },
]
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

/**
 * A Staff member's weekly shifts as a week: one line per day with its shifts as chips. A shift is added from the
 * day's list (Morning, Afternoon, Night or custom hours, 24-hour clock); an end before the start runs past midnight.
 */
function ShiftEditor({ shifts, onChange }) {
  const [custom, setCustom] = useState(null)
  const add = (days, start, end) => {
    const fresh = days.filter((d) => !shifts.some((s) => s.weekday === d && s.start === start)).map((weekday) => ({ weekday, start, end }))
    if (fresh.length) onChange([...shifts, ...fresh])
  }
  const remove = (x) => onChange(shifts.filter((s) => s !== x))
  const span = (s) => `${s.start}–${s.end}`
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-base font-medium text-fg">{t('Weekly shifts')}</legend>
      <p className="text-sm text-fg-secondary">
        {t('Outside these hours, every change this person makes asks them to confirm and is marked in the staff activity log. No shift = always outside.')}
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2">
        <span className="text-sm font-medium text-fg">{t('Mon–Fri:')}</span>
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" onClick={() => add([1, 2, 3, 4, 5], p.start, p.end)}>
            {`${t(p.label)} ${p.start}–${p.end}`}
          </Button>
        ))}
        {shifts.length > 0 && (
          <Button size="sm" variant="text" className="ml-auto" onClick={() => onChange([])}>
            Clear all
          </Button>
        )}
      </div>
      <div className="flex flex-col rounded-lg border border-line">
        {WEEKDAYS.map((name, i) => {
          const day = i + 1
          const mine = shifts.filter((s) => s.weekday === day).sort((a, b) => a.start.localeCompare(b.start))
          return (
            <div key={day} className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="w-9 shrink-0 font-medium text-fg">{t(name)}</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {mine.length === 0 && <span className="text-sm text-fg-tertiary">{t('Day off')}</span>}
                  {mine.map((s) => (
                    <span key={`${s.start}-${s.end}`} className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-subtle pr-1 pl-2.5 text-sm font-medium text-fg-brand tabular">
                      {span(s)}
                      {s.end < s.start && <span className="font-normal text-fg-secondary">({t('until {day} morning', { day: t(WEEKDAYS[s.weekday % 7]) })})</span>}
                      <button type="button" onClick={() => remove(s)} aria-label={t('Remove {span}', { span: span(s) })} className="rounded-full p-0.5 hover:bg-primary/15">
                        <X size={14} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
                <Select
                  aria-label={t('Add a shift on {day}', { day: t(name) })}
                  wrapperClassName="w-44 shrink-0"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'custom') setCustom({ weekday: day, start: '08:00', end: '17:00' })
                    else {
                      const p = PRESETS.find((x) => x.key === v)
                      if (p) add([day], p.start, p.end)
                    }
                  }}
                  options={[
                    { value: '', label: t('+ Add a shift') },
                    ...PRESETS.map((p) => ({ value: p.key, label: `${t(p.label)} ${p.start}–${p.end}` })),
                    { value: 'custom', label: t('Custom hours…') },
                  ]}
                />
              </div>
              {custom?.weekday === day && (
                <div className="flex flex-wrap items-center gap-2 pl-12">
                  <Select aria-label={t('Start')} wrapperClassName="w-24 shrink-0" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} options={TIMES} />
                  <span aria-hidden="true">–</span>
                  <Select aria-label={t('End')} wrapperClassName="w-24 shrink-0" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} options={TIMES} />
                  {custom.end < custom.start && <span className="text-sm text-fg-secondary">({t('overnight')})</span>}
                  <Button size="sm" variant="primary" disabled={custom.start === custom.end} onClick={() => (add([day], custom.start, custom.end), setCustom(null))}>
                    Add
                  </Button>
                  <Button size="sm" variant="text" onClick={() => setCustom(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

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
  const [shifts, setShifts] = useState(person.shifts ?? [])
  const save = useMutation(
    async () => {
      await api.blockStaff.update(person.id, { handles: handleOptions.filter((h) => handles.has(h)) })
      if (isStaff) await api.blockStaff.setShifts(person.id, { shifts })
    },
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
          <Button variant="primary" onClick={() => save.run()} disabled={save.pending || shifts.some((s) => !s.start || !s.end || s.start === s.end)}>
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
      {isStaff && <ShiftEditor shifts={shifts} onChange={setShifts} />}
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

  // Receivers: the others of the list, on duty first, then the least loaded.
  const receivers = useMemo(
    () =>
      staff
        .filter((s) => s.id !== person.id)
        .sort((a, b) => (a.onDuty === b.onDuty ? a.open - b.open || a.name.localeCompare(b.name) : a.onDuty ? -1 : 1)),
    [staff, person.id],
  )
  const receiver = receivers.find((s) => s.id === to)

  const move = useMutation(
    () =>
      api.blockStaff.reassign(person.id, {
        items: items.filter((i) => selected.has(key(i))).map((i) => ({ type: i.type, id: i.id })),
        toStaffId: to,
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
          <Button variant="primary" icon={ArrowRightLeft} onClick={() => move.run()} disabled={move.pending || selected.size === 0 || !to || !note.trim()}>
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
          <Field label="Move to" required helper="The receiver must work in the item's Block and handle its kind of work.">
            {(id) => (
              <Select
                id={id}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                options={[
                  { value: '', label: t('Choose a staff member') },
                  ...receivers.map((s) => ({ value: s.id, label: `${s.name} · ${t('{n} open', { n: s.open })} · ${t(s.onDuty ? 'On duty' : 'Off duty')}` })),
                ]}
              />
            )}
          </Field>
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
  return (
    <Alert
      type={pending ? 'warning' : 'success'}
      title={pending ? t('Next week ({week}): schedule not sent yet', { week }) : t('Next week ({week}): schedule sent', { week })}
      action={
        <Button variant={pending ? 'primary' : 'secondary'} icon={Send} onClick={() => send.run()} disabled={send.pending}>
          {pending ? 'Send next week’s schedule' : 'Send again'}
        </Button>
      }
    >
      {pending
        ? t('Check each person’s shifts and work, then send: every Staff member is told their shifts. Not sent: Blocks {list}. You are reminded on Sunday.', { list: w.pendingBlocks.join(', ') })
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

  return (
    <>
      <PageHeader
        title={block ? t('Staff and workload · Block {code}', { code: block }) : 'Staff and workload'}
        description="Staff of the blocks in your scope, the work each person holds and who is on duty. Open a person's work to move it to someone else. Duty follows sign-in: staff are on duty while signed in and go off when they sign out or stop using the app for a while."
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
      <div className="grid shrink-0 grid-cols-3 gap-4">
        {[
          { icon: Route, title: 'Who gets new requests', text: 'A new maintenance or room-change request goes to the person its routing rule names while they are on duty, else to the rule’s fallback.' },
          { icon: UserCheck, title: 'Who works on a request', text: 'Only the person in charge changes a request’s status. A colleague who covers takes it over first; the history keeps both names.' },
          { icon: ShieldCheck, title: 'What duty does not do', text: 'Off duty is not a lock: staff keep access to their blocks to look things up. To stop someone working, lock the account on staff accounts.' },
        ].map((x) => (
          <div key={x.title} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5">
            <x.icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-brand" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-base font-medium text-fg">{t(x.title)}</p>
              <p className="text-sm text-fg-secondary">{t(x.text)}</p>
            </div>
          </div>
        ))}
      </div>
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
      <Table fill className="min-h-[420px] shrink-0">
        <THead>
          <tr>
            <Th className="sticky left-0 z-20 min-w-60 bg-subtle">Staff</Th>
            <Th className="min-w-56">Handles</Th>
            {KINDS.map((k) => (
              <Th key={k} className="w-24 whitespace-nowrap text-right">
                {k}
              </Th>
            ))}
            <Th className="w-20 whitespace-nowrap text-right">Overdue</Th>
            <Th className="w-20 whitespace-nowrap text-right">Oldest</Th>
            <Th className="w-28 whitespace-nowrap text-right">Resolved (7 days)</Th>
            <Th className="w-28 whitespace-nowrap">Status</Th>
            <Th className="min-w-48">Work shift</Th>
            <Th className="sticky right-0 z-20 w-32 bg-subtle">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={12} emptyIcon={Users} emptyTitle="No staff in these blocks" />
          {staff.map((p) => (
            <Tr key={p.id} className="[&>td]:min-h-14">
              <Td className="sticky left-0 z-[1] bg-surface">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={p.name} />
                  <button type="button" onClick={() => setViewing(p)} className="min-w-0 text-left hover:underline">
                    <TwoLine primary={p.name} secondary={`${tr(p.title)} · ${t('Blocks {codes}', { codes: p.blocks.join(', ') })}`} />
                  </button>
                  {p.overloaded && <Tag tone="warning">Overloaded</Tag>}
                </div>
              </Td>
              <Td>
                {p.handles.length ? (
                  <div className="flex max-w-72 flex-wrap gap-1 py-1">
                    {p.handles.map((h) => (
                      <Tag key={h}>{tr(h)}</Tag>
                    ))}
                  </div>
                ) : (
                  <span className="text-fg-tertiary">{t('Nothing yet')}</span>
                )}
              </Td>
              {KINDS.map((k) => (
                <Td key={k} className="text-right tabular">
                  {p.openByType?.[k] ?? 0}
                </Td>
              ))}
              <Td className="text-right tabular">{p.overdue > 0 ? <Tag tone="error">{String(p.overdue)}</Tag> : 0}</Td>
              <Td className={p.oldestOpenAt ? 'text-right tabular' : 'text-right text-fg-tertiary'}>{oldest(p.oldestOpenAt)}</Td>
              <Td className="text-right tabular">{p.resolved7d ?? '—'}</Td>
              <Td className="whitespace-nowrap">{p.onDuty ? <Tag tone="success">On duty</Tag> : <Tag>Off</Tag>}</Td>
              <Td>
                {p.role !== 'Staff' ? (
                  <span className="text-fg-tertiary">—</span>
                ) : p.shifts?.length ? (
                  <div className="flex flex-col items-start gap-0.5 py-1">
                    {p.inShift ? <Tag tone="success">In shift</Tag> : <Tag tone="warning">Outside shift</Tag>}
                    <span className="text-sm text-fg-secondary">{shiftSummary(p.shifts)}</span>
                  </div>
                ) : (
                  <Tag tone="warning">No shift set</Tag>
                )}
              </Td>
              <Td className="sticky right-0 z-[1] bg-surface">
                <div className="flex justify-end gap-0.5">
                  <IconButton icon={ClipboardList} aria-label={t('Work')} onClick={() => setViewing(p)} />
                  {p.role === 'Staff' && <IconButton icon={History} aria-label={t('Activity')} onClick={() => navigate(`/manager/staff-activity?staff=${p.id}`)} />}
                  <IconButton icon={Pencil} aria-label={t('Edit')} onClick={() => setEditing(p)} />
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {editing && <EditModal person={editing} handleOptions={query.data?.handleOptions ?? editing.handles} onClose={() => setEditing(null)} />}
      {viewing && <WorkDrawer person={viewing} staff={staff} onClose={() => setViewing(null)} />}
    </>
  )
}
