import { Link, useLocation } from 'react-router'
import { tabGroupFor } from '@/app/navigation'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * Screens joined under one menu entry (navigation `tabs`: Payments, Decisions, Moves, Students, Block settings,
 * Staff) switch here, above the page, so the menu stays short and related work sits one click apart.
 */
export function SectionTabs({ role }) {
  const { pathname } = useLocation()
  const group = tabGroupFor(role, pathname)
  if (!group) return null
  const current = group.tabs.findLast((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))
  return (
    <nav aria-label={t(group.label)} className="-mb-1 flex shrink-0 gap-1 border-b border-line">
      {group.tabs.map((tab) => {
        const active = tab === current
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px border-b-2 px-3 pt-1 pb-2 text-base whitespace-nowrap transition-colors',
              active ? 'border-primary font-semibold text-fg-brand' : 'border-transparent text-fg-secondary hover:text-fg',
            )}
          >
            {t(tab.label)}
          </Link>
        )
      })}
    </nav>
  )
}
