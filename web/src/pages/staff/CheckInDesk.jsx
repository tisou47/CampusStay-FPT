import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CalendarClock, Check, CircleCheck, CircleX, Clock, LogIn, ScanLine, Upload, UserX } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Avatar, Card, ProgressBar } from '@/components/ui/Display'
import { Field, Input, SearchInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatTime, formatVnd, toDateInput } from '@/lib/format'
import { t, tr } from '@/i18n'

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
  'not-allocated': <Tag tone="neutral">No Bed yet</Tag>,
}

function CheckItem({ ok, children }) {
  const Glyph = ok ? CircleCheck : CircleX
  return (
    <p className="flex items-center gap-2 text-base whitespace-nowrap text-fg">
      <Glyph size={16} aria-hidden="true" className={cx('shrink-0', ok ? 'text-success' : 'text-error')} />
      {tr(children)}
    </p>
  )
}

function LateCheckInModal({ person, termId, onClose }) {
  const { notify } = useToast()
  const fileInput = useRef(null)
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
        notify({ title: 'Late check-in recorded', message: t('{name} arrives on {date}. A Manager decides it in Decisions › Late check-in.', { name: person.name, date: formatDate(requestedFor) }) })
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
        {(id) => <Input id={id} type="date" min={today} value={requestedFor} onChange={(e) => setRequestedFor(e.target.value)} />}
      </Field>
      <Field label="Reason" required hint={`${reason.length}/500`}>
        {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the student arrives after the check-in window" />}
      </Field>
      <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2.5 text-left hover:border-primary">
        <Upload size={16} aria-hidden="true" className="text-fg-secondary" />
        <span className="text-base text-fg">{file ? file.name : t('Attach evidence (JPEG, PNG or PDF, optional)')}</span>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </button>
    </Modal>
  )
}

function StudentPanel({ person, onDone }) {
  const { notify, notifyError } = useToast()
  const { term } = useSession()
  const items = person.handOverItems ?? []
  const [checked, setChecked] = useState(() => new Set(items))
  const [note, setNote] = useState('')
  const [late, setLate] = useState(false)
  const ready = person.status === 'ready'
  const all = checked.size === items.length
  const owing = [person.owes?.balance, person.owes?.utilityDeposit].filter((v) => v > 0).length
  // C-23: the checks are Bed allocated, Balance paid, Utility Deposit paid and the check-in window (passed while
  // a late check-in is approved). A failed check the unpaid amounts do not explain is the window; after the
  // Term's checkInEnd it has closed (before checkInStart it has not opened yet).
  const windowClosed =
    person.status === 'blocked' && (person.checks ?? []).filter((c) => !c.passed).length > owing && Boolean(term?.checkInEnd) && toDateInput(new Date()) > term.checkInEnd
  const confirm = useMutation(() => api.desk.checkIn({ studentCode: person.studentCode, items: [...checked], note: note.trim() || undefined }), {
    invalidates: ['check-in', 'dashboard'],
    onSuccess: () => notify({ title: t('{name} checked in', { name: person.name }), message: t('{room} · Bed {bed}. The QR pass is active.', { room: person.room, bed: person.bed }) }),
    onError: (e) => notifyError(e, 'Could not check in'),
  })

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} size={48} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-h2 font-semibold text-fg">
            {person.name} · {person.studentCode}
          </h2>
          {person.room && (
            <p className="text-lg text-fg-secondary">
              {t('{room} · Bed {bed}', { room: person.room, bed: person.bed })} · {[person.block && tr(person.block), person.floor != null && t('Floor {n}', { n: person.floor })].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        {statusTag[person.status]}
      </div>

      {person.status === 'not-allocated' ? (
        <Alert type="warning" title="No Room and Bed for this Term yet">
          {t('This student has no confirmed Allocation. Check-in opens after the assignment is committed and the balance is paid.')}
        </Alert>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(person.checks ?? []).map((c) => (
            <CheckItem key={c.label} ok={c.passed}>
              {c.label}
            </CheckItem>
          ))}
        </div>
      )}

      {windowClosed && (
        <Alert
          type="warning"
          title={t('Check-in window closed on {date}', { date: formatDate(term.checkInEnd) })}
          action={
            <Button icon={CalendarClock} onClick={() => setLate(true)}>
              Record late check-in
            </Button>
          }
        >
          {t('Record when {name} will arrive. Once a Manager approves it, check-in opens here until the approved day.', { name: person.name })}
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
              person.owes?.utilityDeposit ? t('the Utility Deposit of {amount}', { amount: formatVnd(person.owes.utilityDeposit) }) : null,
            ].filter(Boolean).join(t(' and ')),
          })}
        </Alert>
      )}

      {person.status === 'checked-in' && (
        <Alert type="success" title={t('Checked in at {time}', { time: formatTime(person.checkedInAt) })}>
          {t('Assets were handed over and the student’s QR pass now opens the Block gates.')}
        </Alert>
      )}

      {ready && (
        <>
          <p className="text-base font-medium text-fg">{t('Asset hand-over · Bed {bed}', { bed: person.bed })}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {items.map((item) => (
              <Checkbox
                key={item}
                label={item}
                checked={checked.has(item)}
                onChange={() =>
                  setChecked((s) => {
                    const next = new Set(s)
                    if (next.has(item)) next.delete(item)
                    else next.add(item)
                    return next
                  })
                }
              />
            ))}
          </div>
          <Field label="Condition notes" helper={all ? undefined : 'Tick every item the student received before you confirm.'}>
            {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Scratches, stains or missing items" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onDone}>Cancel</Button>
            <Button variant="primary" icon={Check} disabled={!all || confirm.pending} onClick={() => confirm.run()}>
              Confirm check-in
            </Button>
          </div>
        </>
      )}
    </Card>
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

  // QR scanners type the pass into the focused search box and press Enter.
  const scan = () => {
    input.current?.focus()
    input.current?.select()
  }

  return (
    <>
      <PageHeader
        title="Check-in desk"
        description={`${d0?.date ? `${formatDate(d0.date)} · ` : ''}${t('Scan the student’s QR pass from the Android app or search by student code.')}`}
        actions={<DeskModeSwitch mode="in" />}
      />

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput
          ref={input}
          size="lg"
          wrapperClassName="w-120"
          aria-label={t('Student code or name')}
          placeholder="Student code or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSearch(q.trim())}
          autoFocus
        />
        <Button icon={LogIn} onClick={scan}>
          Scan QR pass
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        {!search ? (
          <Card padding="none" className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={ScanLine} title="Waiting for the next student">
              Scan a QR pass or type a student code.
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
          <StudentPanel key={`${person.studentCode}-${person.status}`} person={person} onDone={() => setQ('')} />
        ) : (
          <Card padding="none" className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={UserX} title={t('No student matches “{q}”', { q: search })}>
              Check the student code, or ask the student to open the QR pass in the Android app.
            </EmptyBlock>
          </Card>
        )}

        <div className="flex w-90 shrink-0 flex-col gap-4 overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-2.5">
            <h2 className="text-h3 font-semibold text-fg">{t('Today')}{d0?.block ? ` · ${t('Block {code}', { code: d0.block })}` : ''}</h2>
            <QueryState query={today} compact>
              {(d) => (
                <>
                  <dl className="flex flex-col gap-2.5 text-base">
                    <div className="flex justify-between">
                      <dt className="text-fg-secondary">{t('Checked in')}</dt>
                      <dd className="text-fg tabular">
                        {t('{n} of {total}', { n: formatNumber(d.checkedIn), total: formatNumber(d.expected) })}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-secondary">{t('Waiting at desk')}</dt>
                      <dd className="text-fg tabular">{formatNumber(d.waiting)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-secondary">{t('Blocked (unpaid)')}</dt>
                      <dd className="text-error-fg tabular">{formatNumber(d.blocked)}</dd>
                    </div>
                  </dl>
                  <ProgressBar value={d.checkedIn} max={d.expected || 1} tone="success" />
                </>
              )}
            </QueryState>
          </Card>

          <Card className="flex min-h-40 flex-1 flex-col gap-2">
            <h2 className="shrink-0 text-h3 font-semibold text-fg">{t('Recent check-ins')}</h2>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {(d0?.recent ?? []).map((r) => (
                <li key={`${r.bed}-${r.at}`} className="flex items-center gap-2">
                  <Clock size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
                  <span className="min-w-0 flex-1 truncate text-base text-fg">
                    {r.name} · {r.bed}
                  </span>
                  <span className="text-sm text-fg-tertiary tabular">{formatTime(r.at)}</span>
                </li>
              ))}
              {d0 && !d0.recent?.length && <li className="text-base text-fg-secondary">{t('No check-ins yet today.')}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
