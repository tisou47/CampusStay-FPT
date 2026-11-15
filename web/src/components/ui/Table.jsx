import { Children, createContext, useContext } from 'react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

// Table patterns from the designs:
//  md (back office): 40 px header on bg/subtle, rows at least 52 px, 24 px between columns.
//  lg (student web): 44 px header, rows at least 56 px, 32 px between columns.
// Every cell is padded on both sides, so a right-aligned figure never touches the column after it, and rows that
// wrap keep space above and below. Both use 16/20 px side padding, Label/Small header text and border/default
// row separators.
// `fill` makes the table take the remaining height of a one-screen page and scroll inside,
// with the header row kept in view.
const SizeContext = createContext({ size: 'md', inset: 'md' })

const insets = { md: 'first:pl-4 last:pr-4', lg: 'first:pl-5 last:pr-5' }

const sizes = {
  md: { th: 'h-10 px-3 py-2', td: 'h-13 px-3 py-2.5' },
  lg: { th: 'h-11 px-4 py-2.5', td: 'h-14 px-4 py-3' },
}

// bare: no outer border/radius (table inside a Card). inset: side padding md = 16 px, lg = 20 px.
export function Table({ size = 'md', inset = 'md', bare = false, fill = false, className, tableClassName, children, ...props }) {
  return (
    <SizeContext.Provider value={{ size, inset }}>
      <div
        className={cx('overflow-auto bg-surface', fill && 'min-h-0 flex-1', !bare && 'rounded-lg border border-line', className)}
        {...props}
      >
        <table className={cx('cs-table w-full border-separate border-spacing-0 text-left text-base', tableClassName)}>{children}</table>
      </div>
    </SizeContext.Provider>
  )
}

export function THead({ children }) {
  return <thead className="sticky top-0 z-10 bg-subtle">{children}</thead>
}

export function TBody({ children }) {
  return <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
}

export function Th({ className, align = 'left', children, ...props }) {
  const { size, inset } = useContext(SizeContext)
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-line bg-subtle text-sm font-medium whitespace-nowrap text-fg-secondary',
        insets[inset] ?? insets.md,
        (sizes[size] ?? sizes.md).th,
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {tx(children)}
    </th>
  )
}

/**
 * A row. With onClick the whole row opens its record (no "Open"/"View" button): it is tinted on hover, Tab reaches
 * it with a focus ring and Enter opens it. Buttons inside a cell call stop() so they do not open the row.
 */
export function Tr({ selected, onClick, className, children, ...props }) {
  const onKeyDown = onClick
    ? (e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClick(e)
        props.onKeyDown?.(e)
      }
    : props.onKeyDown
  return (
    <tr
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      {...props}
      onKeyDown={onKeyDown}
      className={cx(
        'transition-colors [&>td]:border-b [&>td]:border-line',
        selected ? 'bg-brand-subtle' : onClick && 'hover:bg-primary-subtle/60',
        onClick && 'cursor-pointer outline-none focus-visible:bg-primary-subtle/60 focus-visible:[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-focus)]',
        className,
      )}
    >
      {children}
    </tr>
  )
}

// A cell whose text is short (a code, a date, an amount, a name) stays on one line: "APP-FA26-024993" never breaks
// at its hyphens and "2,588,000 ₫" never splits. Longer text wraps between words with balanced lines.
const SHORT = 28
function textOf(children) {
  let text = ''
  for (const child of Children.toArray(children)) {
    if (typeof child !== 'string' && typeof child !== 'number') return null
    text += child
  }
  return text
}

/** wrap: true lets a cell wrap even when its text is short; false keeps any cell on one line. */
export function Td({ className, align = 'left', wrap, children, ...props }) {
  const { size, inset } = useContext(SizeContext)
  const text = textOf(children)
  const oneLine = wrap === false || (wrap !== true && (align === 'right' || (text != null && (text.length <= SHORT || !/\s/.test(text)))))
  return (
    <td
      className={cx(
        'align-middle text-fg [text-wrap:pretty]',
        oneLine && 'whitespace-nowrap',
        align === 'right' && 'tabular',
        insets[inset] ?? insets.md,
        (sizes[size] ?? sizes.md).td,
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  )
}

/** Two-line cell: medium primary line + small tertiary line (e.g. student name + code). */
export function TwoLine({ primary, secondary, className }) {
  return (
    <div className={cx('flex min-w-0 flex-col', className)}>
      <span className="truncate font-medium text-fg">{tx(primary)}</span>
      {secondary && <span className="truncate text-sm text-fg-tertiary">{tx(secondary)}</span>}
    </div>
  )
}

/** Stops row click handlers from firing when a cell holds its own buttons. */
export function stop(e) {
  e.stopPropagation()
}
