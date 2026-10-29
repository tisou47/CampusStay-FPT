import { useEffect, useState } from 'react'
import { Bed, Calendar, ChevronDown, Clock, CreditCard, ExternalLink, Eye, EyeOff, Layers, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar, Card, Note } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { Popover } from '@/components/ui/Popover'
import { ConfirmDialog } from '@/components/student/ConfirmDialog'
import { StatusBadge } from '@/components/student/StatusBadge'
import { cx } from '@/lib/cx'
import { typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr, tx } from '@/i18n'
import { DateInput } from '@/components/ui/DatePicker'

// SCR-ASG-01 My Room (Figma 39:1535)
// GET /students/me/allocation?termId → {
//   term: { name, stayStart, stayEnd, resultsPublishedAt },
//   allocation: { room, bed, block, blockLabel, floor, roomTypeName, roomClassName, amenities, allocatedAt,
//                 status (Assigned – unpaid, Paid – waiting for the door code, Resident), residentSince, codeReleased } | null,
//   roommates: [{ name, bed }], roommateCapacity,
//   checkIn: { start, end, deskHours, location, checkedInAt } | null,
//   balance: { invoiceId, amount, status, dueAt, paidAt } | null,
//   application: { id, status } | null, rulesUrl, stayTerms (the stay length),
//   termination: { reason, note, status, moveOutBy, startedAt } | null,
//   stay: { committedTerms, termsUsed, termsLeft, status } | null,
//   nextTerm: { term: { id, name, stayStart }, state (Continuing, Awaiting extension, Not continuing), room, bed, roomTypeName,
//     roomClassName, termPrice, termsLeft, fee: { invoiceId, amount, status, dueAt } | null,
//     window: { opensAt, closesAt, decisionsDueAt, feesDueAt, filing, checkOutBy }, endReason, checkOutBy } | null }
// POST /students/me/stay/extension { terms, reason } · POST /students/me/stay/end { reason } → { id, status, automatic, note }
// GET /students/me/late-check-in → { request: { id, status, requestedFor, deadline, reason, decisionReason, source } | null,
//   canRequest, checkInEnd, latestDay } · POST /students/me/late-check-in (multipart reason, requestedFor, evidence)
// GET /students/me/door-code → { room, status (Ready, Not ready, Not set), note, changedAt } · POST /students/me/door-code/reveal
//   → { room, code, changedAt } (audited) · GET /students/me/furniture → { room, items: [{ assetCode, type, typeVi, status }] }

const SHOW_SECONDS = 30

/**
 * The Room's door code (ADR-23), at the right of the hero: shown on request for a short time; every view is
 * written to the Audit Log. Same query, reveal and 30-second hide as before; only the placement changed.
 */
function DoorCodeAction() {
  const query = useQuery(['door-code'], ({ signal }) => api.me.doorCode(undefined, { signal }))
  const [code, setCode] = useState(null)
  const reveal = useMutation(() => api.me.revealDoorCode(), { onSuccess: (res) => setCode(res.code), onError: () => {} })
  useEffect(() => {
    if (!code) return undefined
    const timer = setTimeout(() => setCode(null), SHOW_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [code])
  const d = query.data
  if (!d) return null
  if (d.status !== 'Ready') {
    return (
      <div className="flex max-w-xs flex-col gap-1.5 md:items-end md:text-right">
        <StatusBadge status={d.status} label={t('Door code: {status}', { status: tr(d.status) })} />
        {d.note && <p className="text-small text-text-secondary">{tr(d.note)}</p>}
      </div>
    )
  }
  return (
    <div className="flex w-full flex-col gap-2 md:w-auto md:max-w-xs md:items-end md:text-right">
      {code ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
          <span className="font-mono text-h1 font-semibold tracking-[0.3em] text-text num">{code}</span>
          <Button variant="text" icon={EyeOff} onClick={() => setCode(null)}>
            Hide
          </Button>
        </div>
      ) : (
        <Button variant="primary" size="lg" icon={Eye} onClick={() => reveal.run()} disabled={reveal.pending} className="max-md:w-full">
          Show door code
        </Button>
      )}
      {reveal.error && <Alert type="error" title="Could not show the code">{reveal.error.message}</Alert>}
      <p className="text-small text-text-secondary">
        {t('Changed {date}. It changes whenever someone leaves the Room; never share it.', { date: formatDateTime(d.changedAt) })}
      </p>
    </div>
  )
}

/**
 * Late check-in (spec §6.9): a student who cannot arrive in the check-in window asks online with the day and a
 * document; a Manager decides. An approved day also moves the Balance deadline.
 */
function LateCheckInCard() {
  const { notify } = useToast()
  const query = useQuery(['late-check-in'], ({ signal }) => api.me.lateCheckIn(undefined, { signal }))
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [day, setDay] = useState('')
  const [file, setFile] = useState(null)
  const send = useMutation(
    () => {
      const data = new FormData()
      data.set('reason', reason.trim())
      data.set('requestedFor', day)
      if (file) data.set('evidence', file)
      return api.me.requestLateCheckIn(data)
    },
    {
      invalidates: ['late-check-in'],
      onSuccess: () => {
        notify({ title: 'Late check-in requested', message: t('A Manager will decide it. You will be notified.') })
        setOpen(false)
        query.reload()
      },
      onError: () => {},
    },
  )
  const d = query.data
  if (!d || (!d.request && !d.canRequest)) return null
  const r = d.request
  const fields = send.error?.details?.fields ?? {}
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-card-title text-text">{t('Late check-in')}</h2>
        {r && <StatusTag status={r.status} />}
      </div>
      {r && (
        <>
          <dl className="flex flex-col gap-3">
            <Fact label="Arrival asked for" value={formatDate(r.requestedFor)} />
            {r.status === 'Approved' && <Fact label="Approved until" value={formatDate(r.deadline)} />}
          </dl>
          {r.status === 'Rejected' && r.decisionReason && <Alert type="warning" title="Not approved">{r.decisionReason}</Alert>}
          {r.status === 'Approved' && <Note>{t('Your Balance deadline and your arrival move to the end of that day.')}</Note>}
        </>
      )}
      {d.canRequest &&
        (open ? (
          <div className="flex flex-col gap-3">
            {send.error && !send.error.details?.fields && <Alert type="error" title="Could not send the request">{send.error.message}</Alert>}
            <Field label="Why do you arrive late?" required error={fields.reason}>
              {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <Field label="Day you will arrive" required error={fields.requestedFor} helper={d.latestDay ? t('Up to {date}', { date: formatDate(d.latestDay) }) : undefined}>
              {(id) => <DateInput id={id} value={day} max={d.latestDay ?? undefined} onChange={(e) => setDay(e.target.value)} />}
            </Field>
            <Field label="Document (ticket, letter …)" required error={fields.evidence}>
              {(id) => <input id={id} type="file" accept="image/*,application/pdf" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={send.pending || !reason.trim() || !day || !file} onClick={() => send.run()}>
                {send.pending ? t('Sending…') : t('Send request')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-secondary">
              {t('Cannot arrive by {date}? Ask for a late check-in with a document that explains why.', { date: formatDate(d.checkInEnd) })}
            </p>
            <Button block onClick={() => setOpen(true)}>
              Ask for a late check-in
            </Button>
          </>
        ))}
    </Card>
  )
}

function FurnitureCard() {
  const query = useQuery(['my-furniture'], ({ signal }) => api.me.furniture(undefined, { signal }))
  const items = query.data?.items
  if (!items) return null
  // One line per type ("4 × Bed"); items that are not in use are named with their asset code.
  const groups = Object.values(
    items.reduce((acc, i) => {
      const name = typeName(i)
      ;(acc[name] ??= { name, items: [] }).items.push(i)
      return acc
    }, {}),
  )
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <h2 className="text-card-title text-text">{t('Furniture')}</h2>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.name} className="flex flex-col gap-1">
              <span className="text-base text-fg">{`${g.items.length} × ${g.name}`}</span>
              {g.items
                .filter((i) => i.status !== 'In use')
                .map((i) => (
                  <span key={i.assetCode} className="flex items-center gap-2 pl-4 text-sm text-fg-tertiary">
                    {i.assetCode}
                    <StatusTag status={i.status} />
                  </span>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-fg-secondary">{t('No furniture recorded in this Room.')}</p>
      )}
      <Note>Something broken? Report it from Requests so Staff can repair it.</Note>
    </Card>
  )
}

/** Label above value (definition list). */
function Fact({ label, value, className }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-0.5', className)}>
      <dt className="text-small text-text-muted">{tx(label)}</dt>
      <dd className="text-body font-medium text-text">{typeof value === 'string' ? tx(value) : value}</dd>
    </div>
  )
}

// Next-Term requests that go behind "More options" (static, so the menu never builds new props per render).
const NEXT_TERM_MORE = [
  { to: '/student/requests/swap/new', icon: Users, label: 'Swap Beds for next Term' },
  { to: '/student/requests/room-class/new', icon: Layers, label: 'Change the Room Class' },
]

/** "1 Mar 2027 – 14 Mar 2027" with each date kept on one line. */
function DateRange({ from, to }) {
  return (
    <>
      <span className="nowrap">{formatDate(from)}</span> – <span className="nowrap">{formatDate(to)}</span>
    </>
  )
}

/**
 * The next Term (spec §6.10): where the student stays, the Stay's Terms left, the next-Term fee, and while the
 * requests window is open the requests that change it (extension, end of stay, room change, swap, Room Class).
 */
function NextTermCard({ data }) {
  const n = data.nextTerm
  const { notify } = useToast()
  const [extending, setExtending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [terms, setTerms] = useState('1')
  const [reason, setReason] = useState('')
  const done = (r) => {
    notify({ title: r.automatic ? 'Request approved' : 'Request sent', message: tr(r.note) })
    setExtending(false)
    setEnding(false)
    setReason('')
  }
  const extend = useMutation(() => api.stay.extend({ terms: Number(terms), reason: reason.trim() || undefined }), {
    invalidates: ['allocation', 'requests', 'home'],
    onSuccess: done,
    onError: () => {},
  })
  const end = useMutation(() => api.stay.end({ reason: reason.trim() || undefined }), {
    invalidates: ['allocation', 'requests', 'home'],
    onSuccess: done,
    onError: () => {},
  })
  if (!n) return null
  const w = n.window
  const filing = Boolean(w?.filing)
  const left = data.stay ? Math.max(1, 9 - data.stay.committedTerms) : 8
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-card-title text-text">{t('Next Term · {term}', { term: n.term?.name })}</h2>
        <StatusBadge status={n.state} />
      </div>
      {n.state === 'Not continuing' ? (
        <Alert type="warning" title="No Bed for the next Term">
          {t('Reason: {reason}.', { reason: tr(n.endReason) })} {n.checkOutBy && t('Check out at the desk by {date}.', { date: formatDate(n.checkOutBy) })}
        </Alert>
      ) : (
        <>
          <dl className="flex flex-col gap-3">
            <Fact label="Your Bed next Term" value={`${t('{room} · Bed {bed}', { room: n.room, bed: n.bed })} · ${tr(n.roomTypeName)} · ${tr(n.roomClassName)}`} />
            {n.termPrice != null && <Fact label="Next-Term fee" value={<span className="num">{formatVnd(n.termPrice)}</span>} />}
            {n.state !== 'Awaiting extension' && <Fact label="Terms left after this one" value={<span className="num">{n.termsLeft}</span>} />}
          </dl>
          {n.state === 'Awaiting extension' && (
            <Alert type="warning" title="This is the last Term of your stay">
              {t('Ask for an extension before {date} to keep your Bed. Otherwise it is released and you check out at the end of this Term.', { date: formatDateTime(w?.closesAt) })}
            </Alert>
          )}
          {n.fee && (
            <div className="flex flex-col gap-2 rounded-md bg-subtle px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-body font-medium text-text num nowrap">{formatVnd(n.fee.amount)}</span>
                {n.fee.status === 'Unpaid' ? (
                  <span className="text-small text-text-secondary nowrap">{t('Due {date}', { date: formatDateTime(n.fee.dueAt) })}</span>
                ) : (
                  <StatusBadge status={n.fee.status} />
                )}
              </div>
              {n.fee.status === 'Unpaid' && (
                <Button icon={CreditCard} block to={`/student/invoices/${n.fee.invoiceId}/pay`}>
                  Pay next-Term fee
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {w &&
        (filing ? (
          <p className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-small font-medium text-warning-fg">
            <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t('Requests for the next Term are open until {date}.', { date: formatDateTime(w.closesAt) })}
          </p>
        ) : (
          <p className="text-small text-text-muted">{t('Requests for the next Term closed on {date}.', { date: formatDateTime(w.closesAt) })}</p>
        ))}
      {filing && n.state !== 'Not continuing' && (
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block icon={Calendar} onClick={() => setExtending(true)}>
            Extend my stay
          </Button>
          {n.state === 'Continuing' && (
            <>
              <Button size="lg" block icon={Repeat} to="/student/requests/room-change/new">
                Change Room next Term
              </Button>
              <Popover
                align="start"
                width={280}
                trigger={({ toggle, props }) => (
                  <Button variant="text" block iconAfter={ChevronDown} iconSize={16} onClick={toggle} {...props}>
                    More options
                  </Button>
                )}
              >
                {({ close }) => (
                  <div role="menu" className="flex flex-col py-1">
                    {NEXT_TERM_MORE.map((o) => (
                      <Link key={o.to} role="menuitem" to={o.to} onClick={close} className="flex items-center gap-2.5 px-3 py-2.5 text-body text-text hover:bg-subtle">
                        <o.icon size={16} aria-hidden="true" className="shrink-0 text-text-secondary" />
                        {t(o.label)}
                      </Link>
                    ))}
                  </div>
                )}
              </Popover>
            </>
          )}
          <div className="mt-1 border-t border-border pt-3">
            <button type="button" onClick={() => setEnding(true)} className="rounded-sm text-small font-medium text-danger underline-offset-2 hover:underline">
              {t('End my stay after this Term')}
            </button>
          </div>
        </div>
      )}

      <Modal
        open={extending}
        onClose={() => setExtending(false)}
        title="Extend my stay"
        footer={
          <>
            <Button onClick={() => setExtending(false)}>Cancel</Button>
            <Button variant="primary" disabled={extend.pending} onClick={() => extend.run()}>
              {extend.pending ? t('Sending…') : t('Extend')}
            </Button>
          </>
        }
      >
        {extend.error && <Alert type="error" title="Could not extend">{extend.error.details?.fields?.terms ?? extend.error.message}</Alert>}
        <Field label="Terms to add" required>
          {(id) => <Select id={id} value={terms} onChange={(e) => setTerms(e.target.value)} options={Array.from({ length: left }, (_, i) => ({ value: String(i + 1), label: t('{n} Terms', { n: i + 1 }) }))} />}
        </Field>
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <Note>Approved at once when you are enrolled and owe nothing overdue; otherwise Staff decide. Each Term is still billed on its own.</Note>
      </Modal>

      <ConfirmDialog
        open={ending}
        onCancel={() => setEnding(false)}
        onConfirm={() => end.run()}
        pending={end.pending}
        title="End my stay after this Term"
        description={t('Your Bed for {term} is released at once. You check out at the desk by {date}; the Utility Deposit is settled then. Nothing is charged for ending now.', {
          term: n.term?.name,
          date: formatDate(w?.checkOutBy ?? n.checkOutBy) || t('the check-out day'),
        })}
        cancelLabel="Keep my Bed"
        confirmLabel={end.pending ? t('Sending…') : t('End my stay')}
      >
        {end.error && <Alert type="error" title="Could not end the stay">{end.error.message}</Alert>}
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </ConfirmDialog>
    </Card>
  )
}

/*
 * ≥ 1024 px: two columns (2fr / 1fr), the page scrolls as a whole and only the Next-Term card sticks.
 * Under 1024 px: one column; the column wrappers become `display: contents` and CSS `order` puts the cards in
 * the order Hero → Next Term → (late check-in) → Details → Roommates → Furniture → Rent.
 */
function Room({ data }) {
  const { allocation: a, roommates = [], checkIn, balance, term: tm, termination } = data
  const resident = a.status === 'Resident'
  const stayTerms = data.stay?.committedTerms ?? data.stayTerms
  const movedIn = checkIn?.checkedInAt ?? a.residentSince
  const freeBeds = data.roommateCapacity != null ? Math.max(0, data.roommateCapacity - roommates.length) : null
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4 max-lg:contents">
        {termination && (
          <Alert type="error" title={termination.status === 'Checked out' ? 'Stay ended' : 'Your stay is terminated'}>
            {t('Reason: {reason}.', { reason: tr(termination.reason) })}
            {termination.note ? ' ' + termination.note : ''}
            {termination.status !== 'Checked out' && ' ' + t('Check out at the desk by {date}.', { date: formatDate(termination.moveOutBy) })}
          </Alert>
        )}
        {!resident && a.status === 'Assigned – unpaid' && (
          <Alert type="warning" title="Pay the Balance to keep your Bed">
            {t('Your Bed is held until {date}. Unpaid by then, it is released and the Deposit is kept.', { date: formatDateTime(balance?.dueAt) })}
          </Alert>
        )}

        <section aria-labelledby="my-room-hero" className="flex flex-col gap-4 rounded-lg border border-primary/25 bg-brand-subtle p-5 max-lg:order-1 md:flex-row md:items-start md:justify-between md:gap-6 lg:px-6">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 id="my-room-hero" className="text-h1 font-semibold text-text">
                {t('Room {room} · Bed {bed}', { room: a.room, bed: a.bed })}
              </h2>
              <StatusBadge status={a.status ?? 'Allocated'} />
            </div>
            <p className="text-body text-text-secondary">
              {[
                a.block && t('Building {code}', { code: a.block }),
                a.floor != null && t('Floor {n}', { n: a.floor }),
                a.roomTypeName && tr(a.roomTypeName),
                a.roomClassName && t('Class {name}', { name: tr(a.roomClassName) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <DoorCodeAction />
        </section>

        <Card padding="lg" className="flex flex-col gap-4 max-lg:order-4">
          <h2 className="text-card-title text-text">{t('Details')}</h2>
          {tm && (
            <p className="text-small text-text-secondary lg:hidden">
              {tm.name}
              {tm.stayStart && (
                <>
                  {' · '}
                  <DateRange from={tm.stayStart} to={tm.stayEnd} />
                </>
              )}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <Fact label="Building" value={a.blockLabel ?? a.block ?? '—'} />
            <Fact label="Floor" value={a.floor != null ? String(a.floor) : '—'} />
            <Fact label="Room Type" value={a.roomTypeName ?? '—'} />
            <Fact label="Room Class" value={a.roomClassName ?? '—'} />
            <Fact label="Allocated on" value={formatDate(a.allocatedAt) || '—'} />
            <Fact
              label="Move-in date"
              value={movedIn ? formatDate(movedIn) : checkIn ? <DateRange from={checkIn.start} to={checkIn.end} /> : '—'}
            />
            <Fact label="Contract length" value={stayTerms ? t('{n} Terms', { n: stayTerms }) : '—'} />
            <Fact label="Terms used" value={data.stay ? <span className="num">{data.stay.termsUsed}</span> : '—'} />
            <div className="col-span-full flex flex-col gap-1.5">
              <dt className="text-small text-text-muted">{t('Amenities')}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {a.amenities?.length ? (
                  a.amenities.map((x) => (
                    <span key={x} className="rounded-full bg-subtle px-2.5 py-0.5 text-small text-text-secondary">
                      {tr(x)}
                    </span>
                  ))
                ) : (
                  <span className="text-body text-text">—</span>
                )}
              </dd>
            </div>
          </dl>
          {checkIn && !checkIn.checkedInAt && (checkIn.deskHours || checkIn.location) && (
            <p className="text-small text-text-secondary">
              {[checkIn.deskHours && t('Desk hours: {hours}', { hours: checkIn.deskHours }), checkIn.location && t('Where: {place}', { place: checkIn.location })].filter(Boolean).join(' · ')}
            </p>
          )}
          {checkIn && !checkIn.checkedInAt && <Note>Open the CampusStay Android app to show your check-in QR pass.</Note>}
          {data.rulesUrl && (
            <a href={data.rulesUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 self-start text-body font-medium text-link hover:underline">
              {t('Dormitory rules')}
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
        </Card>

        <Card padding="lg" className="flex flex-col gap-4 max-lg:order-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-card-title text-text">{t('Roommates')}</h2>
            <span className="text-small text-text-muted">
              {freeBeds != null
                ? t('{n} roommates · {free} free Beds', { n: roommates.length, free: freeBeds })
                : t('{n} roommates', { n: roommates.length })}
            </span>
          </div>
          {roommates.length ? (
            <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {roommates.map((p) => (
                <li key={`${p.bed}-${p.name}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-subtle p-3">
                  <Avatar name={p.name} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-medium text-text">{p.name}</span>
                    <span className="text-small text-text-muted">{t('Bed {bed}', { bed: p.bed })}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-text-secondary">{t('No roommates assigned yet.')}</p>
          )}
          <Note>Only names are shared. Contact details stay private; you meet your roommates at check-in.</Note>
        </Card>

        <div className="max-lg:order-6">
          <FurnitureCard />
        </div>

        {balance && (
          <Card padding="lg" className="flex flex-col gap-3 max-lg:order-7">
            <h2 className="text-card-title text-text">{t('Rent (after deposit)')}</h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-h2 font-semibold text-text num">{formatVnd(balance.amount)}</p>
                <p className="text-small text-text-secondary">
                  {balance.status === 'Paid' ? t('Paid on {date}', { date: formatDate(balance.paidAt) }) : t('Due {date}', { date: formatDate(balance.dueAt) })}
                </p>
              </div>
              <StatusBadge status={balance.status} />
            </div>
            {balance.status === 'Paid' ? (
              <Button size="lg" className="self-start" to={`/student/invoices/${balance.invoiceId}`}>
                View invoice
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="self-start" icon={CreditCard} to={`/student/invoices/${balance.invoiceId}/pay`}>
                Pay balance
              </Button>
            )}
          </Card>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4 max-lg:contents lg:self-stretch">
        {!checkIn?.checkedInAt && !resident && (
          <div className="max-lg:order-3">
            <LateCheckInCard />
          </div>
        )}
        <div className="max-lg:order-2 lg:sticky lg:top-4">
          <NextTermCard data={data} />
        </div>
      </div>
    </div>
  )
}

export default function MyRoom() {
  const { term } = useSession()
  const query = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
  const data = query.data
  const tm = data?.term ?? term
  const description = tm ? `${tm.name}${tm.stayStart ? ` · ${formatDate(tm.stayStart)} – ${formatDate(tm.stayEnd)}` : ''}` : undefined

  return (
    <StudentPage
      title="My Room"
      flow
      description={description}
    >
      {data === undefined && query.loading ? (
        <LoadingState />
      ) : data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !data.allocation ? (
        <Card padding="none" className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock
            icon={Bed}
            title="No Room assigned yet"
            action={
              <Button variant="primary" size="lg" to={data.application ? `/student/applications/${data.application.id}` : '/student/apply/term'}>
                {data.application ? t('View application') : t('Start application')}
              </Button>
            }
          >
            {t('The dormitory assigns your Room and Bed after review.')}
            {tm?.resultsPublishedAt ? ` ${t('Assignment results are published on {date}.', { date: formatDate(tm.resultsPublishedAt) })}` : ''}
          </EmptyBlock>
        </Card>
      ) : (
        <Room data={data} />
      )}
    </StudentPage>
  )
}
