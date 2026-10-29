import { formatCompactVnd, formatNumber, formatPercent } from '@/lib/format'
import { t } from '@/i18n'

/** The collection rate as a whole percent, rounded down: 99.97 % reads 99 %, never 100 % while money is owed. */
export const floorPercent = (rate) => formatPercent(rate == null ? null : Math.floor(rate * 100) / 100, 0)

/**
 * The note under "Collected this Term" on the Manager and Admin homes: the rate, and what is still owed whenever
 * anything is (kpis.outstanding, outstandingInvoices; contract A-63).
 */
export function collectedNote(k) {
  return k.outstanding > 0
    ? t('{p} of invoiced · {amount} unpaid ({n} Invoices)', { p: floorPercent(k.collectionRate), amount: formatCompactVnd(k.outstanding), n: formatNumber(k.outstandingInvoices) })
    : t('{p} of invoiced', { p: floorPercent(k.collectionRate) })
}

/** Tooltip of "Collected this Term": the rule every screen uses (backend answer Q1). */
export const COLLECTED_RULE = 'Paid Invoices of every kind, Utility Deposit included; refunds shown apart'
