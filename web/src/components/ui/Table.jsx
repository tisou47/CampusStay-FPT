import { createContext, useContext } from 'react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

// Table patterns from the designs:
//  md (back office): 40 px header on bg/subtle, 52 px rows, 12 px between cells.
//  lg (student web): 44 px header, 56 px rows, 16 px between cells.
// Both use 16 px side padding, Label/Small header text and border/default row separators.
// `fill` makes the table take the remaining height of a one-screen page and scroll inside,
// with the header row kept in view.
const SizeContext = createContext({ size: 'md', inset: 'md' })

const insets = { md: 'first:pl-4 last:pr-4', lg: 'first:pl-5 last:pr-5' }

const sizes = {
  md: { th: 'h-10 pr-3', td: 'h-13 pr-3' },
  lg: { th: 'h-11 pr-4', td: 'h-14 pr-4' },
}

// bare: no outer border/radius (table inside a Card). inset: side padding md = 16 px, lg = 20 px.
export function Table({ size = 'md', inset = 'md', bare = false, fill = false, className, tableClassName, children, ...props }) {
  return (
    <SizeContext.Provider value={{ size, inset }}>
      <div
        className={cx('overflow-auto bg-surface', fill && 'min-h-0 flex-1', !bare && 'rounded-lg border border-line', className)}
        {...props}
      >
        <table className={cx('w-full border-separate border-spacing-0 text-left text-base', tableClassName)}>{children}</table>
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

export function Tr({ selected, onClick, className, children, ...props }) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        'transition-colors [&>td]:border-b [&>td]:border-line',
        selected ? 'bg-brand-subtle' : onClick && 'hover:bg-gray-50',
        onClick && 'cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export function Td({ className, align = 'left', children, ...props }) {
  const { size, inset } = useContext(SizeContext)
  return (
    <td
      className={cx(
        'align-middle text-fg',
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
