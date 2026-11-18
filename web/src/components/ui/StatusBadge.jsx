import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

/*
 * The one status pill of the app (requests, Applications, payments, inspections, rooms…): a 6 px dot in the
 * status colour, the label in 12 px medium, on a light background of the same hue, no border.
 * Pages never pick a colour: they pass the API status (`status="In progress"`) and this file maps it to a
 * variant and its label. Every pair below is at least 4.5 : 1 (WCAG AA) for 12 px text.
 */
export const VARIANTS = {
  assigned: { box: 'bg-info-bg text-info-fg', dot: 'bg-info' }, // blue: someone is in charge, not started
  in_progress: { box: 'bg-progress-bg text-progress-fg', dot: 'bg-progress' }, // purple: being worked on
  unassigned: { box: 'bg-neutral-bg text-neutral-fg', dot: 'bg-neutral' }, // grey: nobody in charge
  overdue: { box: 'bg-error-bg text-error-fg', dot: 'bg-error' }, // red: late, rejected, broken
  done: { box: 'bg-success-bg text-success-fg', dot: 'bg-success' }, // green: done, allocated, paid
  pending: { box: 'bg-warning-bg text-warning-fg', dot: 'bg-warning' }, // amber: waiting for someone
  cancelled: { box: 'bg-neutral-bg text-neutral-fg line-through decoration-neutral-fg/60', dot: 'bg-neutral' }, // grey, struck through
  neutral: { box: 'bg-neutral-bg text-neutral-fg', dot: 'bg-neutral' },
  brand: { box: 'bg-primary-subtle text-fg-brand', dot: 'bg-primary' },
}

// The older tone names (Tag tone="warning") resolve to the same colours.
const TONE_ALIAS = { info: 'assigned', success: 'done', warning: 'pending', error: 'overdue' }
export const variantOf = (name) => VARIANTS[name] ? name : TONE_ALIAS[name] ?? 'neutral'

/** API status (English, as the contract sends it) → variant. A status missing here shows grey. */
const STATUS_VARIANT = {
  // Requests and tickets
  Unassigned: 'unassigned',
  New: 'assigned',
  Open: 'assigned',
  Assigned: 'assigned',
  'In progress': 'in_progress',
  'In repair': 'in_progress',
  'On hold': 'pending',
  'Awaiting confirmation': 'pending',
  'Waiting for confirmation': 'pending',
  Resolved: 'done',
  Closed: 'neutral',
  Declined: 'overdue',
  Escalated: 'overdue',
  Overdue: 'overdue',
  // Priorities
  Urgent: 'overdue',
  High: 'pending',
  Normal: 'neutral',
  Low: 'neutral',
  // Applications (Foundations › Application status tags)
  Draft: 'neutral',
  Expired: 'neutral',
  Cancelled: 'cancelled',
  'Awaiting Roommate': 'pending',
  'Awaiting Deposit': 'pending',
  Waitlisted: 'pending',
  Submitted: 'assigned',
  'Under Review': 'in_progress',
  Approved: 'assigned',
  Allocated: 'done',
  Rejected: 'overdue',
  // Invoices and payments
  Paid: 'done',
  Unpaid: 'pending',
  'Partially paid': 'pending',
  Pending: 'pending',
  Refunded: 'neutral',
  Void: 'cancelled',
  Forfeited: 'overdue',
  'Assigned – unpaid': 'pending',
  'Paid – waiting for the door code': 'assigned',
  // Inspections, inventory, door codes
  Planned: 'assigned',
  Scheduled: 'assigned',
  Done: 'done',
  Completed: 'neutral',
  Matches: 'done',
  'Does not match': 'pending',
  'Change needed': 'pending',
  'Not set': 'neutral',
  'In use': 'done',
  Broken: 'overdue',
  'In store': 'assigned',
  Disposed: 'cancelled',
  Ready: 'done',
  'Not ready': 'neutral',
  // Generic
  Upcoming: 'neutral',
  'Not issued': 'neutral',
  Archived: 'neutral',
  Paused: 'neutral',
  Invited: 'assigned',
  Locked: 'overdue',
  'Waiting approval': 'pending',
  'Proposal ready': 'pending',
  'In approval': 'assigned',
  Committed: 'done',
  Discarded: 'cancelled',
  Handled: 'done',
  'Checked in': 'done',
  'Checked out': 'neutral',
  Active: 'done',
  Inactive: 'neutral',
  Disabled: 'neutral',
  Published: 'done',
  // Accounts and the student list
  Verified: 'done',
  'Pending verification': 'pending',
  'Profile needed': 'assigned',
  'Not signed in yet': 'neutral',
  Ended: 'neutral',
  Update: 'assigned',
  Unchanged: 'neutral',
  Error: 'overdue',
  Preview: 'pending',
  Applied: 'done',
  // Residence
  Resident: 'brand',
  'Notice sent': 'pending',
  Confirmed: 'done',
  Warning: 'pending',
  'Final warning': 'overdue',
  // Family Day
  'Registration open': 'done',
  'Registration closed': 'assigned',
  'Not arrived': 'neutral',
  'No-show': 'pending',
}

/** The variant of an API status: "In progress" → "in_progress". */
export function statusVariant(status) {
  return STATUS_VARIANT[status] ?? 'neutral'
}

/**
 * <StatusBadge status="In progress" /> shows the translated status in its colour.
 * `variant` overrides the colour; `children` overrides the label (e.g. "2d overdue" with variant="overdue").
 */
export function StatusBadge({ status, variant, dot = true, className, children, title }) {
  const v = VARIANTS[variantOf(variant ?? statusVariant(status))]
  const label = children ?? status
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-current/15 px-2.5 py-0.5 text-sm leading-4 font-medium whitespace-nowrap',
        v.box,
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cx('inline-block size-1.5 shrink-0 rounded-full', v.dot)} />}
      {tx(label)}
    </span>
  )
}
