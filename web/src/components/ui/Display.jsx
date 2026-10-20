import { Fragment } from 'react'
import { Check, ChevronRight, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router'
import { cx } from '@/lib/cx'
import { initials as toInitials } from '@/lib/format'

/* ---------------------------------------------------------------- Avatar */
// Figma: 02 Components › Avatar — 32 px, orange/100 fill, brand initials.
export function Avatar({ name, initials, size = 32, className }) {
  const text = initials ?? (name ? toInitials(name) : '?')
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-orange-100 font-medium text-fg-brand',
        size >= 40 ? 'text-base' : 'text-sm',
        className,
      )}
    >
      {text}
    </span>
  )
}

/* ---------------------------------------------------------------- Card */
// Cards stay flat on the canvas with a 1 px border (Foundations › Elevation).
export function Card({ as: Tag = 'section', padding = 'md', className, children, ...props }) {
  const pad = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }[padding]
  return (
    <Tag className={cx('rounded-lg border border-line bg-surface', pad, className)} {...props}>
      {children}
    </Tag>
  )
}

export function CardHeader({ title, description, actions, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{title}</h2>
        {description && <p className="text-sm text-fg-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Alert */
// Figma: 02 Components › Alert (Ant Design <Alert showIcon>). Width is set by the container.
const alertTypes = {
  info: { box: 'bg-info-bg', icon: Info, iconColor: 'text-info' },
  warning: { box: 'bg-warning-bg', icon: TriangleAlert, iconColor: 'text-warning' },
  success: { box: 'bg-success-bg', icon: CircleCheck, iconColor: 'text-success' },
  error: { box: 'bg-error-bg', icon: TriangleAlert, iconColor: 'text-error' },
}

export function Alert({ type = 'info', title, children, action, onClose, className }) {
  const t = alertTypes[type]
  const Glyph = t.icon
  return (
    <div
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-lg px-4 py-3', t.box, className)}
    >
      <Glyph size={20} aria-hidden="true" className={cx('mt-px shrink-0', t.iconColor)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-base">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className="text-fg-secondary">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 rounded text-fg-tertiary hover:text-fg">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Steps */
// Figma: 02 Components › Step (Ant Design <Steps>). Steps are joined by a 1 px border/default line.
export function StepIndicator({ state, number }) {
  if (state === 'done') {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-brand bg-primary-subtle text-fg-brand">
        <Check size={16} aria-hidden="true" />
      </span>
    )
  }
  return (
    <span
      className={cx(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-base font-medium',
        state === 'current' ? 'bg-primary text-fg-on-brand' : 'border border-line-strong bg-surface text-fg-tertiary',
      )}
    >
      {number}
    </span>
  )
}

// Connectors leading to a done or current step use action/primary; the rest border/default.
export function Steps({ steps, current, compact = false, className }) {
  return (
    <ol className={cx('flex w-full items-center', compact ? 'gap-3' : 'gap-4', className)}>
      {steps.map((title, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming'
        return (
          <Fragment key={title}>
            {i > 0 && <li aria-hidden="true" className={cx('h-px min-w-4 flex-1', i <= current ? 'bg-primary' : 'bg-line')} />}
            <li className="flex shrink-0 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
              <StepIndicator state={state} number={i + 1} />
              <span
                className={cx(
                  'text-base whitespace-nowrap',
                  state === 'current' ? 'font-medium text-fg' : state === 'done' ? 'text-fg' : 'text-fg-tertiary',
                )}
              >
                {title}
              </span>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

/* ---------------------------------------------------------------- Breadcrumb */
// 12/20, earlier levels tertiary, current level secondary, 12 px chevrons.
export function Breadcrumb({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('flex items-center gap-1.5 text-sm', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1
        return (
          <Fragment key={item.label}>
            {i > 0 && <ChevronRight size={12} aria-hidden="true" className="text-fg-tertiary" />}
            {item.to && !last ? (
              <Link to={item.to} className="text-fg-tertiary hover:text-fg-brand">
                {item.label}
              </Link>
            ) : (
              <span className={last ? 'text-fg-secondary' : 'text-fg-tertiary'} aria-current={last ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

/* ---------------------------------------------------------------- Facts row */
// Label (12/20 tertiary) over value (14/22 medium), laid out in equal columns.
export function Facts({ items, dense = false, className }) {
  return (
    <dl className={cx('flex w-full items-start', dense ? 'gap-4' : 'gap-6', className)}>
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <dt className="text-sm text-fg-tertiary">{label}</dt>
          <dd className="text-base font-medium text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Small tertiary note with a 16 px info glyph. */
export function Note({ children, className, icon: Glyph = Info }) {
  return (
    <p className={cx('flex items-start gap-2 text-sm text-fg-tertiary', className)}>
      <Glyph size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  )
}

/* ---------------------------------------------------------------- Key/value list */
export function DescriptionList({ items, columns = 1, className, labelWidth }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3', className)}>
      {items.map(([label, value]) => (
        <div key={label} className={cx('flex min-w-0 gap-3', labelWidth ? 'flex-row' : 'flex-col gap-0.5')}>
          <dt className={cx('shrink-0 text-sm text-fg-tertiary', labelWidth)}>{label}</dt>
          <dd className="min-w-0 text-base text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------------- Progress timeline */
// Vertical event rail (Application Detail › Progress): 12 px markers joined by 2 px lines.
// done = success marker + success line; current = 3 px action/primary ring; upcoming = 1.5 px border/strong ring.
export function ProgressTimeline({ events, className }) {
  return (
    <ol className={cx('flex flex-col', className)}>
      {events.map((event, i) => {
        const last = i === events.length - 1
        return (
          <li key={event.title} className="flex items-start gap-4">
            <span aria-hidden="true" className={cx('flex w-5 shrink-0 flex-col items-center', last ? 'h-3' : 'h-11')}>
              <span
                className={cx(
                  'size-3 shrink-0 rounded-full',
                  event.state === 'done' && 'bg-success',
                  event.state === 'current' && 'border-[3px] border-primary bg-white',
                  event.state === 'upcoming' && 'border-[1.5px] border-line-strong bg-white',
                )}
              />
              {!last && <span className={cx('w-0.5 flex-1', event.state === 'done' ? 'bg-success' : 'bg-line')} />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p
                className={cx(
                  'text-base',
                  event.state === 'current' ? 'font-medium text-fg' : event.state === 'done' ? 'text-fg' : 'text-fg-secondary',
                )}
              >
                {event.title}
              </p>
              {event.time && <p className={cx('text-sm', event.state === 'current' ? 'text-fg-brand' : 'text-fg-tertiary')}>{event.time}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------------------------------------------------------------- Detail rows */
// Label left (secondary), value right; rows separated by border/default (Invoice, Transfer details…).
export function DetailRows({ rows, className, rowClassName = 'py-2.5' }) {
  return (
    <dl className={cx('flex flex-col', className)}>
      {rows.map(([label, value], i) => (
        <div key={label} className={cx('flex items-center justify-between gap-4', rowClassName, i < rows.length - 1 && 'border-b border-line')}>
          <dt className="shrink-0 text-base text-fg-secondary">{label}</dt>
          <dd className="min-w-0 text-right text-base text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------------- Stat tile */
// Summary tiles (My Invoices, dashboards): icon + Label/Small, Display/KPI value, Body/Small note.
export function StatTile({ icon: Glyph, label, value, note, className, children }) {
  return (
    <Card className={cx('flex min-w-0 flex-1 flex-col gap-2', className)}>
      <div className="flex items-center gap-2 text-fg-tertiary">
        {Glyph && <Glyph size={16} aria-hidden="true" />}
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="text-kpi font-semibold text-fg">{value}</p>
      {note && <p className="text-sm text-fg-secondary">{note}</p>}
      {children}
    </Card>
  )
}

/* ---------------------------------------------------------------- Divider */
export function Divider({ className }) {
  return <hr className={cx('w-full border-0 border-t border-line', className)} />
}

/* ---------------------------------------------------------------- Empty state */
export function EmptyState({ icon: Glyph, title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {Glyph && (
        <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-fg-tertiary">
          <Glyph size={24} aria-hidden="true" />
        </span>
      )}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-h3 font-semibold text-fg">{title}</p>
        {children && <p className="text-base text-fg-secondary">{children}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------------------------------------------------------------- Progress bar */
// brand/accent is decorative: progress bars and chart marks only.
export function ProgressBar({ value, max = 100, tone = 'accent', className }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', error: 'bg-error', info: 'bg-info' }[tone]
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cx('h-2 w-full overflow-hidden rounded-full bg-subtle', className)}
    >
      <div className={cx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}
