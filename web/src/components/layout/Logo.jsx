import { cx } from '@/lib/cx'
import { tx } from '@/i18n'

/** CampusStay mark + wordmark. sm: 32 px mark (shells), lg: 40 px mark (Sign in). */
export function Logo({ subtitle = 'FPT University · Tân Uyên', size = 'sm', className }) {
  const lg = size === 'lg'
  return (
    <div className={cx('flex shrink-0 items-center gap-2.5', className)}>
      {/* A fixed-size SVG: the "CS" mark looks the same on every page and never shifts the layout. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 40 40"
        width={lg ? 40 : 32}
        height={lg ? 40 : 32}
        className="shrink-0 text-primary"
      >
        <rect width="40" height="40" rx="9" fill="currentColor" />
        <text x="20" y="25.5" textAnchor="middle" className="fill-fg-on-brand" fontFamily="inherit" fontSize="16" fontWeight="600">
          CS
        </text>
      </svg>
      <span className="flex flex-col whitespace-nowrap">
        <span className={cx('font-semibold text-fg', lg ? 'text-h2' : 'text-h3')}>CampusStay</span>
        <span className={cx('text-sm', lg ? 'text-fg-secondary' : 'text-fg-tertiary')}>{tx(subtitle)}</span>
      </span>
    </div>
  )
}
