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
import { t, tx } from '@/i18n'

/**
 * Student page frame (one screen): header on top, content fills the rest of the window.
 * Content that can grow (lists, tables) scrolls inside its own card.
 * On a phone the title moves to the App Bar (the h1 stays for screen readers), the page
 * scrolls as a whole, and a breadcrumb's parent becomes the App Bar's back target.
 */
export function StudentPage({ breadcrumb, title, mobileTitle, phoneTop, badge, badgeOnPhone = true, description, actions, width, className, children }) {
  const back = breadcrumb?.length > 1 ? breadcrumb[breadcrumb.length - 2].to : undefined
  useMobileBar(mobileTitle ?? title, back)
  const phoneHeader = (badge && badgeOnPhone) || actions
  return (
    <StudentContainer className="flex flex-col pt-2 pb-4 lg:h-full lg:min-h-0 lg:py-6">
      <div className={cx('mx-auto flex w-full flex-col gap-3 lg:min-h-0 lg:flex-1 lg:gap-4', width, className)}>
        {phoneTop}
        <header className={cx('flex flex-col gap-3 lg:shrink-0 lg:flex-row lg:items-end lg:justify-between lg:gap-6', !phoneHeader && 'max-lg:sr-only')}>
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb && <Breadcrumb items={breadcrumb} className="max-lg:hidden" />}
            <div className="flex items-center gap-3">
              <h1 className="text-page-title text-fg max-lg:sr-only">{tx(title)}</h1>
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
 * "Next action" banner on Student Home: brand-subtle panel, 48 px icon disc, H2 title, CTA.
 * Phone (Android Home › Next action): icon and deadline on top, full-width CTA below.
 */
export function NextAction({ icon: Glyph, title, children, deadline, deadlineIcon: DeadlineGlyph = Clock, action }) {
  return (
    <section className="flex shrink-0 flex-col gap-3 rounded-xl border border-primary/25 bg-brand-subtle p-4 lg:min-h-25 lg:flex-row lg:items-center lg:gap-6 lg:rounded-lg lg:px-6 lg:py-3">
      <span className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand lg:flex">
        <Glyph size={24} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {deadline && (
          <p className="flex items-center gap-2 pb-2 text-sm font-medium text-fg-brand lg:hidden">
            <Glyph size={20} aria-hidden="true" />
            {tx(deadline)}
          </p>
        )}
        <h2 className="text-section-title text-fg">{tx(title)}</h2>
        {children && <p className="text-base text-fg-secondary">{tx(children)}</p>}
        {deadline && (
          <p className="hidden items-center gap-1.5 text-sm font-medium text-warning-fg lg:flex">
            <DeadlineGlyph size={16} aria-hidden="true" className="text-warning" />
            {tx(deadline)}
          </p>
        )}
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
      <span className="flex items-center gap-2 text-fg-tertiary">
        <Glyph size={16} aria-hidden="true" />
        <span className="text-sm font-medium">{tx(label)}</span>
      </span>
      <span className="truncate text-h3 font-semibold text-fg">{tx(value)}</span>
      <span className="truncate text-sm text-fg-secondary">{tx(note)}</span>
    </>
  )
  const classes = 'flex min-w-0 flex-1 flex-col gap-2 self-stretch rounded-lg border border-line bg-surface p-5'
  return to ? (
    <Link to={to} className={cx(classes, 'transition-colors hover:border-line-strong hover:shadow-card')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

/**
 * Term milestones: done = success dot, current = action/primary dot, upcoming = hollow 1.5 px ring. A list on
 * phones; on wide screens one row of steps joined by a line (green up to the current step), so the whole home page
 * fits on one screen.
 */
export function TermTimeline({ term, milestones, className }) {
  return (
    <Card padding="lg" className={cx('flex flex-col gap-4', className)}>
      <div className="flex shrink-0 flex-col gap-0.5 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-card-title text-fg">{term?.name ? t('{name} timeline', { name: term.name }) : t('Term timeline')}</h2>
        {term?.stayStart && (
          <p className="text-sm text-fg-tertiary">
            {t('Term {start} – {end}', { start: formatDate(term.stayStart), end: formatDate(term.stayEnd) })}
          </p>
        )}
      </div>
      <ol className="flex flex-col gap-3 lg:flex-row lg:gap-0">
        {milestones.map(({ label, date, state }, i) => (
          <li key={label} className="flex items-center gap-3 lg:min-w-0 lg:flex-1 lg:flex-col lg:items-start lg:gap-2">
            <span className="flex items-center lg:w-full">
              <span
                aria-hidden="true"
                className={cx(
                  'size-2.5 shrink-0 rounded-full',
                  state === 'done' && 'bg-success',
                  state === 'current' && 'bg-primary ring-4 ring-primary-subtle',
                  state === 'upcoming' && 'border-[1.5px] border-line-strong bg-surface',
                )}
              />
              {i < milestones.length - 1 && (
                <span aria-hidden="true" className={cx('mx-2 hidden h-0.5 flex-1 rounded-full lg:block', state === 'done' ? 'bg-success' : 'bg-line')} />
              )}
            </span>
            <span className={cx('flex-1 text-base lg:flex-none lg:pr-3 lg:text-sm', state === 'current' ? 'font-medium text-fg' : state === 'done' ? 'text-fg' : 'text-fg-secondary')}>
              {tx(label)}
            </span>
            <span className={cx('text-base whitespace-nowrap lg:text-sm lg:whitespace-normal', state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-secondary')}>{date}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** Compare Room Classes (opened from Student Home › Room Types). */
export function CompareClassesModal({ open, onClose }) {
  const catalog = useCatalog()
  const { termPrice } = catalogHelpers(catalog.data)
  const roomTypes = catalog.data?.roomTypes ?? []
  return (
    <Modal open={open} onClose={onClose} title="Compare Room Classes" description="Term price per Bed." width={760}>
      <QueryState query={catalog} compact isEmpty={(d) => !d?.roomClasses?.length}>
        {(data) => (
          <Table>
            <THead>
              <tr>
                <Th>Room Class</Th>
                <Th>Amenities</Th>
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
                  <Td className="text-fg-secondary">{(c.amenities ?? []).join(' · ')}</Td>
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
      description="Payment confirmed by the bank."
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
            ['Method', invoice.paymentMethod ?? '—'],
            ['Transfer content', invoice.transferContent ?? '—'],
            ['Amount', <span className="font-medium">{formatVnd(invoice.amount)}</span>],
          ]}
        />
      )}
    </Modal>
  )
}
