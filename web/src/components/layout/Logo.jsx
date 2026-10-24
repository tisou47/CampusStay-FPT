import { cx } from '@/lib/cx'
import { tx } from '@/i18n'

/** CampusStay mark + wordmark. sm: 32 px mark (shells), lg: 40 px mark (Sign in). */
export function Logo({ subtitle = 'FPT University · Tân Uyên', size = 'sm', className }) {
  const lg = size === 'lg'
  return (
    <div className={cx('flex shrink-0 items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cx(
          'flex shrink-0 items-center justify-center rounded-lg bg-primary text-fg-on-brand',
          lg ? 'size-10 text-h3 font-semibold' : 'size-8 text-base font-medium',
        )}
      >
        CS
      </span>
      <span className="flex flex-col whitespace-nowrap">
        <span className={cx('font-semibold text-fg', lg ? 'text-h2' : 'text-h3')}>CampusStay</span>
        <span className={cx('text-sm', lg ? 'text-fg-secondary' : 'text-fg-tertiary')}>{tx(subtitle)}</span>
      </span>
    </div>
  )
}
