import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Bed,
  CalendarClock,
  Check,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  KeyRound,
  PackageCheck,
  Search,
  UserX,
  Zap,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar, Card, ProgressBar } from '@/components/ui/Display'
import { Field, FilePicker, SearchInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { InfoTip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber, formatTime, formatVnd, toDateInput } from '@/lib/format'
import { t, tr } from '@/i18n'
import { DatePicker } from '@/components/ui/date-time'

// SCR-REQ-11 Check-in Desk (Figma 60:3026)
// GET /check-in/today?termId&block → { date, block, expected, checkedIn, waiting, blocked, recent: [{ name, bed, at }] }
// GET /check-in/lookup?termId&q → { student: { name, studentCode, room, bed, block, floor,
//   status: 'ready'|'blocked'|'checked-in'|'not-allocated', checks: [{ label, passed }], owes: { balance, utilityDeposit } | null,
//   checkedInAt, handOverItems: [string] } | null }
// POST /check-in { studentCode, items, note } → { checkedInAt }
// POST /late-check-ins (multipart) studentCode, reason, requestedFor (YYYY-MM-DD), termId?, evidence? → { id }
//   — for a student whose check-in window closed; a Manager decides it in Decisions › Late check-in

const statusTag = {
  ready: <Tag tone="success">Ready to check in</Tag>,
  blocked: <Tag tone="error">Check-in blocked</Tag>,
  'checked-in': <Tag tone="info">Checked in</Tag>,
  'not-allocated': <Tag tone="neutral">No bed yet</Tag>,
}

/** Visual green/red status tile for each check-in eligibility prerequisite. */
function EligibilityCheckTile({ ok, label, hint }) {
  const Glyph = ok ? CircleCheck : CircleX
  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors',
        ok ? 'border-success/20 bg-success-bg text-success-fg' : 'border-error/20 bg-error-bg text-error-fg',
      )}
    >
      <span
        className={cx(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          ok ? 'bg-success text-white' : 'bg-error text-white',
        )}
      >
        <Glyph size={17} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-snug font-semibold text-fg">{tr(label)}</span>
        {!ok && hint && <span className="text-xs leading-snug font-normal text-fg-secondary">{tr(hint)}</span>}
      </span>
    </div>
  )
}

function LateCheckInModal({ person, termId, onClose }) {
  const { notify } = useToast()
  const today = toDateInput(new Date())
  const [requestedFor, setRequestedFor] = useState(today)
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const record = useMutation(
    () => {
      const data = new FormData()
      data.set('studentCode', person.studentCode)
      data.set('reason', reason.trim())
      data.set('requestedFor', requestedFor)
      if (termId) data.set('termId', termId)
      if (file) data.set('evidence', file)
      return api.desk.recordLateCheckIn(data)
    },
    {
      invalidates: ['approvals', 'dashboard'],
      onSuccess: () => {
        notify({ title: 'Late check-in recorded', message: t('{name} arrives on {date}. A manager decides it in Decisions › Late check-in.', { name: person.name, date: formatDate(requestedFor) }) })
        onClose()
      },
      onError: () => {},
    },
  )

  return (
    <Modal
      open
      onClose={onClose}
      title="Record late check-in"
      description={`${person.name} · ${person.studentCode} · ${t('{room} · Bed {bed}', { room: person.room, bed: person.bed })}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!reason.trim() || !requestedFor || record.pending} onClick={() => record.run()}>
            {record.pending ? t('Recording…') : t('Record late check-in')}
          </Button>
        </>
      }
    >
      {record.error && <p className="rounded-md bg-error-bg px-3 py-2 text-base text-error-fg">{record.error.message}</p>}
      <Field label="Arrives on" required>
        {(id) => <DatePicker id={id} clearable minDate={today} value={requestedFor} onChange={setRequestedFor} />}
      </Field>
      <Field label="Reason" required hint={`${reason.length}/500`}>
        {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the student arrives after the check-in window" />}
      </Field>
      <FilePicker file={file} onChange={setFile} accept="image/jpeg,image/png,application/pdf" placeholder="Attach evidence (JPEG, PNG or PDF, optional)" />
    </Modal>
  )
}

function StudentPanel({ person, onDone }) {
  const { notify, notifyError } = useToast()
  const { term } = useSession()
  const items = person.handOverItems ?? []
  const [checked, setChecked] = useState(() => new Set())
  const [note, setNote] = useState('')
  const [late, setLate] = useState(false)

  useEffect(() => {
    setChecked(new Set())
  }, [person.studentCode])

  const ready = person.status === 'ready'
  const all = checked.size === items.length
  const owing = [person.owes?.balance, person.owes?.utilityDeposit].filter((v) => v > 0).length
  const hStatus = person.handoverStatus
  const inRoomWithReport =
    person.status !== 'checked-in' &&
    owing === 0 &&
    (Boolean(person.doorCodeReleased) || hStatus === 'Draft' || hStatus === 'Submitted' || hStatus === 'Verifying')
  const awaitingStartInventory =
    person.status === 'blocked' && owing === 0 && !inRoomWithReport && (person.checks ?? []).some((c) => !c.passed && /inventory/i.test(c.label))
  // C-23: the checks are Bed allocated, Balance paid, Utility Deposit paid and the check-in window (passed while
  // a late check-in is approved). A failed check the unpaid amounts do not explain is the window; after the
  // Term's checkInEnd it has closed (before checkInStart it has not opened yet).
  const windowClosed =
    person.status === 'blocked' &&
    !inRoomWithReport &&
    !awaitingStartInventory &&
    (person.checks ?? []).filter((c) => !c.passed).length > owing &&
    Boolean(term?.checkInEnd) &&
    toDateInput(new Date()) > term.checkInEnd

  const headerBadge =
    person.status === 'checked-in' ? (
      <Tag tone="success">{t('Checked in · Utility counting')}</Tag>
    ) : inRoomWithReport ? (
      hStatus === 'Submitted' ? (
        <Tag tone="info">{t('Inventory submitted · Awaiting Staff review')}</Tag>
      ) : hStatus === 'Verifying' ? (
        <Tag tone="warning">{t('Room visit · Awaiting Final report')}</Tag>
      ) : (
        <Tag tone="warning">{t('In room · Filing inventory')}</Tag>
      )
    ) : awaitingStartInventory ? (
      <Tag tone="warning">{t('Awaiting room inventory')}</Tag>
    ) : (
      statusTag[person.status]
    )
  const confirm = useMutation(() => api.desk.checkIn({ studentCode: person.studentCode, items: [...checked], note: note.trim() || undefined }), {
    invalidates: ['check-in', 'dashboard'],
    onSuccess: () => {
      notify({ title: t('{name} checked in', { name: person.name }), message: t('{room} · Bed {bed}. The QR pass is active.', { room: person.room, bed: person.bed }) })
      onDone?.()
    },
    onError: (e) => notifyError(e, 'Could not check in'),
  })

  const toggleItem = (item) =>
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })

  return (
    <Card padding="none" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* 1. Pinned Student Identity Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-6 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={person.name} size={48} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="truncate text-h2 font-semibold text-fg">{person.name}</h2>
              <span className="rounded-md bg-subtle px-2 py-0.5 font-mono text-sm font-semibold text-fg-secondary">
                {person.studentCode}
              </span>
            </div>
            {person.room && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-subtle px-2.5 py-0.5 font-semibold text-fg-brand">
                  <Bed size={14} aria-hidden="true" />
                  {t('{room} · Bed {bed}', { room: person.room, bed: person.bed })}
                </span>
                <span>
                  {[person.block && tr(person.block), person.floor != null && t('Floor {n}', { n: person.floor })]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0">{headerBadge}</div>
      </div>

      {/* 2. Scrollable Body: Visual Eligibility Checks & Large Hit-Target Asset Handover */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {person.status === 'not-allocated' ? (
          <Alert type="warning" title="No room and bed for this term yet">
            {t('This student has no confirmed allocation. Check-in opens after the assignment is committed and the balance is paid.')}
          </Alert>
        ) : (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wider text-fg-tertiary uppercase">
                {t('Eligibility checks')}
              </span>
              <span className="text-xs font-medium text-fg-secondary">
                {t('{n} of {total} passed', {
                  n: (person.checks ?? []).filter((c) => c.passed).length,
                  total: (person.checks ?? []).length,
                })}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(person.checks ?? []).map((c) => (
                <EligibilityCheckTile key={c.label} ok={c.passed} label={c.label} hint={c.hint} />
              ))}
            </div>
          </section>
        )}

        {windowClosed && (
          <Alert
            type="warning"
            title={t('Check-in window closed on {date}', { date: formatDate(term.checkInEnd) })}
            action={
              <Button tip="For a student who cannot come on the check-in day: record the reason and the planned date. A manager decides." icon={CalendarClock} onClick={() => setLate(true)}>
                Record late check-in
              </Button>
            }
          >
            {t('Record when {name} will arrive. Once a manager approves it, check-in opens here until the approved day.', { name: person.name })}
          </Alert>
        )}
        {late && <LateCheckInModal person={person} termId={term?.id} onClose={() => setLate(false)} />}

        {person.status === 'blocked' && owing > 0 && (
          <Alert type="error" title="Check-in blocked">
            {t('{name} ({code}) still owes {what}. Ask the student to pay before check-in.', {
              name: person.name,
              code: person.studentCode,
              what: [
                person.owes?.balance ? t('the balance of {amount}', { amount: formatVnd(person.owes.balance) }) : null,
                person.owes?.utilityDeposit ? t('the utility deposit of {amount}', { amount: formatVnd(person.owes.utilityDeposit) }) : null,
              ].filter(Boolean).join(t(' and ')),
            })}
          </Alert>
        )}

        {inRoomWithReport && (
          <Alert
            type={hStatus === 'Submitted' ? 'info' : 'warning'}
            title={
              hStatus === 'Submitted'
                ? t('Student entered the room and submitted the check-in inventory — awaiting Staff approval')
                : hStatus === 'Verifying'
                  ? t('Student entered the room — awaiting in-room inspection Final report')
                  : t('Student received the door code and is filing the check-in inventory in the room')
            }
            action={
              person.handoverId ? (
                <Button
                  variant="primary"
                  icon={ClipboardList}
                  to={`/staff/check-in/inventories?id=${person.handoverId}&status=${hStatus ?? 'Submitted'}`}
                >
                  {t('Open check-in inventory')}
                </Button>
              ) : null
            }
          >
            <div className="flex flex-col gap-1.5">
              <p>
                {t(
                  'Door code received{when}{code}. Official check-in for utility billing has NOT started yet — check-in is only recorded once the inventory has a Final report or is confirmed by Staff.',
                  {
                    when: person.doorCodeReleasedAt ? ` (${formatDateTime(person.doorCodeReleasedAt)})` : '',
                    code: person.handoverId ? ` · ${person.handoverId}` : '',
                  },
                )}
              </p>
              {(person.electricity != null || person.water != null) && (
                <p className="inline-flex flex-wrap items-center gap-2 font-medium text-fg">
                  <Zap size={14} aria-hidden="true" className="text-fg-brand" />
                  {t('Readings in report: Electricity {e} kWh · Water {w} m³ (will become utility baseline once approved)', {
                    e: person.electricity != null ? formatNumber(person.electricity) : '—',
                    w: person.water != null ? formatNumber(person.water) : '—',
                  })}
                </p>
              )}
            </div>
          </Alert>
        )}

        {awaitingStartInventory && (
          <Alert type="info" title={t('Paid and eligible — waiting for student to receive door code & start inventory')}>
            {t(
              'The student has not started the check-in inventory yet. When they arrive at the room and press Start check-in inventory on the app, they receive the door code to enter and file the report. Official check-in and utility billing start once the report is finalized.',
            )}
          </Alert>
        )}

        {person.status === 'checked-in' && (
          <Alert
            type="success"
            title={t('Officially checked in at {time} · Utility billing active', { time: formatDateTime(person.checkedInAt) })}
            action={
              person.handoverId ? (
                <Button size="sm" icon={ClipboardList} to={`/staff/check-in/inventories?id=${person.handoverId}&status=Final`}>
                  {t('View final inventory')}
                </Button>
              ) : null
            }
          >
            <div className="flex flex-col gap-1">
              <p>{t('Assets were handed over and the student’s QR pass now opens the block gates.')}</p>
              <p className="font-medium text-fg">
                {t('Utility billing started from: {from}', {
                  from: formatDateTime(person.utilityFrom ?? person.checkedInAt),
                })}
                {person.handoverId ? ` · ${person.handoverId}${person.handoverSource ? ` (${tr(person.handoverSource)})` : ''}` : ''}
              </p>
              {(person.electricity != null || person.water != null) && (
                <p className="text-xs text-fg-secondary">
                  {t('Recorded baseline for check-out comparison: Electricity {e} kWh · Water {w} m³', {
                    e: person.electricity != null ? formatNumber(person.electricity) : '—',
                    w: person.water != null ? formatNumber(person.water) : '—',
                  })}
                </p>
              )}
            </div>
          </Alert>
        )}

        {ready && (
          <section className="flex flex-col gap-3.5 rounded-xl bg-subtle/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PackageCheck size={18} aria-hidden="true" className="text-fg-brand" />
                <p className="text-base font-semibold text-fg">
                  {t('Asset hand-over · Bed {bed}', { bed: person.bed })}
                </p>
                <span
                  className={cx(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold tabular',
                    all ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg',
                  )}
                >
                  {checked.size}/{items.length}
                </span>
              </div>
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="text"
                  onClick={() => setChecked(all ? new Set() : new Set(items))}
                >
                  {all ? t('Deselect all') : t('Select all')}
                </Button>
              )}
            </div>

            {/* Large Hit-Target Asset Handover Tiles */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {items.map((item) => {
                const isSelected = checked.has(item)
                return (
                  <button
                    key={item}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggleItem(item)}
                    className={cx(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'bg-brand-subtle text-fg'
                        : 'bg-surface text-fg-secondary hover:bg-subtle',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isSelected
                          ? 'bg-primary text-white'
                          : 'border-2 border-line-strong bg-surface',
                      )}
                    >
                      {isSelected && <Check size={14} strokeWidth={2.5} />}
                    </span>
                    <span className={cx('text-sm font-medium', isSelected ? 'font-semibold text-fg' : 'text-fg-secondary')}>
                      {tr(item)}
                    </span>
                  </button>
                )
              })}
            </div>

            <Field label="Condition notes" helper={all ? undefined : 'Tick every item the student received before you confirm.'}>
              {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Scratches, stains or missing items" />}
            </Field>
          </section>
        )}
      </div>

      {/* 3. Sticky Check-In Confirmation Footer */}
      {ready && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3.5 shadow-card">
          <p className="text-sm text-fg-secondary">
            {all
              ? t('{room} · Bed {bed}. The QR pass is active.', { room: person.room, bed: person.bed })
              : t('Tick every item the student received before you confirm.')}
          </p>
          <div className="flex items-center gap-2.5">
            <Button onClick={onDone}>Cancel</Button>
            <Button
              tip="Tick every item of the checklist first. The stay starts and a meter reading is taken."
              variant="primary"
              size="lg"
              icon={Check}
              disabled={!all || confirm.pending}
              onClick={() => confirm.run()}
            >
              Confirm check-in
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

const sideTitles = {
  recent: 'Checked in (finalized)',
  inProgress: 'In room · Inventory in progress',
  waiting: 'Awaiting room inventory',
  blocked: 'Blocked (unpaid)',
}
const sideEmpty = {
  recent: 'No check-ins yet today.',
  inProgress: 'No student is currently filing or awaiting inventory review.',
  waiting: 'No student is waiting to start the inventory.',
  blocked: 'Nobody is blocked.',
}

function sideStudentBadge(r, side) {
  if (r.handoverStatus === 'Draft') return <Tag tone="warning">{t('Filing draft')}</Tag>
  if (r.handoverStatus === 'Submitted') return <Tag tone="info">{t('Awaiting review')}</Tag>
  if (r.handoverStatus === 'Verifying') return <Tag tone="warning">{t('Room visit')}</Tag>
  if (r.handoverStatus === 'Final' || side === 'recent') return <Tag tone="success">{t('Final · Utility active')}</Tag>
  if (side === 'inProgress' && r.doorCodeReleased) return <Tag tone="warning">{t('Door code received')}</Tag>
  if (side === 'waiting') return <Tag tone="neutral">{t('Not started')}</Tag>
  if (side === 'blocked') return <Tag tone="error">{t('Unpaid')}</Tag>
  return null
}

/** Shared row item for both the desk sidebar list and its "View all" modal. */
function SideStudentRow({ r, side, active, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => r.studentCode && onSelect(r.studentCode)}
        disabled={!r.studentCode}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
          active ? 'bg-brand-subtle' : 'bg-subtle/40 hover:bg-subtle',
        )}
      >
        {side === 'inProgress' ? (
          <KeyRound size={15} aria-hidden="true" className="shrink-0 text-warning-fg" />
        ) : (
          <Clock size={15} aria-hidden="true" className={cx('shrink-0', side === 'blocked' ? 'text-error-fg' : 'text-fg-brand')} />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-fg">{r.name}</span>
          <span className="truncate text-xs text-fg-secondary">{[r.studentCode, r.bed, r.handoverId].filter(Boolean).join(' · ')}</span>
        </span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {sideStudentBadge(r, side)}
          {r.at && <span className="text-xs text-fg-tertiary tabular">{formatTime(r.at)}</span>}
        </div>
      </button>
    </li>
  )
}

/** A count of the desk's side panel; a click lists its students below. */
function SideTile({ label, value, tone, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'flex flex-col items-start justify-between gap-1 rounded-lg px-2.5 py-2 text-left ring-primary transition-colors',
        tone === 'error'
          ? 'bg-error-bg/60 hover:bg-error-bg'
          : tone === 'warning'
            ? 'bg-warning-bg/60 hover:bg-warning-bg'
            : 'bg-subtle/60 hover:bg-subtle',
        active && 'ring-2',
      )}
    >
      <span
        className={cx(
          'text-sm font-semibold tabular',
          tone === 'error' ? 'text-error-fg' : tone === 'warning' ? 'text-warning-fg' : 'text-fg',
        )}
      >
        {value}
      </span>
      <span className="text-[11px] leading-tight text-fg-secondary">{t(label)}</span>
    </button>
  )
}

export function DeskModeSwitch({ mode }) {
  return (
    <>
      <Button variant={mode === 'in' ? 'primary' : 'default'} to="/staff/check-in">
        {t('Check-in mode')}
      </Button>
      <Button variant={mode === 'out' ? 'primary' : 'default'} to="/staff/check-out">
        {t('Check-out mode')}
      </Button>
    </>
  )
}

export default function CheckInDesk() {
  const scope = useScopeQuery()
  const [params] = useSearchParams()
  const input = useRef(null)
  const [q, setQ] = useState(params.get('code') ?? '')
  const [search, setSearch] = useState(params.get('code') ?? '')
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const today = useQuery(['check-in', 'today', scope], ({ signal }) => api.desk.checkInToday(scope, { signal }))
  const lookup = useQuery(['check-in', 'lookup', scope.termId, search], ({ signal }) => api.desk.checkInLookup({ termId: scope.termId, q: search }, { signal }), { enabled: Boolean(search), keepPrevious: false })
  const d0 = today.data
  const person = search ? lookup.data?.student : null
  // The side list: checked-in students, in-room inventory in progress, waiting to start or blocked; a click opens the student here.
  const [side, setSide] = useState('recent')
  const [listOpen, setListOpen] = useState(false)
  const [listQuery, setListQuery] = useState('')
  const sideRows =
    (side === 'inProgress'
      ? d0?.inProgressList
      : side === 'waiting'
        ? d0?.waitingList
        : side === 'blocked'
          ? d0?.blockedList
          : d0?.checkedInList ?? d0?.recent) ?? []
  const needle = listQuery.trim().toLowerCase()
  const modalRows = needle
    ? sideRows.filter((r) =>
        [r.name, r.studentCode, r.bed, r.handoverId].filter(Boolean).some((v) => v.toLowerCase().includes(needle)),
      )
    : sideRows
  const openStudent = (code) => {
    setQ(code)
    setSearch(code)
    setListOpen(false)
  }

  return (
    <>
      <PageHeader
        title="Check-in"
        tip="Search by student code or name to open a check-in record."
        badge={d0?.date && <Tag tone="neutral">{formatDate(d0.date)}</Tag>}
      />

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput
          ref={input}
          size="lg"
          wrapperClassName="w-full max-w-[480px]"
          aria-label={t('Student code or name')}
          placeholder="Student code or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSearch(q.trim())}
          autoFocus
        />
      </div>

      <div className="flex min-h-[540px] flex-1 items-stretch gap-4">
        {!search ? (
          <Card padding="none" className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={Search} title="Waiting for the next student">
              Enter a student code or name above to open their record.
            </EmptyBlock>
          </Card>
        ) : lookup.loading && !lookup.data ? (
          <Card padding="none" className="flex min-w-0 flex-1 flex-col">
            <LoadingState label="Looking up…" />
          </Card>
        ) : lookup.error ? (
          <Card padding="none" className="flex min-w-0 flex-1 flex-col">
            <ErrorState error={lookup.error} onRetry={lookup.reload} />
          </Card>
        ) : person ? (
          <StudentPanel
            key={`${person.studentCode}-${person.status}`}
            person={person}
            onDone={() => {
              setQ('')
              setSearch('')
              setTimeout(() => input.current?.focus(), 50)
            }}
          />
        ) : (
          <Card padding="none" className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={UserX} title={t('No student matches “{q}”', { q: search })}>
              Check the student code or name and try again.
            </EmptyBlock>
          </Card>
        )}

        <div className="flex w-96 shrink-0 flex-col gap-3">
          <Card className="flex shrink-0 flex-col gap-2.5 p-4">
            <h2 className="text-h3 font-semibold text-fg">{t('Today')}{d0?.block ? ` · ${t('Block {code}', { code: d0.block })}` : ''}</h2>
            <QueryState query={today} compact>
              {(d) => (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <SideTile label="Checked in" value={t('{n} of {total}', { n: formatNumber(d.checkedIn), total: formatNumber(d.expected) })} active={side === 'recent'} onClick={() => setSide('recent')} />
                    <SideTile label="In room · Inventory in progress" value={formatNumber(d.inProgress ?? 0)} tone="warning" active={side === 'inProgress'} onClick={() => setSide('inProgress')} />
                    <SideTile label="Awaiting room inventory" value={formatNumber(d.waiting)} active={side === 'waiting'} onClick={() => setSide('waiting')} />
                    <SideTile label="Blocked (unpaid)" value={formatNumber(d.blocked)} tone="error" active={side === 'blocked'} onClick={() => setSide('blocked')} />
                  </div>
                  <ProgressBar value={d.checkedIn} max={d.expected || 1} tone="success" />
                </>
              )}
            </QueryState>
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col gap-2.5 p-4">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="truncate text-h3 font-semibold text-fg">{t(sideTitles[side])}</h2>
                <InfoTip label={t('Click a student to open them at the desk.')} side="bottom" align="start" />
              </div>
              {sideRows.length > 0 && (
                <Button
                  size="sm"
                  variant="text"
                  onClick={() => {
                    setListQuery('')
                    setListOpen(true)
                  }}
                >
                  {t('View all ({n})', { n: formatNumber(sideRows.length) })}
                </Button>
              )}
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
              {sideRows.map((r) => (
                <SideStudentRow
                  key={`${r.studentCode ?? r.name}-${r.bed}`}
                  r={r}
                  side={side}
                  active={person?.studentCode === r.studentCode}
                  onSelect={openStudent}
                />
              ))}
              {d0 && !sideRows.length && <li className="text-sm text-fg-secondary">{t(sideEmpty[side])}</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={t(sideTitles[side])}
        description={t('Click a student to open them at the desk.')}
        width={640}
      >
        <SearchInput
          aria-label={t('Filter by name, student code or bed')}
          placeholder="Filter by name, student code or bed"
          value={listQuery}
          onChange={(e) => setListQuery(e.target.value)}
          autoFocus
        />
        <ul className="flex max-h-[55dvh] flex-col gap-1.5 overflow-y-auto pr-0.5">
          {modalRows.map((r) => (
            <SideStudentRow
              key={`${r.studentCode ?? r.name}-${r.bed}`}
              r={r}
              side={side}
              active={person?.studentCode === r.studentCode}
              onSelect={openStudent}
            />
          ))}
          {!modalRows.length && (
            <li className="py-6 text-center text-sm text-fg-secondary">
              {sideRows.length ? t('No student matches “{q}”', { q: listQuery.trim() }) : t(sideEmpty[side])}
            </li>
          )}
        </ul>
      </Modal>
    </>
  )
}
