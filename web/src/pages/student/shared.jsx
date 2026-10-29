import { Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { useMobileBar } from '@/components/layout/MobileBar'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { PageHeader } from '@/components/student/PageHeader'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, DetailRows } from '@/components/ui/Display'
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
// `flow`: the page grows with its content and the whole page scrolls (one scrollbar) instead of filling the window.
export function StudentPage({ breadcrumb, title, mobileTitle, phoneTop, badge, badgeOnPhone = true, description, actions, width, flow = false, className, children }) {
  const back = breadcrumb?.length > 1 ? breadcrumb[breadcrumb.length - 2].to : undefined
  useMobileBar(mobileTitle ?? title, back)
  const phoneHeader = (badge && badgeOnPhone) || actions
  return (
    <StudentContainer className={cx('flex flex-col pt-2 pb-4 lg:py-6', !flow && 'lg:h-full lg:min-h-0')}>
      <div className={cx('mx-auto flex w-full flex-col gap-3 lg:gap-4', !flow && 'lg:min-h-0 lg:flex-1', width, className)}>
        {phoneTop}
        {/* On a phone the title lives in the App Bar: the h1 stays for screen readers. */}
        <PageHeader
          as="header"
          title={title}
          subtitle={description}
          badge={badge}
          actions={actions}
          breadcrumb={breadcrumb && <Breadcrumb items={breadcrumb} className="max-lg:hidden" />}
          titleClassName="max-lg:sr-only"
          subtitleClassName="max-lg:hidden"
          className={cx(!phoneHeader && 'max-lg:sr-only')}
        />
        {children}
      </div>
    </StudentContainer>
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

/** Compare Room Classes (opened from Student Home › Room Types). */
export function CompareClassesModal({ open, onClose }) {
  const catalog = useCatalog()
  const { termPrice } = catalogHelpers(catalog.data)
  const roomTypes = catalog.data?.roomTypes ?? []
  return (
    <Modal open={open} onClose={onClose} title="Compare room tiers" description="Term price per Bed." width={760}>
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
