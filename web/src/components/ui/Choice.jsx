import { Check, Minus } from 'lucide-react'
import { cx } from '@/lib/cx'

// Figma: 02 Components › Checkbox and Radio. 16 px control in a 22 px row, Body/Base label.

export function Checkbox({ label, description, indeterminate = false, className, disabled, ...props }) {
  return (
    <label
      className={cx(
        'inline-flex items-start gap-2 text-base text-fg',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <span className="relative flex h-[22px] w-4 shrink-0 items-center">
        <input
          type="checkbox"
          disabled={disabled}
          className={cx(
            'peer size-4 cursor-[inherit] appearance-none rounded-sm border border-line-strong bg-surface transition-colors',
            'checked:border-primary checked:bg-primary',
            indeterminate && 'border-primary bg-primary',
          )}
          {...props}
        />
        {indeterminate ? (
          <Minus size={12} aria-hidden="true" className="pointer-events-none absolute left-0.5 text-white" />
        ) : (
          <Check size={12} aria-hidden="true" className="pointer-events-none absolute left-0.5 hidden text-white peer-checked:block" />
        )}
      </span>
      {(label || description) && (
        <span className="flex min-w-0 flex-col">
          {label && <span>{label}</span>}
          {description && <span className="text-sm text-fg-tertiary">{description}</span>}
        </span>
      )}
    </label>
  )
}

export function Radio({ label, description, className, disabled, ...props }) {
  return (
    <label
      className={cx(
        'inline-flex items-start gap-2 text-base text-fg',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <span className="flex h-[22px] w-4 shrink-0 items-center">
        <input
          type="radio"
          disabled={disabled}
          className="size-4 cursor-[inherit] appearance-none rounded-full border border-line-strong bg-surface transition-[border] checked:border-[5px] checked:border-primary"
          {...props}
        />
      </span>
      {(label || description) && (
        <span className="flex min-w-0 flex-col">
          {label && <span>{label}</span>}
          {description && <span className="text-sm text-fg-tertiary">{description}</span>}
        </span>
      )}
    </label>
  )
}

/** On/off switch for configuration screens (Ant Design <Switch>). */
export function Switch({ checked, onChange, label, size = 'md', disabled, className, ...props }) {
  const track = size === 'sm' ? 'h-4 w-7' : 'h-[22px] w-10'
  const knob = size === 'sm' ? 'size-3 peer-checked:translate-x-3' : 'size-[18px] peer-checked:translate-x-[18px]'
  return (
    <label
      className={cx(
        'inline-flex items-center gap-2 text-base text-fg',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <span className={cx('relative inline-flex shrink-0', track)}>
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          {...props}
        />
        <span className={cx('absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary', 'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus')} />
        <span className={cx('absolute top-0.5 left-0.5 rounded-full bg-white shadow-card transition-transform', knob)} />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}
