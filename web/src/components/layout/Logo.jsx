import { cx } from '@/lib/cx'
import { tx } from '@/i18n'

/**
 * CampusStay mark + wordmark. sm: 32 px mark (shells), lg: 40 px mark (Sign in).
 * tone "band": on the FPT-orange band the mark turns white and the words stay ink (white text fails contrast there).
 */
export function Logo({ subtitle = 'FPT University · Tân Uyên', size = 'sm', tone, className }) {
  const lg = size === 'lg'
  const band = tone === 'band'
  return (
    <div className={cx('flex shrink-0 items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cx(
          'flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight',
          band ? 'bg-surface text-fg-brand shadow-card' : 'bg-accent text-band-fg',
          lg ? 'size-10 text-h3' : 'size-8 text-base',
        )}
      >
        CS
      </span>
      <span className="flex flex-col whitespace-nowrap">
        <span className={cx('font-bold tracking-tight', band ? 'text-band-fg' : 'text-fg', lg ? 'text-h2' : 'text-h3')}>CampusStay</span>
        {subtitle && <span className={cx('text-sm', band ? 'text-band-fg' : lg ? 'text-fg-secondary' : 'text-fg-tertiary')}>{tx(subtitle)}</span>}
      </span>
    </div>
  )
}
