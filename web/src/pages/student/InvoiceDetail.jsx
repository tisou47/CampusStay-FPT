import { useParams } from 'react-router'
import { ReceiptText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card, DetailRows } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-BIL-03 Utility Invoice (Figma 102:2263) — also shows any other Invoice's details.
// GET /invoices/:id → { id, title, type, typeLabel, amount, status, issuedAt, dueAt, paidAt, room,
//   breakdown: { segments: [{ from, to, note, residents, kwh, electricityCost, m3, waterCost, share }],
//                subtotal, roundingNote, priceKwh, priceM3 } | null,
//   lines: [{ label, amount }] | null, utilityDeposit, termName, paymentMethod, transferContent, reference,
//   period: { label, from, to, month, months } | null }   — the month of the Term a Utility Invoice bills (R-26)
// Every Invoice of Payments opens here (R-26): its lines or meter breakdown and, once paid, its receipt.

/** The receipt of a paid Invoice, with its PDF (inside the amount card). */
function ReceiptCard({ inv }) {
  const { notifyError } = useToast()
  const pdf = useMutation(() => api.invoices.receipt(inv.id), { onError: (e) => notifyError(e, 'Could not download the receipt') })
  return (
    <div className="flex w-full flex-col gap-3 border-t border-line pt-3">
      <h2 className="text-base font-semibold text-fg">{t('Receipt')}</h2>
      <DetailRows
        rows={[
          ['Invoice', inv.id],
          ['Term', inv.termName ?? '—'],
          ['Paid on', formatDateTime(inv.paidAt)],
          ['Method', inv.paymentMethod ? tr(inv.paymentMethod) : '—'],
          ['Transfer content', inv.transferContent ?? '—'],
          ['Amount', <span className="font-medium">{formatVnd(inv.amount)}</span>],
        ]}
      />
      <Button block onClick={() => pdf.run()} disabled={pdf.pending}>
        {pdf.pending ? 'Downloading…' : 'Download PDF'}
      </Button>
    </div>
  )
}

function Breakdown({ inv }) {
  const b = inv.breakdown
  return (
    <Card padding="lg" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-1">
        <h2 className="text-h3 font-semibold text-fg">{t('How your share is calculated')}</h2>
        {inv.period && (
          <p className="text-base font-medium text-fg">
            {inv.period.months
              ? t('{label} · month {month} of {months} of {term} ({from} – {to})', { label: tr(inv.period.label), month: inv.period.month, months: inv.period.months, term: inv.termName ?? '', from: formatDate(inv.period.from), to: formatDate(inv.period.to) })
              : `${tr(inv.period.label)} (${formatDate(inv.period.from)} – ${formatDate(inv.period.to)})`}
          </p>
        )}
        <p className="text-base text-fg-secondary">{inv.room ? `${t('{room} has one shared meter.', { room: inv.room })} ` : ''}{t('Each segment is split equally among the residents in it.')}</p>
      </div>
      {/* Phone: MOB-BIL-03 Utility Invoice › Segments (Figma 104:14502) — a dated line and its usage per segment. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {b.segments.map((s) => (
          <li key={`${s.from}-${s.to}`} className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 last:pb-0">
            <span className="text-sm text-fg-secondary">
              {formatDate(s.from)} – {formatDate(s.to)} · {t(s.residents === 1 ? '{n} resident' : '{n} residents', { n: s.residents })}
              {s.note ? ` · ${tr(s.note)}` : ''}
            </span>
            <span className="flex items-start justify-between gap-3 text-base">
              <span className="text-fg">
                {formatNumber(s.kwh)} kWh · {formatNumber(s.m3)} m³
              </span>
              <span className="font-medium text-fg">{formatVnd(s.share, { unit: false })}</span>
            </span>
          </li>
        ))}
      </ul>
      <Table fill className="max-lg:hidden">
        <THead>
          <tr>
            <Th>Segment</Th>
            <Th className="w-22">Residents</Th>
            <Th className="w-42">Electricity</Th>
            <Th className="w-38">Water</Th>
            <Th className="w-30" align="right">
              Your share
            </Th>
          </tr>
        </THead>
        <TBody>
          {b.segments.map((s) => (
            <Tr key={`${s.from}-${s.to}`}>
              <Td className="py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {formatDate(s.from)} – {formatDate(s.to)}
                  </span>
                  {s.note && <span className="text-sm text-fg-tertiary">{tr(s.note)}</span>}
                </div>
              </Td>
              <Td>{s.residents}</Td>
              <Td>
                {formatNumber(s.kwh)} kWh · {formatVnd(s.electricityCost, { unit: false })}
              </Td>
              <Td>
                {formatNumber(s.m3)} m³ · {formatVnd(s.waterCost, { unit: false })}
              </Td>
              <Td align="right">{formatVnd(s.share, { unit: false })}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex items-start justify-between text-base">
          <span className="text-fg-secondary">{t('Subtotal')}</span>
          <span className="text-fg">{formatVnd(b.subtotal)}</span>
        </div>
        <div className="flex items-start justify-between text-base">
          <span className="text-fg-secondary">{tr(b.roundingNote) || t('Total')}</span>
          <span className="font-medium text-fg">{formatVnd(inv.amount)}</span>
        </div>
        {(b.priceKwh || b.priceM3) && (
          <p className="text-sm text-fg-tertiary">
            {t('Prices: {kwh} VND/kWh and {m3} VND/m³. Readings are entered by Staff each month and at every move-in or move-out.', { kwh: formatNumber(b.priceKwh), m3: formatNumber(b.priceM3) })}
          </p>
        )}
      </div>
    </Card>
  )
}

function Lines({ inv }) {
  return (
    <Card padding="lg" className="flex min-w-0 flex-1 flex-col gap-1 self-start">
      <h2 className="text-h3 font-semibold text-fg">{tr(inv.typeLabel) || t('Invoice')}</h2>
      <DetailRows className="mt-2" rows={[...(inv.lines ?? []).map((l) => [l.label, formatVnd(l.amount)]), ['Total', <span className="font-medium">{formatVnd(inv.amount)}</span>]]} />
    </Card>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const query = useQuery(['invoices', id], ({ signal }) => api.invoices.get(id, { signal }))
  const inv = query.data
  const payable = inv && (inv.status === 'Unpaid' || inv.status === 'Overdue')

  return (
    <StudentPage breadcrumb={[{ label: 'Payments', to: '/student/invoices' }, { label: id }]} title={tr(inv?.title) || t('Invoice {id}', { id })}>
      {inv === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={ReceiptText} title="Invoice not found" action={<Button to="/student/invoices">Back to Payments</Button>} />
      ) : inv === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
          {inv.breakdown ? <Breakdown inv={inv} /> : <Lines inv={inv} />}
          {/* Phone: the amount card comes first, as in MOB-BIL-03 Utility Invoice. */}
          <Card padding="lg" className="flex w-full shrink-0 flex-col items-start gap-3 self-start max-lg:order-first lg:w-90">
            <StatusTag status={inv.status} />
            <p className="text-kpi font-semibold text-fg">{formatVnd(inv.amount)}</p>
            <div className="flex w-full justify-between text-base">
              <span className="text-fg-secondary">{t('Issued')}</span>
              <span className="text-fg">{formatDate(inv.issuedAt)}</span>
            </div>
            <div className="flex w-full justify-between text-base">
              <span className="text-fg-secondary">{t('Due')}</span>
              <span className="text-fg">{formatDateTime(inv.dueAt)}</span>
            </div>
            {inv.status === 'Paid' ? (
              <Button size="lg" block disabled>
                {t('Paid on {date}', { date: formatDate(inv.paidAt) })}
              </Button>
            ) : payable || inv.status === 'Awaiting confirmation' ? (
              <Button variant="primary" size="lg" block to={`/student/invoices/${inv.id}/pay`}>
                {payable ? t('Pay with VietQR') : t('View payment')}
              </Button>
            ) : null}
            {inv.type === 'utility' && inv.utilityDeposit != null && (
              <p className="text-sm text-fg-tertiary">{t('Your Utility Deposit ({amount}) is not used for monthly bills. It is settled at check-out.', { amount: formatVnd(inv.utilityDeposit) })}</p>
            )}
            {(inv.status === 'Paid' || inv.status === 'Refunded') && <ReceiptCard inv={inv} />}
          </Card>
        </div>
      )}
    </StudentPage>
  )
}
