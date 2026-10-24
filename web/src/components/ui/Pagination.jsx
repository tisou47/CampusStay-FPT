import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { Select } from './Field'
import { formatNumber } from '@/lib/format'

// Figma: 02 Components › Pagination (Ant Design <Pagination showTotal showSizeChanger>).
function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'next-gap', pages]
  if (page >= pages - 3) return [1, 'prev-gap', pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, 'prev-gap', page - 1, page, page + 1, 'next-gap', pages]
}

const box = 'flex size-8 shrink-0 items-center justify-center rounded-md bg-surface text-base transition-colors'

export function Pagination({ total = 0, page = 1, pageSize = 20, onChange, onPageSizeChange, showSizeChanger = true, noun = ['item', 'items'], className }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const go = (p) => onChange?.(Math.min(pages, Math.max(1, p)))
  return (
    <nav aria-label={t('Pagination')} className={cx('flex shrink-0 items-center gap-2', className)}>
      <p className="mr-2 text-base text-fg-secondary">
        {t('Total {n} {noun}', { n: formatNumber(total), noun: t(total === 1 ? noun[0] : noun[1]) })}
      </p>
      <button type="button" aria-label={t('Previous page')} disabled={page === 1} onClick={() => go(page - 1)} className={cx(box, 'text-fg-secondary hover:text-fg-brand disabled:text-fg-disabled')}>
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {/* Phone: "page / pages" between the arrows instead of the page buttons and the size changer. */}
      <span className="text-base text-fg-secondary tabular lg:hidden">
        {page} / {pages}
      </span>
      {pageList(page, pages).map((p) =>
        typeof p === 'string' ? (
          <button
            key={p}
            type="button"
            aria-label={p === 'next-gap' ? t('Next 5 pages') : t('Previous 5 pages')}
            onClick={() => go(p === 'next-gap' ? page + 5 : page - 5)}
            className={cx(box, 'text-fg hover:text-fg-brand max-lg:hidden')}
          >
            •••
          </button>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? 'page' : undefined}
            onClick={() => go(p)}
            className={cx(box, 'max-lg:hidden', p === page ? 'border border-primary font-medium text-fg-brand' : 'text-fg hover:text-fg-brand')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" aria-label={t('Next page')} disabled={page === pages} onClick={() => go(page + 1)} className={cx(box, 'text-fg-secondary hover:text-fg-brand disabled:text-fg-disabled')}>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {showSizeChanger && (
        <Select
          aria-label={t('Page size')}
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          wrapperClassName="w-29 max-lg:hidden"
          options={[10, 20, 50, 100].map((n) => ({ value: n, label: t('{n} / page', { n }) }))}
        />
      )}
    </nav>
  )
}
