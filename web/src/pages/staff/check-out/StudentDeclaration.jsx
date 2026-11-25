import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ChevronLeft, ChevronRight, Droplets, MessageSquareWarning, Smartphone, X, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Field, Textarea } from '@/components/ui/Field'
import { Tag } from '@/components/ui/Tag'
import { conditionName, conditionTone, typeName } from '@/lib/furniture'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t } from '@/i18n'

// Check-out › what the student declared in the CampusStay app before leaving, and their disagreement with the charges.
// GET /check-outs/:allocationId/furniture → { declarationSubmittedAt, studentMeters { electricity, water, updatedAt,
//   photos: [url] }, items: [{ …, studentReportedCondition, studentReportedNote, studentReportedPhotos: [url] }],
//   dispute { id, status: Open | Answered, itemIds, reason, createdAt, answer, answeredAt } }
// POST /check-outs/:allocationId/dispute/answer { answer }

/** A photo large over the page, with a close button (and Esc), and the previous and next ones. */
function PhotoLightbox({ urls, start, onClose }) {
  const [index, setIndex] = useState(start)
  const many = urls.length > 1
  const go = (step) => setIndex((n) => (n + step + urls.length) % urls.length)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (many && e.key === 'ArrowLeft') go(-1)
      if (many && e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button
        type="button"
        aria-label={t('Close')}
        onClick={onClose}
        className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
      >
        <X size={22} aria-hidden="true" />
      </button>
      {many && (
        <>
          <button
            type="button"
            aria-label={t('Previous photo')}
            onClick={(e) => (e.stopPropagation(), go(-1))}
            className="absolute left-4 flex size-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('Next photo')}
            onClick={(e) => (e.stopPropagation(), go(1))}
            className="absolute right-4 flex size-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </>
      )}
      <img src={urls[index]} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" />
      {many && <span className="absolute bottom-4 rounded-full bg-white/15 px-3 py-1 text-sm text-white tabular">{index + 1} / {urls.length}</span>}
    </div>,
    document.body,
  )
}

/** Small photos; a click shows one large over the page. */
function Thumbs({ urls, size = 'size-12' }) {
  const [open, setOpen] = useState(null)
  if (!urls?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((u, n) => (
        <button
          key={u}
          type="button"
          onClick={() => setOpen(n)}
          aria-label={t('Open photo {n}', { n: n + 1 })}
          className={`${size} overflow-hidden rounded-md border border-line transition hover:ring-2 hover:ring-primary/50`}
        >
          <img src={u} alt="" className="size-full object-cover" />
        </button>
      ))}
      {open != null && <PhotoLightbox urls={urls} start={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

const photoUrls = (list) => (list ?? []).map((p) => (typeof p === 'string' ? p : p?.url)).filter(Boolean)

/** Step 1: the readings the student entered in the app, with their photos; Staff may copy them into the form. */
export function StudentMeters({ data, onUse, disabled }) {
  const m = data?.studentMeters
  if (!m || (m.electricity == null && m.water == null && !m.photos?.length)) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-subtle/60 px-3 py-2 text-xs text-fg-tertiary">
        <Smartphone size={14} aria-hidden="true" />
        {t('The student has not entered the meter readings in the app.')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info-bg/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Smartphone size={14} aria-hidden="true" className="text-info-fg" />
          {t('Entered by the student in the app')}
        </span>
        {m.updatedAt && <span className="text-xs text-fg-tertiary">{formatDateTime(m.updatedAt)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1 tabular">
          <Zap size={14} aria-hidden="true" className="text-warning-fg" />
          <strong className="text-fg">{m.electricity != null ? formatNumber(m.electricity) : '—'}</strong> kWh
        </span>
        <span className="inline-flex items-center gap-1 tabular">
          <Droplets size={14} aria-hidden="true" className="text-info-fg" />
          <strong className="text-fg">{m.water != null ? formatNumber(m.water) : '—'}</strong> m³
        </span>
        <Thumbs urls={photoUrls(m.photos)} size="size-10" />
        {!disabled && m.electricity != null && m.water != null && (
          <Button size="sm" onClick={() => onUse(m.electricity, m.water)}>
            Use these readings
          </Button>
        )}
      </div>
    </div>
  )
}

/** Step 2: the student's check-out declaration — each item's condition, note and photos — when they submitted it. */
export function StudentDeclaration({ data }) {
  const [all, setAll] = useState(false)
  if (!data) return null
  const items = (data.items ?? []).filter((i) => i.studentReportedCondition || i.studentReportedPhotos?.length)
  if (!data.declarationSubmittedAt && !items.length) {
    return (
      <Alert type="info" title="No check-out declaration from the student yet">
        {t('The student declares every item with a photo in the CampusStay app and submits it. You can still check the Room without it.')}
      </Alert>
    )
  }
  const declared = items.filter((i) => i.studentReportedCondition && i.studentReportedCondition !== 'Good')
  const shown = all ? items : declared
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera size={15} aria-hidden="true" className="text-fg-brand" />
          <p className="text-sm font-semibold text-fg">{t("Student's check-out declaration")}</p>
          {data.declarationSubmittedAt ? (
            <Tag tone="success">{t('Submitted {date}', { date: formatDateTime(data.declarationSubmittedAt) })}</Tag>
          ) : (
            <Tag tone="warning">Not submitted</Tag>
          )}
        </div>
        <span className="text-xs text-fg-secondary">
          {t('{n} not Good · {p} items with a photo', { n: declared.length, p: items.filter((i) => i.studentReportedPhotos?.length).length })}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('The student declared every item Good.')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {shown.map((i) => (
            <li key={i.itemId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-fg">{typeName(i)}</span>
                <span className="font-mono text-xs text-fg-tertiary">{i.assetCode}</span>
              </span>
              <Tag tone={conditionTone[i.studentReportedCondition ?? 'Good'] ?? 'neutral'}>{conditionName(i.studentReportedCondition ?? 'Good')}</Tag>
              {i.studentReportedNote && <span className="w-full text-xs text-fg-secondary sm:w-auto">— {i.studentReportedNote}</span>}
              <Thumbs urls={photoUrls(i.studentReportedPhotos)} size="size-10" />
            </li>
          ))}
        </ul>
      )}
      {items.length > declared.length && (
        <div>
          <Button size="sm" onClick={() => setAll((v) => !v)}>
            {all ? t('Only items not Good') : t('All items with photos ({n})', { n: items.length })}
          </Button>
        </div>
      )}
    </section>
  )
}

/** The student does not agree with the charges: why and which items; Staff check again (and change the charges in step 2), then answer. */
export function DisputeCard({ allocationId, data }) {
  const { notify, notifyError } = useToast()
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)
  const send = useMutation(() => api.checkOutFurniture.answerDispute(allocationId, { answer: answer.trim() }), {
    invalidates: ['check-out-furniture', 'check-out'],
    onSuccess: () => {
      setAnswer('')
      notify({ title: 'Answer sent', message: 'The student reads the charges again and agrees.' })
    },
    onError: (e) => notifyError(e, 'Could not send the answer'),
  })
  const dispute = data?.dispute
  if (!dispute) return null
  const names = (dispute.itemIds ?? []).map((id) => (data.items ?? []).find((i) => i.itemId === id)).filter(Boolean)
  if (dispute.status !== 'Open') {
    return (
      <Alert type="info" title={t('You answered the student {date}', { date: formatDateTime(dispute.answeredAt) })}>
        {t('Their reason: {reason}', { reason: dispute.reason })} · {t('Your answer: {answer}', { answer: dispute.answer ?? '' })}
      </Alert>
    )
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-warning/50 bg-warning-bg/40 p-4">
      <div className="flex items-center gap-2">
        <MessageSquareWarning size={16} aria-hidden="true" className="text-warning-fg" />
        <p className="text-sm font-semibold text-fg">{t('The student does not agree with the charges')}</p>
        <span className="text-xs text-fg-tertiary">{formatDateTime(dispute.createdAt)}</span>
      </div>
      <p className="text-sm text-fg">“{dispute.reason}”</p>
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.map((i) => (
            <Tag key={i.itemId} tone="warning">
              {typeName(i)} · {i.assetCode}
            </Tag>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-secondary">
        {t('Check the Room again. Change the conditions in step 2 and save if needed, then answer: the student is asked to agree again.')}
      </p>
      <Field label="Your answer" required error={error}>
        <Textarea rows={2} maxLength={500} value={answer} placeholder={t('e.g. Checked again: the desk is only worn, charged as Worn.')} onChange={(e) => setAnswer(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" disabled={send.pending} onClick={() => (answer.trim() ? (setError(null), send.run()) : setError(t('Write what you checked and decided.')))}>
          Send answer
        </Button>
      </div>
    </section>
  )
}
