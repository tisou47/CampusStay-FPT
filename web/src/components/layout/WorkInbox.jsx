import { useEffect } from 'react'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useQuery } from '@/api/hooks'
import { isNavActive } from '@/app/navigation'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { Panel, WorkList } from '@/components/ui/Work'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatNumber, formatRelative } from '@/lib/format'

/*
 * The work waiting for Staff, Managers and the Admin (owner decision 25/11/2026): GET /work/summary counts each kind
 * of open item; the menu shows a badge per screen and the first screen lists them, most urgent first.
 */

const KEY = 'work-summary'

/** What each kind of work is, in the words of the list (the kinds of GET /work/summary). */
const KINDS = {
  maintenance: 'Maintenance Requests assigned to you',
  'maintenance-unassigned': 'Maintenance Requests nobody has taken',
  inspection: 'Inspections assigned to you',
  'room-change': 'Room-Change Requests assigned to you',
  swap: 'Agreed swaps to carry out',
  'next-term-request': 'Next-term requests to decide',
  'check-in-inventory': 'Check-in inventories to review or visit',
  'leaver-overdue': 'Leavers past their move-out date',
  'door-code': 'Door codes to change',
  'meter-period': 'Meter readings due',
  'guest-overdue': 'Family Day guests still inside after their slot',
  application: 'Applications to review',
  assignment: 'Blocks submitted for approval',
  'late-check-in': 'Late check-in requests',
  'check-out-charge': 'Check-out charges to decide',
  'termination-overdue': 'Terminations past the move-out date',
  'swap-manager': 'Swaps across Blocks to approve',
  escalation: 'Overdue requests escalated to you',
  'payment-claim': 'Payments to confirm',
  refund: 'Refunds to decide or pay',
  erasure: 'Data erasure requests',
  reconciliation: 'Reconciliation items to resolve',
  'term-request': 'Registration period requests',
  'job-failed': 'Background jobs that failed',
}

/** The summary as cached (the shell polls it). */
export const useWork = () => useQuery([KEY], (opts) => api.workSummary(opts))

/** The summary, read again every minute and when the window gets the focus back (call it once, in the shell). */
export function useWorkPolling() {
  const query = useQuery([KEY], (opts) => api.workSummary(opts))
  useEffect(() => {
    const refresh = () => invalidate(KEY)
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return query
}

const tone = (w) => (w.overdue > 0 ? 'error' : w.dueSoon > 0 ? 'warning' : 'neutral')

/** The count on a menu item: every kind whose screen the item opens; red when some are overdue, orange due soon. */
export function NavWorkBadge({ item, work }) {
  const mine = (work ?? []).filter((w) => isNavActive(item, w.link))
  const sum = (f) => mine.reduce((n, w) => n + w[f], 0)
  const count = sum('count')
  if (!count) return null
  const overdue = sum('overdue')
  const level = tone({ overdue, dueSoon: sum('dueSoon') })
  return (
    <span
      aria-label={t('{n} waiting, {overdue} overdue', { n: count, overdue })}
      className={cx(
        'ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center text-sm leading-5 font-semibold tabular',
        level === 'error' && 'bg-error text-fg-on-brand',
        level === 'warning' && 'bg-warning text-fg-on-brand',
        level === 'neutral' && 'bg-subtle text-fg-secondary',
      )}
    >
      {count > 99 ? '99+' : formatNumber(count)}
    </span>
  )
}

/** "Waiting for you": the kinds of work open now, overdue first, each opening its screen. */
export function WorkInboxPanel({ className }) {
  const query = useQuery([KEY], (opts) => api.workSummary(opts))
  const items = (query.data?.items ?? []).map((w) => ({
    id: w.kind,
    icon: w.overdue ? TriangleAlert : CircleCheck,
    tone: { error: 'error', warning: 'warning', neutral: 'info' }[tone(w)],
    title: t(KINDS[w.kind] ?? w.kind),
    badge: { label: formatNumber(w.count), tone: tone(w) },
    meta: w.overdue
      ? t('{n} overdue', { n: w.overdue })
      : w.dueSoon
        ? t('{n} due within 24 hours', { n: w.dueSoon })
        : w.oldestAt
          ? t('Waiting since {date}', { date: formatRelative(w.oldestAt) })
          : null,
    action: { label: t('Open'), to: w.link },
  }))
  return (
    <Panel title="Waiting for you" subtitle={t('Most urgent first')} className={className}>
      <QueryState query={query} compact isEmpty={() => false}>
        {() => <WorkList items={items} empty={<EmptyBlock icon={CircleCheck} title="Nothing is waiting for you" className="py-6" />} />}
      </QueryState>
    </Panel>
  )
}
