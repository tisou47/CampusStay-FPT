import { useEffect, useState } from 'react'
import { Bed, Calendar, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, KeyRound, MapPin, QrCode, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, FilePicker, Textarea } from '@/components/ui/Field'
import { StatusTag } from '@/components/ui/Tag'
import { Tooltip } from '@/components/ui/Tooltip'
import { DatePicker } from '@/components/ui/date-time'
import { formatDate, formatDateRange, formatDateTime, formatVnd } from '@/lib/format'
import { t, tr, tx } from '@/i18n'

const SHOW_SECONDS = 30

export function InfoRow({ icon: Glyph, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Glyph size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-fg-tertiary">{tx(label)}</span>
        <span className="text-base font-medium text-fg tabular">{tx(value)}</span>
      </div>
    </div>
  )
}

function MoreLink({ icon: Glyph, to, href, children }) {
  const classes = 'flex items-center gap-2.5 rounded-md py-2 text-base text-fg transition-colors hover:text-fg-brand'
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

export function BalanceCard({ balance }) {
  if (!balance) return null
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-fg">{t('Balance')}</h2>
        <StatusTag status={balance.status} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-kpi font-semibold text-fg tabular">{formatVnd(balance.amount)}</p>
        <p className="text-sm text-fg-secondary tabular">
          {balance.status === 'Paid' ? t('Paid {date}', { date: formatDate(balance.paidAt) }) : t('Due {date}', { date: formatDate(balance.dueAt) })}
        </p>
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
  )
}

/** The Room's door code (ADR-23): shown on request for a short time; every view is written to the Audit Log. */
export function DoorCodeCard() {
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
        <h2 className="text-h3 font-semibold text-fg">{t('Door code')}</h2>
        <StatusTag status={d.status} />
      </div>
      {d.status === 'Ready' ? (
        <>
          {code ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3">
              <span className="font-mono text-h1 font-semibold tracking-[0.3em] text-fg tabular">{code}</span>
              <Button variant="text" icon={EyeOff} onClick={() => setCode(null)}>
                Hide
              </Button>
            </div>
          ) : (
            <Button tip="Keep it to yourself: never share the code with people who do not live in your room." variant="primary" size="lg" block icon={Eye} onClick={() => reveal.run()} disabled={reveal.pending}>
              Show door code
            </Button>
          )}
          {reveal.error && <Alert type="error" title="Could not show the code">{reveal.error.message}</Alert>}
          <p className="text-sm text-fg-tertiary">
            {t('Changed {date}. It changes whenever someone leaves the room; never share it.', { date: formatDateTime(d.changedAt) })}
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
export function LateCheckInCard() {
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
        notify({ title: 'Late check-in requested', message: t('A manager will decide it. You will be notified.') })
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
        <h2 className="text-h3 font-semibold text-fg">{t('Late check-in')}</h2>
        {r && <StatusTag status={r.status} />}
      </div>
      {r && (
        <>
          <InfoRow icon={Calendar} label="Arrival asked for" value={formatDate(r.requestedFor)} />
          {r.status === 'Approved' && <InfoRow icon={Clock} label="Approved until" value={formatDate(r.deadline)} />}
          {r.status === 'Rejected' && r.decisionReason && <Alert type="warning" title="Not approved">{r.decisionReason}</Alert>}
          {r.status === 'Approved' && <Note>{t('Your balance deadline and your arrival move to the end of that day.')}</Note>}
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
              {(id) => <DatePicker id={id} clearable value={day} maxDate={d.latestDay ?? undefined} onChange={setDay} />}
            </Field>
            <Field label="Document (ticket, letter …)" required error={fields.evidence}>
              {(id) => <FilePicker id={id} size="lg" file={file} onChange={setFile} accept="image/*,application/pdf" placeholder="Choose a photo or PDF" />}
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

/** Compact Check-in status widget placed on the top-right of the page header so it never stretches the vertical layout. */
export function CheckInHeaderWidget({ checkIn }) {
  if (!checkIn) return null
  const done = Boolean(checkIn.checkedInAt)
  return (
    <Tooltip
      touch
      side="bottom"
      align="end"
      title={t('Check-in')}
      label={
        done ? (
          <span>{t('Checked in')}: {formatDate(checkIn.checkedInAt)}</span>
        ) : (
          <div className="flex max-w-68 flex-col gap-1.5 pt-1">
            <div className="flex items-center gap-2 tabular">
              <Calendar size={14} aria-hidden="true" className="shrink-0 text-orange-200" />
              <span>{t('Window')}: {formatDateRange(checkIn.start, checkIn.end)}</span>
            </div>
            {checkIn.deskHours && (
              <div className="flex items-center gap-2">
                <Clock size={14} aria-hidden="true" className="shrink-0 text-orange-200" />
                <span>{t('Desk hours')}: {checkIn.deskHours}</span>
              </div>
            )}
            {checkIn.location && (
              <div className="flex items-center gap-2">
                <MapPin size={14} aria-hidden="true" className="shrink-0 text-orange-200" />
                <span>{t('Where')}: {checkIn.location}</span>
              </div>
            )}
            <p className="border-t border-white/15 pt-1.5 text-white/85">
              {t('Open the CampusStay Android app to show your check-in QR pass.')}
            </p>
          </div>
        )
      }
    >
      <div
        tabIndex={0}
        className="flex cursor-help items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
          {done ? <Calendar size={16} aria-hidden="true" /> : <QrCode size={16} aria-hidden="true" />}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-fg">{t('Check-in')}</span>
            <span className="text-fg-tertiary">·</span>
            <span className="font-medium text-fg-brand tabular">
              {done ? formatDate(checkIn.checkedInAt) : formatDateRange(checkIn.start, checkIn.end)}
            </span>
          </div>
          {!done && checkIn.location && (
            <span className="truncate text-sm text-fg-secondary">
              {checkIn.location} · {t('Bring your QR pass')}
            </span>
          )}
        </div>
      </div>
    </Tooltip>
  )
}

export function RoomQuickLinksCard({ rulesUrl }) {
  return (
    <Card padding="sm" className="flex shrink-0 flex-col divide-y divide-line">
      {rulesUrl && (
        <MoreLink icon={Bed} href={rulesUrl}>
          Dormitory rules
        </MoreLink>
      )}
      <MoreLink icon={Repeat} to="/student/requests/room-change/new">
        Request a room change for next term
      </MoreLink>
      <MoreLink icon={Users} to="/student/requests/swap/new">
        Swap next-term beds with another student
      </MoreLink>
    </Card>
  )
}
