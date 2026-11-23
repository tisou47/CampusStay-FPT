import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Banknote,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CircleCheck,
  CircleDot,
  Clock,
  CreditCard,
  FileText,
  HandCoins,
  Hash,
  Layers,
  Percent,
  ReceiptText,
  Scale,
  Undo2,
  Wallet,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, stop } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { InfoTip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { ReceiptModal, StatusList, StatusRow, StudentPage } from './shared'
import { RefundAccountCard } from './refundAccount'
import { t, tr } from '@/i18n'

// SCR-BIL-01 My Invoices (Figma 19:1051)
// GET /students/me/invoices?termId&page&pageSize → {
//   items: [{ id, type, typeLabel, title, termName, amount, dueAt, status, paidAt, paymentMethod, transferContent }], total,
//   summary: { outstanding, dueCount, nextDueAt, paidTotal, paidCount, upcoming: { typeLabel, amount, note } | null,
//              awaitingCount, warning: { level (Warning, Final warning), debt, overdue, terminateOn, issuedAt } | null } }
// The Utility debt warning (spec §6.14): unpaid Utility for the configured months, or a debt reaching the Utility
// Deposit, ends the stay after the final warning.
// GET /students/me/refunds → { items: [{ id, reason, rule, percent, paid, amount, status, createdAt, decidedAt, note }],
//   total, pendingAmount } — refunds are not Invoices, so they are listed apart (R-24).
// Layout: summary tiles → one refund-account block → Tab switcher (Invoices & fees | Refund items) → active tab card.

/** Every Invoice opens its detail (lines or meter breakdown, the receipt once paid); paying starts from there (R-26). */
export const invoicePath = (inv) => `/student/invoices/${inv.id}`

// Approved and Paid both read as good news for the student (money is coming back), so both are green.
const REFUND_TONES = { Pending: 'warning', Approved: 'success', Paid: 'success', Rejected: 'error' }

// Shared shell of the page's sections: white surface, hairline, 12 px corners, the card elevation.
const shell = 'flex shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card'

/* ---------------------------------------------------------------- Summary */

// tone → value colour and glyph chip. `due` asks for action (brand ink), `paid` is done money (green),
// `muted` is a zero or an empty value, so it steps back instead of shouting "0 ₫".
const TILE_TONES = {
  due: { value: 'text-fg-brand', chip: 'bg-primary-subtle text-fg-brand' },
  paid: { value: 'text-success-fg', chip: 'bg-success-bg text-success-fg' },
  default: { value: 'text-fg', chip: 'bg-subtle text-fg-secondary' },
  muted: { value: 'text-fg-tertiary', chip: 'bg-subtle text-fg-tertiary' },
}

function SummaryTile({ icon: Glyph, label, tip, value, note, noteIcon: NoteGlyph, noteTone, tone = 'default', className }) {
  const look = TILE_TONES[tone]
  return (
    <section className={cx('flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card lg:p-5', className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', look.chip)}>
          <Glyph size={16} />
        </span>
        <h2 className="flex min-w-0 items-center gap-1.5 text-base font-medium text-fg-secondary">
          <span className="truncate">{label}</span>
          {tip && <InfoTip label={tip} />}
        </h2>
      </div>
      <p className={cx('text-kpi font-semibold tabular', look.value)}>{value}</p>
      <p className={cx('flex min-w-0 items-center gap-1.5 text-sm', noteTone ?? 'text-fg-tertiary')}>
        {NoteGlyph && <NoteGlyph size={14} aria-hidden="true" className="shrink-0" />}
        <span className="truncate" title={typeof note === 'string' ? note : undefined}>
          {note}
        </span>
      </p>
    </section>
  )
}

function Summary({ summary, term }) {
  const outstanding = summary?.outstanding ?? 0
  const paidTotal = summary?.paidTotal ?? 0
  return (
    <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
      <SummaryTile
        icon={Banknote}
        label={t('Outstanding')}
        tip={t('Total of your invoices that are not paid yet.')}
        tone={!summary ? 'default' : outstanding > 0 ? 'due' : 'muted'}
        value={summary ? formatVnd(outstanding) : '—'}
        note={summary?.dueCount ? t(summary.dueCount === 1 ? '{n} invoice due · next {date}' : '{n} invoices due · next {date}', { n: summary.dueCount, date: formatDate(summary.nextDueAt) }) : t('Nothing to pay right now')}
        noteIcon={summary && !summary.dueCount ? CircleCheck : summary?.dueCount ? Clock : undefined}
        noteTone={summary && !summary.dueCount ? 'text-success-fg' : summary?.dueCount ? 'text-fg-brand' : undefined}
      />
      <SummaryTile
        icon={CreditCard}
        label={term ? t('Paid for {term}', { term: term.name }) : t('Paid')}
        tone={!summary ? 'default' : paidTotal > 0 ? 'paid' : 'muted'}
        value={summary ? formatVnd(paidTotal) : '—'}
        note={summary?.paidCount ? t(summary.paidCount === 1 ? '{n} payment' : '{n} payments', { n: summary.paidCount }) : t('No payments yet')}
      />
      <SummaryTile
        icon={Calendar}
        label={t('Next invoice')}
        tip={t('The next invoice the dormitory will issue to you, and its amount.')}
        tone={summary?.upcoming ? 'default' : 'muted'}
        value={summary?.upcoming ? formatVnd(summary.upcoming.amount) : '—'}
        note={summary?.upcoming ? `${tr(summary.upcoming.typeLabel)} · ${tr(summary.upcoming.note)}` : t('No upcoming invoice')}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- Tabs & Shared bits */

function BillingSegmentedTabs({ items, value, onChange, pendingAmount, onPendingClick }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label={t('Payments')}
        className="flex w-full shrink-0 gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface p-1.5 shadow-card sm:w-fit scrollbar-none"
      >
        {items.map((item) => {
          const active = item.key === value
          const Glyph = item.icon
          return (
            <button
              key={item.key}
              id={`billing-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`billing-panel-${item.key}`}
              onClick={() => onChange(item.key)}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-initial',
                active ? 'bg-primary font-semibold text-fg-on-brand shadow-card' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
              )}
            >
              {Glyph && <Glyph size={16} aria-hidden="true" className={active ? 'text-fg-on-brand' : 'text-fg-tertiary'} />}
              <span>{item.label}</span>
              {item.count != null && (
                <span
                  className={cx(
                    'rounded-full px-2 py-0.5 text-sm font-semibold tabular',
                    active ? 'bg-surface/20 text-fg-on-brand' : 'bg-subtle text-fg-secondary',
                  )}
                >
                  {formatNumber(item.count)}
                </span>
              )}
              {item.dot && !active && <span aria-hidden="true" className="size-2 rounded-full bg-warning" />}
            </button>
          )
        })}
      </div>

      {pendingAmount > 0 && value !== 'refunds' && (
        <button
          type="button"
          onClick={onPendingClick}
          className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-3.5 py-1.5 text-sm font-medium text-warning-fg transition-colors hover:bg-subtle"
        >
          <Clock size={14} aria-hidden="true" className="shrink-0" />
          <span className="tabular">{t('{amount} on its way to you', { amount: formatVnd(pendingAmount) })}</span>
        </button>
      )}
    </div>
  )
}

/** A table header with its glyph; `end` right-aligns it over a figure column. */
function Head({ icon: Glyph, children, end = false }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', end && 'flex-row-reverse')}>
      <Glyph size={14} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
      {t(children)}
    </span>
  )
}

function SectionHeader({ icon: Glyph, title, description, aside }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-fg-brand">
          <Glyph size={20} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{title}</h2>
          {description && <p className="text-sm text-fg-tertiary">{description}</p>}
        </div>
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Invoices */

function Invoices({ query, page, pageSize, setPage, setPageSize, onReceipt }) {
  const navigate = useNavigate()
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  return (
    <section
      id="billing-panel-invoices"
      role="tabpanel"
      aria-labelledby="billing-tab-invoices"
      className={cx(shell, 'animate-fade-in')}
    >
      <SectionHeader
        icon={ReceiptText}
        title={t('Invoices & fees')}
        description={t('Open an invoice to see its lines, pay it or get the receipt.')}
      />

      {/* Phone: MOB-BIL-01 Invoices (Figma 56:203) — one row per Invoice instead of the table. */}
      <div className="p-4 lg:hidden">
        <QueryState query={query} compact empty={<EmptyBlock icon={ReceiptText} title="No invoices">The deposit invoice is issued when you submit an application.</EmptyBlock>}>
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
      </div>

      <Table size="lg" inset="lg" bare className="max-lg:hidden">
        <THead>
          <tr>
            <Th className="w-44">
              <Head icon={Hash}>Invoice</Head>
            </Th>
            <Th className="w-48">
              <Head icon={Layers}>Type</Head>
            </Th>
            <Th className="w-36">
              <Head icon={CalendarRange}>Term</Head>
            </Th>
            <Th className="w-40" align="right">
              <Head icon={Banknote} end>
                Amount
              </Head>
            </Th>
            <Th className="w-44">
              <Head icon={CalendarClock}>Due</Head>
            </Th>
            <Th>
              <Head icon={CircleDot}>Status</Head>
            </Th>
            <Th className="w-28">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={ReceiptText} emptyTitle="No invoices" emptyText="The deposit invoice is issued when you submit an application." />
          {items.map((inv) => (
            <Tr key={inv.id} onClick={() => navigate(invoicePath(inv))}>
              <Td className="py-4 font-medium text-fg-brand tabular">{inv.id}</Td>
              <Td className="max-w-48 truncate py-4" title={tr(inv.typeLabel)}>
                {tr(inv.typeLabel)}
              </Td>
              <Td className="py-4 text-fg-secondary">{inv.termName}</Td>
              <Td align="right" className="py-4 font-semibold whitespace-nowrap text-fg tabular">
                {formatVnd(inv.amount)}
              </Td>
              <Td className="py-4 whitespace-nowrap text-fg-secondary tabular">{formatDateTime(inv.dueAt)}</Td>
              <Td className="py-4">{inv.status === 'Upcoming' ? <Tag>Upcoming</Tag> : <StatusTag status={inv.status} />}</Td>
              <Td className="py-4" align="right" onClick={stop}>
                {inv.status === 'Paid' && (
                  <Button variant="text" onClick={() => onReceipt(inv)}>
                    Receipt
                  </Button>
                )}
                {(inv.status === 'Unpaid' || inv.status === 'Overdue') && (
                  <Button variant="default" size="sm" to={`/student/invoices/${inv.id}/pay`}>
                    Pay
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      {total > 0 && (
        <footer className="border-t border-line bg-surface px-4 py-3 lg:px-5">
          {/* The total sits at the left edge, the page controls and the size changer at the right. */}
          <Pagination
            className="w-full [&>p]:mr-auto [&>p]:text-sm [&>p]:text-fg-tertiary"
            total={total}
            page={page}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </footer>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- Refunds */

/** The student's refunds: what comes back, by which rule, and where it stands. */
function Refunds({ query }) {
  const data = query.data
  const items = data?.items ?? []
  const pendingAmount = data?.pendingAmount ?? 0
  const percent = (r) => (r.percent != null ? `${formatNumber(r.percent)}%` : '—')
  return (
    <section
      id="billing-panel-refunds"
      role="tabpanel"
      aria-labelledby="billing-tab-refunds"
      className={cx(shell, 'animate-fade-in')}
    >
      <SectionHeader
        icon={Undo2}
        title={t('Refund items')}
        description={t('Money the dormitory returns to you, the rule behind it, and where each refund stands.')}
        aside={
          pendingAmount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-3 py-1 text-sm font-medium text-warning-fg">
              <Clock size={14} aria-hidden="true" />
              <span className="tabular">{t('{amount} on its way to you', { amount: formatVnd(pendingAmount) })}</span>
            </span>
          ) : null
        }
      />

      {/* Phone: one block per refund, the amount on the right like the invoice rows. */}
      <div className="lg:hidden">
        <QueryState
          query={query}
          compact
          empty={
            <div className="p-4">
              <EmptyBlock icon={Undo2} title="No refunds yet">
                Deposit and utility settlements appear here when your stay ends or an application is cancelled.
              </EmptyBlock>
            </div>
          }
        >
          {() => (
            <ul className="divide-y divide-line">
              {items.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-base font-medium text-fg">{tr(r.reason)}</p>
                    <StatusTag status={r.status} tone={REFUND_TONES[r.status]} />
                  </div>
                  {r.rule && <p className="text-sm text-fg-secondary">{tr(r.rule)}</p>}
                  {r.note && <p className="text-sm text-fg-tertiary">{tr(r.note)}</p>}
                  <div className="flex items-end justify-between gap-3 pt-1">
                    <p className="text-sm text-fg-tertiary tabular">
                      {t('Paid')} {formatVnd(r.paid)} · {percent(r)}
                      <br />
                      {t('Requested')} {formatDate(r.createdAt)}
                    </p>
                    <p className="text-lg font-semibold whitespace-nowrap text-fg tabular">{formatVnd(r.amount)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>

      <Table size="lg" inset="lg" bare className="max-lg:hidden">
        <THead>
          <tr>
            <Th className="min-w-56">
              <Head icon={FileText}>Reason</Head>
            </Th>
            <Th className="min-w-56">
              <Head icon={Scale}>Rule</Head>
            </Th>
            <Th className="w-36" align="right">
              <Head icon={Wallet} end>
                Paid
              </Head>
            </Th>
            <Th className="w-24" align="right">
              <Head icon={Percent} end>
                Percent
              </Head>
            </Th>
            <Th className="w-36" align="right">
              <Head icon={HandCoins} end>
                Refund
              </Head>
            </Th>
            <Th className="w-32">
              <Head icon={CalendarClock}>Requested</Head>
            </Th>
            <Th className="w-32">
              <Head icon={CalendarCheck}>Decided</Head>
            </Th>
            <Th className="w-32">
              <Head icon={CircleDot}>Status</Head>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus
            query={query}
            colSpan={8}
            emptyIcon={Undo2}
            emptyTitle="No refunds yet"
            emptyText="Deposit and utility settlements appear here when your stay ends or an application is cancelled."
          />
          {items.map((r) => (
            <Tr key={r.id}>
              <Td className="py-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-fg">{tr(r.reason)}</span>
                  {r.note && <span className="text-sm text-fg-tertiary">{tr(r.note)}</span>}
                </div>
              </Td>
              <Td className="max-w-72 py-4 text-sm text-fg-secondary">{tr(r.rule) || '—'}</Td>
              <Td align="right" className="py-4 whitespace-nowrap text-fg-secondary tabular">
                {formatVnd(r.paid)}
              </Td>
              <Td align="right" className="py-4 text-fg-secondary tabular">
                {percent(r)}
              </Td>
              <Td align="right" className="py-4 font-semibold whitespace-nowrap text-fg tabular">
                {formatVnd(r.amount)}
              </Td>
              <Td className="py-4 whitespace-nowrap text-fg-secondary tabular">{formatDate(r.createdAt)}</Td>
              <Td className="py-4 whitespace-nowrap text-fg-secondary tabular">
                {r.decidedAt ? formatDate(r.decidedAt) : r.status === 'Pending' ? <span className="text-fg-tertiary">{t('Pending review')}</span> : '—'}
              </Td>
              <Td className="py-4">
                <StatusTag status={r.status} tone={REFUND_TONES[r.status]} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </section>
  )
}

/* ---------------------------------------------------------------- Page */

/** The header line follows what matters now: money to pay, money coming back, or nothing to do. */
function describe(summary, refunds) {
  if (summary?.outstanding > 0) return t('You have {amount} to pay. Transfer each invoice before its due date, then press I have transferred.', { amount: formatVnd(summary.outstanding) })
  if (refunds?.pendingAmount > 0) return t('Everything is paid. {amount} is being refunded to you.', { amount: formatVnd(refunds.pendingAmount) })
  return t('Everything is paid. Your invoices and refunds are listed here.')
}

export default function MyInvoices() {
  const [tab, setTab] = useState('invoices')
  const [receipt, setReceipt] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // Every Term, unpaid first (WEB-STU-22): an older Term's unpaid Invoice must not hide behind the Term switch.
  const query = useQuery(['invoices', 'mine', page, pageSize], ({ signal }) => api.me.invoices({ page, pageSize }, { signal }))
  const refunds = useQuery(['refunds', 'mine'], ({ signal }) => api.me.refunds({ pageSize: 50 }, { signal }))
  const summary = query.data?.summary
  const pendingRefundAmount = refunds.data?.pendingAmount ?? 0

  const tabs = [
    {
      key: 'invoices',
      label: t('Invoices & fees'),
      icon: ReceiptText,
      count: query.data?.total,
      dot: (summary?.dueCount ?? 0) > 0,
    },
    {
      key: 'refunds',
      label: t('Refund items'),
      icon: Undo2,
      count: refunds.data?.items?.length,
      dot: pendingRefundAmount > 0,
    },
  ]

  return (
    // lg:flex-none! lets the column grow with its content, so the page scrolls instead of the tables.
    <StudentPage title="Payments" description={describe(summary, refunds.data)} className="lg:flex-none!">
      {summary?.warning && (
        <Alert
          type={summary.warning.level === 'Final warning' ? 'error' : 'warning'}
          title={summary.warning.level === 'Final warning' ? 'Final warning: Utility debt' : 'Utility overdue'}
          className="shrink-0"
        >
          {summary.warning.level === 'Final warning'
            ? t('You owe {debt} for utility. Pay everything before {date}, or your stay will be terminated.', { debt: formatVnd(summary.warning.debt), date: formatDate(summary.warning.terminateOn) })
            : t('You owe {debt} for utility. Pay it now: unpaid utility can end your stay.', { debt: formatVnd(summary.warning.debt) })}
        </Alert>
      )}
      {summary?.awaitingCount > 0 && (
        <Alert type="info" title="Transfers waiting for a manager" className="shrink-0">
          {t('{n} of your transfers wait for confirmation. Their deadlines are paused.', { n: summary.awaitingCount })}
        </Alert>
      )}

      <Summary summary={summary} />

      {/* The one place the refund bank account lives on this page. */}
      <RefundAccountCard pendingAmount={pendingRefundAmount} />

      <BillingSegmentedTabs
        items={tabs}
        value={tab}
        onChange={setTab}
        pendingAmount={pendingRefundAmount}
        onPendingClick={() => setTab('refunds')}
      />

      {tab === 'invoices' ? (
        <Invoices query={query} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} onReceipt={setReceipt} />
      ) : (
        <Refunds query={refunds} />
      )}

      <div aria-hidden="true" className="h-2 shrink-0" />
      <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />
    </StudentPage>
  )
}
