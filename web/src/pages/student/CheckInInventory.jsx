import { useState } from 'react'
import { Camera, CircleCheck, ClipboardList, KeyRound, Printer, Trash2 } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Card, CardHeader } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { StudentPage } from './shared'

// Student › My room › Check-in inventory. The student never sees what the dormitory recorded about the Room.
// GET /students/me/handover → { id, status: Not needed | Waiting | Ready | Draft | Submitted | Verifying | Final, room, bed,
//   checks: [{ key, label, passed }], openedAt, dueAt, submittedAt, visitAt, toAgree, finalizedAt, utilityFrom, source,
//   electricity, water, staffElectricity, staffWater, meterPhotos, items: [{ itemId, assetCode, type, typeVi, bed, personal,
//   condition, note, roommateCondition, staffCondition, staffNote, photos }], photosRequired, maxPhotos, studentComment,
//   lateAllowed, lateNote }
// POST /students/me/handover/start · PUT /students/me/handover { items, electricity, water } · POST …/photos (multipart)
// POST …/submit · POST …/agree { comment } · POST …/late { note }
// GET /students/me/check-out → { items, total, studentPresent, agreedAt, saved, claims } · POST …/check-out/agree
// POST /students/me/damage-claims/:id { acknowledge }


function PhotoStrip({ photos, onRemove }) {
  if (!photos?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((p) => (
        <div key={p.id} className="relative size-14 overflow-hidden rounded-md border border-line">
          <img src={p.url} alt={t('Photo')} className="size-full object-cover" />
          {onRemove && (
            <IconButton icon={Trash2} size="sm" aria-label={t('Remove photo')} className="absolute top-0.5 right-0.5 bg-surface" onClick={() => onRemove(p.id)} />
          )}
        </div>
      ))}
    </div>
  )
}

function PhotoButton({ itemId, onAdded }) {
  const { notifyError } = useToast()
  const upload = useMutation(
    (file) => {
      const form = new FormData()
      form.append('photo', file)
      if (itemId) form.append('itemId', itemId)
      return api.handover.addPhoto(form)
    },
    { invalidates: ['handover'], onSuccess: onAdded, onError: (e) => notifyError(e, 'Could not add the photo') },
  )
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-fg-brand">
      <Camera size={16} aria-hidden="true" />
      {upload.pending ? t('Uploading…') : t('Add photo')}
      <input type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && upload.run(e.target.files[0])} />
    </label>
  )
}

function Start({ data }) {
  const { notify, notifyError } = useToast()
  const [open, setOpen] = useState(false)
  const start = useMutation(() => api.handover.start(), {
    invalidates: ['handover', 'allocation', 'door-code'],
    onSuccess: () => notify({ title: 'Inventory started', message: 'Your door code is on My room. File the inventory before the deadline.' }),
    onError: (e) => notifyError(e, 'Could not start the inventory'),
  })
  const ready = data.status === 'Ready'
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader
        title="Receive your Room"
        description="At the Room, start the check-in inventory: you receive the door code and record the condition of your Bed's items, the shared items and the meters."
      />
      <ul className="flex flex-col gap-1.5">
        {data.checks.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-base">
            <Tag tone={c.passed ? 'success' : 'neutral'}>{c.passed ? 'Done' : 'Waiting'}</Tag>
            <span className={c.passed ? 'text-fg' : 'text-fg-secondary'}>{tr(c.label)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button variant="primary" icon={KeyRound} disabled={!ready || start.pending} onClick={() => setOpen(true)}>
          Start check-in inventory
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Start the check-in inventory?"
        description="Do it when you are at the Room. You receive the door code now, and you have 48 hours to file the inventory: after that the Room's recorded condition is used and you can no longer report damage that was already there."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Not yet</Button>
            <Button variant="primary" disabled={start.pending} onClick={() => start.run().then(() => setOpen(false))}>
              I am at the Room, start
            </Button>
          </>
        }
      />
    </Card>
  )
}

function Form({ data }) {
  const { notify, notifyError } = useToast()
  const [answers, setAnswers] = useState(Object.fromEntries(data.items.map((i) => [i.itemId, { condition: i.condition ?? '', note: i.note ?? '' }])))
  const [electricity, setElectricity] = useState(data.electricity ?? '')
  const [water, setWater] = useState(data.water ?? '')
  const body = () => ({
    items: Object.entries(answers).filter(([, a]) => a.condition).map(([itemId, a]) => ({ itemId, condition: a.condition, note: a.note || undefined })),
    electricity: electricity === '' ? undefined : Number(electricity),
    water: water === '' ? undefined : Number(water),
  })
  const save = useMutation(() => api.handover.save(body()), {
    invalidates: ['handover'],
    onSuccess: () => notify({ title: 'Saved', message: 'You can continue later before the deadline.' }),
    onError: (e) => notifyError(e, 'Could not save'),
  })
  const submit = useMutation(() => api.handover.submit(body()), {
    invalidates: ['handover', 'allocation'],
    onSuccess: (v) =>
      notify({
        title: 'Inventory submitted',
        message: v?.status === 'Final' ? 'It matches the Room: it is final.' : 'Staff look at it; they may come to check the Room with you.',
      }),
    onError: (e) => notifyError(e, 'Could not submit the inventory'),
  })
  const remove = useMutation((id) => api.handover.removePhoto(id), { invalidates: ['handover'], onError: (e) => notifyError(e, 'Could not remove the photo') })
  const answered = Object.values(answers).filter((a) => a.condition).length

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={t('Check-in inventory · Room {room}', { room: data.room })}
        description={t('Due {date}. {n} of {total} items answered.', { date: formatDateTime(data.dueAt), n: answered, total: data.items.length })}
      />
      <ul className="flex flex-col divide-y divide-line">
        {data.items.map((i) => {
          const a = answers[i.itemId]
          return (
            <li key={i.itemId} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-base font-medium text-fg">{typeName(i)}</span>
                  <span className="text-sm text-fg-secondary">
                    {i.assetCode} · {i.personal ? t('Your Bed {bed}', { bed: i.bed }) : t('Shared')}
                  </span>
                </div>
                <Select
                  wrapperClassName="w-40"
                  aria-label={t('Condition of {item}', { item: i.assetCode })}
                  value={a.condition}
                  onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], condition: e.target.value } }))}
                  options={[{ value: '', label: 'Choose' }, ...conditionOptions()]}
                />
              </div>
              {i.roommateCondition && (
                <p className="text-sm text-fg-secondary">
                  {t('Your roommate recorded it as {condition}. Choose the same if it is right, or what you see.', { condition: conditionName(i.roommateCondition) })}
                </p>
              )}
              {(a.condition === 'Damaged' || a.condition === 'Missing' || a.condition === 'Worn') && (
                <Input aria-label={t('Note for {item}', { item: i.assetCode })} placeholder={t('What do you see?')} value={a.note} onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], note: e.target.value } }))} />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <PhotoStrip photos={i.photos} onRemove={(id) => remove.run(id)} />
                {i.photos.length < data.maxPhotos && <PhotoButton itemId={i.itemId} />}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className="text-base font-medium text-fg">{t('Meters of the Room')}</span>
        <div className="flex flex-wrap gap-3">
          <Field label="Electricity (kWh)" required className="w-44">
            <Input type="number" min="0" step="0.1" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
          </Field>
          <Field label="Water (m³)" required className="w-44">
            <Input type="number" min="0" step="0.1" value={water} onChange={(e) => setWater(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PhotoStrip photos={data.meterPhotos} onRemove={(id) => remove.run(id)} />
          {data.meterPhotos.length < data.maxPhotos && <PhotoButton />}
        </div>
        <p className="text-sm text-fg-tertiary">
          {data.photosRequired ? t('Photos are required for the meters and for Damaged or Missing items.') : t('Photos are optional but help if something is damaged.')}
        </p>
      </div>
      <Alert type="info" title="Fill it in at the Room">
        Your answers are compared with the Room's record. A large difference brings Staff to the Room to check it with you, and the inventory you make together is the one that counts.
      </Alert>
      <div className="flex justify-end gap-2">
        <Button onClick={() => save.run()} disabled={save.pending}>
          Save draft
        </Button>
        <Button variant="primary" onClick={() => submit.run()} disabled={submit.pending}>
          Submit inventory
        </Button>
      </div>
    </Card>
  )
}

function Summary({ data }) {
  const { notify, notifyError } = useToast()
  const [comment, setComment] = useState('')
  const [late, setLate] = useState('')
  const agree = useMutation(() => api.handover.agree({ comment: comment || undefined }), {
    invalidates: ['handover', 'allocation'],
    onSuccess: () => notify({ title: 'Inventory final', message: 'Utility is counted from the meters recorded with Staff.' }),
    onError: (e) => notifyError(e, 'Could not agree'),
  })
  const sendLate = useMutation(() => api.handover.late({ note: late }), {
    invalidates: ['handover'],
    onSuccess: () => notify({ title: 'Late report sent', message: 'Staff decide whether it was there before you.' }),
    onError: (e) => notifyError(e, 'Could not send the late report'),
  })
  const tone = data.status === 'Final' ? 'success' : 'info'
  // Staff's answers are shown only after a Room visit (the API sends them once Staff recorded what they found).
  const visited = data.staffElectricity != null || data.items.some((i) => i.staffCondition)
  const steps = [
    { label: 'Started (door code received)', at: data.openedAt },
    { label: 'Submitted', at: data.submittedAt },
    { label: 'Room visit with Staff', at: data.visitAt },
    { label: 'Final', at: data.finalizedAt },
  ].filter((s) => s.at)
  return (
    <Card className="flex flex-col gap-4 print:border-0 print:p-0">
      <CardHeader
        title={t('Check-in inventory · Room {room}', { room: data.room })}
        actions={
          <div className="flex items-center gap-2">
            <Tag tone={tone}>{data.status}</Tag>
            <Button size="sm" icon={Printer} onClick={() => window.print()} className="print:hidden" tip="Print it or save it as PDF to show Staff.">
              Print
            </Button>
          </div>
        }
        description={
          data.status === 'Final'
            ? t('Recorded {how} on {date}. Utility is counted from {from}.', { how: t(data.source), date: formatDateTime(data.finalizedAt), from: formatDateTime(data.utilityFrom) })
            : data.status === 'Verifying'
              ? data.toAgree
                ? t('Staff recorded what they found in the Room. Read it and agree.')
                : t('Staff will check the Room with you{when}.', { when: data.visitAt ? ` ${formatDateTime(data.visitAt)}` : '' })
              : t('Submitted {date}. Staff are looking at it.', { date: formatDateTime(data.submittedAt) })
        }
      />
      {steps.length > 0 && (
        <ol className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-subtle/50 px-4 py-3">
          {steps.map((s) => (
            <li key={s.label} className="flex flex-col">
              <span className="text-xs text-fg-secondary">{t(s.label)}</span>
              <span className="text-sm font-medium text-fg tabular">{formatDateTime(s.at)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className={cx('grid gap-2 border-b border-line bg-subtle/60 px-4 py-2 text-xs font-semibold text-fg-secondary', visited ? 'grid-cols-[minmax(0,1fr)_7rem_7rem]' : 'grid-cols-[minmax(0,1fr)_7rem]')}>
          <span>{t('Item')}</span>
          <span>{t('You recorded')}</span>
          {visited && <span>{t('Checked with Staff')}</span>}
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {data.items.map((i) => (
            <li key={i.itemId} className="flex flex-col gap-1.5 px-4 py-2.5">
              <div className={cx('grid items-center gap-2', visited ? 'grid-cols-[minmax(0,1fr)_7rem_7rem]' : 'grid-cols-[minmax(0,1fr)_7rem]')}>
                <span className="min-w-0 text-base text-fg">
                  {typeName(i)}{' '}
                  <span className="text-sm text-fg-secondary">
                    · {i.assetCode} · {i.personal ? t('Your Bed {bed}', { bed: i.bed }) : t('Shared')}
                  </span>
                </span>
                <span>{i.condition ? <Tag tone={conditionTone[i.condition] ?? 'neutral'}>{conditionName(i.condition)}</Tag> : <span className="text-fg-tertiary">—</span>}</span>
                {visited && (
                  <span>{i.staffCondition ? <Tag tone={conditionTone[i.staffCondition] ?? 'neutral'}>{conditionName(i.staffCondition)}</Tag> : <span className="text-fg-tertiary">—</span>}</span>
                )}
              </div>
              {(i.note || i.staffNote) && (
                <p className="text-sm text-fg-secondary">
                  {[i.note && t('Your note: {note}', { note: i.note }), i.staffNote && t('Staff: {note}', { note: i.staffNote })].filter(Boolean).join(' · ')}
                </p>
              )}
              {i.photos?.length > 0 ? <PhotoStrip photos={i.photos} /> : <span className="text-xs text-fg-tertiary">{t('No photo')}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-base font-medium text-fg">{t('Meters of the Room')}</span>
        <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-lg bg-subtle/60 px-3 py-2">
            <dt className="text-xs text-fg-secondary">{t('Electricity (kWh)')}</dt>
            <dd className="text-base font-semibold text-fg tabular">{data.electricity ?? '—'}</dd>
            {visited && data.staffElectricity != null && <dd className="text-xs text-fg-secondary">{t('Checked with Staff: {value}', { value: data.staffElectricity })}</dd>}
          </div>
          <div className="rounded-lg bg-subtle/60 px-3 py-2">
            <dt className="text-xs text-fg-secondary">{t('Water (m³)')}</dt>
            <dd className="text-base font-semibold text-fg tabular">{data.water ?? '—'}</dd>
            {visited && data.staffWater != null && <dd className="text-xs text-fg-secondary">{t('Checked with Staff: {value}', { value: data.staffWater })}</dd>}
          </div>
        </dl>
        {data.meterPhotos?.length > 0 ? <PhotoStrip photos={data.meterPhotos} /> : <span className="text-xs text-fg-tertiary">{t('No photo of the meters')}</span>}
      </div>
      {data.toAgree && (
        <div className="flex flex-col gap-2">
          <Field label="Comment (optional)" hint="If you still see something differently, write it here: it is kept with the inventory and read at check-out.">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" icon={CircleCheck} onClick={() => agree.run()} disabled={agree.pending}>
              {comment.trim() ? 'Agree with my comment' : 'Agree'}
            </Button>
          </div>
        </div>
      )}
      {data.lateAllowed && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Field label="Report something you found late" hint="The deadline passed, so the Room's record is used. Staff decide whether it was there before you.">
            <Textarea rows={2} value={late} onChange={(e) => setLate(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => sendLate.run()} disabled={!late.trim() || sendLate.pending}>
              Send late report
            </Button>
          </div>
        </div>
      )}
      {data.lateNote && <Alert type="info" title="Your late report">{data.lateNote}</Alert>}
      {data.studentComment && <Alert type="info" title="Your comment">{data.studentComment}</Alert>}
    </Card>
  )
}

function FurnitureCharges() {
  const { notify, notifyError } = useToast()
  const query = useQuery(['check-out-furniture', 'mine'], ({ signal }) => api.checkOutFurniture.mine(undefined, { signal }))
  const agree = useMutation(() => api.checkOutFurniture.agree(), {
    invalidates: ['check-out-furniture'],
    onSuccess: () => notify({ title: 'Agreed', message: 'Staff can complete your check-out.' }),
    onError: (e) => notifyError(e, 'Could not agree'),
  })
  const answer = useMutation((id, acknowledge) => api.checkOutFurniture.answerClaim(id, { acknowledge }), {
    invalidates: ['check-out-furniture'],
    onSuccess: (_, __, acknowledge) => notify({ title: acknowledge ? 'Damage confirmed' : 'Damage declined', message: acknowledge ? 'It is charged at check-out.' : 'You are not charged for it.' }),
    onError: (e) => notifyError(e, 'Could not answer'),
  })
  const d = query.data
  if (!d) return null
  const pending = d.claims?.filter((c) => c.status === 'Pending') ?? []
  if (!d.saved && !pending.length) return null
  const s = d.settlement
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title="Furniture charges"
        description="Only what got worse while you lived here is charged; items that were already damaged and normal wear are not."
      />
      {pending.map((c) => (
        <Alert key={c.id} type="warning" title={t('Did you damage {item}?', { item: `${c.type} ${c.assetCode}` })}>
          <div className="flex flex-col gap-2">
            <span>{t('Staff recorded it as {condition}. If it was you, confirm by {date}: {amount} is charged at check-out. Otherwise decline: nobody is charged.', { condition: conditionName(c.condition), date: formatDateTime(c.dueAt), amount: formatCurrency(c.amount) })}</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => answer.run(c.id, false)} disabled={answer.pending}>
                Decline
              </Button>
              <Button size="sm" variant="primary" onClick={() => answer.run(c.id, true)} disabled={answer.pending}>
                Confirm
              </Button>
            </div>
          </div>
        </Alert>
      ))}
      {d.saved && (
        <>
          {(d.electricity != null || d.water != null) && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-fg">{t('1. Final meter reading')}</span>
              <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
                <div className="rounded-lg bg-subtle/60 px-3 py-2">
                  <dt className="text-xs text-fg-secondary">{t('Electricity (kWh)')}</dt>
                  <dd className="text-base font-semibold text-fg tabular">{d.electricity ?? '—'}</dd>
                </div>
                <div className="rounded-lg bg-subtle/60 px-3 py-2">
                  <dt className="text-xs text-fg-secondary">{t('Water (m³)')}</dt>
                  <dd className="text-base font-semibold text-fg tabular">{d.water ?? '—'}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[minmax(0,1.4fr)_8rem_8rem_7rem] items-center gap-2 border-b border-line bg-subtle/60 px-3 py-2 text-xs font-semibold text-fg-secondary">
              <span>{t('Item')}</span>
              <span>{t('Condition')}</span>
              <span className="text-right">{t('Real price')} · %</span>
              <span className="text-right">{t('Charge')}</span>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {d.items.map((i) => (
                <li key={i.itemId} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_8rem_8rem_7rem] items-center gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-fg">{typeName(i)}</span>
                      <span className="truncate font-mono text-xs text-fg-tertiary">
                        {i.assetCode} · {i.personal ? t('Your Bed {bed}', { bed: i.bed }) : t('Shared')}
                      </span>
                    </div>
                    <span className="text-xs text-fg-secondary">
                      {conditionName(i.atCheckIn ?? 'Good')} →{' '}
                      <Tag tone={conditionTone[i.atCheckOut] ?? 'neutral'}>{i.atCheckOut ? conditionName(i.atCheckOut) : '—'}</Tag>
                    </span>
                    <span className="text-right font-mono text-xs text-fg-secondary tabular">
                      {formatCurrency(i.unitPrice ?? 0)} × {i.percent ?? 0}%
                    </span>
                    <span className="text-right font-mono font-semibold text-fg tabular">
                      {formatCurrency(i.amount)}
                      {i.review ? ` · ${t(i.review)}` : ''}
                    </span>
                  </div>
                  {i.note && (
                    <span className="text-xs text-fg-secondary">
                      {t('Note')}: {i.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-base font-semibold text-fg">{t('Total {amount}', { amount: formatCurrency(d.total) })}</p>

          {s && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle/40 p-3.5">
              <span className="text-xs font-semibold tracking-wide text-fg-secondary uppercase">
                {t('3. Utility deposit settlement')}
              </span>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-fg-secondary">{t('Utility deposit held')}</dt>
                  <dd className="font-medium text-fg tabular">{formatCurrency(s.held)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-fg-secondary">
                    {t('Final utility share')}
                    {s.periodLabel ? ` (${s.periodLabel})` : ''}
                  </dt>
                  <dd className="font-medium text-fg tabular">− {formatCurrency(s.share)}</dd>
                </div>
                {s.unpaid > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-fg-secondary">{t('Unpaid utility invoices')}</dt>
                    <dd className="font-medium text-fg tabular">− {formatCurrency(s.unpaid)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-fg-secondary">{t('Damage charge')}</dt>
                  <dd className="font-medium text-warning-fg tabular">− {formatCurrency(s.damage)}</dd>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <dt className="text-fg">{t(s.refund >= 0 ? 'Refund to student' : 'Student still owes')}</dt>
                  <dd className={cx('text-base font-bold tabular', s.refund >= 0 ? 'text-success-fg' : 'text-error-fg')}>
                    {formatCurrency(Math.abs(s.refund))}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-fg-tertiary">
                {t(
                  s.refund >= 0
                    ? 'Refund goes to the manager for approval'
                    : 'The balance will be invoiced to the student',
                )}
              </p>
            </div>
          )}

          {d.studentPresent && !d.agreedAt && (
            <div className="flex justify-end">
              <Button variant="primary" icon={CircleCheck} onClick={() => agree.run()} disabled={agree.pending}>
                Agree with the charges
              </Button>
            </div>
          )}
          {d.agreedAt && <p className="text-sm text-fg-secondary">{t('You agreed on {date}.', { date: formatDateTime(d.agreedAt) })}</p>}
        </>
      )}
    </Card>
  )
}

export default function CheckInInventory() {
  const query = useQuery(['handover', 'mine'], ({ signal }) => api.handover.mine(undefined, { signal }))
  return (
    <StudentPage breadcrumb={[{ label: 'My room', to: '/student/room' }, { label: 'Check-in inventory' }]} title="Check-in inventory" width="max-w-3xl">
      <div className="flex flex-col gap-4 lg:overflow-y-auto">
        {/* The view is never "empty": before the start (Waiting, Ready) its items list is empty by design. */}
        <QueryState query={query} isEmpty={() => false}>
          {(d) =>
            d.status === 'Not needed' ? (
              <Card>
                <EmptyBlock icon={ClipboardList} title="No check-in inventory to file">
                  You file one when you receive a Room.
                </EmptyBlock>
              </Card>
            ) : d.status === 'Waiting' || d.status === 'Ready' ? (
              <Start data={d} />
            ) : d.status === 'Draft' ? (
              <Form key={d.id} data={d} />
            ) : (
              <Summary data={d} />
            )
          }
        </QueryState>
        <FurnitureCharges />
      </div>
    </StudentPage>
  )
}
