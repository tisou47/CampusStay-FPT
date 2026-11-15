import { Link, useLocation } from 'react-router'
import { AlertTriangle, ArrowRight, CalendarDays, Check, Info } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { ADMIN_STAGES, READY_SCREENS, flowPosition } from '@/app/adminFlow'
import { MANAGER_STAGES, STAFF_STAGES, stagePosition } from '@/app/managerFlow'
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
  const flow = role === 'admin' ? adminTrail(pathname) : STAGES[role] ? termTrail(STAGES[role], `/${role}`, pathname, term) : null
  if (!flow) return null
  const InfoGlyph = flow.notice ? AlertTriangle : Info
  return (
    <nav
      aria-label={flow.title}
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm"
    >
      <Link to={flow.home} className="flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 font-semibold text-fg-link transition-colors hover:bg-info-bg">
        <CalendarDays size={15} aria-hidden="true" />
        {flow.title}
      </Link>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />

      {/* Stages: this screen's stage spelled out, the others as numbered dots; each tells its name and purpose on hover. */}
      <ol className="flex shrink-0 items-center">
        {flow.stages.map((stage, i) => {
          const here = i === flow.at
          const live = i === flow.live
          const done = i < flow.at
          const tip = (
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-semibold">
                {t('Stage {n}', { n: i + 1 })}: {t(stage.label)}
                {live && <span className="rounded-full bg-green-500/25 px-1.5 text-green-100">{t('now')}</span>}
              </span>
              {stage.why && <span className="font-normal text-white/75">{t(stage.why)}</span>}
            </span>
          )
          return (
            <li key={stage.key} className="flex items-center">
              {i > 0 && <span aria-hidden="true" className={cx('h-px w-2.5', i <= flow.at ? 'bg-primary/40' : 'bg-line-strong')} />}
              <Tooltip label={tip} side="bottom" align={i === 0 ? 'start' : 'center'}>
                <span
                  tabIndex={0}
                  aria-current={here ? 'step' : undefined}
                  aria-label={`${t('Stage {n}', { n: i + 1 })}: ${t(stage.label)}${live ? ` (${t('now')})` : ''}`}
                  className={cx(
                    'relative flex h-6 cursor-default items-center justify-center rounded-full font-semibold tabular transition-colors',
                    here
                      ? 'gap-1.5 bg-primary-subtle pr-2.5 pl-1 text-fg-brand'
                      : done
                        ? 'size-6 bg-primary-subtle text-fg-brand hover:bg-orange-100'
                        : 'size-6 border border-line-strong text-fg-tertiary hover:border-fg-tertiary hover:text-fg-secondary',
                  )}
                >
                  {here ? (
                    <>
                      <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-xs text-fg-on-brand">{i + 1}</span>
                      <span className="whitespace-nowrap">{t(stage.label)}</span>
                    </>
                  ) : done ? (
                    <Check size={13} strokeWidth={3} aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                  {live && (
                    <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-surface" />
                  )}
                </span>
              </Tooltip>
            </li>
          )
        })}
      </ol>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />

      {/* This screen: its place in the stage, with why it matters (and any timing warning) on hover. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {flow.screen && <span className="truncate font-medium text-fg">{flow.screen}</span>}
        <Tooltip
          side="bottom"
          align="start"
          label={
            <span className="flex flex-col gap-1 font-normal">
              <span>{t(flow.why)}</span>
              {flow.notice && <span className="font-medium text-amber-100">{flow.notice}</span>}
            </span>
          }
        >
          <button
            type="button"
            aria-label={`${t(flow.why)}${flow.notice ? ` ${flow.notice}` : ''}`}
            className={cx(
              'flex size-6 shrink-0 cursor-help items-center justify-center rounded-full transition-colors',
              flow.notice ? 'text-warning hover:bg-warning-bg' : 'text-fg-tertiary hover:bg-subtle hover:text-fg-secondary',
            )}
          >
            <InfoGlyph size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {flow.next && (
        <Tooltip label={flow.next.why ? t(flow.next.why) : null} side="bottom" align="end">
          <Link
            to={flow.next.to}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium whitespace-nowrap text-fg-link transition-colors hover:bg-info-bg"
          >
            {t('Next: {label}', { label: t(flow.next.label) })}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Tooltip>
      )}
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

const STAGES = { manager: MANAGER_STAGES, staff: STAFF_STAGES }

/** The stage the Term is in now, as an index of the role's stages (-1 when there is no Term). */
const liveIndex = (term) => termJourney(term).findIndex((s) => s.state === 'current')

/**
 * The current stage's work on a role's home: why the stage matters and its screens as numbered links, in order.
 * Manager overview and Staff Today show it under the Term's stages.
 */
export function StageNow({ role, term }) {
  const stage = STAGES[role]?.[liveIndex(term)]
  if (!stage) return null
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-base text-fg-secondary">
        <span className="font-semibold text-fg">{t('Now: {stage}.', { stage: t(stage.label) })} </span>
        {t(stage.why)}
      </p>
      <ol className="flex flex-wrap gap-2" aria-label={t('Screens of this stage, in order')}>
        {stage.screens.map((sc, i) => (
          <li key={sc.to}>
            <Link
              to={sc.to}
              title={t(sc.why)}
              className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5 text-base text-fg hover:border-primary hover:text-fg-brand"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-fg-brand tabular">{i + 1}</span>
              {t(sc.label)}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

function termTrail(STAGES_OF_ROLE, home, pathname, term) {
  const live = liveIndex(term)
  const at = stagePosition(STAGES_OF_ROLE, pathname, live)
  if (!at) return null
  const stage = STAGES_OF_ROLE[at.stage]
  const screen = stage.screens[at.screen]
  // The next screen in time order, skipping one that is this screen again in the next stage (Applications).
  const after = [...stage.screens.slice(at.screen + 1), ...STAGES_OF_ROLE.slice(at.stage + 1).flatMap((x) => x.screens)]
  const next = after.find((x) => x.to !== screen.to) ?? null
  return {
    title: term ? t('Term {name}', { name: term.name }) : t('Term'),
    home,
    stages: STAGES_OF_ROLE,
    at: at.stage,
    live,
    screen: t('{label} · {n} of {total}', { label: t(screen.label), n: at.screen + 1, total: stage.screens.length }),
    why: screen.why,
    notice: live >= 0 && live !== at.stage && !screen.daily ? t('The Term is in {stage} now.', { stage: t(STAGES_OF_ROLE[live].label) }) : null,
    next,
  }
}
