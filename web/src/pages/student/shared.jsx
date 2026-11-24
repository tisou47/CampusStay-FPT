import { Check, ChevronRight, Clock } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { useMobileBar } from '@/components/layout/MobileBar'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, Card, DetailRows } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { cx } from '@/lib/cx'
import { formatDate, formatVnd } from '@/lib/format'
import { catalogHelpers, useCatalog } from './apply/wizard'
import { t, tr, tx } from '@/i18n'
import { countLines } from '@/lib/furniture'

/**
 * Student page frame (one screen): header on top, content fills the rest of the window.
 * Content that can grow (lists, tables) scrolls inside its own card.
 * On a phone the title moves to the App Bar (the h1 stays for screen readers), the page
 * scrolls as a whole, and a breadcrumb's parent becomes the App Bar's back target.
 */
export function StudentPage({ breadcrumb, title, mobileTitle, phoneTop, badge, badgeOnPhone = true, description, actions, width, className, headerless = false, children }) {
  const back = breadcrumb?.length > 1 ? breadcrumb[breadcrumb.length - 2].to : undefined
  useMobileBar(mobileTitle ?? title, back)
  const phoneHeader = (badge && badgeOnPhone) || actions
  return (
    <StudentContainer className="flex flex-col pt-2 pb-4 lg:h-full lg:min-h-0 lg:py-4">
      <div className={cx('mx-auto flex w-full flex-col gap-3 lg:min-h-0 lg:flex-1 lg:gap-4', width, className)}>
        {phoneTop}
        <header className={cx('flex flex-col gap-3 lg:shrink-0 lg:flex-row lg:items-end lg:justify-between lg:gap-6', (headerless || !phoneHeader) && 'max-lg:sr-only', headerless && 'lg:sr-only')}>
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb && <Breadcrumb items={breadcrumb} className="max-lg:hidden" />}
            <div className="flex items-center gap-3">
              <h1 className="text-h1 font-semibold text-fg max-lg:sr-only">{tx(title)}</h1>
              {badge}
            </div>
            {description && <p className="text-lg text-fg-secondary max-lg:hidden">{tx(description)}</p>}
          </div>
          {actions && <div className="flex flex-col gap-2 *:w-full lg:shrink-0 lg:flex-row lg:items-center lg:gap-3 lg:*:w-auto">{actions}</div>}
        </header>
        {children}
      </div>
    </StudentContainer>
  )
}

/**
 * "Next action" banner on Student Home: balanced brand-subtle bar with 40 px icon badge, title, subtitle, and CTA.
 * Phone (Android Home › Next action): icon and deadline on top, full-width CTA below.
 */
export function NextAction({ icon: Glyph, title, children, deadline, deadlineIcon: DeadlineGlyph = Clock, action }) {
  return (
    <section className="flex shrink-0 flex-col gap-3 rounded-xl border border-orange-200 bg-brand-subtle p-4 lg:flex-row lg:items-center lg:gap-4 lg:px-5 lg:py-3.5">
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-fg-brand shadow-2xs lg:flex">
        <Glyph size={20} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {deadline && (
          <p className="flex items-center gap-2 pb-1 text-xs font-medium text-fg-brand lg:hidden">
            <Glyph size={16} aria-hidden="true" />
            {tx(deadline)}
          </p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-lg font-semibold text-fg">{tx(title)}</h2>
          {deadline && (
            <p className="hidden items-center gap-1 text-xs font-medium text-warning-fg lg:flex">
              <DeadlineGlyph size={14} aria-hidden="true" className="text-warning" />
              {tx(deadline)}
            </p>
          )}
        </div>
        {children && <p className="text-sm text-fg-secondary">{tx(children)}</p>}
      </div>
      <div className="flex *:w-full lg:shrink-0 lg:*:w-auto">{action}</div>
    </section>
  )
}

/**
 * Phone list row (Android Home › Status): 40 px icon disc, title, note, then a tag or a chevron.
 * `below` sits under the note (Android Activity rows put the status tag there). A row with `to`
 * is a link, one with `onClick` a button.
 */
export function StatusRow({ icon: Glyph, value, note, tag, below, to, onClick }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
        <Glyph size={20} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-medium text-fg">{tx(value)}</span>
        {note && <span className="text-sm text-fg-secondary">{tx(note)}</span>}
        {below && <span className="flex flex-wrap items-center gap-2 pt-1">{below}</span>}
      </span>
      {tag ?? ((to || onClick) && <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-fg-secondary" />)}
    </>
  )
  const classes = cx('flex gap-3 py-2.5 text-left', below ? 'items-start' : 'items-center')
  if (to) {
    return (
      <Link to={to} className={cx(classes, 'rounded-lg hover:bg-subtle')}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(classes, 'w-full rounded-lg hover:bg-subtle')}>
        {body}
      </button>
    )
  }
  return <div className={classes}>{body}</div>
}

/** Phone list card holding StatusRows (Android: 12 px radius, 8 px padding). */
export function StatusList({ className, children }) {
  return <div className={cx('flex flex-col rounded-xl border border-line bg-surface p-2', className)}>{children}</div>
}

/** Phone only: Applications | Requests switch at the top of the Activity tab (Android Activity › Segmented). */
export function ActivitySwitch({ current }) {
  const items = [
    { key: 'applications', label: 'Applications', to: '/student/applications' },
    { key: 'requests', label: 'Requests', to: '/student/requests' },
    { key: 'family-days', label: 'Family Day', to: '/student/family-days' }, // reachable on phones (WEB-STU-24)
  ]
  return (
    <nav aria-label={t('Activity')} className="flex h-10 shrink-0 overflow-hidden rounded-full border border-line-strong bg-surface lg:hidden">
      {items.map((item) => {
        const active = item.key === current
        return (
          <Link
            key={item.key}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex flex-1 items-center justify-center gap-1 text-base',
              active ? 'bg-primary-subtle font-medium text-fg-brand' : 'text-fg-secondary',
            )}
          >
            {active && <Check size={16} aria-hidden="true" />}
            {t(item.label)}
          </Link>
        )
      })}
    </nav>
  )
}

/** Small status card (Application, My Room, Payments, Requests). */
export function StatusCard({ icon: Glyph, label, value, note, to }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 text-fg-secondary">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
            <Glyph size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">{tx(label)}</span>
        </span>
        {to && <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-brand" />}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 pt-1">
        <span className="truncate text-h3 font-semibold text-fg">{tx(value)}</span>
        <span className="truncate text-sm text-fg-secondary">{tx(note)}</span>
      </div>
    </>
  )
  const classes = 'group flex min-w-0 flex-1 flex-col justify-between gap-2.5 self-stretch rounded-xl border border-line bg-surface p-4 shadow-xs lg:p-5'
  return to ? (
    <Link to={to} className={cx(classes, 'transition-colors hover:border-line-strong hover:shadow-card')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

/** Compare Room Classes (opened from Student Home › Room Types). */
export function CompareClassesModal({ open, onClose }) {
  const catalog = useCatalog()
  const { termPrice } = catalogHelpers(catalog.data)
  const roomTypes = catalog.data?.roomTypes ?? []
  return (
    <Modal open={open} onClose={onClose} title="Compare room tiers" description="Term price per bed." width={760}>
      <QueryState query={catalog} compact isEmpty={(d) => !d?.roomClasses?.length}>
        {(data) => (
          <Table>
            <THead>
              <tr>
                <Th>Room tier</Th>
                <Th>Furniture</Th>
                {roomTypes.map((t) => (
                  <Th key={t.id} align="right">
                    {t.name}
                  </Th>
                ))}
              </tr>
            </THead>
            <TBody>
              {data.roomClasses.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">
                    {c.name} <span className="font-normal text-fg-tertiary">+{Math.round((c.surchargeRate ?? 0) * 100)}%</span>
                  </Td>
                  <Td className="text-fg-secondary">{countLines(c.furniture)}</Td>
                  {roomTypes.map((t) => (
                    <Td key={t.id} align="right" className="whitespace-nowrap tabular">
                      {formatVnd(termPrice(t.id, c.id), { unit: false })}
                    </Td>
                  ))}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </QueryState>
    </Modal>
  )
}

/** Receipt for a paid Invoice. invoice: { id, title, paidAt, method, transferContent, amount } */
export function ReceiptModal({ invoice, onClose }) {
  const { notifyError } = useToast()
  const receipt = useMutation((id) => api.invoices.receipt(id), { onError: (e) => notifyError(e, 'Could not download the receipt') })
  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      title={invoice ? t('Receipt · {id}', { id: invoice.id }) : ''}
      description="Payment confirmed by the dormitory office."
      footer={
        <>
          <Button onClick={() => receipt.run(invoice.id)} disabled={receipt.pending}>
            {receipt.pending ? 'Downloading…' : 'Download PDF'}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {invoice && (
        <DetailRows
          rows={[
            ['Invoice', invoice.title ?? invoice.id],
            ['Paid on', formatDate(invoice.paidAt)],
            ['Method', tr(invoice.paymentMethod) || '—'],
            ['Transfer content', invoice.transferContent ?? '—'],
            ['Amount', <span className="font-medium">{formatVnd(invoice.amount)}</span>],
          ]}
        />
      )}
    </Modal>
  )
}
