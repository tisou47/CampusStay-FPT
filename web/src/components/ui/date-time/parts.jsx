import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { mask } from '@/lib/datetime'
import { controlClasses } from '../Field'
import { Tooltip } from '../Tooltip'

/** Open/close state of a picker; closing with Esc or after a choice puts the focus back in the field. */
export function usePicker() {
  const anchor = useRef(null)
  const input = useRef(null)
  const [open, setOpen] = useState(false)
  const close = useCallback((reason) => {
    setOpen(false)
    if (reason !== 'outside') input.current?.focus({ preventScroll: true })
  }, [])
  return { anchor, input, open, setOpen, close }
}

/**
 * The field of every picker: a text box that can be typed in (digits masked to the input format of `kind`, read
 * on blur or Enter by `onCommit`, which answers an error text or null), then on the right a "Now"/"Today" button
 * (showNow), a clear button (clearable, when there is a value) and the calendar or clock button that opens the
 * panel (Alt+↓ too). A typing error shows under the field; `error` from the form shows the same way. A disabled
 * field with `disabledReason` explains itself in a tooltip ("Choose a Block first").
 */
export function PickerInput({
  picker,
  id: idProp,
  kind,
  text,
  onCommit,
  onClear,
  icon: Icon,
  iconLabel,
  placeholder,
  clearable = true,
  nowLabel,
  onNow,
  disabled,
  disabledReason,
  invalid,
  error,
  required,
  label,
  size = 'md',
}) {
  const autoId = useId()
  const id = idProp ?? autoId
  const errorId = `${id}-error`
  const [draft, setDraft] = useState(text)
  const [typingError, setTypingError] = useState('')
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setDraft(text)
    setTypingError('')
  }, [text])

  const commit = () => {
    editing.current = false
    if (draft === text) return
    if (!draft.trim()) {
      setTypingError('')
      onClear?.()
      return
    }
    const problem = onCommit(draft)
    setTypingError(problem ?? '')
  }

  const shownError = typingError || (typeof error === 'string' ? tx(error) : '')
  const hasValue = !!text
  const field = (
    <div ref={picker.anchor} className="relative min-w-0">
      <input
        ref={picker.input}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        placeholder={tx(placeholder)}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || !!shownError || undefined}
        aria-describedby={shownError ? errorId : undefined}
        aria-haspopup="dialog"
        aria-expanded={picker.open}
        onChange={(e) => {
          editing.current = true
          setDraft(mask(kind, e.target.value))
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault()
            picker.setOpen(true)
          }
        }}
        className={cx(
          controlClasses({ size, invalid: invalid || !!shownError }),
          'tabular',
          picker.open && 'border-primary ring-2 ring-primary-subtle',
          onNow ? 'pr-32' : 'pr-16',
        )}
      />
      <span className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {onNow && !disabled && (
          <button type="button" onClick={onNow} className="rounded px-1.5 py-0.5 text-xs font-semibold text-fg-brand hover:bg-primary-subtle">
            {t(nowLabel)}
          </button>
        )}
        {clearable && hasValue && !disabled && (
          <button type="button" aria-label={t('Clear')} onClick={onClear} className="rounded p-1 text-fg-tertiary hover:bg-subtle hover:text-fg">
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={t(iconLabel)}
          onClick={() => picker.setOpen((o) => !o)}
          className="rounded p-1 text-fg-tertiary hover:bg-subtle hover:text-fg disabled:cursor-not-allowed"
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-base font-medium text-fg">
          {tx(label)}
          {required && <span className="text-error-fg"> *</span>}
        </label>
      )}
      {disabled && disabledReason ? (
        <Tooltip label={disabledReason} align="start" className="block">
          {field}
        </Tooltip>
      ) : (
        field
      )}
      {shownError && (
        <p id={errorId} className="text-sm text-error-fg">
          {shownError}
        </p>
      )}
    </div>
  )
}

/** Quick choices as chips ("Tomorrow", "Next week"); a choice outside the allowed range is faded. */
export function QuickOptions({ options, isActive, isAllowed, onPick, extra }) {
  if (!options?.length && !extra) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {extra}
      {options?.map((o) => (
        <button
          key={o.label}
          type="button"
          disabled={!isAllowed(o.value)}
          onClick={() => onPick(o.value)}
          className={cx(
            'rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-30',
            isActive(o.value) ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line text-fg-secondary enabled:hover:border-primary',
          )}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  )
}

/** The "Now" chip inside a panel. */
export function NowChip({ label = 'Now', onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-fg-on-brand hover:bg-primary-hover">
      {t(label)}
    </button>
  )
}

/** The summary of the choice above Confirm, Confirm only once the choice is complete, then Cancel. */
export function PanelFooter({ summary, problem, ready, onConfirm, onCancel }) {
  return (
    <div className="sticky bottom-0 flex flex-col gap-1.5 border-t border-line bg-surface p-3">
      <p className={cx('min-h-5 text-center text-sm tabular', problem ? 'text-error-fg' : summary ? 'font-medium text-fg' : 'text-fg-tertiary')} aria-live="polite">
        {problem || summary || t('Nothing chosen yet')}
      </p>
      <button
        type="button"
        disabled={!ready}
        onClick={onConfirm}
        className="w-full rounded-lg bg-primary py-2 font-semibold text-fg-on-brand hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('Confirm')}
      </button>
      <button type="button" onClick={onCancel} className="py-1 text-sm text-fg-secondary hover:underline">
        {t('Cancel')}
      </button>
    </div>
  )
}

/** A quickOptions prop: false hides them, an array or a function of today replaces the default. */
export function resolveOptions(quickOptions, fallback, today) {
  if (quickOptions === false) return []
  const chosen = quickOptions ?? fallback
  return typeof chosen === 'function' ? chosen(today) : chosen
}

/** The later / earlier of two optional bounds compared as text. */
export const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b)
export const earlier = (a, b) => (!a ? b : !b ? a : a < b ? a : b)
