import { Link, useLocation } from 'react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { ADMIN_STAGES, READY_SCREENS, flowPosition } from '@/app/adminFlow'
import { MANAGER_STAGES, managerPosition } from '@/app/managerFlow'
import { useSession } from '@/app/session'
import { termJourney } from '@/lib/termJourney'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * Where a back-office screen sits in its role's flow: the stages with this screen's one marked (and, for Managers,
 * the stage the Term is in now), why the screen matters and what comes next. Shown above every screen of the flow,
 * so nobody acts on a value without knowing what it feeds or when it is due.
 */
export function FlowTrail({ role }) {
  const { pathname } = useLocation()
  const { term } = useSession()
  const flow = role === 'admin' ? adminTrail(pathname) : role === 'manager' ? managerTrail(pathname, term) : null
  if (!flow) return null
  return (
    <nav aria-label={flow.title} className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-2.5">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        <li>
          <Link to={flow.home} className="font-semibold text-fg-link hover:underline">
            {flow.title}
          </Link>
        </li>
        {flow.stages.map((stage, i) => (
          <li key={stage.key} className="flex items-center gap-1">
            <ChevronRight size={14} aria-hidden="true" className="text-fg-disabled" />
            <span
              aria-current={i === flow.at ? 'step' : undefined}
              className={cx('flex items-center gap-1.5 rounded-full px-2 py-0.5', i === flow.at ? 'bg-primary-subtle font-semibold text-fg-brand' : i < flow.at ? 'text-fg-secondary' : 'text-fg-tertiary')}
            >
              <span className="tabular">{i + 1}</span>
              {t(stage.label)}
              {i === flow.live && (
                <span className="rounded-full bg-success-bg px-1.5 text-sm font-medium text-success-fg">{t('now')}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="min-w-0 text-base text-fg-secondary">
          {flow.screen && <span className="font-semibold text-fg">{flow.screen}: </span>}
          {t(flow.why)}
          {flow.notice && <span className="font-medium text-warning-fg"> {flow.notice}</span>}
        </p>
        {flow.next && (
          <Link to={flow.next.to} className="flex shrink-0 items-center gap-1 text-base font-medium text-fg-link hover:underline">
            {t('Next: {label}', { label: t(flow.next.label) })}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  )
}

function adminTrail(pathname) {
  const at = flowPosition(pathname)
  if (!at) return null
  return {
    title: t('Set up a Term'),
    home: '/admin',
    stages: ADMIN_STAGES,
    at: at.stage,
    live: -1,
    screen: at.current ? t('{label} · {n} of {total}', { label: t(at.current.label), n: at.screen + 1, total: READY_SCREENS.length }) : null,
    why: at.current?.why ?? ADMIN_STAGES[at.stage].why,
    next: at.next,
  }
}

function managerTrail(pathname, term) {
  const live = termJourney(term).findIndex((s) => s.state === 'current')
  const at = managerPosition(pathname, live)
  if (!at) return null
  const stage = MANAGER_STAGES[at.stage]
  const screen = stage.screens[at.screen]
  // The next screen in time order, skipping one that is this screen again in the next stage (Applications).
  const after = [...stage.screens.slice(at.screen + 1), ...MANAGER_STAGES.slice(at.stage + 1).flatMap((x) => x.screens)]
  const next = after.find((x) => x.to !== screen.to) ?? null
  return {
    title: term ? t('Term {name}', { name: term.name }) : t('Term'),
    home: '/manager',
    stages: MANAGER_STAGES,
    at: at.stage,
    live,
    screen: t('{label} · {n} of {total}', { label: t(screen.label), n: at.screen + 1, total: stage.screens.length }),
    why: screen.why,
    notice: live >= 0 && live !== at.stage ? t('The Term is in {stage} now.', { stage: t(MANAGER_STAGES[live].label) }) : null,
    next,
  }
}
