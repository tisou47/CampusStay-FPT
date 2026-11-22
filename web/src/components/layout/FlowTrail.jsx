import { Link, useLocation } from 'react-router'
import { AlertTriangle, ArrowRight, CalendarDays, Info } from 'lucide-react'
import { SemesterProgress } from '@/components/ui/SemesterProgress'
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
      className="-mb-1 flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] leading-5"
    >
      <Link to={flow.home} className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 font-semibold text-fg-link transition-colors hover:bg-info-bg">
        <CalendarDays size={14} aria-hidden="true" />
        {flow.title}
      </Link>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line" />

      {/* Stages: done ones as ticks, this screen's stage spelled out, the others as numbers; each explains itself on hover. */}
      <SemesterProgress variant="compact" steps={flow.steps} aria-label={t('Stages')} />
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line" />

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
              'flex size-5 shrink-0 cursor-help items-center justify-center rounded-full transition-colors',
              flow.notice ? 'text-warning hover:bg-warning-bg' : 'text-fg-tertiary hover:bg-subtle hover:text-fg-secondary',
            )}
          >
            <InfoGlyph size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {flow.next && (
        <Tooltip label={flow.next.why ? t(flow.next.why) : null} side="bottom" align="end">
          <Link
            to={flow.next.to}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 font-medium whitespace-nowrap text-fg-link transition-colors hover:bg-info-bg"
          >
            {t('Next: {label}', { label: t(flow.next.label) })}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </Tooltip>
      )}
    </nav>
  )
}

/** Admin screens that do without the trail (their page says enough on its own). */
const ADMIN_NO_TRAIL = ['/admin/term-requests']

function adminTrail(pathname) {
  if (ADMIN_NO_TRAIL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null
  const at = flowPosition(pathname)
  if (!at) return null
  return {
    title: t('Set up a term'),
    home: '/admin',
    steps: ADMIN_STAGES.map((st, i) => ({ key: st.key, label: st.label, why: st.why, state: stateAt(i, at.stage) })),
    screen: at.current ? t('{label} · {n} of {total}', { label: t(at.current.label), n: at.screen + 1, total: READY_SCREENS.length }) : null,
    why: at.current?.why ?? ADMIN_STAGES[at.stage].why,
    next: at.next,
  }
}

const STAGES = { manager: MANAGER_STAGES, staff: STAFF_STAGES }

const stateAt = (i, at) => (i < at ? 'done' : i === at ? 'current' : 'todo')

/**
 * A role's stages as SemesterProgress steps: the Term's dates and where each stage is in time, what it is for and
 * its first screen. stateOf(i) says how the stage is drawn (by default where it is in time).
 */
export function stageSteps(STAGES_OF_ROLE, term, stateOf, notes) {
  const journey = termJourney(term, notes)
  return STAGES_OF_ROLE.map((st, i) => {
    const j = journey[i] ?? {}
    const time = j.state
    return {
      ...j,
      key: st.key,
      label: st.label,
      why: st.why,
      state: stateOf ? stateOf(i) : (time ?? 'todo'),
      time,
      live: time === 'current',
      link: st.screens?.[0] ? { to: st.screens[0].to, label: st.screens[0].label } : null,
    }
  })
}

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
    steps: stageSteps(STAGES_OF_ROLE, term, (i) => stateAt(i, at.stage)),
    screen: t('{label} · {n} of {total}', { label: t(screen.label), n: at.screen + 1, total: stage.screens.length }),
    why: screen.why,
    notice: live >= 0 && live !== at.stage && !screen.daily ? t('The term is in {stage} now.', { stage: t(STAGES_OF_ROLE[live].label) }) : null,
    next,
  }
}

const badgeTone = {
  error: 'bg-error-bg text-error-fg',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info-fg',
  success: 'bg-success-bg text-success-fg',
  neutral: 'bg-subtle text-fg-secondary',
}

/**
 * The current stage's screens as a row of chips on a role's home (Staff Today), each with what is still open there
 * when the page knows it. counts: { [screen path]: { label, tone, title } }; a screen without a count shows its name.
 */
export function StageWork({ role, term, counts = {}, className }) {
  const stage = STAGES[role]?.[liveIndex(term)]
  if (!stage) return null
  return (
    <div className={cx('flex flex-wrap items-center gap-x-2 gap-y-1.5', className)}>
      <span className="text-sm font-medium text-fg-secondary">{t('Work of this stage:')}</span>
      <ul className="contents">
        {stage.screens.map((sc) => {
          const c = counts[sc.to]
          return (
            <li key={sc.to}>
              <Tooltip label={c?.title ? `${t(sc.why)} ${c.title}` : t(sc.why)} delay={150} side="bottom">
                <Link
                  to={sc.to}
                  className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-canvas pr-1 pl-3 text-sm text-fg transition-colors hover:border-primary hover:text-fg-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {t(sc.label)}
                  {c ? (
                    <span className={cx('rounded-full px-1.5 text-xs leading-5 font-semibold whitespace-nowrap tabular', badgeTone[c.tone ?? 'neutral'])}>{c.label}</span>
                  ) : (
                    <span aria-hidden="true" className="w-2" />
                  )}
                </Link>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
