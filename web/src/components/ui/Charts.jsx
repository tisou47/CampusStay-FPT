import { tx } from '@/i18n'
import { formatNumber } from '@/lib/format'
import { cx } from '@/lib/cx'

// Simple chart marks used by dashboards and reports (as drawn in the Figma frames).
// Every mark carries a text label and value next to it, so colour never carries meaning alone;
// hovering a mark shows its exact value.

const fills = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  neutral: 'bg-neutral',
  accent: 'bg-accent',
  'accent-soft': 'bg-orange-300',
  primary: 'bg-primary',
}

/** Horizontal meter: 10 px rounded track on bg/subtle with a value fill. */
export function Meter({ value, max, tone = 'accent', label, className, trackClassName }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      title={label ? `${tx(label)}: ${formatNumber(value)}` : String(value)}
      className={cx('relative h-2.5 overflow-hidden rounded-full bg-subtle', trackClassName, className)}
    >
      {/* Very small values keep a 4 px sliver so the mark stays visible. */}
      <div className={cx('absolute inset-y-0 left-0 rounded-full', fills[tone])} style={{ width: value > 0 ? `max(${pct}%, 4px)` : 0 }} />
    </div>
  )
}

/** Label · meter · value rows (e.g. "Applications by status"). */
export function MeterRows({ rows, max, labelWidth = 'w-24', trackWidth = 'w-45', className }) {
  const top = max ?? Math.max(...rows.map((r) => r.value))
  return (
    <ul className={cx('flex flex-col gap-3', className)}>
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className={cx('shrink-0 text-base text-fg-secondary', labelWidth)}>{tx(r.label)}</span>
          <Meter value={r.value} max={top} tone={r.tone} label={r.label} className={cx('shrink-0', trackWidth)} />
          <span className="text-base font-medium text-fg tabular">{r.value.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  )
}

/** Small KPI tile used on back-office dashboards (16/14 px padding, Display/KPI value). */
// size "lg" = Display/KPI value (dashboards); "md" = Heading/H2 value with 16 px padding (Payments, Finance…).
export function KpiTile({ icon: Glyph, label, value, note, noteTone = 'secondary', valueTone, size = 'lg', className, children }) {
  const tone = { secondary: 'text-fg-secondary', warning: 'text-warning-fg', error: 'text-error-fg', success: 'text-success-fg', brand: 'text-fg-brand', tertiary: 'text-fg-tertiary' }
  return (
    <div className={cx('flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-line bg-surface', size === 'lg' ? 'px-4 py-3.5' : 'p-4', className)}>
      <div className="flex items-center gap-2 text-fg-tertiary">
        {Glyph && <Glyph size={16} aria-hidden="true" />}
        <p className="truncate text-sm font-medium">{tx(label)}</p>
      </div>
      <p className={cx('font-semibold whitespace-nowrap tabular', size === 'lg' ? 'text-kpi' : 'text-h2', valueTone ? tone[valueTone] : 'text-fg')}>{value}</p>
      {note && <p className={cx('truncate text-sm', tone[noteTone])}>{tx(note)}</p>}
      {children}
    </div>
  )
}
