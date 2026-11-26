import { useState } from 'react'
import { Link } from 'react-router'
import { BedDouble, Camera, Check, Droplets, LogOut, Smartphone, Users, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, CardHeader } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { FurnitureCharges, PhotoStrip } from './CheckInInventory'
import { StudentPage } from './shared'

// Student › My room › Check-out: the check-out period, the declaration of every item of the Bed and every shared item
// (Good, or worn, damaged or missing with a note), the meter readings, submitting it, then Staff's check and the
// charges. Photos are taken in the CampusStay app only (as for the check-in inventory): the web shows them.
// GET /students/me/allocation · GET /students/me/furniture → { items: [{ itemId, …, reportedCondition, reportedNote,
//   reportedPhotos }] } · PUT /students/me/furniture/report { itemId, condition, note }
// GET /students/me/check-out → { saved, claims, studentMeters { electricity, water, photos }, declarationSubmittedAt, … }
// PUT /students/me/check-out/meters { electricity, water } · POST /students/me/check-out/submit

/** The check-out period: when the stay ends, the day to check out by, and why. */
function Period({ allocation: a }) {
  const termination = a?.termination
  const next = a?.nextTerm
  const by = termination?.moveOutBy ?? next?.window?.checkOutBy ?? next?.checkOutBy
  const leaving = !!termination || next?.state === 'Not continuing'
  const checkedOut = termination?.status === 'Checked out'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-fg-brand">
          <LogOut size={20} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-h3 font-semibold text-fg">{t('Check-out period')}</h2>
          {a?.allocation?.room && <span className="text-sm text-fg-secondary">{t('Room {room} · Bed {bed}', { room: a.allocation.room, bed: a.allocation.bed })}</span>}
        </div>
        <Tag tone={checkedOut ? 'success' : leaving ? 'warning' : 'neutral'}>{checkedOut ? 'Checked out' : leaving ? 'Check-out period' : 'Not yet'}</Tag>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        {a?.term?.stayEnd && (
          <div className="rounded-lg bg-subtle/60 px-3 py-2">
            <dt className="text-xs text-fg-secondary">{t('Stay ends')}</dt>
            <dd className="font-medium text-fg">{formatDate(a.term.stayEnd)}</dd>
          </div>
        )}
        {by && !checkedOut && (
          <div className="rounded-lg bg-subtle/60 px-3 py-2">
            <dt className="text-xs text-fg-secondary">{t('Check out at the desk by')}</dt>
            <dd className="font-medium text-fg">{formatDate(by)}</dd>
          </div>
        )}
        {(termination || next?.endReason) && (
          <div className="rounded-lg bg-subtle/60 px-3 py-2">
            <dt className="text-xs text-fg-secondary">{t('Reason')}</dt>
            <dd className="font-medium text-fg">{[tr(termination?.reason ?? next?.endReason), termination?.note].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
      </dl>
      {!leaving && !checkedOut && <p className="text-sm text-fg-secondary">{t('Your check-out period has not started. You can still declare an item that got worse during your stay.')}</p>}
    </Card>
  )
}

/** Declare → Staff check → charges and deposit → checked out. */
function Steps({ charges: c, checkedOut }) {
  const submitted = !!c?.declarationSubmittedAt
  const saved = !!c?.saved
  const settled = !!c?.agreedAt || checkedOut
  const steps = [
    { title: t('Your check-out declaration'), at: c?.declarationSubmittedAt, done: submitted || saved || checkedOut },
    { title: t('Staff check at the desk'), done: saved || checkedOut },
    { title: t('Charges and deposit settlement'), at: c?.agreedAt, done: settled },
    { title: t('Checked out'), done: checkedOut },
  ]
  const current = steps.findIndex((s) => !s.done)
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title="Check-out steps" />
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className={cx('flex items-start gap-2 rounded-lg border px-3 py-2', s.done ? 'border-success/40 bg-success-bg/40' : i === current ? 'border-primary/50 bg-brand-subtle/40' : 'border-line')}>
            <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.done ? 'bg-success text-white' : i === current ? 'bg-primary text-white' : 'bg-subtle text-fg-secondary')}>
              {s.done ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : i + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-fg">{s.title}</span>
              {s.at && <span className="text-xs text-fg-tertiary">{formatDateTime(s.at)}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** The photos of an item, or where to take them: the app. */
function Photos({ photos }) {
  if (photos?.length) return <PhotoStrip photos={photos} size="sm" />
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-error-bg px-2 py-0.5 text-xs font-medium text-error-fg">
      <Camera size={12} aria-hidden="true" />
      {t('No photo yet')}
    </span>
  )
}

/** Every item of the Bed and the shared items: Good by default; another condition needs a note and a photo. */
function Declaration({ items, levels, locked }) {
  const { notify, notifyError } = useToast()
  const reportable = items.filter((i) => i.itemId && i.reportable !== false)
  const base = Object.fromEntries(reportable.map((i) => [i.itemId, { condition: i.reportedCondition ?? 'Good', note: i.reportedNote ?? '' }]))
  const [answers, setAnswers] = useState(base)
  const [shown, setShown] = useState(!locked)
  const changed = reportable.filter((i) => {
    const a = answers[i.itemId]
    const b = base[i.itemId]
    return a.condition !== b.condition || (a.condition !== 'Good' && a.note.trim() !== b.note)
  })
  const blocked = changed.filter((i) => answers[i.itemId].condition !== 'Good' && !i.reportedPhotos?.length)
  const save = useMutation(
    async () => {
      for (const i of changed) {
        const a = answers[i.itemId]
        await api.me.reportFurniture({ itemId: i.itemId, condition: a.condition, note: a.condition !== 'Good' && a.note.trim() ? a.note.trim() : undefined })
      }
    },
    {
      invalidates: ['my-furniture', 'check-out-furniture'],
      onSuccess: () => notify({ title: 'Declaration saved', message: 'Staff check it at the desk.' }),
      onError: (e) => notifyError(e, 'Could not save the declaration'),
    },
  )
  const groups = [
    { key: 'personal', icon: BedDouble, title: t('Your Bed'), items: reportable.filter((i) => i.personal) },
    { key: 'shared', icon: Users, title: t('Shared by the Room'), items: reportable.filter((i) => !i.personal) },
  ].filter((g) => g.items.length)
  const photographed = reportable.filter((i) => i.reportedPhotos?.length).length

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title="Check-out furniture report"
        description={locked ? 'Your declaration is submitted and kept with the check-out record.' : 'Every item needs a photo, taken in the CampusStay app. Leave it Good, or choose its condition and add a note.'}
        actions={<Tag tone={photographed === reportable.length ? 'success' : 'warning'}>{t('{n}/{total} with a photo', { n: photographed, total: reportable.length })}</Tag>}
      />
      {locked && !shown && (
        <div>
          <Button size="sm" onClick={() => setShown(true)}>
            View the submitted declaration
          </Button>
        </div>
      )}
      {shown && groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg-secondary">
            <g.icon size={15} aria-hidden="true" />
            {g.title}
          </h3>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {g.items.map((i) => {
              const a = answers[i.itemId]
              return (
                <li key={i.itemId} className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-medium text-fg">{typeName(i)}</span>
                      <span className="truncate font-mono text-sm text-fg-tertiary">{i.assetCode}</span>
                    </span>
                    <Photos photos={i.reportedPhotos} />
                    {locked ? (
                      <Tag tone={conditionTone[a.condition] ?? 'neutral'}>{conditionName(a.condition, levels)}</Tag>
                    ) : (
                      <Select
                        wrapperClassName="w-44 shrink-0"
                        aria-label={t('Condition of {item}', { item: i.assetCode })}
                        value={a.condition}
                        className={cx(a.condition !== 'Good' && 'border-warning/60')}
                        onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], condition: e.target.value } }))}
                      >
                        {conditionOptions(levels).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                  {a.condition !== 'Good' &&
                    (locked ? (
                      a.note && <p className="text-sm text-fg-secondary">{a.note}</p>
                    ) : (
                      <Input
                        aria-label={t('Note for {item}', { item: i.assetCode })}
                        placeholder={t('What do you see?')}
                        maxLength={300}
                        value={a.note}
                        onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], note: e.target.value } }))}
                      />
                    ))}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {!locked && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {blocked.length > 0 && <span className="text-sm text-error-fg">{t('Take a photo in the app of {n} declared items first.', { n: blocked.length })}</span>}
          <Button variant="primary" disabled={!changed.length || blocked.length > 0 || save.pending} onClick={() => save.run()}>
            {changed.length ? t('Save declaration ({n})', { n: changed.length }) : t('Declaration saved')}
          </Button>
        </div>
      )}
    </Card>
  )
}

/** The meter readings the student enters, with the photos of the meters taken in the app. */
function Meters({ data, locked }) {
  const { notify, notifyError } = useToast()
  const [electricity, setElectricity] = useState(data?.electricity ?? '')
  const [water, setWater] = useState(data?.water ?? '')
  const photos = data?.photos ?? []
  const dirty = String(electricity) !== String(data?.electricity ?? '') || String(water) !== String(data?.water ?? '')
  const save = useMutation(() => api.checkOutFurniture.saveMeters({ electricity: Number(electricity), water: Number(water) }), {
    invalidates: ['check-out-furniture'],
    onSuccess: () => notify({ title: 'Meter readings saved' }),
    onError: (e) => notifyError(e, 'Could not save the meter readings'),
  })
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title="Meter readings at check-out" description="Read the Room's meters before you leave. Staff compare them with their own reading at the desk." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={<span className="inline-flex items-center gap-1"><Zap size={14} aria-hidden="true" className="text-warning-fg" />{t('Electricity (kWh)')}</span>} required>
          <Input type="number" min="0" step="0.1" inputMode="decimal" disabled={locked} value={electricity} onChange={(e) => setElectricity(e.target.value)} />
        </Field>
        <Field label={<span className="inline-flex items-center gap-1"><Droplets size={14} aria-hidden="true" className="text-info-fg" />{t('Water (m³)')}</span>} required>
          <Input type="number" min="0" step="0.1" inputMode="decimal" disabled={locked} value={water} onChange={(e) => setWater(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-fg-secondary">{t('Photos of the meters')}</span>
        <Photos photos={photos} />
      </div>
      {!locked && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!photos.length && <span className="text-sm text-error-fg">{t('Take a photo of the meters in the app first.')}</span>}
          <Button variant="primary" disabled={!dirty || electricity === '' || water === '' || !photos.length || save.pending} onClick={() => save.run()}>
            {dirty ? t('Save readings') : t('Readings saved')}
          </Button>
        </div>
      )}
    </Card>
  )
}

/** Before the declaration is submitted: it is done in the CampusStay app (photos need the phone's camera). */
function DeclareInTheApp() {
  const steps = [
    t('Photograph every item of your Bed and the shared items'),
    t('Choose the condition of anything not Good and add a note'),
    t('Enter the meter readings with a photo of the meters'),
    t('Submit the check-out declaration'),
  ]
  return (
    <Card className="flex flex-col gap-4 border-primary/40">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-fg-brand">
          <Smartphone size={22} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-h3 font-semibold text-fg">{t('Declare your check-out in the CampusStay app')}</h2>
          <p className="text-sm text-fg-secondary">
            {t('The declaration needs photos taken with your phone, so it is made in the app. Once you submit it there, it shows here.')}
          </p>
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((text, n) => (
          <li key={text} className="flex items-center gap-3 rounded-lg bg-subtle/60 px-3 py-2 text-sm text-fg">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{n + 1}</span>
            {text}
          </li>
        ))}
      </ol>
      <p className="text-sm text-fg-tertiary">
        {t('No app yet? Install CampusStay on your Android phone and sign in with this account, then open Check-out.')}
      </p>
    </Card>
  )
}

function CheckOutView({ allocation, furniture, charges: c }) {
  const termination = allocation?.termination
  const checkedOut = termination?.status === 'Checked out' || !!c?.checkedOutAt
  const submitted = !!c?.declarationSubmittedAt
  // What the student declared shows once it is submitted in the app (or Staff have checked the Room).
  const shown = !!c?.saved || checkedOut || submitted
  const items = furniture?.items ?? []
  const refund = c?.settlement?.refund
  return (
    <div className="flex flex-col gap-4">
      {checkedOut && (
        <Alert type="success" title={c?.checkedOutAt ? t('Check-out completed · {date}', { date: formatDateTime(c.checkedOutAt) }) : t('Check-out completed')}>
          {refund > 0 ? (
            t('{amount} of your Utility Deposit is refunded to your refund account.', { amount: formatCurrency(refund) })
          ) : refund < 0 ? (
            <>
              {t('You still owe {amount}: it is invoiced to you.', { amount: formatCurrency(-refund) })}{' '}
              <Link to="/student/invoices" className="font-medium text-fg-brand underline">
                {t('See Payments')}
              </Link>
            </>
          ) : (
            t('Thank you for staying with us.')
          )}
        </Alert>
      )}
      <Period allocation={allocation} />
      <Steps charges={c} checkedOut={checkedOut} />
      {!shown && <DeclareInTheApp />}
      {submitted && !c?.saved && !checkedOut && (
        <Alert type="success" title="Declaration submitted">
          {t('Submitted {date}. Come to the desk before the deadline with your keys; you get a notification when Staff record the charges.', { date: formatDateTime(c.declarationSubmittedAt) })}
        </Alert>
      )}
      <FurnitureCharges />
      {shown && items.length > 0 && <Declaration key={JSON.stringify(items.map((i) => [i.itemId, i.reportedCondition, i.reportedNote, i.reportedPhotos?.length]))} items={items} levels={c?.conditionLevels} locked />}
      {shown && c?.studentMeters?.electricity != null && <Meters key={`${c.studentMeters.electricity}-${c.studentMeters.water}`} data={c.studentMeters} locked />}
    </div>
  )
}

export default function CheckOut() {
  const { term } = useSession()
  const allocation = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
  const furniture = useQuery(['my-furniture'], ({ signal }) => api.me.furniture(undefined, { signal }))
  const charges = useQuery(['check-out-furniture', 'mine'], ({ signal }) => api.checkOutFurniture.mine(undefined, { signal }))
  return (
    <StudentPage breadcrumb={[{ label: 'My room', to: '/student/room' }, { label: 'Check-out' }]} title="Check-out" width="max-w-5xl">
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto [&>*]:shrink-0">
        <QueryState query={allocation} isEmpty={() => false}>
          {(a) =>
            !a?.allocation && !charges.data ? (
              <Card>
                <EmptyBlock icon={LogOut} title="No stay to check out of">
                  Check-out opens when your stay ends or your contract is terminated.
                </EmptyBlock>
              </Card>
            ) : (
              <CheckOutView allocation={a} furniture={furniture.data} charges={charges.data} />
            )
          }
        </QueryState>
      </div>
    </StudentPage>
  )
}
