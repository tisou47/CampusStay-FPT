import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, RotateCcw, Send, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Avatar } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// Manager › Staff › Work schedule
// GET /week-schedule/plan?block&week → { start, end, editable, nextWeek, staff: [{ id, name, title, blocks, shifts, planned }],
//   sentBlocks, pendingBlocks, sentAt, sentBy, reminderDay, reminderHour }
// PUT /week-schedule/plan/:staffId?week { shifts } · DELETE /week-schedule/plan/:staffId?week · POST /week-schedule/send { block }
// A week not planned uses each person's default weekly shifts (Edit on Staff and workload). Planning next week never
// changes this week; Staff see next week once it is sent.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRESETS = [
  { key: 'morning', label: 'Morning', start: '07:00', end: '15:00' },
  { key: 'afternoon', label: 'Afternoon', start: '15:00', end: '23:00' },
  { key: 'night', label: 'Night', start: '23:00', end: '07:00' },
]
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

const pad = (n) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' plus n days, as the same text (UTC arithmetic: no time zone shift). */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const dayMonth = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const sortShifts = (list) => [...list].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))

/** One person's shifts on one day: remove some, add a preset or custom hours, then save the person's week. */
function DayModal({ person, weekday, date, onSave, saving, error, onClose }) {
  const [list, setList] = useState(person.shifts.filter((s) => s.weekday === weekday))
  const [custom, setCustom] = useState({ start: '08:00', end: '17:00' })
  const add = (start, end) => {
    if (start === end || list.some((s) => s.start === start)) return
    setList([...list, { weekday, start, end }].sort((a, b) => a.start.localeCompare(b.start)))
  }
  const save = () => onSave(sortShifts([...person.shifts.filter((s) => s.weekday !== weekday), ...list]))
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={t('{name} · {day} {date}', { name: person.name, day: t(DAYS[weekday - 1]), date: dayMonth(date) })}
      description="Only this week changes; the default weekly shifts stay as they are."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      {error && <Alert type="error" title="Could not save">{error.message}</Alert>}
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        {list.length === 0 && <span className="text-base text-fg-tertiary">{t('Day off')}</span>}
        {list.map((s) => (
          <span key={s.start} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-subtle pr-1 pl-3 font-medium text-fg-brand tabular">
            {s.start}–{s.end}
            {s.end < s.start && <span className="text-sm font-normal text-fg-secondary">({t('until {day} morning', { day: t(DAYS[weekday % 7]) })})</span>}
            <button type="button" aria-label={t('Remove {span}', { span: `${s.start}–${s.end}` })} onClick={() => setList(list.filter((x) => x !== s))} className="rounded-full p-0.5 hover:bg-primary/15">
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" onClick={() => add(p.start, p.end)}>
            {`${t(p.label)} ${p.start}–${p.end}`}
          </Button>
        ))}
        {list.length > 0 && (
          <Button size="sm" variant="text" onClick={() => setList([])}>
            Day off
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-secondary">{t('Custom hours…')}</span>
        <Select aria-label={t('Start')} wrapperClassName="w-24 shrink-0" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} options={TIMES} />
        <span aria-hidden="true">–</span>
        <Select aria-label={t('End')} wrapperClassName="w-24 shrink-0" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} options={TIMES} />
        <Button size="sm" onClick={() => add(custom.start, custom.end)} disabled={custom.start === custom.end}>
          Add
        </Button>
      </div>
    </Modal>
  )
}

export default function StaffSchedule() {
  const { block } = useSession()
  const { notify, notifyError } = useToast()
  const [week, setWeek] = useState(null) // null = next week (the server's default)
  const [editing, setEditing] = useState(null)
  const query = useQuery(['week-schedule', 'plan', block, week], ({ signal }) => api.weekSchedule.plan({ block: block ?? undefined, week: week ?? undefined }, { signal }))
  const d = query.data
  const start = d?.start
  const staff = d?.staff ?? []

  const save = useMutation(({ id, shifts }) => api.weekSchedule.setWeek(id, start, { shifts }), {
    invalidates: ['week-schedule', 'block-staff', 'me-duty'],
    onSuccess: () => setEditing(null),
    onError: () => {},
  })
  const reset = useMutation((id) => api.weekSchedule.resetWeek(id, start), {
    invalidates: ['week-schedule', 'block-staff', 'me-duty'],
    onError: (e) => notifyError(e, 'Could not reset the week'),
  })
  const copyPrevious = useMutation(
    async () => {
      const prev = await api.weekSchedule.plan({ block: block ?? undefined, week: addDays(start, -7) })
      for (const p of prev.staff) {
        if (staff.some((s) => s.id === p.id)) await api.weekSchedule.setWeek(p.id, start, { shifts: p.shifts })
      }
      return prev.staff.length
    },
    {
      invalidates: ['week-schedule', 'block-staff'],
      onSuccess: (n) => notify({ title: t('Copied the week before for {n} staff', { n }) }),
      onError: (e) => notifyError(e, 'Could not copy the week before'),
    },
  )
  const send = useMutation(() => api.weekSchedule.send({ block: block ?? undefined }), {
    invalidates: ['week-schedule'],
    onSuccess: (r) => notify({ title: t('Schedule sent to {n} staff', { n: r.notified }) }),
    onError: (e) => notifyError(e, 'Could not send the schedule'),
  })

  const goTo = (offset) => setWeek(addDays(start, offset * 7))
  const pending = d?.pendingBlocks?.length > 0

  return (
    <>
      <PageHeader
        title="Work schedule"
      />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <IconButton icon={ChevronLeft} variant="outline" aria-label={t('Previous week')} onClick={() => goTo(-1)} disabled={!d} />
        <div className="flex items-center gap-2">
          <CalendarDays size={18} aria-hidden="true" className="text-fg-brand" />
          <span className="text-lg font-semibold text-fg tabular">{d ? `${dayMonth(d.start)} – ${dayMonth(d.end)}` : '—'}</span>
          {d?.nextWeek && <Tag tone="brand">Next week</Tag>}
          {d && !d.editable && <Tag>Past week · read only</Tag>}
          {d && d.sentBlocks.length > 0 && <Tag tone="success">{t('Sent: Blocks {list}', { list: d.sentBlocks.join(', ') })}</Tag>}
          {d && pending && <Tag tone="warning">{t('Not sent: Blocks {list}', { list: d.pendingBlocks.join(', ') })}</Tag>}
        </div>
        <IconButton icon={ChevronRight} variant="outline" aria-label={t('Next week')} onClick={() => goTo(1)} disabled={!d} />
        <Button size="sm" variant="text" onClick={() => setWeek(null)} disabled={!d || d.nextWeek}>
          Back to next week
        </Button>
        <div className="ml-auto flex gap-2">
          {d?.editable && (
            <Button icon={Copy} onClick={() => copyPrevious.run()} disabled={copyPrevious.pending || staff.length === 0}>
              Copy the week before
            </Button>
          )}
          {d?.nextWeek && (
            <Button variant="primary" icon={Send} onClick={() => send.run()} disabled={send.pending || staff.length === 0}>
              {pending ? 'Send next week’s schedule' : 'Send again'}
            </Button>
          )}
        </div>
      </div>
      {d?.nextWeek && d.sentAt && <p className="text-sm text-fg-secondary">{t('Sent by {by} on {at}.', { by: d.sentBy, at: formatDateTime(d.sentAt) })}</p>}
      {d?.editable && !d.nextWeek && <p className="text-sm text-fg-secondary">{t('Changes to this week apply at once: in or out of shift follows them.')}</p>}

      <Table fill className="min-h-[420px] shrink-0">
        <THead>
          <tr>
            <Th className="sticky left-0 z-20 min-w-56 bg-subtle">Staff</Th>
            {DAYS.map((name, i) => (
              <Th key={name} className="min-w-32">
                {d ? `${t(name)} ${dayMonth(addDays(d.start, i))}` : t(name)}
              </Th>
            ))}
            <Th className="w-12">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={9} emptyIcon={CalendarDays} emptyTitle="No staff in these blocks" />
          {staff.map((p) => (
            <Tr key={p.id}>
              <Td className="sticky left-0 z-[1] bg-surface">
                <div className="flex items-center gap-2.5">
                  <Avatar name={p.name} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <TwoLine primary={p.name} secondary={`${tr(p.title ?? 'Staff')} · ${t('Blocks {codes}', { codes: p.blocks.join(', ') })}`} />
                    <span>{p.planned ? <Tag tone="brand">Planned for this week</Tag> : <Tag>Default weekly shifts</Tag>}</span>
                  </div>
                </div>
              </Td>
              {DAYS.map((name, i) => {
                const mine = p.shifts.filter((s) => s.weekday === i + 1)
                return (
                  <Td key={name} className="p-1 align-top">
                    <button
                      type="button"
                      disabled={!d.editable}
                      onClick={() => setEditing({ person: p, weekday: i + 1 })}
                      aria-label={t('Edit {name} on {day}', { name: p.name, day: t(name) })}
                      className={cx('flex min-h-14 w-full flex-col items-start gap-1 rounded-md p-1.5 text-left', d.editable && 'hover:bg-subtle')}
                    >
                      {mine.length === 0 && <span className="text-sm text-fg-tertiary">{t('Day off')}</span>}
                      {mine.map((s) => (
                        <span key={s.start} className="rounded bg-primary-subtle px-1.5 py-0.5 text-sm font-medium text-fg-brand tabular">
                          {s.start}–{s.end}
                        </span>
                      ))}
                    </button>
                  </Td>
                )
              })}
              <Td>
                {d.editable && p.planned && (
                  <IconButton icon={RotateCcw} aria-label={t('Use the default weekly shifts for this week')} onClick={() => reset.run(p.id)} disabled={reset.pending} />
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {editing && (
        <DayModal
          person={editing.person}
          weekday={editing.weekday}
          date={addDays(start, editing.weekday - 1)}
          saving={save.pending}
          error={save.error}
          onSave={(shifts) => save.run({ id: editing.person.id, shifts })}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
