import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Banknote, Calendar, CreditCard, ReceiptText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Alert, StatTile } from '@/components/ui/Display'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, stop } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { ReceiptModal, StatusList, StatusRow, StudentPage } from './shared'
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

export default function MyInvoices() {
  const navigate = useNavigate()
  const { term } = useSession()
  const [receipt, setReceipt] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery(['invoices', 'mine', term?.id, page, pageSize], ({ signal }) => api.me.invoices({ termId: term?.id, page, pageSize }, { signal }))
  const summary = query.data?.summary
  const items = query.data?.items ?? []

  return (
    <StudentPage title="Payments" description="Invoices for your dormitory stay. Transfer each one before its due date, then press I have transferred.">
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
        <StatTile
          icon={Banknote}
          label="Outstanding"
          value={summary ? formatVnd(summary.outstanding) : '—'}
          note={summary?.dueCount ? t(summary.dueCount === 1 ? '{n} Invoice due · next {date}' : '{n} Invoices due · next {date}', { n: summary.dueCount, date: formatDate(summary.nextDueAt) }) : t('Nothing to pay right now')}
        />
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

      {/* Phone: MOB-BIL-01 Invoices (Figma 56:203) — one row per Invoice instead of the table. */}
      <section className="flex flex-col gap-3 lg:hidden">
        <h2 className="text-sm font-medium text-fg-tertiary">{t('Invoices')}</h2>
        <QueryState query={query} compact empty={<EmptyBlock icon={ReceiptText} title="No invoices">The deposit Invoice is issued when you submit an Application.</EmptyBlock>}>
          {(data) => (
            <StatusList>
              {data.items.map((inv) => (
                <StatusRow
                  key={inv.id}
                  icon={CreditCard}
                  value={`${tr(inv.typeLabel)} · ${formatVnd(inv.amount)}`}
                  note={`${inv.id} · ${inv.status === 'Paid' ? t('paid {date}', { date: formatDate(inv.paidAt) }) : t('due {date}', { date: formatDate(inv.dueAt) })}`}
                  tag={inv.status === 'Upcoming' ? <Tag>Upcoming</Tag> : <StatusTag status={inv.status} />}
                  to={invoicePath(inv)}
                />
              ))}
            </StatusList>
          )}
        </QueryState>
      </section>

      <Table size="lg" fill className="max-lg:hidden">
        <THead>
          <tr>
            <Th className="w-44">Invoice</Th>
            <Th className="w-48">Type</Th>
            <Th className="w-35">Term</Th>
            <Th className="w-38" align="right">
              Amount
            </Th>
            <Th className="w-44">Due</Th>
            <Th>Status</Th>
            <Th className="w-26">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={ReceiptText} emptyTitle="No invoices" emptyText="The deposit Invoice is issued when you submit an Application." />
          {items.map((inv) => (
            <Tr key={inv.id} onClick={() => navigate(invoicePath(inv))}>
              <Td className="font-medium text-fg-brand">{inv.id}</Td>
              <Td className="max-w-48 truncate" title={tr(inv.typeLabel)}>
                {tr(inv.typeLabel)}
              </Td>
              <Td>{inv.termName}</Td>
              <Td align="right" className="whitespace-nowrap">
                {formatVnd(inv.amount)}
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(inv.dueAt)}</Td>
              <Td>{inv.status === 'Upcoming' ? <Tag>Upcoming</Tag> : <StatusTag status={inv.status} />}</Td>
              <Td onClick={stop}>
                {inv.status === 'Paid' && (
                  <Button variant="text" onClick={() => setReceipt(inv)}>
                    Receipt
                  </Button>
                )}
                {(inv.status === 'Unpaid' || inv.status === 'Overdue') && (
                  <Button variant="text" to={`/student/invoices/${inv.id}/pay`}>
                    Pay
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="flex shrink-0 justify-end">
        <Pagination
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>

      <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />
    </StudentPage>
  )
}
