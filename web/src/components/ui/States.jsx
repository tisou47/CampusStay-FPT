import { Inbox, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { cx } from '@/lib/cx'
import { Button } from './Button'

/*
 * Loading, error and empty states for data that comes from the API.
 * Every list and panel shows one of: spinner (first load), error with Retry, empty message, or the data.
 */

export function Spinner({ size = 20, className }) {
  return <LoaderCircle size={size} aria-hidden="true" className={cx('animate-spin text-fg-tertiary', className)} />
}

export function LoadingState({ label = 'Loading…', className }) {
  return (
    <div role="status" className={cx('flex flex-1 items-center justify-center gap-2 px-6 py-10 text-base text-fg-secondary', className)}>
      <Spinner />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Could not load this data', compact = false, className }) {
  return (
    <div role="alert" className={cx('flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center', compact ? 'py-6' : 'py-10', className)}>
      {!compact && (
        <span className="flex size-10 items-center justify-center rounded-full bg-error-bg text-error">
          <TriangleAlert size={20} aria-hidden="true" />
        </span>
      )}
      <div className="flex max-w-md flex-col gap-0.5">
        <p className="text-base font-medium text-fg">{title}</p>
        {error?.message && <p className="text-sm text-fg-secondary">{error.message}</p>}
      </div>
      {onRetry && (
        <Button size="sm" icon={RotateCw} iconSize={16} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function EmptyBlock({ icon: Glyph = Inbox, title = 'Nothing here yet', children, action, className }) {
  return (
    <div className={cx('flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-fg-tertiary">
        <Glyph size={20} aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-0.5">
        <p className="text-base font-medium text-fg">{title}</p>
        {children && <p className="text-sm text-fg-secondary">{children}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * Renders children(data) once a query has data; otherwise its loading, error or empty state.
 * `isEmpty(data)` decides when to show the empty state (default: no data or an empty `items` list).
 */
export function QueryState({ query, isEmpty, empty, loadingLabel, errorTitle, compact, className, children }) {
  const { data, error, loading, reload } = query
  if (data === undefined && error) return <ErrorState error={error} onRetry={reload} title={errorTitle} compact={compact} className={className} />
  if (data === undefined) return loading ? <LoadingState label={loadingLabel} className={className} /> : (empty ?? <EmptyBlock className={className} />)
  const emptyNow = data == null || (isEmpty ? isEmpty(data) : (Array.isArray(data?.items) && data.items.length === 0) || (Array.isArray(data) && data.length === 0))
  if (emptyNow) return empty ?? <EmptyBlock className={className} />
  return children(data)
}

/** One full-width table row holding the loading, error or empty state (keeps the header visible). */
export function TableStatus({ query, colSpan, rows, emptyTitle = 'No records', emptyText, emptyIcon }) {
  const { data, error, loading, reload } = query
  let content = null
  if (data === undefined && loading) content = <LoadingState />
  else if (data === undefined && error) content = <ErrorState error={error} onRetry={reload} compact />
  else if ((rows ?? data?.items ?? []).length === 0)
    content = (
      <EmptyBlock icon={emptyIcon} title={emptyTitle}>
        {emptyText}
      </EmptyBlock>
    )
  if (!content) return null
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {content}
      </td>
    </tr>
  )
}

/** Thin bar shown above a page when a background refresh failed but older data is still on screen. */
export function StaleNotice({ query }) {
  if (!query.error || query.data === undefined) return null
  return (
    <div role="alert" className="flex shrink-0 items-center justify-between gap-3 rounded-lg bg-error-bg px-4 py-2 text-base text-error-fg">
      <span>Could not refresh: {query.error.message}</span>
      <Button size="sm" onClick={query.reload}>
        Retry
      </Button>
    </div>
  )
}

/** "—" for values the API has not provided. */
export function dash(value, format = (v) => v) {
  return value == null || value === '' ? '—' : format(value)
}
