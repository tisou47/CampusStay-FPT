import { Fragment, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Upload } from 'lucide-react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { InfoTip } from './Tooltip'

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
      ? 'border-error focus:border-error focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-error)_15%,transparent)]'
      : 'border-line-strong focus:border-focus focus:shadow-focus',
    sizes[size],
  )
}

/** Label + control + helper/error. Pass a render function to receive the generated id. */
/** tip: a "?" after the label explaining the field (what it means, where the value is used). */
export function Field({ label, hint, tip, helper, error, required, className, children, id: idProp }) {
  const autoId = useId()
  const id = idProp ?? autoId
  // The helper or error under the field is read out with the control (aria-describedby on the element the
  // render function returns), so a screen reader hears "Lower than previous" when it lands on the input.
  const messageId = error || helper ? `${id}-message` : undefined
  let control = typeof children === 'function' ? children(id) : children
  if (messageId && typeof children === 'function' && isValidElement(control) && control.type !== Fragment && !control.props['aria-describedby']) {
    control = cloneElement(control, { 'aria-describedby': messageId })
  }
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      {label && (
        <label htmlFor={id} className="flex items-baseline gap-1 text-base font-medium text-fg">
          {tx(label)}
          {required && <span className="text-error-fg">*</span>}
          {tip && <InfoTip label={tip} className="self-center" />}
          {hint && <span className="ml-auto text-sm font-normal text-fg-tertiary">{tx(hint)}</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={messageId} className="text-sm text-error-fg">{tx(error)}</p>
      ) : helper ? (
        <p id={messageId} className="text-sm text-fg-tertiary">{tx(helper)}</p>
      ) : null}
    </div>
  )
}

export function Input({ size = 'md', invalid, className, placeholder, ...props }) {
  return <input className={cx(controlClasses({ size, invalid }), className)} aria-invalid={invalid || undefined} placeholder={tx(placeholder)} {...props} />
}

export function Textarea({ size = 'md', invalid, className, rows = 4, placeholder, ...props }) {
  return (
    <textarea
      rows={rows}
      placeholder={tx(placeholder)}
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
                {tx(o.label)}
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
export function SearchInput({ size = 'md', className, wrapperClassName, placeholder, ...props }) {
  return (
    <div className={cx('relative min-w-0', wrapperClassName)}>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-tertiary"
      />
      <input type="search" className={cx(controlClasses({ size }), 'pl-9', className)} placeholder={tx(placeholder)} {...props} />
    </div>
  )
}

/**
 * Attach-a-file row (receipts, evidence): a dashed box with an upload glyph that names the chosen file.
 * The hidden file input sits beside the button, not inside it. onChange receives the File (or null).
 */
export function FilePicker({ file, onChange, accept, placeholder, disabled, size = 'md', className, ...props }) {
  const input = useRef(null)
  return (
    <>
      <button
        {...props}
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={cx(
          'flex min-w-0 items-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 text-left transition-colors',
          size === 'lg' ? 'min-h-12 py-3' : 'py-2.5',
          'hover:border-primary hover:bg-primary-subtle/40 disabled:pointer-events-none disabled:opacity-45',
          className,
        )}
      >
        <Upload size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
        <span className={cx('min-w-0 truncate text-base', file ? 'font-medium text-fg' : 'text-fg-secondary')}>{file ? file.name : tx(placeholder)}</span>
      </button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => onChange?.(e.target.files?.[0] ?? null)} />
    </>
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
      <span className="truncate">{tx(children)}</span>
    </div>
  )
}

/**
 * Custom filter dropdown: shows `Label: Value` when closed, and only clean options inside the aligned popover menu.
 */
export function FilterSelect({ label, icon: Icon, value, onChange, options = [], size = 'md', disabled = false, placement = 'bottom', align = 'left', className, wrapperClassName, 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const normalized = options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
  const current = normalized.find((o) => String(o.value) === String(value)) ?? normalized[0]

  return (
    <div ref={ref} className={cx('relative', wrapperClassName)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? (label ? tx(label) : undefined)}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cx(
          'inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 whitespace-nowrap text-fg transition-colors',
          'hover:border-primary/60 focus-visible:border-focus focus-visible:shadow-focus focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:border-line disabled:bg-subtle disabled:text-fg-disabled',
          size === 'sm' ? 'h-7 text-sm' : 'h-8 text-base',
          open && 'border-focus shadow-focus',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {Icon && <Icon size={14} aria-hidden="true" className="shrink-0 text-fg-secondary" />}
          {label && <span className="shrink-0 text-fg-secondary">{tx(label)}:</span>}
          <span className="truncate font-medium">{current ? tx(current.label) : ''}</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" className={cx('shrink-0 text-fg-secondary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel ?? (label ? tx(label) : undefined)}
          className={cx(
            'absolute z-30 max-h-72 min-w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-dropdown',
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {normalized.map((opt) => {
            const selected = String(opt.value) === String(value)
            return (
              <li key={String(opt.value)} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange?.(opt.value)
                    setOpen(false)
                  }}
                  className={cx(
                    'flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors',
                    selected ? 'bg-primary-subtle font-medium text-fg-brand' : 'text-fg hover:bg-subtle',
                  )}
                >
                  <span>{tx(opt.label)}</span>
                  {selected && <Check size={14} aria-hidden="true" className="shrink-0 text-fg-brand" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
