import { memo } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

// The whole card is one link or button. The hover border is an overlay that fades in (opacity, 150 ms),
// so nothing but opacity is animated and the card never changes size.
const shell =
  'group relative flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-card ' +
  'after:pointer-events-none after:absolute after:-inset-px after:rounded-[inherit] after:border-2 after:border-primary after:opacity-0 ' +
  'after:transition-opacity after:duration-150 hover:after:opacity-100'

function Body({ icon: Glyph, label, value, description }) {
  return (
    <>
      {Glyph && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-fg-brand">
          <Glyph size={20} aria-hidden="true" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-small text-text-secondary">{tx(label)}</span>
        {value != null && <span className="truncate text-card-title text-text">{tx(value)}</span>}
        {description && <span className="truncate text-small text-text-muted">{tx(description)}</span>}
      </span>
      <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
    </>
  )
}

/** A summary card that opens a page (to) or runs an action (onClick); chevron › on the right. */
export const StatCard = memo(function StatCard({ to, onClick, className, ...body }) {
  if (to) {
    return (
      <Link to={to} className={cx(shell, className)}>
        <Body {...body} />
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cx(shell, 'w-full', className)}>
      <Body {...body} />
    </button>
  )
})
