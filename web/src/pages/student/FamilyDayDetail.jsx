import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import qrcode from 'qrcode-generator'
import { Plus, ShieldCheck, Trash2, TriangleAlert, UserPlus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Radio } from '@/components/ui/Choice'
import { QueryState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { StudentPage } from './shared'
import { guestStatusLabel, familyDayStatusLabel } from '@/lib/familyDayStatus'

// SCR-VIS-05 Family Day — Student (ADR-29, contract A-69). The student registers their guests for one time slot
// (within the places left; a guest under the adult age comes with an adult guest); the registration is approved at
// once and every guest gets their own pass (QR) to show at the visitor desk with an identity paper. The student may
// cancel before the time slot starts while no guest came in.
// GET /students/me/family-days/:id → { id, block, title, description, area, status, registrationOpensAt,
//   registrationClosesAt, startsAt, endsAt, maxGuests, adultAge, slots: [{ id, startsAt, endsAt, remaining }],
//   canRegister, registerBlockedBy, registration: { id, status, slotId, slotStartsAt, slotEndsAt, createdAt,
//   cancelledAt, cancelReason, canCancel, guests: [{ id, fullName, relationship, birthYear, status, passToken,
//   checkedInAt, checkedOutAt }] } | null }
// POST /students/me/family-days/:id/registration { slotId, guests: [{ fullName, relationship, birthYear }] }
// POST /students/me/family-days/:id/registration/cancel
// A-70: guests still inside after the time slot are `overdue`; the student confirms they are safe:
// POST /students/me/family-days/:id/registration/safety-confirmation { note? }

const RELATIONSHIPS = ['Father', 'Mother', 'Brother', 'Sister', 'Grandparent', 'Guardian', 'Relative']
const emptyGuest = { fullName: '', relationship: 'Father', birthYear: '' }

function Qr({ text }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    return qr.createSvgTag(5, 2)
  }, [text])
  return <span role="img" aria-label={t('Pass QR code')} className="block size-44 rounded-md bg-white [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

function RegisterForm({ day }) {
  const { notify } = useToast()
  const [slotId, setSlotId] = useState('')
  const [guests, setGuests] = useState([{ ...emptyGuest }])
  const setGuest = (i, key, value) => setGuests((g) => g.map((x, j) => (j === i ? { ...x, [key]: value } : x)))
  const register = useMutation(
    () =>
      api.me.registerFamily(day.id, {
        slotId,
        guests: guests.map((g) => ({ fullName: g.fullName.trim(), relationship: g.relationship, birthYear: Number(g.birthYear) || null })),
      }),
    {
      invalidates: ['my-family-day', 'my-family-days'],
      onSuccess: () => notify({ title: 'Guests registered', message: 'Each guest has their own pass below. Send it to them before the day.' }),
      onError: () => {},
    },
  )
  const fields = register.error?.details?.fields ?? {}
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-fg">{t('Register your guests')}</h2>
      {register.error && !register.error.details?.fields && <Alert type="error" title="Could not register">{register.error.message}</Alert>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium text-fg">{t('Time slot')}</legend>
        {day.slots.map((s) => (
          <Radio
            key={s.id}
            name="slot"
            checked={slotId === s.id}
            disabled={s.remaining === 0}
            onChange={() => setSlotId(s.id)}
            label={`${formatDateTime(s.startsAt)} – ${formatTime(s.endsAt)}`}
            description={s.remaining === 0 ? t('Full') : t('{n} places left', { n: s.remaining })}
          />
        ))}
        {fields.slotId && <p className="text-sm text-error-fg">{fields.slotId}</p>}
      </fieldset>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-fg">{t('Guests (up to {n})', { n: day.maxGuests })}</span>
          <Button size="sm" icon={Plus} disabled={guests.length >= day.maxGuests} onClick={() => setGuests([...guests, { ...emptyGuest }])}>
            Add a guest
          </Button>
        </div>
        {fields.guests && <p className="text-sm text-error-fg">{fields.guests}</p>}
        {guests.map((g, i) => (
          <div key={i} className="grid items-start gap-3 rounded-lg border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Field label="Full name" required error={fields[`guests[${i}].fullName`]}>
              {(id) => <Input id={id} maxLength={100} value={g.fullName} onChange={(e) => setGuest(i, 'fullName', e.target.value)} placeholder="As on the identity paper" />}
            </Field>
            <Field label="Relationship" required error={fields[`guests[${i}].relationship`]}>
              {(id) => <Select id={id} value={g.relationship} onChange={(e) => setGuest(i, 'relationship', e.target.value)} options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))} />}
            </Field>
            <Field label="Year of birth" required error={fields[`guests[${i}].birthYear`]}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={1900} max={new Date().getFullYear()} value={g.birthYear} onChange={(e) => setGuest(i, 'birthYear', e.target.value)} />}
            </Field>
            <IconButton icon={Trash2} className="mt-7" aria-label={t('Remove the guest')} disabled={guests.length === 1} onClick={() => setGuests(guests.filter((_, j) => j !== i))} />
          </div>
        ))}
        <Note>{t('A guest under {age} must come with an adult guest. Guests bring an identity paper; their name is checked at the desk.', { age: day.adultAge })}</Note>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" icon={UserPlus} disabled={register.pending || !slotId} onClick={() => register.run()}>
          {register.pending ? t('Sending…') : t('Register guests')}
        </Button>
      </div>
    </Card>
  )
}

/**
 * Guests still inside after the time slot (A-70): the desk reminds the student, who asks their family to leave through
 * the desk and confirms here that they are safe; the desk checks them out only after that.
 */
function OverdueGuests({ day, registration }) {
  const { notify } = useToast()
  const [note, setNote] = useState('')
  const overdue = registration.guests.filter((g) => g.overdue)
  const waiting = overdue.filter((g) => !g.safetyConfirmedAt)
  const confirm = useMutation(() => api.me.confirmFamilySafety(day.id, { note: note.trim() || null }), {
    invalidates: ['my-family-day', 'my-family-days'],
    onSuccess: () => {
      notify({ title: 'Confirmation sent', message: 'The visitor desk can now check your guests out.' })
      setNote('')
    },
    onError: () => {},
  })
  if (overdue.length === 0) return null
  const names = (list) => list.map((g) => g.fullName).join(', ')
  if (waiting.length === 0) {
    return (
      <Alert type="info" title="You confirmed your guests are safe">
        {t('{names}: confirmed at {time}. The visitor desk checks them out when they leave.', {
          names: names(overdue),
          time: formatTime(overdue.map((g) => g.safetyConfirmedAt).sort().at(-1)),
        })}
      </Alert>
    )
  }
  const reminded = waiting.map((g) => g.remindedAt).filter(Boolean).sort().at(-1)
  return (
    <Card className="flex flex-col gap-3 border-warning bg-warning-bg">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-fg" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 font-semibold text-fg">{t('Your guests are still inside')}</h2>
          <p className="text-base text-fg-secondary">
            {t('The time slot of {names} ended at {time}. Ask them to leave through the visitor desk, then confirm here that they are safe.', {
              names: names(waiting),
              time: formatTime(registration.slotEndsAt),
            })}
          </p>
          {reminded && <p className="text-sm text-fg-secondary">{t('The visitor desk reminded you at {time}.', { time: formatTime(reminded) })}</p>}
        </div>
      </div>
      {confirm.error && <Alert type="error" title="Could not confirm">{confirm.error.message}</Alert>}
      <Field label="Message to the visitor desk" helper="Optional, e.g. where your family is now">
        {(id) => <Textarea id={id} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" icon={ShieldCheck} disabled={confirm.pending} onClick={() => confirm.run()}>
          {confirm.pending ? t('Sending…') : t('My family is safe')}
        </Button>
      </div>
    </Card>
  )
}

function MyRegistration({ day, registration }) {
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const cancel = useMutation(() => api.me.cancelFamily(day.id), {
    invalidates: ['my-family-day', 'my-family-days'],
    onSuccess: () => {
      notify({ title: 'Registration cancelled', message: 'The passes no longer work and the places are free again.' })
      setConfirming(false)
    },
    onError: () => {},
  })
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{t('Your guests')}</h2>
          <span className="text-sm text-fg-secondary">
            {t('Time slot {slot}', { slot: `${formatDateTime(registration.slotStartsAt)} – ${formatTime(registration.slotEndsAt)}` })}
          </span>
        </div>
        <StatusTag status={registration.status} />
      </div>
      {registration.cancelReason && <Alert type="warning" title="Cancelled">{registration.cancelReason}</Alert>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {registration.guests.map((g) => (
          <li key={g.id} className="flex flex-col items-center gap-2 rounded-lg border border-line p-4 text-center">
            {g.passToken ? <Qr text={g.passToken} /> : null}
            <span className="text-base font-semibold text-fg">{g.fullName}</span>
            <span className="text-sm text-fg-secondary">
              {tr(g.relationship)} · {g.birthYear}
            </span>
            <StatusTag status={g.overdue ? 'Overdue' : g.status}>{g.overdue ? t('Overdue') : guestStatusLabel(g.status)}</StatusTag>
            {g.overdue && g.safetyConfirmedAt && <span className="text-sm text-fg-secondary">{t('Confirmed safe at {time}', { time: formatTime(g.safetyConfirmedAt) })}</span>}
            {g.checkedInAt && (
              <span className="text-sm text-fg-secondary">
                {[t('In {time}', { time: formatTime(g.checkedInAt) }), g.checkedOutAt && t('Out {time}', { time: formatTime(g.checkedOutAt) })].filter(Boolean).join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>
      {registration.status === 'Approved' && (
        <Note>{t('Send each guest a photo of their own pass. A pass lets one guest in once, during this time slot.')}</Note>
      )}
      {registration.canCancel && (
        <div className="flex justify-end">
          <Button variant="danger-text" onClick={() => setConfirming(true)}>
            Cancel registration
          </Button>
        </div>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Cancel your registration?"
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Back</Button>
            <Button variant="danger" disabled={cancel.pending} onClick={() => cancel.run()}>
              {cancel.pending ? t('Saving…') : t('Cancel registration')}
            </Button>
          </>
        }
      >
        {cancel.error && <Alert type="error" title="Could not cancel">{cancel.error.message}</Alert>}
        <p className="text-base text-fg-secondary">{t('Every pass of your guests stops working. You can register again while registration is open.')}</p>
      </Modal>
    </Card>
  )
}

export default function FamilyDayDetail() {
  const { id } = useParams()
  const query = useQuery(['my-family-day', id], ({ signal }) => api.me.familyDay(id, { signal }))
  const day = query.data
  return (
    <StudentPage
      breadcrumb={[{ label: 'Family Days', to: '/student/family-days' }, { label: day?.title ?? '…' }]}
      title={day?.title ?? 'Family Day'}
      badge={day && <StatusTag status={day.status}>{familyDayStatusLabel(day.status)}</StatusTag>}
      description={day ? t('Block {block} · {area}', { block: day.block, area: day.area }) : undefined}
      width="lg:max-w-3xl"
    >
      <QueryState query={query} isEmpty={() => false}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-2">
              <p className="text-base text-fg">
                {t('{date}, {from}–{to}', { date: formatDateTime(d.startsAt), from: formatTime(d.startsAt), to: formatTime(d.endsAt) })}
              </p>
              <p className="text-sm text-fg-secondary">
                {t('Registration: {opens} – {closes}', { opens: formatDateTime(d.registrationOpensAt), closes: formatDateTime(d.registrationClosesAt) })}
              </p>
              {d.description && <p className="whitespace-pre-line text-base text-fg-secondary">{d.description}</p>}
              <Note>{t('Guests stay in the common area of the Block. They may not enter the Rooms or stay overnight.')}</Note>
            </Card>
            {d.registration && <OverdueGuests day={d} registration={d.registration} />}
            {d.registration && <MyRegistration day={d} registration={d.registration} />}
            {d.canRegister ? <RegisterForm day={d} /> : !d.registration?.status?.startsWith('Approved') && d.registerBlockedBy && <Alert type="info" title="Registration">{d.registerBlockedBy}</Alert>}
          </div>
        )}
      </QueryState>
    </StudentPage>
  )
}
