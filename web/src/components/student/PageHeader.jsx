import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * Title of a student page (page-title 28/600) with an optional subtitle and actions on the right.
 * Under 768 px the actions wrap onto their own line.
 */
export function PageHeader({ title, subtitle, actions, breadcrumb, badge, as: Tag = 'div', className, titleClassName, subtitleClassName }) {
  return (
    <Tag className={cx('flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {breadcrumb}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cx('text-page-title text-text', titleClassName)}>{tx(title)}</h1>
          {badge}
        </div>
        {subtitle && <p className={cx('text-body text-text-secondary', subtitleClassName)}>{tx(subtitle)}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">{actions}</div>}
    </Tag>
  )
}
