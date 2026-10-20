import { Clock } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, Card, DetailRows } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { cx } from '@/lib/cx'
import { formatDate, formatVnd } from '@/lib/format'
import { catalogHelpers, useCatalog } from './apply/wizard'

/**
 * Student page frame (one screen): header on top, content fills the rest of the window.
 * Content that can grow (lists, tables) scrolls inside its own card.
 */
export function StudentPage({ breadcrumb, title, badge, description, actions, width, className, children }) {
  return (
    <StudentContainer className="flex h-full min-h-0 flex-col py-6">
      <div className={cx('mx-auto flex min-h-0 w-full flex-1 flex-col gap-4', width, className)}>
        <header className="flex shrink-0 items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb && <Breadcrumb items={breadcrumb} />}
            <div className="flex items-center gap-3">
              <h1 className="text-h1 font-semibold text-fg">{title}</h1>
              {badge}
            </div>
            {description && <p className="text-lg text-fg-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
        </header>
        {children}
      </div>
    </StudentContainer>
  )
}

/** "Next action" banner on Student Home: brand-subtle panel, 48 px icon disc, H2 title, CTA. */
export function NextAction({ icon: Glyph, title, children, deadline, deadlineIcon: DeadlineGlyph = Clock, action }) {
  return (
    <section className="flex min-h-25 shrink-0 items-center gap-6 rounded-lg border border-orange-200 bg-brand-subtle px-6 py-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand">
        <Glyph size={24} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-h2 font-semibold text-fg">{title}</h2>
        {children && <p className="text-base text-fg-secondary">{children}</p>}
        {deadline && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning-fg">
            <DeadlineGlyph size={16} aria-hidden="true" className="text-warning" />
            {deadline}
          </p>
        )}
      </div>
      {action}
    </section>
  )
}

/** Small status card (Application, My Room, Payments, Requests). */
export function StatusCard({ icon: Glyph, label, value, note, to }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-fg-tertiary">
        <Glyph size={16} aria-hidden="true" />
        <span className="text-sm font-medium">{label}</span>
      </span>
      <span className="truncate text-h3 font-semibold text-fg">{value}</span>
      <span className="truncate text-sm text-fg-secondary">{note}</span>
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

/** Term milestones: done = success dot, current = action/primary dot, upcoming = hollow 1.5 px ring. */
export function TermTimeline({ term, milestones, className }) {
  return (
    <Card padding="lg" className={cx('flex min-h-0 flex-col gap-4', className)}>
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-h3 font-semibold text-fg">{term?.name ? `${term.name} timeline` : 'Term timeline'}</h2>
        {term?.stayStart && (
          <p className="text-sm text-fg-tertiary">
            Term {formatDate(term.stayStart)} – {formatDate(term.stayEnd)}
          </p>
        )}
      </div>
      <ul className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {milestones.map(({ label, date, state }) => (
          <li key={label} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cx(
                'size-2.5 shrink-0 rounded-full',
                state === 'done' && 'bg-success',
                state === 'current' && 'bg-primary',
                state === 'upcoming' && 'border-[1.5px] border-line-strong bg-white',
              )}
            />
            <span className={cx('flex-1 text-base', state === 'current' ? 'font-medium text-fg' : state === 'done' ? 'text-fg' : 'text-fg-secondary')}>
              {label}
            </span>
            <span className={cx('text-base whitespace-nowrap', state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-secondary')}>{date}</span>
          </li>
        ))}
      </ul>
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
      title={invoice ? `Receipt · ${invoice.id}` : ''}
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
