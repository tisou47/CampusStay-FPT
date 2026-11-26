import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, RotateCcw, Send, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Avatar } from '@/components/ui/Display'
import { SearchInput, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { campusToday, formatDateTime } from '@/lib/format'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// Manager › Staff › Work schedule
// GET /week-schedule/plan?block&week → { start, end, editable, nextWeek, staff: [{ id, name, title, blocks, shifts, planned }],
//   sentBlocks, pendingBlocks, sentAt, sentBy, reminderDay, reminderHour }
// PUT /week-schedule/plan/:staffId?week { shifts } · DELETE /week-schedule/plan/:staffId?week · POST /week-schedule/send { block }
// GET /block-staff → items[].shifts (default weekly shifts) · PUT /block-staff/:id/shifts { shifts }.
// The one place shifts are edited (user decision 25/11/2026): Week by week plans one week (it then keeps its own shifts),
// Default weekly shifts is the pattern every week not planned on its own follows. Planning next week never changes this
// week; Staff see next week once it is sent.

/** Lower case without Vietnamese marks, so "dinh" finds "Đinh". */
const fold = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

const DAYS =['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
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

const DAY_MIN = 24 * 60
const WEEK_MIN = 7 * DAY_MIN
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
/** The shift as minutes from Monday 00:00; an overnight shift ends on the next day (Sunday's on the next Monday). */
function span(s) {
  const start = (s.weekday - 1) * DAY_MIN + minutes(s.start)
  const end = (s.weekday - 1) * DAY_MIN + minutes(s.end)
  return [start, end <= start ? end + DAY_MIN : end]
}
/** The first shift of `week` that `shift` overlaps (as the server checks: shifts that only meet do not), else null. */
function overlapWith(shift, week) {
  const [a0, a1] = span(shift)
  return week.find((other) => {
    const [b0, b1] = span(other)
    return [-WEEK_MIN, 0, WEEK_MIN].some((w) => a0 < b1 + w && b0 + w < a1)
  }) ?? null
}
const label = (s) => `${t(DAYS[s.weekday - 1])} ${s.start}–${s.end}`

/**
 * One person's shifts on one day: remove some, add a preset or custom hours, then save the person's week. A shift
 * that would overlap another one of the week (this day's, or the night shift of the day before running into it) cannot
 * be added: its preset is off and the reason is shown.
 */
function DayModal({ person, weekday, date, onSave, saving, error, onClose, description = 'Only this week changes; the default weekly shifts stay as they are.' }) {
  const [list, setList] = useState(person.shifts.filter((s) => s.weekday === weekday))
  const [custom, setCustom] = useState({ start: '08:00', end: '17:00' })
  const others = person.shifts.filter((s) => s.weekday !== weekday)
  const week = [...others, ...list]
  const clash = (start, end) => (start === end ? null : overlapWith({ weekday, start, end }, week))
  const add = (start, end) => {
    if (start === end || clash(start, end)) return
    setList([...list, { weekday, start, end }].sort((a, b) => a.start.localeCompare(b.start)))
  }
  const customClash = clash(custom.start, custom.end)
  const save = () => onSave(sortShifts([...others, ...list]))
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={date ? t('{name} · {day} {date}', { name: person.name, day: t(DAYS[weekday - 1]), date: dayMonth(date) }) : t('{name} · every {day}', { name: person.name, day: t(DAYS[weekday - 1]) })}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      {error && <Alert type="error" title="Could not save">{error.details?.fields?.shifts ?? error.message}</Alert>}
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
        {PRESETS.map((p) => {
          const hit = clash(p.start, p.end)
          return (
            <Button key={p.key} size="sm" onClick={() => add(p.start, p.end)} disabled={Boolean(hit)} tip={hit ? t('Overlaps {shift}', { shift: label(hit) }) : undefined}>
              {`${t(p.label)} ${p.start}–${p.end}`}
            </Button>
          )
        })}
        {list.length > 0 && (
          <Button size="sm" variant="text" onClick={() => setList([])}>
            Day off
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg-secondary">{t('Custom hours…')}</span>
          <Select aria-label={t('Start')} wrapperClassName="w-24 shrink-0" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} options={TIMES} />
          <span aria-hidden="true">–</span>
          <Select aria-label={t('End')} wrapperClassName="w-24 shrink-0" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} options={TIMES} />
          {custom.end < custom.start && <span className="text-sm text-fg-secondary">({t('overnight')})</span>}
          <Button size="sm" onClick={() => add(custom.start, custom.end)} disabled={custom.start === custom.end || Boolean(customClash)}>
            Add
          </Button>
        </div>
        {customClash && <p className="text-sm text-error-fg">{t('Overlaps {shift}: a shift must start after the one before it ends.', { shift: label(customClash) })}</p>}
      </div>
    </Modal>
  )
}

/** Monday of the current week on the campus clock, as 'YYYY-MM-DD'. */
function thisMonday() {
  const today = campusToday()
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7
  return addDays(today, 1 - weekday)
}

/** One row of the week grid: a person and their shifts per day; a day opens the editor. */
function ShiftRow({ person, editable, pastDays = 0, badge, action, onEdit }) {
  return (
    <Tr>
      <Td>
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={person.name} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <TwoLine primary={person.name} secondary={`${t('Blocks {codes}', { codes: person.blocks.join(', ') })} · ${tr(person.title ?? 'Staff')}`} />
            {badge}
          </div>
        </div>
      </Td>
      {DAYS.map((name, i) => {
        const mine = person.shifts.filter((s) => s.weekday === i + 1)
        const past = i < pastDays
        const open = editable && !past
        return (
          <Td key={name} className="p-1 align-top">
            <button
              type="button"
              disabled={!open}
              onClick={() => onEdit(i + 1)}
              title={past ? t('This day is over: its shifts can no longer change.') : undefined}
              aria-label={t('Edit {name} on {day}', { name: person.name, day: t(name) })}
              className={cx('flex min-h-14 w-full flex-col items-stretch gap-1 rounded-md p-1 text-center', open && 'hover:bg-subtle', past && 'cursor-not-allowed bg-subtle')}
            >
              {mine.length === 0 && <span className="py-0.5 text-sm text-fg-tertiary">{t('Day off')}</span>}
              {mine.map((s) => (
                // Start and end wrap onto two lines when the column is too narrow for one.
                <span key={s.start} className={cx('flex flex-wrap justify-center rounded bg-primary-subtle px-1 py-0.5 text-sm font-medium text-fg-brand tabular', past && 'opacity-60')}>
                  <span>{s.start}–</span>
                  <span>{s.end}</span>
                </span>
              ))}
            </button>
          </Td>
        )
      })}
      <Td className="whitespace-nowrap">{action}</Td>
    </Tr>
  )
}

function GridHead({ start, pastDays = 0 }) {
  return (
    <THead>
      <tr>
        <Th className="w-60">Staff</Th>
        {DAYS.map((name, i) => (
          <Th key={name} className={i < pastDays ? 'text-fg-tertiary' : undefined}>
            {start ? `${t(name)} ${dayMonth(addDays(start, i))}` : t(name)}
          </Th>
        ))}
        <Th className="w-40">
          <span className="sr-only">{t('Actions')}</span>
        </Th>
      </tr>
    </THead>
  )
}

/** The default weekly shifts: the pattern every week follows unless it is planned on its own. */
function DefaultShifts({ block, needle }) {
  const [editing, setEditing] = useState(null)
  const query = useQuery(['block-staff', block], ({ signal }) => api.blockStaff.list({ block: block ?? undefined }, { signal }))
  const staff = (query.data?.items ?? []).filter((p) => p.role === 'Staff').map((p) => ({ ...p, shifts: p.shifts ?? [] }))
  const shown = needle ? staff.filter((p) => fold(p.name).includes(needle)) : staff
  const save = useMutation(({ id, shifts }) => api.blockStaff.setShifts(id, { shifts }), {
    invalidates: ['block-staff', 'week-schedule', 'me-duty'],
    onSuccess: () => setEditing(null),
    onError: () => {},
  })
  return (
    <>
      <Table fill className="min-h-[420px] shrink-0" tableClassName="table-fixed">
        <GridHead />
        <TBody>
          <TableStatus query={query} rows={shown} colSpan={9} emptyIcon={CalendarDays} emptyTitle={needle ? 'No staff match this name' : 'No staff in these blocks'} />
          {shown.map((p) => (
            <ShiftRow key={p.id} person={p} editable onEdit={(weekday) => setEditing({ person: p, weekday })} />
          ))}
        </TBody>
      </Table>
      {editing && (
        <DayModal
          person={editing.person}
          weekday={editing.weekday}
          description="Every week that is not planned on its own uses this day. Weeks already planned keep their shifts."
          saving={save.pending}
          error={save.error}
          onSave={(shifts) => save.run({ id: editing.person.id, shifts })}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export default function StaffSchedule() {
  const { block } = useSession()
  const { notify, notifyError } = useToast()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'default' ? 'default' : 'week'
  const [week, setWeek] = useState(() => (params.get('view') === 'this-week' ? thisMonday() : null)) // null = next week (the server's default)
  const [editing, setEditing] = useState(null)
  const query = useQuery(['week-schedule', 'plan', block, week], ({ signal }) => api.weekSchedule.plan({ block: block ?? undefined, week: week ?? undefined }, { signal }), { enabled: view === 'week' })
  const d = query.data
  const start = d?.start
  const staff = d?.staff ?? []
  const [q, setQ] = useState('')
  const needle = fold(q.trim())
  const shown = needle ? staff.filter((p) => fold(p.name).includes(needle)) : staff
  const current = thisMonday()
  // In this week the days before today are over: shown, not editable (the server keeps them as recorded too).
  const pastDays = d?.start === current ? Math.round((Date.parse(`${campusToday()}T00:00:00Z`) - Date.parse(`${current}T00:00:00Z`)) / 86400000) : 0

  const save = useMutation(({ id, shifts }) => api.weekSchedule.setWeek(id, start, { shifts }), {
    invalidates: ['week-schedule', 'block-staff', 'me-duty'],
    onSuccess: () => setEditing(null),
    onError: () => {},
  })
  const reset = useMutation((id) => api.weekSchedule.resetWeek(id, start), {
    invalidates: ['week-schedule', 'block-staff', 'me-duty'],
    onError: (e) => notifyError(e, 'Could not reset the week'),
  })
  // Copying is confirmed first and takes only the people planned the week before: people on their default shifts
  // stay on them. One request per person; a failure says how many were already copied (WEB-OPS-40).
  const [copying, setCopying] = useState(null) // { people, replaced } once the week before is read
  const prepareCopy = useMutation(
    async () => {
      const prev = await api.weekSchedule.plan({ block: block ?? undefined, week: addDays(start, -7) })
      const people = prev.staff.filter((p) => p.planned && staff.some((s) => s.id === p.id))
      const replaced = people.filter((p) => staff.find((s) => s.id === p.id)?.planned).length
      setCopying({ people, replaced })
    },
    { onError: (e) => notifyError(e, 'Could not read the week before') },
  )
  const copyPrevious = useMutation(
    async () => {
      let done = 0
      try {
        for (const p of copying.people) {
          await api.weekSchedule.setWeek(p.id, start, { shifts: p.shifts })
          done++
        }
      } catch (e) {
        e.message = t('{done} of {n} people were copied before this error: {message}', { done, n: copying.people.length, message: e.message })
        throw e
      }
      return done
    },
    {
      invalidates: ['week-schedule', 'block-staff'],
      onSuccess: (n) => {
        setCopying(null)
        notify({ title: t('Copied the week before for {n} staff', { n }) })
      },
      onError: (e) => {
        setCopying(null)
        invalidate('week-schedule')
        notifyError(e, 'Could not copy the week before')
      },
    },
  )
  const resetAll = useMutation(
    async () => {
      const own = staff.filter((p) => p.planned)
      for (const p of own) await api.weekSchedule.resetWeek(p.id, start)
      return own.length
    },
    {
      invalidates: ['week-schedule', 'block-staff', 'me-duty'],
      onSuccess: (n) => notify({ title: t('{n} staff follow the default weekly shifts this week', { n }) }),
      onError: (e) => notifyError(e, 'Could not reset the week'),
    },
  )
  const send = useMutation(() => api.weekSchedule.send({ block: block ?? undefined }), {
    invalidates: ['week-schedule'],
    onSuccess: (r) => notify({ title: t('Schedule sent to {n} staff', { n: r.notified }) }),
    onError: (e) => notifyError(e, 'Could not send the schedule'),
  })

  const goTo = (offset) => setWeek(addDays(start, offset * 7))
  const setView = (next) => setParams(next === 'default' ? { view: 'default' } : {}, { replace: true })
  const pending = d?.pendingBlocks?.length > 0
  const planned = staff.filter((p) => p.planned).length

  return (
    <>
      <PageHeader title="Work schedule" />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'week', label: 'Week by week' },
            { value: 'default', label: 'Default weekly shifts' },
          ]}
        />
        <SearchInput wrapperClassName="ml-auto w-64" aria-label={t('Search staff')} placeholder="Search staff name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {view === 'default' ? (
        <>
          <Alert type="info" title="The pattern every week repeats" className="shrink-0">
            {t('A week that is not planned on its own follows these shifts. To change one week only (a day off, a swap), use Week by week: that week then keeps its own shifts.')}
          </Alert>
          <DefaultShifts block={block} needle={needle} />
        </>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <IconButton icon={ChevronLeft} variant="outline" aria-label={t('Previous week')} onClick={() => goTo(-1)} disabled={!d} />
            <div className="flex items-center gap-2">
              <CalendarDays size={18} aria-hidden="true" className="text-fg-brand" />
              <span className="text-lg font-semibold text-fg tabular">{d ? `${dayMonth(d.start)} – ${dayMonth(d.end)}` : '—'}</span>
              {d?.start === current && <Tag tone="brand">This week</Tag>}
              {d?.nextWeek && <Tag tone="brand">Next week</Tag>}
              {d && !d.editable && <Tag>Past week · read only</Tag>}
              {d && d.sentBlocks.length > 0 && <Tag tone="success">{t('Sent: Blocks {list}', { list: d.sentBlocks.join(', ') })}</Tag>}
              {d && pending && <Tag tone="warning">{t('Not sent: Blocks {list}', { list: d.pendingBlocks.join(', ') })}</Tag>}
            </div>
            <IconButton icon={ChevronRight} variant="outline" aria-label={t('Next week')} onClick={() => goTo(1)} disabled={!d} />
            <Button size="sm" variant="text" onClick={() => setWeek(current)} disabled={!d || d.start === current}>
              This week
            </Button>
            <Button size="sm" variant="text" onClick={() => setWeek(null)} disabled={!d || d.nextWeek}>
              Next week
            </Button>
            <div className="ml-auto flex gap-2">
              {d?.editable && planned > 0 && (
                <Button
                  icon={RotateCcw}
                  onClick={() => window.confirm(t('{n} staff have their own shifts this week. Put the whole week back on the default weekly shifts?', { n: planned })) && resetAll.run()}
                  disabled={resetAll.pending}
                >
                  Whole week to default
                </Button>
              )}
              {d?.editable && (
                <Button icon={Copy} onClick={() => prepareCopy.run()} disabled={prepareCopy.pending || copyPrevious.pending || staff.length === 0}>
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
          {d && (
            <p className="shrink-0 text-sm text-fg-secondary">
              {[
                t('{n} of {total} staff have their own shifts this week; the others follow the default weekly shifts.', { n: planned, total: staff.length }),
                d.editable ? (d.nextWeek ? t('Changing a day here changes this week only.') : t('Changing a day here changes this week only, at once: in or out of shift follows it. Days already over are locked.')) : null,
                d.nextWeek && d.sentAt ? t('Sent by {by} on {at}.', { by: d.sentBy, at: formatDateTime(d.sentAt) }) : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          )}

          <Table fill className="min-h-[420px] shrink-0" tableClassName="table-fixed">
            <GridHead start={d?.start} pastDays={pastDays} />
            <TBody>
              <TableStatus query={query} rows={shown} colSpan={9} emptyIcon={CalendarDays} emptyTitle={needle ? 'No staff match this name' : 'No staff in these blocks'} />
              {shown.map((p) => (
                <ShiftRow
                  key={p.id}
                  person={p}
                  editable={d.editable}
                  pastDays={pastDays}
                  onEdit={(weekday) => setEditing({ person: p, weekday })}
                  badge={<span>{p.planned ? <Tag tone="warning">Own shifts this week</Tag> : <Tag>Follows the default shifts</Tag>}</span>}
                  action={
                    d.editable &&
                    p.planned && (
                      <Button size="sm" variant="text" icon={RotateCcw} iconSize={16} onClick={() => reset.run(p.id)} disabled={reset.pending} tip="This week follows the default weekly shifts again.">
                        Use default
                      </Button>
                    )
                  }
                />
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
      )}
      <Modal
        open={Boolean(copying)}
        onClose={() => setCopying(null)}
        title="Copy the week before?"
        description={
          copying?.people.length
            ? t('{n} people planned the week before get the same shifts this week. {replaced} of them already have shifts planned this week: those are replaced.', { n: copying.people.length, replaced: copying.replaced })
            : t('Nobody was planned the week before: everyone stays on their default shifts.')
        }
        footer={
          <>
            <Button onClick={() => setCopying(null)}>Cancel</Button>
            <Button variant="primary" icon={Copy} disabled={!copying?.people.length || copyPrevious.pending} onClick={() => copyPrevious.run()}>
              {copyPrevious.pending ? t('Copying…') : t('Copy {n} people', { n: copying?.people.length ?? 0 })}
            </Button>
          </>
        }
      />
    </>
  )
}
