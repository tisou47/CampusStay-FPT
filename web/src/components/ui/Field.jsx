import { Fragment, cloneElement, isValidElement, useId, useRef } from 'react'
import { ChevronDown, Search, Upload } from 'lucide-react'
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
 * `fit`: the box is as wide as the chosen option's text (filter bars), so "Role: All" or "Date: Last 30 days" is never
 * cut; `wrapperClassName` may still cap it (max-w-…), and then a long name ends with "…".
 */
export function Select({ size = 'md', invalid, options = [], className, wrapperClassName, children, fit = false, ...props }) {
  const chosen = fit
    ? options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt)).find((o) => String(o.value) === String(props.value ?? ''))
    : null
  return (
    <div className={cx('relative min-w-0', fit && 'shrink-0', wrapperClassName)}>
      {fit && (
        // Invisible copy of the chosen text: it gives the box its width, and the select lies over it. (A select's own
        // width follows its longest option, which is what made filters too wide or cut.)
        <span aria-hidden="true" className={cx('invisible block truncate border px-3 pr-9 leading-[30px] whitespace-pre', sizes[size])}>
          {tx(chosen?.label ?? '')}
        </span>
      )}
      <select
        className={cx(controlClasses({ size, invalid }), 'cursor-pointer appearance-none truncate pr-9', fit && 'absolute inset-0', className)}
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
          'pointer-events-none absolute top-1/2 right-3 z-1 -translate-y-1/2',
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
