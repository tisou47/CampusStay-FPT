import { Check } from 'lucide-react'
import { Card } from '@/components/ui/Display'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

// Marker per state: done = green tick, current = primary dot, upcoming = hollow ring (all 20 px, no layout shift).
const MARKER = {
  done: 'border-success bg-success text-fg-on-brand',
  current: 'border-primary bg-surface',
  upcoming: 'border-line-strong bg-surface',
}

/**
 * Term milestones as an ordered list: a row of steps from 768 px, a vertical list below (CSS only).
 * `milestones` = [{ label, date (node), state: 'done' | 'current' | 'upcoming' }]; the current one carries
 * aria-current="step" and the visible label "In progress".
 */
export function TermTimeline({ title, subtitle, milestones, className }) {
  return (
    <Card padding="lg" className={cx('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-4">
        <h2 className="text-card-title text-text">{tx(title)}</h2>
        {subtitle && <p className="text-small text-text-muted">{subtitle}</p>}
      </div>
      <ol className="flex flex-col gap-4 md:flex-row md:gap-0">
        {milestones.map(({ label, date, state }, i) => (
          <li key={label} aria-current={state === 'current' ? 'step' : undefined} className="relative flex gap-3 md:min-w-0 md:flex-1 md:flex-col md:gap-2">
            {/* The joining line: below the marker on phones, to the right of it from 768 px. */}
            {i < milestones.length - 1 && (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-6 bottom-[-16px] left-[9px] w-0.5 md:top-[9px] md:right-0 md:bottom-auto md:left-6 md:h-0.5 md:w-auto',
                  state === 'done' ? 'bg-success' : 'bg-line',
                )}
              />
            )}
            <span aria-hidden="true" className={cx('relative flex size-5 shrink-0 items-center justify-center rounded-full border-2', MARKER[state])}>
              {state === 'done' && <Check size={16} strokeWidth={3} aria-hidden="true" />}
              {state === 'current' && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 md:pr-3">
              <span className={cx('text-small', state === 'upcoming' ? 'text-text-secondary' : 'font-medium text-text')}>{tx(label)}</span>
              <span className={cx('text-small', state === 'current' ? 'font-medium text-fg-brand' : 'text-text-secondary')}>{date}</span>
              {state === 'current' && <span className="text-caption font-medium text-fg-brand">{t('Happening now')}</span>}
              {state === 'done' && <span className="sr-only">{t('Done')}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
