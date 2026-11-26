import { Inbox, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { Button } from './Button'

/*
 * Loading, error and empty states for data that comes from the API.
 * Every list and panel shows one of: skeleton (first load), error with Retry, empty message, or the data.
 */

export function Spinner({ size = 20, className }) {
  return <LoaderCircle size={size} aria-hidden="true" className={cx('animate-spin text-fg-tertiary', className)} />
}

/** One grey placeholder bar; size it with classes. Pulses (stills with reduced motion, index.css). */
export function Skeleton({ className }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-md bg-gray-200', className)} />
}

const LINE_WIDTHS = ['w-11/12', 'w-3/4', 'w-5/6', 'w-2/3', 'w-4/5', 'w-1/2']

/**
 * First load of API data: a skeleton shaped like what is coming, never a spinner in the middle of content.
 * variant: 'block' (a title and a few lines), 'table' (list rows), 'form' (label and field pairs).
 * The label stays for screen readers only.
 */
export function LoadingState({ label = 'Loading…', variant = 'block', rows, className }) {
  const n = rows ?? (variant === 'table' ? 5 : variant === 'form' ? 4 : 3)
  return (
    <div role="status" aria-busy="true" className={cx('flex flex-1 flex-col px-5 py-5', variant === 'table' ? 'gap-0' : 'gap-3', className)}>
      <span className="sr-only">{tx(label)}</span>
      {variant === 'block' && <Skeleton className="mb-1 h-5 w-1/3" />}
      {Array.from({ length: n }, (_, i) =>
        variant === 'table' ? (
          <div key={i} className={cx('flex items-center gap-4 py-3', i > 0 && 'border-t border-line')}>
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className={cx('h-4 flex-1', i % 2 && 'max-w-[60%]')} />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : variant === 'form' ? (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-9 w-full max-w-md" />
          </div>
        ) : (
          <Skeleton key={i} className={cx('h-4', LINE_WIDTHS[i % LINE_WIDTHS.length])} />
        ),
      )}
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
        <p className="text-base font-medium text-fg">{tx(title)}</p>
        {error?.message && <p className="text-sm text-fg-secondary">{error.message}</p>}
      </div>
      {onRetry && (
        <Button size="sm" icon={RotateCw} iconSize={16} onClick={onRetry}>
          {t('Retry')}
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
        <p className="text-base font-medium text-fg">{tx(title)}</p>
        {children && <p className="text-sm text-fg-secondary">{tx(children)}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * Renders children(data) once a query has data; otherwise its loading, error or empty state.
 * `isEmpty(data)` decides when to show the empty state (default: no data or an empty `items` list).
 */
export function QueryState({ query, isEmpty, empty, loadingLabel, skeleton, errorTitle, compact, className, children }) {
  const { data, error, loading, reload } = query
  if (data === undefined && error) return <ErrorState error={error} onRetry={reload} title={errorTitle} compact={compact} className={className} />
  if (data === undefined) return loading ? <LoadingState label={loadingLabel} variant={skeleton} className={className} /> : (empty ?? <EmptyBlock className={className} />)
  const emptyNow = data == null || (isEmpty ? isEmpty(data) : (Array.isArray(data?.items) && data.items.length === 0) || (Array.isArray(data) && data.length === 0))
  if (emptyNow) return empty ?? <EmptyBlock className={className} />
  return children(data)
}

/** One full-width table row holding the loading, error or empty state (keeps the header visible). */
export function TableStatus({ query, colSpan, rows, emptyTitle = 'No records', emptyText, emptyIcon }) {
  const { data, error, loading, reload } = query
  let content = null
  if (data === undefined && loading) content = <LoadingState variant="table" />
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
      <span>{t('Could not refresh: {message}', { message: query.error.message })}</span>
      <Button size="sm" onClick={query.reload}>
        {t('Retry')}
      </Button>
    </div>
  )
}

/** "—" for values the API has not provided. */
export function dash(value, format = (v) => v) {
  return value == null || value === '' ? '—' : format(value)
}
