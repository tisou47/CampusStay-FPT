import { cx } from '@/lib/cx'
import { tx } from '@/i18n'
import { Card } from './Display'
import { QueryState } from './States'

/**
 * The facts row of a record's detail panel, in the style of Staff › Maintenance detail: a small label above each value,
 * as many columns as fit. Facts without a value are left out, so the row never shows empty boxes.
 * @param facts [{ label, value }] (labels are translated)
 */
export function DetailFacts({ facts, className }) {
  const shown = (facts ?? []).filter((f) => f && f.value != null && f.value !== '')
  if (shown.length === 0) return null
  return (
    <dl className={cx('grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-line bg-subtle/40 px-4 py-3 sm:grid-cols-3 2xl:grid-cols-4', className)}>
      {shown.map((f) => (
        <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-sm text-fg-secondary">{tx(f.label)}</dt>
          <dd className="truncate text-base font-medium text-fg" title={typeof f.value === 'string' ? f.value : undefined}>
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The detail panel's frame while its record loads or fails: the same card as the loaded detail, so the screen keeps
 * its layout instead of an empty area. Renders the children with the data once loaded.
 */
export function DetailPanel({ query, children, className }) {
  if (query.data === undefined) {
    return (
      <Card className={cx('flex min-h-0 min-w-0 flex-1 flex-col justify-center', className)}>
        <QueryState query={query} isEmpty={() => false}>
          {() => null}
        </QueryState>
      </Card>
    )
  }
  return children(query.data)
}
