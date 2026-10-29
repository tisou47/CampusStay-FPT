import { Info } from 'lucide-react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * The reason a button is locked, always visible next to it. Give the button aria-describedby={id}
 * (from useId in the page) so a screen reader reads the reason with the button.
 */
export function ReasonLine({ id, children, className }) {
  if (!children) return null
  return (
    <p id={id} className={cx('flex items-start gap-1.5 text-small text-text-secondary', className)}>
      <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-text-muted" />
      <span>{tx(children)}</span>
    </p>
  )
}
