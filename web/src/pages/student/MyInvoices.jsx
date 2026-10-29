import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Banknote, Calendar, CreditCard, ReceiptText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Alert, StatTile } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { DataTable } from '@/components/student/DataTable'
import { EmptyState } from '@/components/student/EmptyState'
import { StatusBadge } from '@/components/student/StatusBadge'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { ReceiptModal, StudentPage } from './shared'
import { RefundAccountCard } from './refundAccount'
import { t, tr } from '@/i18n'

// SCR-BIL-01 My Invoices (Figma 19:1051)
// GET /students/me/invoices?termId&page&pageSize → {
//   items: [{ id, type, typeLabel, title, termName, amount, dueAt, status, paidAt, paymentMethod, transferContent }], total,
//   summary: { outstanding, dueCount, nextDueAt, paidTotal, paidCount, upcoming: { typeLabel, amount, note } | null,
//              awaitingCount, warning: { level (Warning, Final warning), debt, overdue, terminateOn, issuedAt } | null } }
// The Utility debt warning (spec §6.14): unpaid Utility for the configured months, or a debt reaching the Utility
// Deposit, ends the stay after the final warning.

/** Utility Invoices open their breakdown; others open the payment page ("I have transferred"). */
export const invoicePath = (inv) => (inv.type === 'utility' ? `/student/invoices/${inv.id}` : `/student/invoices/${inv.id}/pay`)

const UNPAID = new Set(['Unpaid', 'Overdue'])
const unpaidFirst = (a, b) => Number(UNPAID.has(b.status)) - Number(UNPAID.has(a.status))
const anchorOf = (inv) => `invoice-${inv.id}`

/** "Due: …" (red once overdue) for an unpaid Invoice, "Paid on: …" when the response has the payment date. */
function DateCell({ inv }) {
  if (inv.status === 'Paid' && inv.paidAt) return <span className="nowrap">{t('Paid on: {date}', { date: formatDate(inv.paidAt) })}</span>
  return <span className={cx('nowrap', inv.status === 'Overdue' && 'font-medium text-danger')}>{t('Due: {date}', { date: formatDateTime(inv.dueAt) })}</span>
}

// Columns are static; only the receipt action needs the page's setter, so they are built once per page.
function invoiceColumns(openReceipt) {
  return [
    {
      key: 'id',
      header: 'Invoice',
      render: (inv) => (
        <Link to={invoicePath(inv)} className="font-medium text-link hover:underline">
          {inv.id}
        </Link>
      ),
    },
    { key: 'typeLabel', header: 'Type', render: (inv) => tr(inv.typeLabel) },
    { key: 'termName', header: 'Term' },
    { key: 'amount', header: 'Amount', money: true, render: (inv) => formatVnd(inv.amount) },
    { key: 'dueAt', header: 'Due / paid', render: (inv) => <DateCell inv={inv} /> },
    { key: 'status', header: 'Status', render: (inv) => <StatusBadge status={inv.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      actions: true,
      render: (inv) =>
        inv.status === 'Paid' ? (
          <Button variant="text" onClick={() => openReceipt(inv)}>
            Receipt
          </Button>
        ) : UNPAID.has(inv.status) ? (
          <Button variant="text" to={`/student/invoices/${inv.id}/pay`}>
            Pay
          </Button>
        ) : null,
    },
  ]
}

export default function MyInvoices() {
  const { term } = useSession()
  const [receipt, setReceipt] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery(['invoices', 'mine', term?.id, page, pageSize], ({ signal }) => api.me.invoices({ termId: term?.id, page, pageSize }, { signal }))
  const summary = query.data?.summary
  const columns = useMemo(() => invoiceColumns(setReceipt), [])
  const rows = useMemo(() => [...(query.data?.items ?? [])].sort(unpaidFirst), [query.data])
  const firstDue = rows.find((inv) => UNPAID.has(inv.status))
  const owing = summary?.outstanding > 0
  // "… then press I have transferred.": the button name is set in bold.
  const [before, after] = t('Invoices for your dormitory stay. Transfer each one before its due date, then press {button}.').split('{button}')

  return (
    <StudentPage
      flow
      title="Payments"
      description={
        <>
          {before}
          <strong className="font-semibold text-text">{t('I have transferred')}</strong>
          {after}
        </>
      }
    >
      {summary?.warning && (
        <Alert
          type={summary.warning.level === 'Final warning' ? 'error' : 'warning'}
          title={summary.warning.level === 'Final warning' ? 'Final warning: Utility debt' : 'Utility overdue'}
          className="shrink-0"
        >
          {summary.warning.level === 'Final warning'
            ? t('You owe {debt} for Utility. Pay everything before {date}, or your stay will be terminated.', { debt: formatVnd(summary.warning.debt), date: formatDate(summary.warning.terminateOn) })
            : t('You owe {debt} for Utility. Pay it now: unpaid Utility can end your stay.', { debt: formatVnd(summary.warning.debt) })}
        </Alert>
      )}
      {summary?.awaitingCount > 0 && (
        <Alert type="info" title="Transfers waiting for a Manager" className="shrink-0">
          {t('{n} of your transfers wait for confirmation. Their deadlines are paused.', { n: summary.awaitingCount })}
        </Alert>
      )}
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-6">
        <section className={cx('flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-5', owing ? 'border-warning/30 bg-warning-bg' : 'border-border bg-surface')}>
          <span className={cx('flex items-center gap-2 text-small font-medium', owing ? 'text-warning-fg' : 'text-text-secondary')}>
            <Banknote size={16} aria-hidden="true" />
            {t('Outstanding')}
          </span>
          <p className="text-h2 font-semibold text-text num">{summary ? formatVnd(summary.outstanding) : '—'}</p>
          <p className="text-small text-text-secondary">
            {summary?.dueCount
              ? t(summary.dueCount === 1 ? '{n} Invoice due · next {date}' : '{n} Invoices due · next {date}', { n: summary.dueCount, date: formatDate(summary.nextDueAt) })
              : t('Nothing to pay right now')}
          </p>
          {owing && firstDue && (
            <a href={`#${anchorOf(firstDue)}`} className="inline-flex h-10 items-center self-start rounded-md bg-primary px-5 text-base font-medium text-fg-on-brand hover:bg-primary-hover">
              {t('Pay')}
            </a>
          )}
        </section>
        <StatTile
          icon={CreditCard}
          className="max-lg:hidden"
          label={term ? t('Paid for {term}', { term: term.name }) : t('Paid')}
          value={summary ? formatVnd(summary.paidTotal) : '—'}
          note={summary?.paidCount ? t(summary.paidCount === 1 ? '{n} payment' : '{n} payments', { n: summary.paidCount }) : t('No payments yet')}
        />
        <StatTile
          icon={Calendar}
          className="max-lg:hidden"
          label="Next Invoice"
          value={summary?.upcoming ? formatVnd(summary.upcoming.amount) : '—'}
          note={summary?.upcoming ? `${tr(summary.upcoming.typeLabel)} · ${tr(summary.upcoming.note)}` : t('No upcoming Invoice this Term')}
        />
      </div>

      <RefundAccountCard />

      <section aria-labelledby="invoices-heading" className="flex flex-col gap-3">
        <h2 id="invoices-heading" className="text-section-title text-text">
          {t('Invoices')}
        </h2>
        <QueryState query={query} empty={<EmptyState icon={ReceiptText} title="No invoices" description="The deposit Invoice is issued when you submit an Application." />}>
          {(data) => (
            <DataTable
              caption="Invoices"
              columns={columns}
              rows={rows}
              rowId={anchorOf}
              total={data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
              noun={['invoice', 'invoices']}
            />
          )}
        </QueryState>
      </section>

      <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />
    </StudentPage>
  )
}
