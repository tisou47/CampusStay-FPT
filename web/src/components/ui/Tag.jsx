import { cx } from '@/lib/cx'

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
      {dot && <span aria-hidden="true" className={cx('size-1.5 shrink-0 rounded-full', t.dot)} />}
      {children}
    </span>
  )
}

/*
 * One status vocabulary for web and Android (Foundations › Application status tags).
 * Draft/Expired/Cancelled = Neutral; Awaiting Roommate/Awaiting Deposit/Waitlisted = Warning;
 * Submitted/Under Review/Approved = Info; Allocated = Success; Rejected = Error.
 * Other entities (invoices, requests, rooms) extend the same mapping.
 */
const statusTone = {
  // Application
  Draft: 'neutral',
  Expired: 'neutral',
  Cancelled: 'neutral',
  'Awaiting Roommate': 'warning',
  'Awaiting Deposit': 'warning',
  Waitlisted: 'warning',
  Submitted: 'info',
  'Under Review': 'info',
  Approved: 'info',
  Allocated: 'success',
  Rejected: 'error',
  // Invoices and payments
  Paid: 'success',
  Unpaid: 'warning',
  'Partially paid': 'warning',
  Pending: 'warning',
  Overdue: 'error',
  Refunded: 'neutral',
  Void: 'neutral',
  // Requests
  New: 'info',
  Open: 'info',
  Assigned: 'info',
  'In progress': 'warning',
  'On hold': 'warning',
  Resolved: 'success',
  Completed: 'success',
  Closed: 'neutral',
  Declined: 'error',
  Escalated: 'error',
  'Awaiting confirmation': 'warning',
  // Priorities
  Urgent: 'error',
  High: 'warning',
  Normal: 'neutral',
  Low: 'neutral',
  // Generic
  Upcoming: 'neutral',
  'Not issued': 'neutral',
  Archived: 'neutral',
  Paused: 'neutral',
  Planned: 'info',
  Invited: 'info',
  Locked: 'error',
  'Waiting approval': 'warning',
  'Proposal ready': 'warning',
  'In approval': 'info',
  Committed: 'success',
  Discarded: 'neutral',
  Handled: 'success',
  'Checked in': 'success',
  'Checked out': 'neutral',
  Active: 'success',
  Inactive: 'neutral',
  Disabled: 'neutral',
  Published: 'success',
  Scheduled: 'info',
}

export function toneForStatus(status) {
  return statusTone[status] ?? 'neutral'
}

export function StatusTag({ status, tone, className, children }) {
  return (
    <Tag tone={tone ?? toneForStatus(status)} className={className}>
      {children ?? status}
    </Tag>
  )
}
