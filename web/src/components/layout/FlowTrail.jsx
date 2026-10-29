import { Link, useLocation } from 'react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { ADMIN_STAGES, READY_SCREENS, flowPosition } from '@/app/adminFlow'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * Where an Admin screen sits in "Set up a Term": the five stages with the current one marked, why this screen
 * matters and what comes next. Shown above every screen of the flow, so nobody configures a value without
 * knowing what it feeds.
 */
export function FlowTrail() {
  const { pathname } = useLocation()
  const at = flowPosition(pathname)
  if (!at) return null
  const why = at.current?.why ?? ADMIN_STAGES[at.stage].why
  return (
    <nav aria-label={t('Set up a Term')} className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-2.5">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        <li>
          <Link to="/admin" className="font-semibold text-fg-link hover:underline">
            {t('Set up a Term')}
          </Link>
        </li>
        {ADMIN_STAGES.map((stage, i) => (
          <li key={stage.key} className="flex items-center gap-1">
            <ChevronRight size={14} aria-hidden="true" className="text-fg-disabled" />
            <span
              aria-current={i === at.stage ? 'step' : undefined}
              className={cx('flex items-center gap-1.5 rounded-full px-2 py-0.5', i === at.stage ? 'bg-primary-subtle font-semibold text-fg-brand' : i < at.stage ? 'text-fg-secondary' : 'text-fg-tertiary')}
            >
              <span className="tabular">{i + 1}</span>
              {t(stage.label)}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="min-w-0 text-base text-fg-secondary">
          {at.current && (
            <span className="font-semibold text-fg">
              {t('{label} · {n} of {total}', { label: t(at.current.label), n: at.screen + 1, total: READY_SCREENS.length })}:{' '}
            </span>
          )}
          {t(why)}
        </p>
        {at.next && (
          <Link to={at.next.to} className="flex shrink-0 items-center gap-1 text-base font-medium text-fg-link hover:underline">
            {t('Next: {label}', { label: t(at.next.label) })}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  )
}
