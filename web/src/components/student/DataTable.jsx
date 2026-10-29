import { memo } from 'react'
import { Pagination } from '@/components/ui/Pagination'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

/*
 * Student list table. Columns are a static array declared outside the page component:
 *   { key, header, align?: 'right', money?: true, actions?: true, className?, render?: (row) => node }
 * Money columns are right-aligned with tabular digits and keep 24 px to the next column. An actions column
 * has a visually hidden header. No minimum height. Under 768 px each row becomes a card (CSS only): every
 * cell shows its column name before the value.
 */
const row = 'border-b border-border last:border-b-0 max-md:grid max-md:gap-1.5 max-md:rounded-lg max-md:border max-md:border-border max-md:bg-surface max-md:p-4 max-md:last:border-b'
const cell =
  'px-4 py-3 align-middle text-body text-text max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:p-0 max-md:text-right ' +
  'max-md:before:shrink-0 max-md:before:text-left max-md:before:text-small max-md:before:text-text-muted max-md:before:content-[attr(data-label)]'

const DataRow = memo(function DataRow({ item, columns, id }) {
  return (
    <tr id={id} className={cx(row, id && 'scroll-mt-4')}>
      {columns.map((c) => (
        <td
          key={c.key}
          data-label={c.actions ? '' : t(c.header)}
          className={cx(cell, (c.align === 'right' || c.money) && 'text-right', c.money && 'num nowrap pr-6', c.actions && 'max-md:justify-end max-md:before:content-none', c.className)}
        >
          {c.render ? c.render(item) : item[c.key]}
        </td>
      ))}
    </tr>
  )
})

// rowId(row) gives a row an element id (an anchor such as #invoice-INV-1); onPageSizeChange keeps the size changer.
export function DataTable({ columns, rows, rowKey = 'id', rowId, caption, page, pageSize, total, onPageChange, onPageSizeChange, noun, className }) {
  const keyOf = typeof rowKey === 'function' ? rowKey : (r) => r[rowKey]
  const pages = pageSize ? Math.ceil((total ?? rows.length) / pageSize) : 1
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <table className="w-full border-separate border-spacing-0 text-left max-md:block">
          {caption && <caption className="sr-only">{tx(caption)}</caption>}
          <thead className="bg-subtle max-md:sr-only">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx('border-b border-border px-4 py-2.5 text-small font-medium whitespace-nowrap text-text-secondary', (c.align === 'right' || c.money) && 'text-right', c.money && 'pr-6')}
                >
                  {c.actions ? <span className="sr-only">{t('Actions')}</span> : tx(c.header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="max-md:flex max-md:flex-col max-md:gap-2">
            {rows.map((r) => (
              <DataRow key={keyOf(r)} item={r} columns={columns} id={rowId?.(r)} />
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && onPageChange && (
        <Pagination
          className="self-end"
          total={total}
          page={page}
          pageSize={pageSize}
          onChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          showSizeChanger={Boolean(onPageSizeChange)}
          noun={noun}
        />
      )}
    </div>
  )
}
