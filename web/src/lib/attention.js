import { formatDate, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

/*
 * The words of a "needs your attention" line (GET /dashboards/staff attention[], /dashboards/manager waiting[]),
 * written here from its kind and values (contract A-63) so they follow the language; the API's English title and
 * body are the fallback for a kind this list does not know. Escalations keep their title and reason as typed.
 */
const REFUND_SOURCE = {
  CHECK_OUT: 'Check-out: Utility Deposit settlement',
  ROOM_CHANGE: 'Room change or swap',
  APPLICATION_CANCEL: 'Application cancelled',
}
const REQUEST_TYPE = { MAINTENANCE: 'Maintenance Requests', ROOM_CHANGE: 'Room-Change Requests' }

const WORDS = {
  proposal: (v) => ({ title: t('{n} conflicts in the allocation proposal', { n: formatNumber(v.count) }), body: t('Resolve them before the Block goes to its Manager.') }),
  payments: (v) => ({ title: t('{n} transfers to confirm', { n: formatNumber(v.count) }), body: t('Students said they transferred and wait for a Manager to confirm.') }),
  maintenance: (v) => ({ title: t('{n} urgent Maintenance Requests open', { n: formatNumber(v.count) }), body: t('High priority, not resolved yet.') }),
  queue: (v) => ({ title: t('{n} Applications to review', { n: formatNumber(v.count) }), body: t('{s} Submitted · {u} Under Review', { s: v.submitted, u: v.underReview }) }),
  room: (v) => ({ title: t('{n} Rooms out of service', { n: formatNumber(v.count) }), body: t('Oldest: {room} since {date}', { room: v.room, date: formatDate(v.since) }) }),
  'check-out': (v) => ({ title: t('{n} leavers past the check-out date', { n: formatNumber(v.count) }), body: t('They have not checked out at the desk.') }),
  'meter-period': (v) => ({
    title: t('Meter period {period} of Block {block} not closed', { period: v.period, block: v.block }),
    body: t('The month ended {n} days ago; its residents get no Utility Invoice until it is closed.', { n: formatNumber(v.days) }),
  }),
  expired: (v) => ({ title: t('{n} Deposits expired this week', { n: formatNumber(v.count) }), body: t('Their Applications were cancelled; the students may apply again.') }),
  refund: (v) => ({ title: t('Refund of {amount}', { amount: formatVnd(v.amount) }), body: t(REFUND_SOURCE[v.source] ?? 'Other') }),
  routing: (v) => ({
    title: t('No routing rule for {type} in Block {block}', { type: t(REQUEST_TYPE[v.requestType] ?? 'requests'), block: v.block }),
    body: t('New requests of this type wait unassigned until someone takes them.'),
  }),
}

/** { title, body, cta } of an attention line in the current language. */
export function attentionText(item) {
  const write = item.values && WORDS[item.kind]
  const words = write ? write(item.values) : { title: tr(item.title), body: tr(item.body) }
  return { ...words, cta: item.cta }
}
