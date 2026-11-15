import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatDateTime, formatTimeLeft } from '@/lib/format'
import { StatusBadge, statusVariant } from './StatusBadge'

// Figma: 02 Components › Tag (status). Pill with a 6 px dot in the status solid colour.
const tones = {
  neutral: { box: 'bg-neutral-bg text-neutral-fg', dot: 'bg-neutral' },
  warning: { box: 'bg-warning-bg text-warning-fg', dot: 'bg-warning' },
  info: { box: 'bg-info-bg text-info-fg', dot: 'bg-info' },
  success: { box: 'bg-success-bg text-success-fg', dot: 'bg-success' },
  error: { box: 'bg-error-bg text-error-fg', dot: 'bg-error' },
  brand: { box: 'bg-primary-subtle text-fg-brand', dot: 'bg-primary' },
}

export function Tag({ tone = 'neutral', dot = true, className, children }) {
  const t = tones[tone] ?? tones.neutral
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 text-sm font-medium whitespace-nowrap',
        dot ? 'pr-2.5 pl-2' : 'px-2.5',
        t.box,
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cx('inline-block size-1.5 shrink-0 rounded-full', t.dot)} />}
      {tx(children)}
    </span>
  )
}

/*
 * One status vocabulary for web and Android: the map and the colours live in StatusBadge.jsx; StatusTag and
 * toneForStatus are kept for the pages that use them and draw the same pill.
 */
const VARIANT_TONE = { assigned: 'info', in_progress: 'info', unassigned: 'neutral', overdue: 'error', done: 'success', pending: 'warning', cancelled: 'neutral', neutral: 'neutral', brand: 'brand' }

export function toneForStatus(status) {
  return VARIANT_TONE[statusVariant(status)] ?? 'neutral'
}

/**
 * Time left until a request's deadline (spec §6.18): green, amber in the last {warnHours} hours, red once overdue.
 * Nothing for a request that is finished (done) or has no deadline.
 */
export function SlaBadge({ dueAt, done = false, warnHours = 4, className }) {
  if (!dueAt || done) return null
  const hours = (new Date(dueAt).getTime() - Date.now()) / 3_600_000
  const late = hours < 0
  const text = formatTimeLeft(dueAt)
  return (
    <Tag tone={late ? 'error' : hours <= warnHours ? 'warning' : 'success'} className={className}>
      <span title={formatDateTime(dueAt)}>{text}</span>
    </Tag>
  )
}

/** A status pill (see StatusBadge); `tone` overrides the colour the status would get. */
export function StatusTag({ status, tone, className, children }) {
  return (
    <StatusBadge status={status} variant={tone} className={className}>
      {children}
    </StatusBadge>
  )
}
