// Shared pieces of the check-in inventory screens: the queue's KPI tabs and progress bar, the bulk bar and its Undo
// toast, the bar of the focus screens, and every action on an inventory with its dialogs.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, CalendarClock, CircleCheck, Columns3, FileText, RotateCcw } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tooltip } from '@/components/ui/Tooltip'
import { DateTimePicker } from '@/components/ui/date-time'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { conditionOptions, typeName } from '@/lib/furniture'
import { campusToday, formatDate, formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { StatusBadge } from './Badges'

/* ------------------------------------------------------------------------------------------------- KPI tabs */

/**
 * The queue tabs as one slim strip of counts: label and count on one line, the hint in a tooltip, so the table below
 * keeps the height. The selected tab has a brand underline and wash.
 */
export function KpiTabs({ items, value, onChange, label }) {
  const move = (e, index) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange(next.key)
    document.getElementById(`kpi-tab-${next.key}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item, index) => (
        <KpiTabCard key={item.key} item={item} selected={item.key === value} onSelect={() => onChange(item.key)} onKeyDown={(e) => move(e, index)} />
      ))}
    </div>
  )
}

export function KpiTabCard({ item, selected, onSelect, onKeyDown }) {
  return (
    <Tooltip label={tx(item.hint)} block>
      <button
        id={`kpi-tab-${item.key}`}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-description={tx(item.hint)}
        tabIndex={selected ? 0 : -1}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={cx(
          '-mb-px flex h-14 w-full items-center justify-between gap-3 border-b-2 px-4 text-left transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus',
          selected ? 'border-b-primary bg-primary-subtle/60' : 'border-b-transparent hover:bg-subtle/50',
        )}
      >
        <span className={cx('truncate text-sm font-medium', selected ? 'text-fg-brand' : 'text-fg-secondary')}>{tx(item.label)}</span>
        <span className={cx('text-xl leading-7 font-semibold tabular-nums', selected ? 'text-fg-brand' : 'text-fg', item.count === 0 && !selected && 'text-fg-tertiary')}>
          {item.count == null ? '—' : formatNumber(item.count)}
        </span>
      </button>
    </Tooltip>
  )
}

/* --------------------------------------------------------------------------------------------- progress bar */

/**
 * One bar in several coloured parts with a legend (each part named: colour never stands alone).
 * segments: [{ key, label, value, className }] — className is the fill (bg-…).
 */
export function ProgressSegmentBar({ title, done, total, segments, note, compact = false, className }) {
  const sum = segments.reduce((n, s) => n + s.value, 0) || 1
  const bar = (
    <div role="img" aria-label={segments.map((s) => `${t(s.label)}: ${s.value}`).join(', ')} className={cx('flex w-full overflow-hidden rounded-full bg-subtle', compact ? 'h-1.5' : 'h-2.5')}>
      {segments.map((s) => (s.value > 0 ? <span key={s.key} className={cx('h-full', s.className)} style={{ width: `${(s.value / sum) * 100}%` }} /> : null))}
    </div>
  )
  if (compact) {
    // One line beside the page's actions; the legend and the note are in the tooltip.
    const legend = (
      <span className="flex flex-col gap-1">
        {note && <span className="font-medium">{note}</span>}
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('inline-block size-2 rounded-full', s.className)} />
            {tx(s.label)}: <span className="tabular-nums">{formatNumber(s.value)}</span>
          </span>
        ))}
      </span>
    )
    return (
      <Tooltip label={legend} side="bottom" align="end">
        <div tabIndex={0} className={cx('flex w-56 flex-col gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus', className)}>
          <span className="text-sm text-fg-secondary">
            <span className="font-semibold text-fg tabular-nums">{formatNumber(done)}</span>
            <span className="tabular-nums"> / {formatNumber(total)}</span> {tx(title)}
          </span>
          {bar}
        </div>
      </Tooltip>
    )
  }
  return (
    <section className={cx('flex flex-col gap-3 rounded-lg border border-line bg-surface p-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base text-fg">
          <span className="text-h3 font-semibold tabular-nums">{formatNumber(done)}</span>
          <span className="text-fg-secondary"> / {formatNumber(total)} </span>
          <span className="text-fg-secondary">{tx(title)}</span>
        </p>
        {note && <span className="text-sm text-fg-secondary">{note}</span>}
      </div>
      <div
        role="img"
        aria-label={segments.map((s) => `${t(s.label)}: ${s.value}`).join(', ')}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-subtle"
      >
        {segments.map((s) =>
          s.value > 0 ? <span key={s.key} className={cx('h-full', s.className)} style={{ width: `${(s.value / sum) * 100}%` }} /> : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('inline-block size-2 rounded-full', s.className)} />
            {tx(s.label)} <span className="tabular-nums text-fg">{formatNumber(s.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* --------------------------------------------------------------------------------------------- bulk actions */

function Kbd({ children }) {
  return <kbd className="rounded border border-white/30 px-1 font-sans text-[11px] leading-4 text-white/80">{children}</kbd>
}

/**
 * Floating at the foot of the screen while rows are selected: the count, clear (Esc), and the bulk actions.
 * actions: [{ key, label, onClick, kbd?, primary?, disabled?, tip? }]
 */
export function BulkActionBar({ count, onClear, actions }) {
  if (!count) return null
  return (
    <div role="region" aria-label={t('Bulk actions')} className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg bg-fg px-4 py-2.5 text-white shadow-[0_16px_32px_-8px_#3f1d0a29,0_4px_8px_-2px_#3f1d0a0f]">
        <span className="text-sm font-semibold tabular-nums" aria-live="polite">
          {t('{n} selected', { n: count })}
        </span>
        <button type="button" onClick={onClear} className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
          {t('Clear selection')} <Kbd>Esc</Kbd>
        </button>
        <span aria-hidden="true" className="h-5 w-px bg-white/20" />
        {actions.map((a) => {
          const button = (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={cx(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45',
                a.primary ? 'bg-primary text-white hover:bg-primary-hover' : 'border border-white/30 text-white hover:bg-white/10',
              )}
            >
              {t(a.label)}
              {a.kbd && <Kbd>{a.kbd}</Kbd>}
            </button>
          )
          return a.tip ? (
            <Tooltip key={a.key} label={a.tip}>
              {button}
            </Tooltip>
          ) : (
            button
          )
        })}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------------------------- undo toast */

/**
 * "Accepted N inventories · Undo": the action runs only when the countdown ends, so Undo really undoes it
 * (a Final inventory cannot be reopened afterwards).
 */
export function UndoToast({ message, seconds = 5, onUndo, onExpire }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) {
      onExpire()
      return undefined
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-lg bg-fg px-4 py-2.5 text-sm text-white shadow-[0_16px_32px_-8px_#3f1d0a29,0_4px_8px_-2px_#3f1d0a0f]">
        <span>{message}</span>
        <span className="tabular-nums text-white/70">{t('{n} s', { n: Math.max(left, 0) })}</span>
        <button type="button" onClick={onUndo} className="min-h-8 rounded-md px-2.5 font-semibold text-orange-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
          {t('Undo')}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------ focus top bar */

export const REPORTS = [
  { n: '1', label: 'Record' },
  { n: '2', label: 'Student' },
  { n: '3', label: 'Final' },
]

/**
 * The bar of the focus screens (one report, the comparison): back, who and where, the report switch, and the
 * comparison. `current` is '1' | '2' | '3' on a report and null on the comparison.
 */
export function FocusTopBar({ back, detail, current, reportTo, compareTo, children }) {
  const row = detail.row
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <Link to={back} aria-label={t('Back to the student')} className="inline-flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-focus">
        <ArrowLeft size={18} aria-hidden="true" />
      </Link>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold text-fg">{row.studentName}</span>
        <span className="text-xs text-fg-secondary tabular-nums">{`${row.studentCode} · ${row.room} · ${t('Bed {bed}', { bed: row.bed })}`}</span>
      </div>
      <nav aria-label={t('Reports')} className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
        {REPORTS.map((r) => {
          const active = r.n === current
          return (
            <Link
              key={r.n}
              to={reportTo(r.n)}
              aria-current={active ? 'page' : undefined}
              aria-keyshortcuts={r.n}
              title={t('Key {k}', { k: r.n })}
              className={cx(
                'inline-flex h-7 items-center gap-1.5 rounded px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-focus',
                active ? 'bg-primary-subtle font-medium text-fg-brand' : 'text-fg-secondary hover:text-fg',
              )}
            >
              {t(`${r.n} · ${r.label}`)}
            </Link>
          )
        })}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {children}
        {compareTo && (
          <Button to={compareTo} icon={Columns3} variant={current ? 'default' : 'primary'}>
            {t('Compare')}
            <kbd className="ml-1 rounded border border-current/30 px-1 font-sans text-[11px] leading-4 opacity-70">C</kbd>
          </Button>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------------------- inventory actions */

// What Staff do with an inventory (POST /handovers/:id/confirm, /visit, /cancel, /late; PUT …/verification).
// Moved from the former single-page review: every action it had is here (Cancel, Check the Room, Confirm, Record what
// I found with Save / Send to the student / Sign the Final report in the Room, Late report review).

const pad = (n) => String(n).padStart(2, '0')

/** In the Room: what Staff found, saved, sent to the student, or signed there with the student present. */
export function VerificationModal({ detail, prefill = {}, onClose }) {
  const { notify, notifyError } = useToast()
  // prefill: the comparison's conclusions ({ itemId | 'electricity' | 'water': 'base' | 'student' }) start the form.
  const pick = (key, record, student, current) => (current != null ? current : prefill[key] === 'base' ? record : student)
  const [items, setItems] = useState(
    Object.fromEntries(detail.items.map((i) => [i.itemId, { condition: pick(String(i.itemId), i.baseline, i.condition, i.verified) ?? i.condition ?? 'Good', note: i.verifiedNote ?? '' }])),
  )
  const [electricity, setElectricity] = useState(pick('electricity', detail.electricity?.baseline, detail.electricity?.student, detail.electricity?.verified) ?? '')
  const [water, setWater] = useState(pick('water', detail.water?.baseline, detail.water?.student, detail.water?.verified) ?? '')
  const [present, setPresent] = useState(false)
  const save = useMutation(
    (mode) =>
      api.handover.verification(detail.row.id, {
        items: Object.entries(items).map(([itemId, v]) => ({ itemId, condition: v.condition, note: v.note || undefined })),
        electricity: electricity === '' ? undefined : Number(electricity),
        water: water === '' ? undefined : Number(water),
        send: mode === 'send',
        finalizeOnSite: mode === 'final',
      }),
    {
      invalidates: ['handovers', 'check-in'],
      onSuccess: (_, mode) => {
        if (mode === 'final') {
          notify({ title: 'Final report signed in the Room', message: 'The student is checked in. The Final report is kept until check-out.' })
          onClose()
          return
        }
        notify({ title: mode === 'send' ? 'Sent to the student' : 'Saved', message: mode === 'send' ? 'The student agrees on the app; the inventory is then final.' : undefined })
        if (mode === 'send') onClose()
      },
      onError: (e) => notifyError(e, 'Could not save what you found'),
    },
  )
  const helper = (m, unit) =>
    m?.baselineAt
      ? t(`Previous reading: {value} ${unit} (recorded {date}) · Student: {student}`, { value: m?.baseline ?? '—', date: formatDate(m.baselineAt), student: m?.student ?? '—' })
      : t('Record {value} · Student {student}', { value: m?.baseline ?? '—', student: m?.student ?? '—' })
  return (
    <Modal
      open
      onClose={onClose}
      width={880}
      title={t('Check Room {room} with the student', { room: detail.row.room })}
      description="Start from the student's answers and change what you find different. With the student in the Room, sign the Final report there; otherwise send it and the student agrees on the app."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Checkbox label="The student is here and agrees with what we found" checked={present} onChange={(e) => setPresent(e.target.checked)} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.run('save')} disabled={save.pending}>
              Save
            </Button>
            <Button onClick={() => save.run('send')} disabled={save.pending}>
              Send to the student
            </Button>
            <Button variant="primary" icon={CircleCheck} onClick={() => save.run('final')} disabled={!present || save.pending}>
              Sign the Final report in the Room
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-auto">
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th className="w-28">Room's record</Th>
              <Th className="w-28">Student</Th>
              <Th className="w-40">Found</Th>
              <Th className="w-56">Note</Th>
            </tr>
          </THead>
          <TBody>
            {detail.items.map((i) => (
              <Tr key={i.itemId} className={i.differs ? 'bg-warning-bg' : undefined}>
                <Td>
                  <TwoLine primary={`${typeName(i)} · ${i.assetCode ?? ''}`} secondary={i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')} />
                </Td>
                <Td>
                  <StatusBadge value={i.baseline} />
                </Td>
                <Td>
                  <StatusBadge value={i.condition} />
                </Td>
                <Td>
                  <Select
                    size="sm"
                    aria-label={t('Condition of {item}', { item: i.assetCode })}
                    value={items[i.itemId].condition}
                    onChange={(e) => setItems((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], condition: e.target.value } }))}
                    options={conditionOptions()}
                  />
                </Td>
                <Td>
                  <Input
                    size="sm"
                    aria-label={t('Note for {item}', { item: i.assetCode })}
                    value={items[i.itemId].note}
                    onChange={(e) => setItems((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], note: e.target.value } }))}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="flex flex-wrap gap-3">
          <Field label="Electricity (kWh)" className="w-64" helper={helper(detail.electricity, 'kWh')}>
            <Input type="number" min="0" step="0.1" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
          </Field>
          <Field label="Water (m³)" className="w-64" helper={helper(detail.water, 'm³')}>
            <Input type="number" min="0" step="0.1" value={water} onChange={(e) => setWater(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/** Set a Room visit: the shared picker, limited to the office hours and days of the visit window, with suggestions. */
export function VisitModal({ window: w, onClose, onSave, pending }) {
  const [visitAt, setVisitAt] = useState('')
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title="Check the Room with the student"
      description="The student is notified and asked to be in the Room at this time. In the Room, record what you find and send it for their agreement."
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant="primary" icon={CalendarClock} onClick={() => onSave(visitAt)} disabled={!visitAt || pending}>
            Set the visit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {w && (
          <p className="text-sm text-fg-secondary">
            {t('Visits are set from {from}:00 to {to}:00, until {day} (System parameters › Room handover).', { from: pad(w.fromHour), to: pad(w.toHour), day: formatDate(w.lastDay) })}
          </p>
        )}
        {w?.suggestions?.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{t('Suggested times')}</span>
            <div className="flex flex-wrap gap-2">
              {w.suggestions.map((s) => (
                <Button key={s} size="sm" variant={visitAt && new Date(visitAt).getTime() === new Date(s).getTime() ? 'primary' : 'default'} onClick={() => setVisitAt(s)}>
                  {`${formatDate(s)} · ${formatTime(s)}`}
                </Button>
              ))}
            </div>
          </div>
        )}
        <Field label="Or choose a time" required>
          {(id) => (
            <DateTimePicker
              id={id}
              valueFormat="iso"
              value={visitAt}
              onChange={setVisitAt}
              minDate={campusToday()}
              maxDate={w?.lastDay}
              minTime={w ? `${pad(w.fromHour)}:00` : '08:00'}
              maxTime={w ? `${pad(Math.max(w.fromHour, w.toHour - 1))}:00` : '16:00'}
              stepMinutes={60}
              disablePastTimes
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/** The late report: accept items as there before the student (Damaged or Missing), or keep them as recorded. */
function LateModal({ detail, onClose, onSave, pending }) {
  const [lateItems, setLateItems] = useState({})
  return (
    <Modal
      open
      onClose={onClose}
      width={720}
      title="Review the late report"
      description="Items you accept are recorded as there before the student and never charged to them."
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant="primary" disabled={pending} onClick={() => onSave(Object.entries(lateItems).filter(([, c]) => c).map(([itemId, condition]) => ({ itemId, condition })))}>
            Save late report review
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto">
        <Alert type="info" title="Late report from the student">
          {detail.lateNote}
        </Alert>
        <ul className="flex flex-col divide-y divide-line">
          {detail.items.map((i) => (
            <li key={i.itemId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <TwoLine primary={`${typeName(i)} · ${i.assetCode ?? ''}`} secondary={i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')} />
              <div className="flex items-center gap-2">
                <StatusBadge value={i.verified ?? i.condition ?? i.baseline} />
                <Select
                  size="sm"
                  wrapperClassName="w-52"
                  aria-label={t('Accept {item} from the late report', { item: i.assetCode })}
                  value={lateItems[i.itemId] ?? ''}
                  onChange={(e) => setLateItems((s) => ({ ...s, [i.itemId]: e.target.value }))}
                  options={[{ value: '', label: 'Keep as recorded' }, { value: 'Damaged', label: 'Accept as Damaged' }, { value: 'Missing', label: 'Accept as Missing' }]}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

/** Cancelling an inventory: by mistake, or to ask the student to file it again (they can start a new one). */
function CancelModal({ refile, onClose, onSave, pending }) {
  const [reason, setReason] = useState(refile ? t('Please file the check-in inventory again: some answers do not match the Room.') : '')
  return (
    <Modal
      open
      onClose={onClose}
      title={refile ? 'Ask the student to file again' : 'Cancel this inventory'}
      description={refile ? 'This inventory is cancelled and the student starts a new one from My Room. The reason is sent to them.' : 'Filed for the wrong Room or by mistake. The student can start a new one.'}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant={refile ? 'primary' : 'danger'} disabled={!reason.trim() || pending} onClick={() => onSave(reason)}>
            {refile ? 'Ask to file again' : 'Cancel inventory'}
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

/**
 * The actions of one inventory and their dialogs. Returns { can, open, run, dialogs }: `can` says which actions the
 * status allows, `open(name)` opens a dialog (visit, verify, cancel, refile, late), `run.confirm()` confirms.
 * onDone(kind) runs after a change that leaves this inventory (confirmed, cancelled).
 */
export function useReportActions(detail, { onDone, prefill } = {}) {
  const { notify, notifyError } = useToast()
  const [dialog, setDialog] = useState(null)
  const id = detail?.row?.id
  const status = detail?.row?.status
  const major = detail?.row?.comparison === 'Major difference'
  const close = () => setDialog(null)
  const confirm = useMutation((reason) => api.handover.confirm(id, { reason: reason || undefined }), {
    invalidates: ['handovers', 'check-in'],
    onSuccess: () => {
      notify({ title: 'Inventory confirmed', message: 'It is final: Utility counts from the student’s reading.' })
      onDone?.('confirmed')
    },
    onError: (e) => notifyError(e, 'Could not confirm the inventory'),
  })
  const visit = useMutation((visitAt) => api.handover.visit(id, { visitAt }), {
    invalidates: ['handovers'],
    onSuccess: () => {
      notify({ title: 'Room visit set', message: 'The student is notified and asked to be in the Room.' })
      close()
    },
    onError: (e) => notifyError(e, 'Could not set the visit'),
  })
  const cancel = useMutation((reason) => api.handover.cancel(id, { reason }), {
    invalidates: ['handovers', 'check-in'],
    onSuccess: () => {
      notify({ title: dialog === 'refile' ? 'Asked to file again' : 'Inventory cancelled', message: 'The student can start a new one.' })
      close()
      onDone?.('cancelled')
    },
    onError: (e) => notifyError(e, 'Could not cancel the inventory'),
  })
  const late = useMutation((items) => api.handover.acceptLate(id, { items }), {
    invalidates: ['handovers'],
    onSuccess: () => {
      notify({ title: 'Late report reviewed', message: 'The accepted items are recorded as there before the student.' })
      close()
    },
    onError: (e) => notifyError(e, 'Could not review the late report'),
  })
  const can = {
    confirm: status === 'Submitted' && !major,
    visit: status === 'Submitted',
    verify: status === 'Verifying',
    cancel: status === 'Draft' || status === 'Submitted' || status === 'Verifying',
    refile: status === 'Submitted',
    late: Boolean(detail?.lateNote) && status === 'Final' && Boolean(detail?.row?.lateReport),
  }
  const dialogs = detail ? (
    <>
      {dialog === 'verify' && <VerificationModal detail={detail} prefill={prefill} onClose={close} />}
      {dialog === 'visit' && <VisitModal window={detail.visitWindow} onClose={close} onSave={(v) => visit.run(v)} pending={visit.pending} />}
      {(dialog === 'cancel' || dialog === 'refile') && <CancelModal refile={dialog === 'refile'} onClose={close} onSave={(r) => cancel.run(r)} pending={cancel.pending} />}
      {dialog === 'late' && <LateModal detail={detail} onClose={close} onSave={(items) => late.run(items)} pending={late.pending} />}
    </>
  ) : null
  return { can, major, open: setDialog, run: { confirm: (reason) => confirm.run(reason) }, pending: confirm.pending, dialogs }
}

/**
 * The action block of a screen (the student's reports, one report): what can be done now, the primary first.
 * layout 'stack' for the side column, 'row' for a header.
 */
export function ReportActionPanel({ detail, actions, layout = 'stack' }) {
  const { can, major, open, run, pending } = actions
  const status = detail.row.status
  const stack = layout === 'stack'
  const buttons = []
  if (can.visit) {
    buttons.push(
      <Button key="visit" block={stack} variant={major ? 'primary' : 'default'} icon={CalendarClock} onClick={() => open('visit')}>
        Check the Room with the student
      </Button>,
    )
  }
  if (can.confirm) {
    buttons.push(
      <Button key="confirm" block={stack} variant="primary" icon={CircleCheck} onClick={() => run.confirm()} disabled={pending} tip="Confirm at the desk: the student's answers become the Final record.">
        Accept the student's report
      </Button>,
    )
  }
  if (can.verify) {
    buttons.push(
      <Button key="verify" block={stack} variant="primary" onClick={() => open('verify')}>
        {detail.sentToStudent ? 'Change what I found' : 'Record what I found'}
      </Button>,
    )
  }
  if (can.late) {
    buttons.push(
      <Button key="late" block={stack} variant="primary" icon={FileText} onClick={() => open('late')}>
        Review the late report
      </Button>,
    )
  }
  if (can.refile) {
    buttons.push(
      <Button key="refile" block={stack} icon={RotateCcw} onClick={() => open('refile')}>
        Ask the student to file again
      </Button>,
    )
  }
  if (can.cancel) {
    buttons.push(
      <Button key="cancel" block={stack} variant="danger-text" onClick={() => open('cancel')}>
        Cancel inventory
      </Button>,
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {status === 'Submitted' && major && (
        <Alert type="error" title="A major difference is checked in the Room">
          {t('An item reported Missing, too many items that differ or a meter beyond the limit cannot be confirmed from the desk. Set a time to check the Room with the student.')}
        </Alert>
      )}
      {status === 'Verifying' && detail.row.visitAt && (
        <Alert type="info" title={t('Room visit at {date}', { date: formatDateTime(detail.row.visitAt) })}>
          {detail.sentToStudent ? t('Sent to the student: the inventory is final once they agree.') : t('In the Room, record what you find and send it to the student.')}
        </Alert>
      )}
      {status === 'Final' && (
        <p className="text-sm text-fg-secondary">
          {t('Final ({source}) on {at}; Utility counts from {from}.', { source: t(detail.source), at: formatDateTime(detail.finalizedAt), from: formatDateTime(detail.utilityFrom) })}
        </p>
      )}
      {buttons.length > 0 && <div className={stack ? 'flex flex-col gap-2' : 'flex flex-wrap justify-end gap-2'}>{buttons}</div>}
    </div>
  )
}
