import { useParams } from 'react-router'
import { BedDouble, CalendarClock, Check, CheckCircle2, Download, Droplets, ReceiptText, Users, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { daysFromToday, formatDate, formatDateRange, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-BIL-03 Utility Invoice (Figma 102:2263) — also shows any other Invoice's details.
// GET /invoices/:id → { id, title, type, typeLabel, amount, status, issuedAt, dueAt, paidAt, room,
//   breakdown: { segments: [{ from, to, note, residents, kwh, electricityCost, m3, waterCost, share }],
//                subtotal, roundingNote, priceKwh, priceM3 } | null,
//   lines: [{ label, amount }] | null, utilityDeposit, termName, paymentMethod, transferContent, reference,
//   period: { label, from, to, month, months } | null }   — the month of the Term a Utility Invoice bills (R-26)
// Every Invoice of Payments opens here (R-26): its lines or meter breakdown and, once paid, its receipt.
// Layout: the invoice as a sheet on the left (its header, facts, what is billed and the total; a stamp once paid),
// the amount, the payment timeline and the receipt on the right; both cards are as tall as their content.

/** One labelled value of a card: label left, value right. */
function Row({ label, children, strong, tone, className }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 text-base', className)}>
      <span className={strong ? 'font-semibold text-fg' : 'text-fg-secondary'}>{label}</span>
      <span className={cx('min-w-0 text-right tabular', strong ? 'text-lg font-semibold text-fg' : 'text-fg', tone)}>{children}</span>
    </div>
  )
}

/** Subtotal, the rounding and the total under a list of charges. */
function Totals({ subtotal, rounding, total }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {subtotal != null && subtotal !== total && <Row label={t('Subtotal')}>{formatVnd(subtotal)}</Row>}
      {rounding}
      <Row label={t('Total')} strong>
        {formatVnd(total)}
      </Row>
    </div>
  )
}

/** A usage tile of the utility breakdown: icon, what, how much and what it costs. */
function Usage({ icon: Glyph, tone, label, value, note }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-subtle/60 px-3 py-2.5">
      <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-full', tone)}>
        <Glyph size={18} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-fg-tertiary">{label}</span>
        <span className="truncate text-base font-semibold text-fg tabular">{value}</span>
        {note && <span className="truncate text-sm text-fg-secondary tabular">{note}</span>}
      </span>
    </div>
  )
}

// "Each share is rounded up to 1,000 VND." → 1000 (the API sends the sentence in English).
const roundingStep = (note) => {
  const m = /rounded up to ([\d.,]+)/.exec(note ?? '')
  return m ? Number(m[1].replace(/[.,]/g, '')) : null
}
// 18 → "18", 12.5 → "12,5": meter usage with a decimal only when it has one.
const qty = (v) => formatNumber(v, { decimals: Number.isInteger(Number(v)) ? 0 : 1 })
// A segment's note is left out when it only repeats its dates.
const usefulNote = (note) => note && !/^[\d\s/.–-]+$/.test(note)

function Breakdown({ inv }) {
  const b = inv.breakdown
  const sum = (key) => b.segments.reduce((total, s) => total + Number(s[key] ?? 0), 0)
  const step = roundingStep(b.roundingNote)
  const rounding = inv.amount - (b.subtotal ?? inv.amount)
  const residents = [...new Set(b.segments.map((s) => s.residents))]
  return (
    <Card padding="lg" className="relative flex min-w-0 flex-1 flex-col gap-5 self-start">
      <PaidStamp inv={inv} />
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold text-fg">{t('How your share is calculated')}</h2>
        {inv.period && (
          <p className="text-base text-fg-secondary">
            {inv.period.months
              ? t('{label} · month {month} of {months} of {term} ({from} – {to})', { label: tr(inv.period.label), month: inv.period.month, months: inv.period.months, term: inv.termName ?? '', from: formatDate(inv.period.from), to: formatDate(inv.period.to) })
              : `${tr(inv.period.label)} (${formatDateRange(inv.period.from, inv.period.to)})`}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Usage icon={Zap} tone="bg-warning-bg text-warning-fg" label={t('Electricity')} value={`${qty(sum('kwh'))} kWh`} note={formatVnd(sum('electricityCost'))} />
        <Usage icon={Droplets} tone="bg-info-bg text-info-fg" label={t('Water')} value={`${qty(sum('m3'))} m³`} note={formatVnd(sum('waterCost'))} />
        <Usage
          icon={Users}
          tone="bg-brand-subtle text-fg-brand"
          label={inv.room ? t('Room {room}', { room: inv.room }) : t('Residents')}
          value={residents.length === 1 ? t(residents[0] === 1 ? '{n} resident' : '{n} residents', { n: residents[0] }) : t('{from}–{to} residents', { from: Math.min(...residents), to: Math.max(...residents) })}
          note={t('One shared meter')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-fg">{t('Periods')}</h3>
        <p className="text-sm text-fg-tertiary">{t('Each period is split equally among the residents in it.')}</p>
        {/* Phone: MOB-BIL-03 Utility Invoice › Segments (Figma 104:14502) — a dated line and its usage per segment. */}
        <ul className="flex flex-col gap-3 lg:hidden">
          {b.segments.map((s) => (
            <li key={`${s.from}-${s.to}`} className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 last:pb-0">
              <span className="text-sm text-fg-secondary">
                {formatDateRange(s.from, s.to)} · {t(s.residents === 1 ? '{n} resident' : '{n} residents', { n: s.residents })}
                {usefulNote(s.note) ? ` · ${tr(s.note)}` : ''}
              </span>
              <span className="flex items-start justify-between gap-3 text-base">
                <span className="text-fg">
                  {qty(s.kwh)} kWh · {qty(s.m3)} m³
                </span>
                <span className="font-medium text-fg">{formatVnd(s.share)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="overflow-hidden rounded-lg border border-line max-lg:hidden">
          <Table bare>
            <THead>
              <tr>
                <Th>Period</Th>
                <Th className="w-24" align="right">
                  Residents
                </Th>
                <Th className="w-44" align="right">
                  Electricity
                </Th>
                <Th className="w-40" align="right">
                  Water
                </Th>
                <Th className="w-32" align="right">
                  Your share
                </Th>
              </tr>
            </THead>
            <TBody>
              {b.segments.map((s) => (
                <Tr key={`${s.from}-${s.to}`}>
                  <Td>
                    <span className="flex flex-col">
                      <span className="font-medium">{formatDateRange(s.from, s.to)}</span>
                      {usefulNote(s.note) && <span className="text-sm text-fg-tertiary">{tr(s.note)}</span>}
                    </span>
                  </Td>
                  <Td align="right" className="tabular">
                    {s.residents}
                  </Td>
                  <Td align="right">
                    <span className="flex flex-col tabular">
                      <span>{formatVnd(s.electricityCost)}</span>
                      <span className="text-sm text-fg-tertiary">{qty(s.kwh)} kWh</span>
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="flex flex-col tabular">
                      <span>{formatVnd(s.waterCost)}</span>
                      <span className="text-sm text-fg-tertiary">{qty(s.m3)} m³</span>
                    </span>
                  </Td>
                  <Td align="right" className="font-medium tabular">
                    {formatVnd(s.share)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </div>

      <Totals
        subtotal={b.subtotal}
        total={inv.amount}
        rounding={
          rounding > 0 && (
            <Row label={step ? t('Rounded up to {step}', { step: formatVnd(step) }) : t('Rounding')}>+ {formatVnd(rounding)}</Row>
          )
        }
      />
      {(b.priceKwh || b.priceM3) && (
        <p className="-mt-2 text-sm text-fg-tertiary">
          {t('Prices: {kwh} ₫/kWh and {m3} ₫/m³. Readings are entered by staff each month and at every move-in or move-out.', { kwh: formatNumber(b.priceKwh), m3: formatNumber(b.priceM3) })}
        </p>
      )}
    </Card>
  )
}

/** A tilted "Paid" stamp in the corner of a paid invoice. */
function PaidStamp({ inv }) {
  if (inv.status !== 'Paid') return null
  return (
    <span aria-hidden="true" className="pointer-events-none absolute top-5 right-6 -rotate-12 rounded-md border-2 border-success/50 px-3 py-1 text-base font-bold tracking-widest text-success-fg/70 uppercase select-none">
      {t('Paid')}
    </span>
  )
}

/** One fact of the invoice sheet: a small label above its value. */
function Fact({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm text-fg-tertiary">{label}</dt>
      <dd className="truncate text-base font-medium text-fg">{children}</dd>
    </div>
  )
}

function Lines({ inv }) {
  // An invoice billed as one amount has no lines: it is shown as one line named after its type.
  const lines = inv.lines?.length ? inv.lines : [{ label: inv.typeLabel || inv.title, amount: inv.amount }]
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0)
  const Glyph = inv.type === 'room' || /room|phòng/i.test(inv.typeLabel ?? '') ? BedDouble : ReceiptText
  return (
    <Card padding="none" className="relative flex min-w-0 flex-1 flex-col self-start overflow-hidden">
      <PaidStamp inv={inv} />
      {/* The sheet's header: what this invoice is for. */}
      <div className="flex items-center gap-3 border-b border-line bg-brand-subtle/40 px-4 py-4 lg:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand shadow-card">
          <Glyph size={22} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm text-fg-tertiary">{t('Invoice')}</span>
          <span className="truncate text-h3 font-semibold text-fg">{tr(inv.typeLabel) || tr(inv.title)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-5 px-4 py-5 lg:px-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label={t('Invoice number')}>
            <span className="font-mono text-sm">{inv.id}</span>
          </Fact>
          <Fact label={t('Term')}>{inv.termName ?? '—'}</Fact>
          <Fact label={t('Issued')}>{formatDate(inv.issuedAt)}</Fact>
          <Fact label={t('Due')}>{formatDate(inv.dueAt)}</Fact>
        </dl>

        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between gap-4 bg-subtle/70 px-4 py-2 text-sm font-medium text-fg-tertiary">
            <span>{t('Item')}</span>
            <span>{t('Amount')}</span>
          </div>
          <ul className="flex flex-col">
            {lines.map((l, i) => (
              <li key={`${l.label}-${i}`} className="flex items-baseline justify-between gap-4 border-t border-line px-4 py-3 text-base first:border-t-0">
                <span className="text-fg">{tr(l.label)}</span>
                <span className="text-fg tabular">{formatVnd(l.amount)}</span>
              </li>
            ))}
          </ul>
          {lines.length > 1 && (
            <div className="flex items-baseline justify-between gap-4 border-t border-line px-4 py-2.5 text-base">
              <span className="text-fg-secondary">{t('Subtotal')}</span>
              <span className="text-fg tabular">{formatVnd(subtotal)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 border-t border-line bg-subtle/70 px-4 py-3">
            <span className="text-base font-semibold text-fg">{t('Total')}</span>
            <span className="text-h3 font-semibold text-fg tabular">{formatVnd(inv.amount)}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// Whole days from a to b (b later: positive).
const daysBetween = (a, b) => Math.round((new Date(b).setHours(0, 0, 0, 0) - new Date(a).setHours(0, 0, 0, 0)) / 86400000)

/** When it was paid against its due date, or how long is left. */
function timing(inv) {
  if (inv.paidAt && inv.dueAt) {
    const early = daysBetween(inv.paidAt, inv.dueAt)
    if (early > 0) return { text: t('Paid {n} days before the due date', { n: early }), tone: 'text-success-fg' }
    if (early < 0) return { text: t('Paid {n} days after the due date', { n: -early }), tone: 'text-warning-fg' }
    return { text: t('Paid on the due date'), tone: 'text-success-fg' }
  }
  if (inv.dueAt && (inv.status === 'Unpaid' || inv.status === 'Overdue')) {
    const left = daysFromToday(inv.dueAt)
    if (left < 0) return { text: t('{n} days overdue', { n: -left }), tone: 'text-error-fg' }
    if (left === 0) return { text: t('Due today'), tone: 'text-warning-fg' }
    return { text: t('{n} days left to pay', { n: left }), tone: 'text-fg-secondary' }
  }
  return null
}

/** Issued → paid → due (in date order): what happened to this invoice. */
function Timeline({ inv }) {
  const overdue = inv.status === 'Overdue'
  const steps = [
    { key: 'issued', label: t('Issued'), at: inv.issuedAt, done: true },
    inv.paidAt && { key: 'paid', label: t('Paid'), at: inv.paidAt, note: inv.paymentMethod ? tr(inv.paymentMethod) : null, done: true, time: true },
    inv.dueAt && { key: 'due', label: t('Due'), at: inv.dueAt, done: Boolean(inv.paidAt) || overdue, late: overdue, time: true },
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-6 bottom-0 left-[11px] w-px bg-line" />}
          <span
            className={cx(
              'flex size-6 shrink-0 items-center justify-center rounded-full border',
              s.late ? 'border-error/40 bg-error-bg text-error-fg' : s.key === 'paid' ? 'border-success/40 bg-success-bg text-success-fg' : s.done ? 'border-line bg-subtle text-fg-secondary' : 'border-line bg-surface text-fg-tertiary',
            )}
          >
            {s.key === 'paid' ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-current" />}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className={cx('text-base', s.key === 'paid' ? 'font-semibold text-success-fg' : s.late ? 'font-medium text-error-fg' : 'text-fg')}>{s.label}</span>
              {s.note && <span className="text-sm text-fg-tertiary">{s.note}</span>}
            </span>
            <span className="shrink-0 text-base text-fg-secondary tabular">{s.time ? formatDateTime(s.at) : formatDate(s.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The amount and how it stands, the payment timeline and, once paid, the receipt and its PDF. */
function Summary({ inv }) {
  const { notifyError } = useToast()
  const pdf = useMutation(() => api.invoices.receipt(inv.id), { onError: (e) => notifyError(e, 'Could not download the receipt') })
  const payable = inv.status === 'Unpaid' || inv.status === 'Overdue'
  const paid = inv.status === 'Paid' || inv.status === 'Refunded'
  const when = timing(inv)
  return (
    // Phone: the amount card comes first, as in MOB-BIL-03 Utility Invoice.
    <div className="flex w-full shrink-0 flex-col gap-3 self-start max-lg:order-first lg:w-96 lg:gap-4">
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <StatusTag status={inv.status} />
          <p className="text-kpi font-semibold text-fg tabular">{formatVnd(inv.amount)}</p>
          {when && (
            <p className={cx('flex items-center gap-1.5 text-sm font-medium', when.tone)}>
              {paid ? <CheckCircle2 size={15} aria-hidden="true" /> : <CalendarClock size={15} aria-hidden="true" />}
              {when.text}
            </p>
          )}
        </div>
        {(payable || inv.status === 'Awaiting confirmation') && (
          <Button variant="primary" size="lg" block to={`/student/invoices/${inv.id}/pay`}>
            {payable ? t('Pay with VietQR') : t('View payment')}
          </Button>
        )}
        <div className="border-t border-line pt-4">
          <Timeline inv={inv} />
        </div>
        {inv.type === 'utility' && inv.utilityDeposit > 0 && (
          <p className="text-sm text-fg-tertiary">{t('Your utility deposit ({amount}) is not used for monthly bills. It is settled at check-out.', { amount: formatVnd(inv.utilityDeposit) })}</p>
        )}
      </Card>

      {paid && (
        <Card padding="lg" className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <ReceiptText size={17} aria-hidden="true" className="text-fg-brand" />
            {t('Receipt')}
          </h3>
          <div className="flex flex-col gap-2">
            {inv.paymentMethod && <Row label={t('Method')}>{tr(inv.paymentMethod)}</Row>}
            {inv.transferContent && (
              <Row label={t('Transfer content')}>
                <span className="font-mono text-sm">{inv.transferContent}</span>
              </Row>
            )}
          </div>
          <Button block icon={Download} onClick={() => pdf.run()} disabled={pdf.pending}>
            {pdf.pending ? 'Downloading…' : 'Download receipt (PDF)'}
          </Button>
        </Card>
      )}
    </div>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const query = useQuery(['invoices', id], ({ signal }) => api.invoices.get(id, { signal }))
  const inv = query.data

  return (
    <StudentPage breadcrumb={[{ label: 'Payments', to: '/student/invoices' }, { label: id }]} title={tr(inv?.title) || t('Invoice {id}', { id })}>
      {inv === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={ReceiptText} title="Invoice not found" action={<Button to="/student/invoices">Back to payments</Button>} />
      ) : inv === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        // The page scrolls as a whole when the details are long; the cards never stretch.
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-start lg:gap-6 lg:overflow-y-auto">
          {inv.breakdown ? <Breakdown inv={inv} /> : <Lines inv={inv} />}
          <Summary inv={inv} />
        </div>
      )}
    </StudentPage>
  )
}
