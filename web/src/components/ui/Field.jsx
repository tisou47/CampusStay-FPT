import { useId } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cx } from '@/lib/cx'

// Figma: 02 Components › Input and Select (maps to Ant Design <Input> / <Select>).
// md = Middle 32 px (back office), lg = Large 40 px (student web). Label above, helper or error below.

const sizes = {
  md: 'h-8 text-base',
  lg: 'h-10 text-lg',
}

export function controlClasses({ size = 'md', invalid = false } = {}) {
  return cx(
    'w-full min-w-0 rounded-md border bg-surface px-3 text-fg outline-none transition-[border-color,box-shadow]',
    'placeholder:text-fg-tertiary',
    'disabled:cursor-not-allowed disabled:border-line disabled:bg-subtle disabled:text-fg-disabled',
    invalid
      ? 'border-error focus:border-error focus:shadow-[0_0_0_2px_#c81e1e26]'
      : 'border-line-strong focus:border-focus focus:shadow-focus',
    sizes[size],
  )
}

/** Label + control + helper/error. Pass a render function to receive the generated id. */
export function Field({ label, hint, helper, error, required, className, children, id: idProp }) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      {label && (
        <label htmlFor={id} className="flex items-baseline gap-1 text-base font-medium text-fg">
          {label}
          {required && <span className="text-error-fg">*</span>}
          {hint && <span className="ml-auto text-sm font-normal text-fg-tertiary">{hint}</span>}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? (
        <p className="text-sm text-error-fg">{error}</p>
      ) : helper ? (
        <p className="text-sm text-fg-tertiary">{helper}</p>
      ) : null}
    </div>
  )
}

export function Input({ size = 'md', invalid, className, ...props }) {
  return <input className={cx(controlClasses({ size, invalid }), className)} aria-invalid={invalid || undefined} {...props} />
}

export function Textarea({ size = 'md', invalid, className, rows = 4, ...props }) {
  return (
    <textarea
      rows={rows}
      className={cx(controlClasses({ size, invalid }), 'h-auto resize-y py-2', size === 'lg' ? 'py-2.5' : 'py-1.5', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

/**
 * Native select styled like the Figma Select. `options` accepts strings or { value, label }.
 */
export function Select({ size = 'md', invalid, options = [], className, wrapperClassName, children, ...props }) {
  return (
    <div className={cx('relative min-w-0', wrapperClassName)}>
      <select
        className={cx(controlClasses({ size, invalid }), 'cursor-pointer appearance-none truncate pr-9', className)}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children ??
          options.map((opt) => {
            const o = typeof opt === 'string' ? { value: opt, label: opt } : opt
            return (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            )
          })}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2',
          props.disabled ? 'text-fg-disabled' : 'text-fg-secondary',
        )}
      />
    </div>
  )
}

/** Search box used in filter bars: 16 px search glyph, tertiary placeholder. */
export function SearchInput({ size = 'md', className, wrapperClassName, ...props }) {
  return (
    <div className={cx('relative min-w-0', wrapperClassName)}>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-tertiary"
      />
      <input type="search" className={cx(controlClasses({ size }), 'pl-9', className)} {...props} />
    </div>
  )
}

/** Read-only value shown in a field box (disabled look without the disabled semantics). */
export function StaticField({ size = 'md', className, children }) {
  return (
    <div
      className={cx(
        'flex w-full min-w-0 items-center rounded-md border border-line bg-subtle px-3 text-fg-secondary',
        sizes[size],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </div>
  )
}
