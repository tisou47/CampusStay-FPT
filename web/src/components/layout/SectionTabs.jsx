import { Link, useLocation } from 'react-router'
import { tabGroupFor } from '@/app/navigation'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { NavWorkBadge, useWork } from './WorkInbox'

/**
 * Screens joined under one menu entry (navigation `tabs`: Payments, Decisions, Moves, Students, Block settings,
 * Staff) switch here, above the page, so the menu stays short and related work sits one click apart.
 */
export function SectionTabs({ role }) {
  const { pathname } = useLocation()
  const group = tabGroupFor(role, pathname)
  // Each tab carries its own count, so a menu badge never lands on a tab that looks empty (e.g. refunds under Payments).
  const work = useWork().data?.items
  if (!group) return null
  const current = group.tabs.findLast((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))
  return (
    <nav aria-label={t(group.label)} className="scrollbar-none -mb-1 flex shrink-0 gap-1 overflow-x-auto border-b border-line">
      {group.tabs.map((tab) => {
        const active = tab === current
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 pt-1 pb-2 text-base whitespace-nowrap transition-colors',
              active ? 'border-primary font-semibold text-fg-brand' : 'border-transparent text-fg-secondary hover:text-fg',
            )}
          >
            {t(tab.label)}
            <NavWorkBadge item={tab} work={work} />
          </Link>
        )
      })}
    </nav>
  )
}
