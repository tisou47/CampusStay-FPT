import { useEffect, useState } from 'react'
import { Bed, Calendar, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, KeyRound, Layers, MapPin, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar, Card, Facts, Note } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
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

/** The Room's door code (ADR-23): shown on request for a short time; every view is written to the Audit Log. */
function DoorCodeCard() {
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
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-card-title text-fg">{t('Door code')}</h2>
        <StatusTag status={d.status} />
      </div>
      {d.status === 'Ready' ? (
        <>
          {code ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle px-4 py-3">
              <span className="font-mono text-h1 font-semibold tracking-[0.3em] text-fg tabular">{code}</span>
              <Button variant="text" icon={EyeOff} onClick={() => setCode(null)}>
                Hide
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="lg" block icon={Eye} onClick={() => reveal.run()} disabled={reveal.pending}>
              Show door code
            </Button>
          )}
          {reveal.error && <Alert type="error" title="Could not show the code">{reveal.error.message}</Alert>}
          <p className="text-sm text-fg-tertiary">
            {t('Changed {date}. It changes whenever someone leaves the Room; never share it.', { date: formatDateTime(d.changedAt) })}
          </p>
        </>
      ) : (
        <InfoRow icon={KeyRound} label={t('Room {code}', { code: d.room })} value={tr(d.note)} />
      )}
    </Card>
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
        <h2 className="text-card-title text-fg">{t('Late check-in')}</h2>
        {r && <StatusTag status={r.status} />}
      </div>
      {r && (
        <>
          <InfoRow icon={Calendar} label="Arrival asked for" value={formatDate(r.requestedFor)} />
          {r.status === 'Approved' && <InfoRow icon={Clock} label="Approved until" value={formatDate(r.deadline)} />}
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
      <h2 className="text-card-title text-fg">{t('Furniture')}</h2>
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

function InfoRow({ icon: Glyph, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Glyph size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <div className="flex flex-col">
        <span className="text-sm text-fg-tertiary">{tx(label)}</span>
        <span className="text-base font-medium text-fg">{tx(value)}</span>
      </div>
    </div>
  )
}

function MoreLink({ icon: Glyph, to, href, children }) {
  const classes = 'flex items-center gap-2.5 rounded-md py-2 text-base text-fg hover:text-fg-brand'
  const body = (
    <>
      <Glyph size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
      <span className="flex-1">{tx(children)}</span>
      {href ? <ExternalLink size={16} aria-hidden="true" className="text-fg-secondary" /> : <ChevronRight size={16} aria-hidden="true" className="text-fg-secondary" />}
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <Link to={to} className={classes}>
      {body}
    </Link>
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
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-card-title text-fg">{t('Next Term · {term}', { term: n.term?.name })}</h2>
        <StatusTag status={n.state} />
      </div>
      {n.state === 'Not continuing' ? (
        <Alert type="warning" title="No Bed for the next Term">
          {t('Reason: {reason}.', { reason: tr(n.endReason) })} {n.checkOutBy && t('Check out at the desk by {date}.', { date: formatDate(n.checkOutBy) })}
        </Alert>
      ) : (
        <>
          <InfoRow icon={Bed} label="Your Bed next Term" value={`${t('{room} · Bed {bed}', { room: n.room, bed: n.bed })} · ${tr(n.roomTypeName)} · ${tr(n.roomClassName)}`} />
          {n.termPrice != null && <InfoRow icon={CreditCard} label="Next-Term fee" value={formatVnd(n.termPrice)} />}
          {n.state === 'Awaiting extension' ? (
            <Alert type="warning" title="This is the last Term of your stay">
              {t('Ask for an extension before {date} to keep your Bed. Otherwise it is released and you check out at the end of this Term.', { date: formatDateTime(w?.closesAt) })}
            </Alert>
          ) : (
            <p className="text-sm text-fg-secondary">{t('Terms left on your stay after this one: {n}', { n: n.termsLeft })}</p>
          )}
          {n.fee && (
            // Stacked: the card sits in a narrow column, where amount, date and button do not fit on one line.
            <div className="flex flex-col gap-2 rounded-md bg-subtle px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-base font-medium whitespace-nowrap text-fg">{formatVnd(n.fee.amount)}</span>
                {n.fee.status === 'Unpaid' ? (
                  <span className="text-sm whitespace-nowrap text-fg-secondary">{t('Due {date}', { date: formatDateTime(n.fee.dueAt) })}</span>
                ) : (
                  <StatusTag status={n.fee.status} />
                )}
              </div>
              {n.fee.status === 'Unpaid' && (
                <Button variant="primary" icon={CreditCard} block to={`/student/invoices/${n.fee.invoiceId}/pay`}>
                  Pay next-Term fee
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {w && (
        <p className="text-sm text-fg-tertiary">
          {filing
            ? t('Requests for the next Term are open until {date}.', { date: formatDateTime(w.closesAt) })
            : t('Requests for the next Term closed on {date}.', { date: formatDateTime(w.closesAt) })}
        </p>
      )}
      {filing && n.state !== 'Not continuing' && (
        <div className="flex flex-col gap-2">
          <Button variant={n.state === 'Awaiting extension' ? 'primary' : 'secondary'} block icon={Calendar} onClick={() => setExtending(true)}>
            Extend my stay
          </Button>
          {n.state === 'Continuing' && (
            <>
              <Button block icon={Repeat} to="/student/requests/room-change/new">
                Change Room next Term
              </Button>
              <Button block icon={Users} to="/student/requests/swap/new">
                Swap Beds for next Term
              </Button>
              <Button block icon={Layers} to="/student/requests/room-class/new">
                Change the Room Class
              </Button>
            </>
          )}
          <Button variant="text" onClick={() => setEnding(true)}>
            End my stay after this Term
          </Button>
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

      <Modal
        open={ending}
        onClose={() => setEnding(false)}
        title="End my stay after this Term"
        footer={
          <>
            <Button onClick={() => setEnding(false)}>Keep my Bed</Button>
            <Button variant="danger" disabled={end.pending} onClick={() => end.run()}>
              {end.pending ? t('Sending…') : t('End my stay')}
            </Button>
          </>
        }
      >
        {end.error && <Alert type="error" title="Could not end the stay">{end.error.message}</Alert>}
        <p className="text-base text-fg-secondary">
          {t('Your Bed for {term} is released at once. You check out at the desk by {date}; the Utility Deposit is settled then. Nothing is charged for ending now.', {
            term: n.term?.name,
            date: formatDate(w?.checkOutBy ?? n.checkOutBy) || t('the check-out day'),
          })}
        </p>
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Modal>
    </Card>
  )
}

function Room({ data }) {
  const { allocation: a, roommates = [], checkIn, balance, term: tm, termination } = data
  const resident = a.status === 'Resident'
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-1 lg:gap-4 lg:overflow-y-auto">
        {termination && (
          <Alert type="error" title={termination.status === 'Checked out' ? 'Stay ended' : 'Your stay is terminated'} className="shrink-0">
            {t('Reason: {reason}.', { reason: tr(termination.reason) })}
            {termination.note ? ' ' + termination.note : ''}
            {termination.status !== 'Checked out' && ' ' + t('Check out at the desk by {date}.', { date: formatDate(termination.moveOutBy) })}
          </Alert>
        )}
        {!resident && a.status === 'Assigned – unpaid' && (
          <Alert type="warning" title="Pay the Balance to keep your Bed" className="shrink-0">
            {t('Your Bed is held until {date}. Unpaid by then, it is released and the Deposit is kept.', { date: formatDateTime(balance?.dueAt) })}
          </Alert>
        )}
        <section className="flex shrink-0 flex-col items-start gap-1.5 rounded-xl border border-primary/25 bg-brand-subtle p-4 lg:flex-row lg:items-center lg:gap-6 lg:rounded-lg lg:px-6 lg:py-5">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand lg:flex">
            <Bed size={28} aria-hidden="true" />
          </span>
          <StatusTag status={a.status ?? 'Allocated'} className="lg:hidden" />
          <div className="flex flex-col gap-1">
            <p className="text-h1 font-semibold text-fg">
              <span className="max-lg:hidden">{t('Room')} </span>
              {a.room} · {t('Bed {bed}', { bed: a.bed })}
            </p>
            <p className="text-base text-fg-secondary lg:text-lg">{[a.block, a.floor, a.roomTypeName, a.roomClassName].filter(Boolean).map(tr).join(' · ')}</p>
          </div>
        </section>

        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <h2 className="text-card-title text-fg max-lg:hidden">{t('Details')}</h2>
          {tm && (
            <Facts
              className="lg:hidden"
              items={[
                ['Term', tm.name],
                ...(tm.stayStart ? [['Stay', `${formatDate(tm.stayStart)} – ${formatDate(tm.stayEnd)}`]] : []),
              ]}
            />
          )}
          <Facts
            items={[
              ['Block', a.blockLabel ?? a.block ?? '—'],
              ['Floor', a.floor ?? '—'],
              ['Room Type', a.roomTypeName ?? '—'],
            ]}
          />
          <Facts
            items={[
              ['Room Class', a.roomClassName ?? '—'],
              ['Amenities', a.amenities?.length ? a.amenities.map(tr).join(', ') : '—'],
              ['Allocated on', formatDate(a.allocatedAt)],
              ...(data.stay
                ? [
                    ['Stay length', t('{n} Terms', { n: data.stay.committedTerms })],
                    ['Terms used', data.stay.termsUsed],
                  ]
                : data.stayTerms
                  ? [['Stay length', t('{n} Terms', { n: data.stayTerms })]]
                  : []),
              ...(a.residentSince ? [['Resident since', formatDate(a.residentSince)]] : []),
            ]}
          />
        </Card>

        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-card-title text-fg">{t('Roommates')}</h2>
            {data.roommateCapacity != null && (
              <span className="text-sm text-fg-tertiary">
                {t('{n} of {total}', { n: roommates.length, total: data.roommateCapacity })}
              </span>
            )}
          </div>
          {roommates.length ? (
            <ul className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-4">
              {roommates.map((p) => (
                <li key={`${p.bed}-${p.name}`} className="flex min-w-0 items-center gap-3 py-1.5 lg:flex-1 lg:rounded-lg lg:border lg:border-line lg:bg-subtle lg:p-4">
                  <Avatar name={p.name} />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:flex-col lg:items-start lg:justify-start lg:gap-0">
                    <span className="truncate text-base font-medium text-fg">{p.name}</span>
                    <span className="shrink-0 text-sm text-fg-tertiary">{t('Bed {bed}', { bed: p.bed })}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-fg-secondary">{t('No roommates assigned yet.')}</p>
          )}
          <Note>Only names are shared. Contact details stay private; you meet your roommates at check-in.</Note>
        </Card>
        <FurnitureCard />
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-90 lg:gap-4 lg:overflow-y-auto">
        <NextTermCard data={data} />
        <DoorCodeCard />
        {!checkIn?.checkedInAt && !resident && <LateCheckInCard />}
        {checkIn && (
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-card-title text-fg">{t('Check-in')}</h2>
            {checkIn.checkedInAt ? (
              <InfoRow icon={Calendar} label="Checked in" value={formatDate(checkIn.checkedInAt)} />
            ) : (
              <>
                <InfoRow icon={Calendar} label="Window" value={`${formatDate(checkIn.start)} – ${formatDate(checkIn.end)}`} />
                {checkIn.deskHours && <InfoRow icon={Clock} label="Desk hours" value={checkIn.deskHours} />}
                {checkIn.location && <InfoRow icon={MapPin} label="Where" value={checkIn.location} />}
                <Alert type="info" title="Bring your QR pass">
                  {t('Open the CampusStay Android app to show your check-in QR pass.')}
                </Alert>
              </>
            )}
          </Card>
        )}

        {balance && (
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-card-title text-fg">{t('Balance')}</h2>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-h2 font-semibold text-fg">{formatVnd(balance.amount)}</p>
                <p className="text-sm text-fg-secondary">{balance.status === 'Paid' ? t('Paid {date}', { date: formatDate(balance.paidAt) }) : t('Due {date}', { date: formatDate(balance.dueAt) })}</p>
              </div>
              <StatusTag status={balance.status} />
            </div>
            {balance.status === 'Paid' ? (
              <Button size="lg" block to="/student/invoices">
                View invoices
              </Button>
            ) : (
              <Button variant="primary" size="lg" block icon={CreditCard} to={`/student/invoices/${balance.invoiceId}/pay`}>
                Pay balance
              </Button>
            )}
          </Card>
        )}

        <Card padding="sm" className="flex shrink-0 flex-col gap-1">
          {data.rulesUrl && (
            <MoreLink icon={Bed} href={data.rulesUrl}>
              Dormitory rules
            </MoreLink>
          )}
          <MoreLink icon={Repeat} to="/student/requests/room-change/new">
            Request a room change for next Term
          </MoreLink>
          <MoreLink icon={Users} to="/student/requests/swap/new">
            Swap next-Term Beds with another Student
          </MoreLink>
        </Card>
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
      badge={data?.allocation && <StatusTag status={data.allocation.status ?? 'Allocated'} />}
      badgeOnPhone={false}
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
