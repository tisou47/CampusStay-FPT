import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Banknote, Calendar, CreditCard, ReceiptText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { StatTile } from '@/components/ui/Display'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, stop } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { ReceiptModal, StudentPage } from './shared'

// SCR-BIL-01 My Invoices (Figma 19:1051)
// GET /students/me/invoices?termId&page&pageSize → {
//   items: [{ id, type, typeLabel, title, termName, amount, dueAt, status, paidAt, paymentMethod, transferContent }], total,
//   summary: { outstanding, dueCount, nextDueAt, paidTotal, paidCount, upcoming: { typeLabel, amount, note } | null } }

/** Utility Invoices open their breakdown; others open the VietQR payment page. */
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
    <StudentPage title="Payments" description="Invoices for your dormitory stay. Pay each Invoice with VietQR before its due date.">
      <div className="flex shrink-0 items-stretch gap-6">
        <StatTile
          icon={Banknote}
          label="Outstanding"
          value={summary ? formatVnd(summary.outstanding) : '—'}
          note={summary?.dueCount ? `${summary.dueCount} ${summary.dueCount === 1 ? 'Invoice' : 'Invoices'} due · next ${formatDate(summary.nextDueAt)}` : 'Nothing to pay right now'}
        />
        <StatTile
          icon={CreditCard}
          label={`Paid${term ? ` for ${term.name}` : ''}`}
          value={summary ? formatVnd(summary.paidTotal) : '—'}
          note={summary?.paidCount ? `${summary.paidCount} ${summary.paidCount === 1 ? 'payment' : 'payments'}` : 'No payments yet'}
        />
        <StatTile
          icon={Calendar}
          label="Next Invoice"
          value={summary?.upcoming ? formatVnd(summary.upcoming.amount) : '—'}
          note={summary?.upcoming ? `${summary.upcoming.typeLabel} · ${summary.upcoming.note}` : 'No upcoming Invoice this Term'}
        />
      </div>

      <Table size="lg" fill>
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
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={ReceiptText} emptyTitle="No invoices" emptyText="The deposit Invoice is issued when you submit an Application." />
          {items.map((inv) => (
            <Tr key={inv.id} onClick={() => navigate(invoicePath(inv))}>
              <Td className="font-medium text-fg-brand">{inv.id}</Td>
              <Td className="max-w-48 truncate" title={inv.typeLabel}>
                {inv.typeLabel}
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
