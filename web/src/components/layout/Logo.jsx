import fptMark from '@/assets/fpt-mark.png'
import { cx } from '@/lib/cx'
import { tx } from '@/i18n'

/**
 * FPT mark + CampusStay wordmark. sm: 36 px tile (shells), lg: 44 px tile (Sign in).
 * The FPT mark always sits on a white tile so its orange part stays visible on the orange band.
 */
export function Logo({ subtitle = 'FPT University · Tân Uyên', size = 'sm', tone, className }) {
  const lg = size === 'lg'
  const band = tone === 'band'
  return (
    <div className={cx('flex shrink-0 items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cx(
          'flex shrink-0 items-center justify-center rounded-xl bg-surface shadow-card ring-1 ring-black/5',
          lg ? 'h-11 px-2.5' : 'h-9 px-2',
        )}
      >
        <img src={fptMark} alt="" className={cx('w-auto object-contain', lg ? 'h-7' : 'h-5.5')} />
      </span>
      <span className="flex flex-col whitespace-nowrap">
        <span className={cx('leading-tight font-bold tracking-tight', band ? 'text-band-fg' : 'text-fg', lg ? 'text-h2' : 'text-h3')}>CampusStay</span>
        {subtitle && <span className={cx('text-sm leading-tight', band ? 'text-band-fg/75' : lg ? 'text-fg-secondary' : 'text-fg-tertiary')}>{tx(subtitle)}</span>}
      </span>
    </div>
  )
}
