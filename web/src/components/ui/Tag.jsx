import { t, tx } from '@/i18n'
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
      {tx(children)}
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
  // Accounts and the student list (Change Spec v2 phase 2)
  Verified: 'success',
  'Pending verification': 'warning',
  'Profile needed': 'info',
  'Not signed in yet': 'neutral',
  Ended: 'neutral',
  Update: 'info',
  Unchanged: 'neutral',
  Error: 'error',
  Preview: 'warning',
  Applied: 'success',
  // Inventory: furniture, conformance, door codes (Change Spec v2 phase 3)
  'In use': 'success',
  Broken: 'error',
  'In repair': 'warning',
  'In store': 'info',
  Disposed: 'neutral',
  Done: 'success',
  Matches: 'success',
  'Does not match': 'warning',
  'Change needed': 'warning',
  'Not set': 'neutral',
  'Waiting for confirmation': 'info',
  Ready: 'success',
  'Not ready': 'neutral',
  // Money and residence (Change Spec v2 phase 5)
  Forfeited: 'error',
  'Assigned – unpaid': 'warning',
  'Paid – waiting for the door code': 'info',
  Resident: 'success',
  'Notice sent': 'warning',
  Confirmed: 'success',
  Warning: 'warning',
  'Final warning': 'error',
}

export function toneForStatus(status) {
  return statusTone[status] ?? 'neutral'
}

/**
 * Time left until a request's deadline (spec §6.18): green, amber in the last {warnHours} hours, red once overdue.
 * Nothing for a request that is finished (done) or has no deadline.
 */
export function SlaBadge({ dueAt, done = false, warnHours = 4, className }) {
  if (!dueAt || done) return null
  const hours = (new Date(dueAt).getTime() - Date.now()) / 3_600_000
  const late = hours < 0
  const abs = Math.abs(hours)
  const n = abs >= 48 ? Math.floor(abs / 24) : late ? Math.max(1, Math.floor(abs)) : Math.max(1, Math.ceil(abs))
  const unit = abs >= 48 ? 'd' : 'h'
  const text = late ? t(`{n} ${unit} overdue`, { n }) : t(`{n} ${unit} left`, { n })
  return (
    <Tag tone={late ? 'error' : hours <= warnHours ? 'warning' : 'success'} className={className}>
      <span title={new Date(dueAt).toLocaleString()}>{text}</span>
    </Tag>
  )
}

export function StatusTag({ status, tone, className, children }) {
  return (
    <Tag tone={tone ?? toneForStatus(status)} className={className}>
      {children ?? status}
    </Tag>
  )
}
