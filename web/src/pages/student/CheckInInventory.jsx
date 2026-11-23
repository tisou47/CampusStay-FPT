import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BedDouble, Check, ChevronLeft, ChevronRight, CircleCheck, ClipboardList, Droplets, Gauge, KeyRound, Printer, Trash2, Users, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Card, CardHeader, ProgressBar } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { CONDITIONS, conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
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


/** One photo large (taken in the Android app); while the inventory is a draft it can be deleted. */
function PhotoViewer({ photos, start, editable, onClose }) {
  const { notifyError } = useToast()
  const [index, setIndex] = useState(start)
  const remove = useMutation((id) => api.handover.removePhoto(id), { invalidates: ['handover'], onError: (e) => notifyError(e, 'Could not remove the photo') })
  const photo = photos[Math.min(index, photos.length - 1)]
  if (!photo) return null
  const busy = remove.pending
  const many = photos.length > 1
  const go = (step) => setIndex((i) => (i + step + photos.length) % photos.length)
  return (
    <Modal
      open
      width={720}
      onClose={onClose}
      title={many ? t('Photo {n} of {total}', { n: photos.indexOf(photo) + 1, total: photos.length }) : t('Photo')}
      footer={
        <>
          {editable && (
            <>
              <Button
                variant="danger-text"
                icon={Trash2}
                disabled={busy}
                onClick={() =>
                  remove.run(photo.id).then(() => {
                    if (photos.length === 1) onClose()
                  })
                }
              >
                Delete
              </Button>
            </>
          )}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black/5">
        <img src={photo.url} alt={t('Photo')} className="max-h-[60vh] w-full object-contain" />
        {many && (
          <>
            <IconButton icon={ChevronLeft} aria-label={t('Previous photo')} className="absolute top-1/2 left-2 -translate-y-1/2 bg-surface/90 shadow-card" onClick={() => go(-1)} />
            <IconButton icon={ChevronRight} aria-label={t('Next photo')} className="absolute top-1/2 right-2 -translate-y-1/2 bg-surface/90 shadow-card" onClick={() => go(1)} />
          </>
        )}
      </div>
    </Modal>
  )
}

/** Thumbnails that open the photo large (to view it, or delete it while editable). */
function PhotoStrip({ photos, editable = false, size = 'md' }) {
  const [open, setOpen] = useState(null)
  if (!photos?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((p, i) => (
        <button
          key={p.id}
          type="button"
          aria-label={t('Open photo {n}', { n: i + 1 })}
          onClick={() => setOpen(i)}
          className={cx('overflow-hidden rounded-md border border-line transition hover:ring-2 hover:ring-primary/50', size === 'sm' ? 'size-9' : 'size-16')}
        >
          <img src={p.url} alt="" className="size-full object-cover" />
        </button>
      ))}
      {open != null && <PhotoViewer photos={photos} start={open} editable={editable} onClose={() => setOpen(null)} />}
    </div>
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

/** An item's name and asset code; the Bed only for personal items listed with the shared ones. */
function ItemName({ item, showBed }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-base font-medium text-fg">{typeName(item)}</span>
      <span className="truncate text-sm text-fg-tertiary">
        <span className="font-mono">{item.assetCode}</span>
        {showBed && item.personal ? ` · ${t('Your Bed {bed}', { bed: item.bed })}` : ''}
      </span>
    </span>
  )
}

/** The items of the Bed first, then the shared ones, each group under its own heading. */
const groupsOf = (items, bed) =>
  [
    { key: 'personal', icon: BedDouble, title: t('Your Bed {bed}', { bed: bed ?? '' }), hint: t('Only you use these'), items: items.filter((i) => i.personal) },
    { key: 'shared', icon: Users, title: t('Shared by the Room'), hint: t('Everyone in the Room uses these'), items: items.filter((i) => !i.personal) },
  ].filter((g) => g.items.length)

/** A group's heading band: its icon, its name and what it holds, and how much of it is filled in. */
function GroupHeader({ icon: Glyph, title, hint, done, total }) {
  const complete = done === total
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-subtle px-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand shadow-card">
        <Glyph size={16} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {hint && <span className="text-sm text-fg-tertiary">{hint}</span>}
      </span>
      {total != null && (
        <span className={cx('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium tabular', complete ? 'bg-success-bg text-success-fg' : 'bg-surface text-fg-secondary')}>
          {complete && <Check size={13} strokeWidth={3} aria-hidden="true" />}
          {done}/{total}
        </span>
      )}
    </div>
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
  const answered = Object.values(answers).filter((a) => a.condition).length
  const meters = (electricity !== '' ? 1 : 0) + (water !== '' ? 1 : 0)
  const complete = answered === data.items.length && meters === 2
  const pick = (itemId, condition) => setAnswers((s) => ({ ...s, [itemId]: { ...s[itemId], condition } }))
  const levels = data?.conditionLevels

  return (
    // One screen on a computer: the furniture on the left, the meters and the buttons on the right; the page does not
    // scroll (only a very long furniture list scrolls inside its card).
    <div className="grid grid-cols-1 gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 flex-col">
            <h2 className="text-h3 font-semibold text-fg">{t('Furniture · Room {room}', { room: data.room })}</h2>
          </div>
          <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-sm text-fg-secondary">{t('Due {date}', { date: formatDateTime(data.dueAt) })}</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {groupsOf(data.items, data.bed).map((g) => (
            <section key={g.key} className="flex flex-col">
              <GroupHeader icon={g.icon} title={g.title} done={g.items.filter((i) => answers[i.itemId]?.condition).length} total={g.items.length} />
              <ul className="flex flex-col divide-y divide-line px-1">
                {g.items.map((i) => {
                  const a = answers[i.itemId]
                  const needsNote = a.condition === 'Damaged' || a.condition === 'Missing' || a.condition === 'Worn'
                  return (
                    <li key={i.itemId} className="flex flex-col gap-1.5 px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <ItemName item={i} />
                        </span>
                        <PhotoStrip photos={i.photos} editable size="sm" />
                        <Select
                          wrapperClassName="w-40 shrink-0"
                          aria-label={t('Condition of {item}', { item: i.assetCode })}
                          value={a.condition}
                          className={cx(!a.condition && 'text-fg-tertiary', a.condition && a.condition !== 'Good' && 'border-warning/60')}
                          onChange={(e) => pick(i.itemId, e.target.value)}
                        >
                          <option value="" disabled>
                            {t('Choose…')}
                          </option>
                          {conditionOptions(levels).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      {i.roommateCondition && (
                        <p className="text-sm text-fg-secondary">
                          {t('Your roommate recorded it as {condition}. Choose the same if it is right, or what you see.', { condition: conditionName(i.roommateCondition, levels) })}
                        </p>
                      )}
                      {needsNote && (
                        <Input aria-label={t('Note for {item}', { item: i.assetCode })} placeholder={t('What do you see?')} value={a.note} onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], note: e.target.value } }))} />
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      {/* The right column scrolls inside itself when the window is short, so the buttons are always reachable. */}
      <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
        <Card className="flex shrink-0 flex-col gap-3">
          <GroupHeader icon={Gauge} title={t('Meters of the Room')} done={meters} total={2} />
          <div className="grid grid-cols-2 gap-3 px-1">
            <Field label={<span className="inline-flex items-center gap-1"><Zap size={14} aria-hidden="true" className="text-warning-fg" />{t('Electricity (kWh)')}</span>} required>
              <Input type="number" min="0" step="0.1" inputMode="decimal" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
            </Field>
            <Field label={<span className="inline-flex items-center gap-1"><Droplets size={14} aria-hidden="true" className="text-info-fg" />{t('Water (m³)')}</span>} required>
              <Input type="number" min="0" step="0.1" inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} />
            </Field>
          </div>
          {data.meterPhotos.length > 0 && (
            <div className="flex flex-col gap-1.5 px-1">
              <span className="text-sm font-medium text-fg-secondary">{t('Photos of the meters')}</span>
              <PhotoStrip photos={data.meterPhotos} editable />
            </div>
          )}
        </Card>

        <Card className="flex shrink-0 flex-col gap-3">
          <h3 className="text-base font-semibold text-fg">{t('Your progress')}</h3>
          <div className="flex flex-col gap-2">
            {[
              [t('Furniture'), answered, data.items.length],
              [t('Meters'), meters, 2],
            ].map(([label, done, total]) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-fg-secondary">{label}</span>
                <ProgressBar value={done} max={total || 1} tone={done === total ? 'success' : 'warning'} className="flex-1" />
                <span className="w-10 shrink-0 text-right font-medium text-fg tabular">
                  {done}/{total}
                </span>
              </div>
            ))}
          </div>
          <p className={cx('text-sm', complete ? 'text-success-fg' : 'text-fg-tertiary')}>
            {complete ? t('Everything is filled in: you can submit.') : t('Fill it in at the Room: a large difference with the Room’s record brings Staff to check it with you.')}
          </p>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <Button onClick={() => save.run()} disabled={save.pending}>
              Save draft
            </Button>
            <Button variant="primary" block onClick={() => submit.run()} disabled={submit.pending}>
              Submit inventory
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- after submitting */

const STATUS_TONE = { Final: 'success', Verifying: 'warning', Submitted: 'info' }

/** Started → submitted → (visit with Staff) → final, top to bottom: the steps done have their date, the next are grey. */
function Steps({ data }) {
  const steps = [
    { key: 'start', label: 'Started (door code received)', at: data.openedAt },
    { key: 'submit', label: 'Submitted', at: data.submittedAt },
    (data.visitAt || data.status === 'Verifying') && { key: 'visit', label: 'Room visit with Staff', at: data.visitAt },
    { key: 'final', label: 'Final', at: data.finalizedAt },
  ].filter(Boolean)
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className={cx('absolute top-6 bottom-0 left-[11px] w-0.5', steps[i + 1].at ? 'bg-success' : 'bg-line')} />}
          <span className={cx('relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.at ? 'bg-success text-white' : 'border border-line bg-surface text-fg-tertiary')}>
            {s.at ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : i + 1}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <span className={cx('text-sm', s.at ? 'font-medium text-fg' : 'text-fg-tertiary')}>{t(s.label)}</span>
            <span className="shrink-0 text-sm text-fg-secondary tabular">{s.at ? formatDateTime(s.at) : '—'}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The condition that counts: the one checked with Staff when there was a visit, else the student's. */
const finalCondition = (i) => i.staffCondition ?? i.condition

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
  const levels = data?.conditionLevels
  // Staff's answers are shown only after a Room visit (the API sends them once Staff recorded what they found).
  const visited = data.staffElectricity != null || data.items.some((i) => i.staffCondition)
  const counts = CONDITIONS.map((c) => ({ c, n: data.items.filter((i) => finalCondition(i) === c).length }))
  const tag = (c) => (c ? <Tag tone={conditionTone[c] ?? 'neutral'}>{conditionName(c, levels)}</Tag> : <span className="text-fg-tertiary">—</span>)
  return (
    <>
      {/* One screen on a computer, like the form: the items on the left, the record and its actions on the right;
          each column scrolls inside itself when it is longer. */}
      <div className="grid grid-cols-1 gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 flex-col">
              <h2 className="text-h3 font-semibold text-fg">{t('Furniture · Room {room}', { room: data.room })}</h2>
              <p className="text-sm text-fg-tertiary">{visited ? t('What you recorded, and what was checked with Staff.') : t('What you recorded.')}</p>
            </div>
            {visited && (
              <span className="flex shrink-0 gap-2 text-sm text-fg-tertiary">
                <span className="w-32 text-center">{t('You recorded')}</span>
                <span className="w-32 text-center">{t('Checked with Staff')}</span>
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {groupsOf(data.items, data.bed).map((g) => (
              <section key={g.key} className="flex flex-col">
                <GroupHeader icon={g.icon} title={g.title} />
                <ul className="flex flex-col divide-y divide-line px-1">
                  {g.items.map((i) => (
                    <li key={i.itemId} className="flex flex-col gap-1 px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <ItemName item={i} />
                        </span>
                        <PhotoStrip photos={i.photos} size="sm" />
                        <span className={cx('flex shrink-0 justify-center', visited && 'w-32')}>{tag(i.condition)}</span>
                        {visited && <span className="flex w-32 shrink-0 justify-center">{tag(i.staffCondition)}</span>}
                      </div>
                      {(i.note || i.staffNote) && (
                        <p className="text-sm text-fg-secondary">{[i.note && t('Your note: {note}', { note: i.note }), i.staffNote && t('Staff: {note}', { note: i.staffNote })].filter(Boolean).join(' · ')}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Tag tone={STATUS_TONE[data.status] ?? 'info'}>{data.status}</Tag>
                <p className="text-sm text-fg-secondary">
                  {data.status === 'Final'
                    ? t('Recorded {how} on {date}. Utility is counted from {from}.', { how: t(data.source), date: formatDateTime(data.finalizedAt), from: formatDateTime(data.utilityFrom) })
                    : data.status === 'Verifying'
                      ? data.toAgree
                        ? t('Staff recorded what they found in the Room. Read it and agree.')
                        : t('Staff will check the Room with you{when}.', { when: data.visitAt ? ` ${formatDateTime(data.visitAt)}` : '' })
                      : t('Submitted {date}. Staff are looking at it.', { date: formatDateTime(data.submittedAt) })}
                </p>
              </div>
              <Button size="sm" icon={Printer} onClick={() => window.print()} tip="Print the inventory report or save it as PDF to show Staff.">
                Print report
              </Button>
            </div>
            <Steps data={data} />
          </Card>

          <Card className="flex shrink-0 flex-col gap-3">
            <h3 className="text-base font-semibold text-fg">{t('At a glance')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {counts.map(({ c, n }) => (
                <div key={c} className={cx('flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5', n ? 'border-line' : 'border-line/60 bg-subtle/40')}>
                  <Tag tone={n ? conditionTone[c] ?? 'neutral' : 'neutral'}>{conditionName(c, levels)}</Tag>
                  <span className={cx('text-base font-semibold tabular', n ? 'text-fg' : 'text-fg-tertiary')}>{n}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col rounded-lg bg-subtle/60 px-3 py-2">
                <span className="flex items-center gap-1 text-sm text-fg-secondary">
                  <Zap size={14} aria-hidden="true" className="text-warning-fg" /> {t('Electricity')}
                </span>
                <span className="text-base font-semibold text-fg tabular">{(visited ? data.staffElectricity : null) ?? data.electricity ?? '—'} kWh</span>
              </div>
              <div className="flex flex-col rounded-lg bg-subtle/60 px-3 py-2">
                <span className="flex items-center gap-1 text-sm text-fg-secondary">
                  <Droplets size={14} aria-hidden="true" className="text-info-fg" /> {t('Water')}
                </span>
                <span className="text-base font-semibold text-fg tabular">{(visited ? data.staffWater : null) ?? data.water ?? '—'} m³</span>
              </div>
            </div>
            {data.meterPhotos?.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-fg-secondary">{t('Photos of the meters')}</span>
                <PhotoStrip photos={data.meterPhotos} size="sm" />
              </div>
            )}
          </Card>

          {data.status === 'Final' && (
            <Alert type="success" title="Final report: your handover record until check-out">
              {t('This is the final, signed record of your Room ({how}). Keep it: at check-out Staff compare each item with it, and only what got worse since is charged. Damage recorded here is never charged to you.', { how: t(data.source) })}
            </Alert>
          )}
          {data.toAgree && (
            <Card className="flex shrink-0 flex-col gap-2 border-primary/30 bg-brand-subtle/30">
              <Field label="Comment (optional)" hint="If you still see something differently, write it here: it is kept with the inventory and read at check-out.">
                <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
              <Button variant="primary" block icon={CircleCheck} onClick={() => agree.run()} disabled={agree.pending}>
                {comment.trim() ? 'Agree with my comment' : 'Agree'}
              </Button>
            </Card>
          )}
          {data.lateAllowed && (
            <Card className="flex shrink-0 flex-col gap-2">
              <Field label="Report something you found late" hint="The deadline passed, so the Room's record is used. Staff decide whether it was there before you.">
                <Textarea rows={2} value={late} onChange={(e) => setLate(e.target.value)} />
              </Field>
              <Button block onClick={() => sendLate.run()} disabled={!late.trim() || sendLate.pending}>
                Send late report
              </Button>
            </Card>
          )}
          {data.lateNote && <Alert type="info" title="Your late report">{data.lateNote}</Alert>}
          {data.studentComment && <Alert type="info" title="Your comment">{data.studentComment}</Alert>}
        </div>
      </div>
      <InventoryReport data={data} visited={visited} />
    </>
  )
}

/* ---------------------------------------------------------------- the printed report */

/**
 * The check-in inventory report as it goes on paper (A4): only this is printed (index.css › .print-area), never the
 * page around it. Hidden on screen.
 */
function InventoryReport({ data, visited }) {
  const { user, term } = useSession()
  const levels = data?.conditionLevels
  const cell = 'border border-black/40 px-2 py-1.5 align-top'
  const steps = [
    ['Started (door code received)', data.openedAt],
    ['Submitted', data.submittedAt],
    ['Room visit with Staff', data.visitAt],
    ['Final', data.finalizedAt],
  ].filter(([, at]) => at)
  return createPortal(
    <div className="print-area hidden bg-white p-8 text-[12px] leading-snug text-black print:block">
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-[13px] font-bold">CampusStay FPT</p>
          <p>{t('FPT University dormitory')}</p>
        </div>
        <div className="text-right">
          <p>{t('Printed {date}', { date: formatDateTime(new Date()) })}</p>
          <p>{t('Status: {status}', { status: t(data.status) })}</p>
        </div>
      </div>

      <h1 className="mt-5 text-center text-[18px] font-bold uppercase">{t('Check-in inventory report')}</h1>
      <p className="mt-1 text-center">{t('Room {room}', { room: data.room })}{term?.name ? ` · ${term.name}` : ''}</p>

      <table className="mt-5 w-full border-collapse">
        <tbody>
          <tr>
            <td className={cx(cell, 'w-1/4 font-semibold')}>{t('Student')}</td>
            <td className={cell}>{user?.name ?? '—'}</td>
            <td className={cx(cell, 'w-1/4 font-semibold')}>{t('Student code')}</td>
            <td className={cell}>{user?.studentCode ?? '—'}</td>
          </tr>
          <tr>
            <td className={cx(cell, 'font-semibold')}>{t('Room')}</td>
            <td className={cell}>{data.room}</td>
            <td className={cx(cell, 'font-semibold')}>{t('Bed')}</td>
            <td className={cell}>{data.bed ?? '—'}</td>
          </tr>
          {steps.map(([label, at], i) =>
            i % 2 === 0 ? (
              <tr key={label}>
                <td className={cx(cell, 'font-semibold')}>{t(label)}</td>
                <td className={cell}>{formatDateTime(at)}</td>
                <td className={cx(cell, 'font-semibold')}>{steps[i + 1] ? t(steps[i + 1][0]) : ''}</td>
                <td className={cell}>{steps[i + 1] ? formatDateTime(steps[i + 1][1]) : ''}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>

      <h2 className="mt-5 mb-2 text-[13px] font-bold">{t('1. Furniture and equipment')}</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-black/5">
            <th className={cx(cell, 'w-8 text-center')}>#</th>
            <th className={cx(cell, 'text-left')}>{t('Item')}</th>
            <th className={cx(cell, 'text-left')}>{t('Asset code')}</th>
            <th className={cx(cell, 'text-left')}>{t('Used by')}</th>
            <th className={cx(cell, 'text-left')}>{t('Student recorded')}</th>
            {visited && <th className={cx(cell, 'text-left')}>{t('Checked with Staff')}</th>}
            <th className={cx(cell, 'text-left')}>{t('Note')}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((i, n) => (
            <tr key={i.itemId}>
              <td className={cx(cell, 'text-center')}>{n + 1}</td>
              <td className={cell}>{typeName(i)}</td>
              <td className={cx(cell, 'font-mono')}>{i.assetCode}</td>
              <td className={cell}>{i.personal ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}</td>
              <td className={cell}>{i.condition ? conditionName(i.condition, levels) : '—'}</td>
              {visited && <td className={cell}>{i.staffCondition ? conditionName(i.staffCondition, levels) : '—'}</td>}
              <td className={cell}>{[i.note, i.staffNote && t('Staff: {note}', { note: i.staffNote })].filter(Boolean).join(' · ') || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-5 mb-2 text-[13px] font-bold">{t('2. Meters of the Room')}</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-black/5">
            <th className={cx(cell, 'text-left')}>{t('Meter')}</th>
            <th className={cx(cell, 'text-left')}>{t('Student recorded')}</th>
            {visited && <th className={cx(cell, 'text-left')}>{t('Checked with Staff')}</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cell}>{t('Electricity (kWh)')}</td>
            <td className={cell}>{data.electricity ?? '—'}</td>
            {visited && <td className={cell}>{data.staffElectricity ?? '—'}</td>}
          </tr>
          <tr>
            <td className={cell}>{t('Water (m³)')}</td>
            <td className={cell}>{data.water ?? '—'}</td>
            {visited && <td className={cell}>{data.staffWater ?? '—'}</td>}
          </tr>
        </tbody>
      </table>

      {(data.studentComment || data.lateNote) && (
        <>
          <h2 className="mt-5 mb-2 text-[13px] font-bold">{t('3. Comments')}</h2>
          {data.studentComment && <p>{t('Student comment: {note}', { note: data.studentComment })}</p>}
          {data.lateNote && <p>{t('Late report: {note}', { note: data.lateNote })}</p>}
        </>
      )}

      <p className="mt-5 italic">
        {t('At check-out each item is compared with this report: only what got worse since is charged. Damage recorded here is never charged to the student.')}
      </p>

      <div className="mt-10 grid grid-cols-2 gap-8 text-center">
        <div>
          <p className="font-bold">{t('Student')}</p>
          <p className="italic">{t('(signature and full name)')}</p>
          <p className="mt-16">{user?.name ?? ''}</p>
        </div>
        <div>
          <p className="font-bold">{t('Dormitory staff')}</p>
          <p className="italic">{t('(signature and full name)')}</p>
        </div>
      </div>
    </div>,
    document.body,
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
    <StudentPage breadcrumb={[{ label: 'My room', to: '/student/room' }, { label: 'Check-in inventory' }]} title="Check-in inventory" width={'max-w-6xl'}>
      <div className={cx('flex flex-col gap-4 lg:min-h-0 lg:flex-1', query.data?.status === 'Draft' ? 'lg:overflow-hidden' : 'lg:overflow-y-auto [&>*]:shrink-0')}>
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
