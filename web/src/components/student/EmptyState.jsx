import { Inbox } from 'lucide-react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

/** Empty list or section: icon, title, description, an optional action and a small hint under it. */
export function EmptyState({ icon: Glyph = Inbox, title, description, action, hint, className }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-text-muted">
        <Glyph size={20} aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-card-title text-text">{tx(title)}</p>
        {description && <p className="text-small text-text-secondary">{tx(description)}</p>}
      </div>
      {action}
      {hint && <p className="max-w-md text-caption text-text-muted">{tx(hint)}</p>}
    </div>
  )
}
