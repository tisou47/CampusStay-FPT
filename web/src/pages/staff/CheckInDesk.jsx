import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, CircleCheck, CircleX, Clock, LogIn, ScanLine, UserX } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Avatar, Card, ProgressBar } from '@/components/ui/Display'
import { Field, SearchInput, Textarea } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatTime, formatVnd } from '@/lib/format'

// SCR-REQ-11 Check-in Desk (Figma 60:3026)
// GET /check-in/today?termId&block → { date, block, expected, checkedIn, waiting, blocked, recent: [{ name, bed, at }] }
// GET /check-in/lookup?termId&q → { student: { name, studentCode, room, bed, block, floor,
//   status: 'ready'|'blocked'|'checked-in'|'not-allocated', checks: [{ label, passed }], owes: { balance, utilityDeposit } | null,
//   checkedInAt, handOverItems: [string] } | null }
// POST /check-in { studentCode, items, note } → { checkedInAt }

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
      {children}
    </p>
  )
}

function StudentPanel({ person, onDone }) {
  const { notify, notifyError } = useToast()
  const items = person.handOverItems ?? []
  const [checked, setChecked] = useState(() => new Set(items))
  const [note, setNote] = useState('')
  const ready = person.status === 'ready'
  const all = checked.size === items.length
  const confirm = useMutation(() => api.desk.checkIn({ studentCode: person.studentCode, items: [...checked], note: note.trim() || undefined }), {
    invalidates: ['check-in', 'dashboard'],
    onSuccess: () => notify({ title: `${person.name} checked in`, message: `${person.room} · Bed ${person.bed}. The QR pass is active.` }),
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
              {person.room} · Bed {person.bed} · {[person.block && `Block ${person.block}`, person.floor != null && `Floor ${person.floor}`].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        {statusTag[person.status]}
      </div>

      {person.status === 'not-allocated' ? (
        <Alert type="warning" title="No Room and Bed for this Term yet">
          This student has no confirmed Allocation. Check-in opens after the assignment is committed and the balance is paid.
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

      {person.status === 'blocked' && (
        <Alert type="error" title="Check-in blocked">
          {person.name} ({person.studentCode}) still owes
          {person.owes?.balance ? ` the balance of ${formatVnd(person.owes.balance)}` : ''}
          {person.owes?.balance && person.owes?.utilityDeposit ? ' and' : ''}
          {person.owes?.utilityDeposit ? ` the Utility Deposit of ${formatVnd(person.owes.utilityDeposit)}` : ''}. Ask the student to pay with VietQR before check-in.
        </Alert>
      )}

      {person.status === 'checked-in' && (
        <Alert type="success" title={`Checked in at ${formatTime(person.checkedInAt)}`}>
          Assets were handed over and the student’s QR pass now opens the Block gates.
        </Alert>
      )}

      {ready && (
        <>
          <p className="text-base font-medium text-fg">Asset hand-over · Bed {person.bed}</p>
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
        Check-in mode
      </Button>
      <Button variant={mode === 'out' ? 'primary' : 'default'} to="/staff/check-out">
        Check-out mode
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
  const t = today.data
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
        description={`${t?.date ? `${formatDate(t.date)} · ` : ''}Scan the student’s QR pass from the Android app or search by student code.`}
        actions={<DeskModeSwitch mode="in" />}
      />

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput
          ref={input}
          size="lg"
          wrapperClassName="w-120"
          aria-label="Student code or name"
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
            <EmptyBlock icon={UserX} title={`No student matches “${search}”`}>
              Check the student code, or ask the student to open the QR pass in the Android app.
            </EmptyBlock>
          </Card>
        )}

        <div className="flex w-90 shrink-0 flex-col gap-4 overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-2.5">
            <h2 className="text-h3 font-semibold text-fg">Today{t?.block ? ` · Block ${t.block}` : ''}</h2>
            <QueryState query={today} compact>
              {(d) => (
                <>
                  <dl className="flex flex-col gap-2.5 text-base">
                    <div className="flex justify-between">
                      <dt className="text-fg-secondary">Checked in</dt>
                      <dd className="text-fg tabular">
                        {formatNumber(d.checkedIn)} of {formatNumber(d.expected)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-secondary">Waiting at desk</dt>
                      <dd className="text-fg tabular">{formatNumber(d.waiting)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-secondary">Blocked (unpaid)</dt>
                      <dd className="text-error-fg tabular">{formatNumber(d.blocked)}</dd>
                    </div>
                  </dl>
                  <ProgressBar value={d.checkedIn} max={d.expected || 1} tone="success" />
                </>
              )}
            </QueryState>
          </Card>

          <Card className="flex min-h-40 flex-1 flex-col gap-2">
            <h2 className="shrink-0 text-h3 font-semibold text-fg">Recent check-ins</h2>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {(t?.recent ?? []).map((r) => (
                <li key={`${r.bed}-${r.at}`} className="flex items-center gap-2">
                  <Clock size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
                  <span className="min-w-0 flex-1 truncate text-base text-fg">
                    {r.name} · {r.bed}
                  </span>
                  <span className="text-sm text-fg-tertiary tabular">{formatTime(r.at)}</span>
                </li>
              ))}
              {t && !t.recent?.length && <li className="text-base text-fg-secondary">No check-ins yet today.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
