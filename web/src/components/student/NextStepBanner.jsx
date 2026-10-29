import { useId } from 'react'
import { Button } from '@/components/ui/Button'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { ReasonLine } from './ReasonLine'

// Tone of the "what to do next" banner (static: one class string per tone).
const TONES = {
  warning: { box: 'border-warning/30 bg-warning-bg', icon: 'text-warning-fg', meta: 'text-warning-fg' },
  primary: { box: 'border-primary/25 bg-brand-subtle', icon: 'text-fg-brand', meta: 'text-fg-brand' },
  info: { box: 'border-info/25 bg-info-bg', icon: 'text-info-fg', meta: 'text-info-fg' },
  success: { box: 'border-success/25 bg-success-bg', icon: 'text-success-fg', meta: 'text-success-fg' },
  neutral: { box: 'border-border bg-surface', icon: 'text-text-secondary', meta: 'text-text-secondary' },
}

/**
 * Full-width banner answering "what do I do next, and by when". `step` = { tone, icon, title, detail?, meta?,
 * cta: { label, to, disabled? }, reason? } — computed by a pure function from data the page already has.
 * The call to action is the page's one primary button; a locked one points at its visible reason.
 */
export function NextStepBanner({ step, className }) {
  const reasonId = useId()
  const tone = TONES[step.tone] ?? TONES.neutral
  const Glyph = step.icon
  const locked = Boolean(step.cta?.disabled)
  return (
    <section aria-labelledby={`${reasonId}-title`} className={cx('flex flex-col gap-4 rounded-lg border p-5 md:flex-row md:items-center md:gap-6 lg:px-6', tone.box, className)}>
      {Glyph && (
        <span className={cx('hidden size-12 shrink-0 items-center justify-center rounded-full bg-surface md:flex', tone.icon)}>
          <Glyph size={20} aria-hidden="true" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={`${reasonId}-title`} className="text-section-title text-text">
          {tx(step.title)}
        </h2>
        {step.meta && <p className={cx('text-body font-medium', tone.meta)}>{tx(step.meta)}</p>}
        {step.detail && <p className="text-body text-text-secondary">{tx(step.detail)}</p>}
        {locked && <ReasonLine id={reasonId}>{step.reason}</ReasonLine>}
      </div>
      {step.cta && (
        <Button
          variant="primary"
          size="lg"
          to={locked ? undefined : step.cta.to}
          disabled={locked}
          aria-describedby={locked ? reasonId : undefined}
          className="max-md:w-full"
        >
          {step.cta.label}
        </Button>
      )}
    </section>
  )
}
