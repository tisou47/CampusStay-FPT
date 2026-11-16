import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { Tooltip } from './Tooltip'

/*
 * Where the Term (or a role's flow) stands, as numbered stages joined by a line. One component, two variants:
 * - "full" (Staff Today): equal grid columns, each a 28 px circle centred over its name, dates and, for the current
 *   stage, a mini bar of the time gone and the days left;
 * - "compact" (the trail above each screen): 20 px circles and 12 px joins, no text but the stage of this screen.
 * Every stage explains itself in a tooltip (hover, or Tab to it): its dates, how far it is, what it is for and the
 * page it leads to. The day figures are worked out here from the stage's own dates, for display only.
 *
 * Step: { key, label, date, state: 'done' | 'current' | 'todo', note, custom, from, to, why, link: { to, label },
 *   live (compact: the Term is in this stage now), time ('done' | 'current' | 'todo': where the stage is in time,
 *   when `state` says something else, e.g. the stage of the screen) }.
 */

const DAY = 86_400_000

/** How far a stage is in time, from its dates; null when it has none. */
export function stageTiming(step, now = new Date()) {
  const from = step.from?.getTime?.()
  const to = step.to?.getTime?.()
  if (!from || !to || to <= from) return null
  const at = now.getTime()
  const total = Math.max(1, Math.round((to - from) / DAY))
  if (at < from) return { before: true, startsIn: Math.max(1, Math.ceil((from - at) / DAY)), total }
  if (at >= to) return { after: true, total }
  return {
    total,
    day: Math.min(total, Math.floor((at - from) / DAY) + 1),
    left: Math.max(0, Math.ceil((to - at) / DAY)),
    pct: Math.min(100, Math.max(0, ((at - from) / (to - from)) * 100)),
  }
}

/** The short status of a stage in time: in progress, done, or how soon it starts. */
function statusOf(step, timing) {
  const time = step.time ?? step.state
  if (!step.from && !step.to && !step.time) return null
  if (time === 'done') return { label: t('Stage done'), tone: 'done' }
  if (time === 'current') {
    if (timing?.before) return { label: t('Starts in {n} days', { n: timing.startsIn }), tone: 'todo' }
    return { label: t('Under way'), tone: 'current' }
  }
  return { label: timing?.before ? t('Starts in {n} days', { n: timing.startsIn }) : t('Coming up'), tone: 'todo' }
}

function MiniBar({ pct, className, track = 'bg-primary-subtle' }) {
  return (
    <span aria-hidden="true" className={cx('block h-1 overflow-hidden rounded-full', track, className)}>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct > 0 ? Math.max(pct, 3) : 0}%` }} />
    </span>
  )
}

/** The tooltip of a stage: number and name with its status, dates, how far it is, why it matters, where it leads. */
function StageTip({ step, index, now }) {
  const timing = stageTiming(step, now)
  const status = statusOf(step, timing)
  const running = timing && !timing.before && !timing.after
  return (
    <span className="flex w-68 flex-col gap-1.5 py-0.5">
      <span className="flex items-start justify-between gap-3">
        <span className="font-semibold">
          {index + 1} · {tx(step.label)}
        </span>
        {status && (
          <span
            className={cx(
              'shrink-0 rounded-full px-1.5 text-xs leading-5 font-semibold whitespace-nowrap',
              status.tone === 'done' && 'bg-green-500/25 text-green-100',
              status.tone === 'current' && 'bg-orange-500/30 text-orange-100',
              status.tone === 'todo' && 'bg-white/15 text-white/85',
            )}
          >
            {status.label}
          </span>
        )}
      </span>
      {step.date && <span className="font-normal text-white/75 tabular">{step.date}</span>}
      {running && (step.time ?? step.state) === 'current' && (
        <span className="flex items-center gap-2 font-normal">
          <MiniBar pct={timing.pct} track="bg-white/20" className="w-20 shrink-0" />
          <span className="text-white/85 tabular">{t('day {d}/{n} · {left} days left', { d: timing.day, n: timing.total, left: timing.left })}</span>
        </span>
      )}
      {step.live && step.state !== 'current' && <span className="font-normal text-green-100">{t('The term is in this stage now.')}</span>}
      {step.why && <span className="font-normal text-white/80">{tx(step.why)}</span>}
      {step.link && (
        <span className="font-semibold text-orange-200">
          {t('Go to {page}', { page: tx(step.link.label) })} →
        </span>
      )}
    </span>
  )
}

/** The focusable anchor of a stage: a link to its page when it has one, else a plain stop for the keyboard. */
function StageAnchor({ step, describedBy, label, className, children }) {
  const common = { 'aria-describedby': describedBy, 'aria-label': label, 'aria-current': step.state === 'current' ? 'step' : undefined }
  return step.link ? (
    <Link to={step.link.to} {...common} className={cx('outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2', className)}>
      {children}
    </Link>
  ) : (
    <span tabIndex={0} {...common} className={cx('cursor-default outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2', className)}>
      {children}
    </span>
  )
}

const stateName = (s) => t(s === 'done' ? 'Done' : s === 'current' ? 'Current step' : 'Not started')

export function SemesterProgress({ steps, variant = 'full', now = new Date(), className, 'aria-label': ariaLabel }) {
  if (!steps?.length) return null
  return variant === 'compact' ? (
    <Compact steps={steps} now={now} className={className} ariaLabel={ariaLabel} />
  ) : (
    <Full steps={steps} now={now} className={className} ariaLabel={ariaLabel} />
  )
}

function Full({ steps, now, className, ariaLabel }) {
  return (
    <ol aria-label={ariaLabel} className={cx('grid', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const timing = stageTiming(s, now)
        const running = s.state === 'current' && timing && !timing.before && !timing.after
        return (
          <li key={s.key ?? s.label} className="flex min-w-0 flex-col">
            {/* The circle's own row: the join runs from this circle's centre to the next one's, 6 px clear of each. */}
            <div
              className={cx(
                'relative flex h-7 items-center justify-center',
                !last && "after:absolute after:top-1/2 after:right-[calc(-50%+20px)] after:left-[calc(50%+20px)] after:h-0.5 after:-translate-y-1/2 after:rounded-[1px] after:content-['']",
                !last && (s.state === 'done' ? 'after:bg-success' : 'after:bg-line'),
              )}
            >
              <Tooltip label={<StageTip step={s} index={i} now={now} />} delay={150} align={i === 0 ? 'start' : last ? 'end' : 'center'} className="z-[1]" bubbleClassName="max-w-none">
                {({ describedBy }) => (
                  <StageAnchor step={s} describedBy={describedBy} label={`${i + 1}. ${tx(s.label)} (${stateName(s.state)})`} className="rounded-full">
                    <Circle state={s.state} n={i + 1} size="full" />
                  </StageAnchor>
                )}
              </Tooltip>
            </div>
            <div className="flex min-w-0 flex-col items-center gap-0.5 px-2 pt-1.5 text-center">
              <Tooltip label={<StageTip step={s} index={i} now={now} />} delay={150} align={i === 0 ? 'start' : last ? 'end' : 'center'} className="max-w-full" bubbleClassName="max-w-none">
                {({ describedBy }) => (
                  <StageAnchor step={s} describedBy={describedBy} className="rounded-sm">
                    <span className={cx('line-clamp-2 text-base leading-tight', s.state === 'current' ? 'font-semibold text-fg-brand' : s.state === 'done' ? 'text-fg' : 'text-fg-secondary')}>
                      {tx(s.label)}
                    </span>
                  </StageAnchor>
                )}
              </Tooltip>
              {s.date && <span className="text-sm leading-tight text-fg-tertiary tabular">{s.date}</span>}
              {running && <MiniBar pct={timing.pct} className="mt-1 w-4/5" />}
              {running && s.custom && <span className="text-sm leading-tight font-medium text-fg-brand">{t('{n} days left', { n: timing.left })}</span>}
              {s.note && (
                <span className={cx('line-clamp-2 text-sm leading-tight', s.state === 'current' ? 'font-medium text-fg-brand' : 'text-fg-secondary')} title={tx(s.note)}>
                  {tx(s.note)}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Circle({ state, n, size, label }) {
  const full = size === 'full'
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative flex shrink-0 items-center justify-center rounded-full font-semibold tabular',
        full ? 'size-7 text-sm' : 'size-5 text-xs',
        state === 'done' && 'bg-success text-white',
        state === 'current' && 'bg-primary text-fg-on-brand',
        state === 'current' && full && 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_22%,transparent)] motion-safe:animate-halo',
        state === 'todo' && cx('bg-surface text-fg-tertiary', full ? 'border-2 border-line-strong' : 'border border-line-strong'),
        label && 'w-auto',
      )}
    >
      {state === 'done' ? <Check size={full ? 15 : 12} strokeWidth={3} /> : n}
    </span>
  )
}

/**
 * The compact trail: done stages as ticks, this screen's stage as its number and name, the rest as numbers; a green
 * dot marks the stage the Term is in now. Each stage's name and dates are in its tooltip.
 */
function Compact({ steps, now, className, ariaLabel }) {
  return (
    <ol aria-label={ariaLabel} className={cx('flex shrink-0 items-center', className)}>
      {steps.map((s, i) => {
        const here = s.state === 'current'
        return (
          <li key={s.key ?? s.label} className="flex items-center">
            {i > 0 && <span aria-hidden="true" className={cx('h-0.5 w-3 rounded-[1px]', steps[i - 1].state === 'done' ? 'bg-success/70' : 'bg-line-strong')} />}
            <Tooltip label={<StageTip step={s} index={i} now={now} />} delay={150} side="bottom" align={i === 0 ? 'start' : 'center'} bubbleClassName="max-w-none">
              {({ describedBy }) => (
                <StageAnchor
                  step={s}
                  describedBy={describedBy}
                  label={`${t('Stage {n}', { n: i + 1 })}: ${tx(s.label)}${s.live ? ` (${t('now')})` : ''}`}
                  className={cx(
                    'relative flex h-5 items-center justify-center rounded-full font-semibold tabular transition-colors',
                    here ? 'gap-1.5 bg-primary-subtle pr-2 pl-0.5 text-fg-brand' : 'hover:brightness-95',
                  )}
                >
                  {here ? (
                    <>
                      <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[11px] text-fg-on-brand">{i + 1}</span>
                      <span className="whitespace-nowrap">{tx(s.label)}</span>
                    </>
                  ) : (
                    <Circle state={s.state} n={i + 1} size="compact" />
                  )}
                  {s.live && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-surface" />}
                </StageAnchor>
              )}
            </Tooltip>
          </li>
        )
      })}
    </ol>
  )
}
