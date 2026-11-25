import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { FilterSelect } from './Field'
import { formatNumber } from '@/lib/format'

// Figma: 02 Components › Pagination (Ant Design <Pagination showTotal showSizeChanger showQuickJumper>).
// One shared control for every list in every role. Layout, left to right:
//   range summary ("1.421–1.440 / 1.606 món") · [‹ 1 … 71 72 73 … 81 ›] · "Đến trang [__] / 81" · "20 / trang"
// The page strip always renders the same number of slots (7) so the arrows never shift under the pointer while
// paging, and every page button grows with its number (min 32px) so 3–4 digit pages stay readable.
const SLOTS = 7

function pageList(page, pages) {
  if (pages <= SLOTS) return Array.from({ length: pages }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'next-gap', pages]
  if (page >= pages - 3) return [1, 'prev-gap', pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, 'prev-gap', page - 1, page, page + 1, 'next-gap', pages]
}

const cell =
  'inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-2 text-base tabular transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1'
const idle = 'text-fg hover:bg-subtle hover:text-fg-brand'
const arrow = 'text-fg-secondary hover:bg-subtle hover:text-fg-brand disabled:cursor-not-allowed disabled:bg-transparent disabled:text-fg-disabled'

function JumpTo({ page, pages, go }) {
  const [draft, setDraft] = useState('')
  useEffect(() => setDraft(''), [page])
  const commit = () => {
    const n = Number.parseInt(draft, 10)
    if (Number.isFinite(n)) go(n)
    setDraft('')
  }
  return (
    <label className="flex shrink-0 items-center gap-2 text-base text-fg-secondary max-lg:hidden">
      {t('Go to page')}
      <input
        value={draft}
        inputMode="numeric"
        aria-label={t('Go to page')}
        placeholder={String(page)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, String(pages).length))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') setDraft('')
        }}
        onBlur={commit}
        style={{ width: `${Math.max(3, String(pages).length) + 3}ch` }}
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-center text-base text-fg tabular placeholder:text-fg-disabled hover:border-primary focus:border-focus focus:outline-none focus:shadow-focus"
      />
      <span className="tabular">/ {formatNumber(pages)}</span>
    </label>
  )
}

export function Pagination({ total = 0, page = 1, pageSize = 20, onChange, onPageSizeChange, showSizeChanger = true, sizes = [10, 20, 50, 100], noun = ['item', 'items'], className }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(pages, Math.max(1, page))
  const go = (p) => {
    const next = Math.min(pages, Math.max(1, p))
    if (next !== current) onChange?.(next)
  }
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)
  const nounText = t(total === 1 ? noun[0] : noun[1])
  // Every slot is as wide as the widest page number, so the strip keeps one width while paging
  // (5 → 10 → 14 no longer shifts the buttons and the arrows under the pointer).
  const cellWidth = `max(2rem, calc(${String(pages).length}ch + 1rem))`

  return (
    <nav aria-label={t('Pagination')} className={cx('flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-2', className)}>
      {/* Range summary: what this page shows out of how many. */}
      <p className="text-base text-fg-secondary tabular" aria-live="polite">
        {total > 0 ? (
          <>
            <span className="font-medium text-fg">
              {formatNumber(from)}–{formatNumber(to)}
            </span>{' '}
            {t('of {n} {noun}', { n: formatNumber(total), noun: nounText })}
          </>
        ) : (
          t('Total {n} {noun}', { n: formatNumber(total), noun: nounText })
        )}
      </p>

      {/* Page strip: one framed group so it reads as a single control. */}
      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-card">
        <button type="button" aria-label={t('Previous page')} title={t('Previous page')} disabled={current === 1} onClick={() => go(current - 1)} className={cx(cell, 'px-0', arrow)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        {/* Phone: "page / pages" between the arrows instead of the page buttons and the size changer. */}
        <span className="px-2 text-base text-fg-secondary tabular lg:hidden">
          <span className="font-semibold text-fg">{formatNumber(current)}</span> / {formatNumber(pages)}
        </span>

        {pageList(current, pages).map((p) =>
          typeof p === 'string' ? (
            <button
              key={p}
              type="button"
              aria-label={p === 'next-gap' ? t('Next 5 pages') : t('Previous 5 pages')}
              title={p === 'next-gap' ? t('Next 5 pages') : t('Previous 5 pages')}
              onClick={() => go(p === 'next-gap' ? current + 5 : current - 5)}
              style={{ minWidth: cellWidth }}
              className={cx(cell, 'group relative text-fg-tertiary hover:bg-subtle hover:text-fg-brand max-lg:hidden')}
            >
              {/* Ant Design: the gap shows ••• and turns into a double arrow on hover / focus. Both stay in the
                  layout (only visibility swaps) so the button keeps its width: a width change on hover moved the
                  button out from under the pointer and made it flicker. */}
              <span className="tracking-widest group-hover:invisible group-focus-visible:invisible" aria-hidden="true">
                •••
              </span>
              <span className="invisible absolute inset-0 flex items-center justify-center group-hover:visible group-focus-visible:visible" aria-hidden="true">
                {p === 'next-gap' ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              </span>
            </button>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={t('Page {n}', { n: formatNumber(p) })}
              aria-current={p === current ? 'page' : undefined}
              onClick={() => go(p)}
              style={{ minWidth: cellWidth }}
              className={cx(cell, 'max-lg:hidden', p === current ? 'bg-primary font-semibold text-fg-on-brand shadow-card hover:bg-primary-hover' : idle)}
            >
              {formatNumber(p)}
            </button>
          ),
        )}

        <button type="button" aria-label={t('Next page')} title={t('Next page')} disabled={current === pages} onClick={() => go(current + 1)} className={cx(cell, 'px-0', arrow)}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {pages > SLOTS && <JumpTo page={current} pages={pages} go={go} />}

      {showSizeChanger && (
        <FilterSelect
          aria-label={t('Page size')}
          value={pageSize}
          onChange={(n) => onPageSizeChange?.(Number(n))}
          placement="top"
          align="right"
          wrapperClassName="shrink-0 max-lg:hidden"
          options={sizes.map((n) => ({ value: n, label: t('{n} / page', { n }) }))}
        />
      )}
    </nav>
  )
}
