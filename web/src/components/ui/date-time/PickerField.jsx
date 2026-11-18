import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { controlClasses } from '../Field'
import { mask } from './values'

/**
 * Open/close state of a picker. open is false, 'pointer' (a click in the text box: the focus stays there for typing,
 * ↓ moves it into the panel) or 'keyboard' (the icon button, Alt+↓: the focus goes to the panel). Closing after a
 * choice, Cancel or Esc puts the focus back in the field; a click outside leaves it where it went.
 */
export function usePicker() {
  const anchor = useRef(null)
  const input = useRef(null)
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const close = useCallback((reason) => {
    setOpen(false)
    if (reason !== 'outside') input.current?.focus({ preventScroll: true })
  }, [])
  const focusPanel = useCallback(() => {
    const panel = document.getElementById(panelId)
    const target = panel?.querySelector('[data-autofocus]:not([disabled])') ?? panel?.querySelector('[tabindex="0"], button:not([disabled])')
    target?.focus({ preventScroll: true })
  }, [panelId])
  return { anchor, input, panelId, open, setOpen, close, focusPanel }
}

/**
 * The field of every picker: a text box with the look of the other inputs, the chosen value in it ("16/11/2026",
 * "08:00", "16/11/2026 · 08:00", "08:00 – 10:00"), and on the right a clear button (clearable, when there is a value)
 * and the calendar or clock button that opens the panel. A click in the box or Alt+↓ opens it too.
 * The value can also be typed: digits are masked to `kind` ("16112026" → "16/11/2026") and read on blur or Enter by
 * onCommit(text), which answers true when it took the text. A text it cannot take turns the border red and calls
 * nothing; an emptied box calls onClear when clearable. `suffix` is shown after the text ("(2 giờ)").
 * `name` goes on a hidden input carrying the form's value, for forms read with FormData.
 */
export function PickerField({
  picker,
  id,
  name,
  formValue,
  kind,
  text,
  suffix,
  onCommit,
  onClear,
  icon: Icon,
  iconLabel,
  placeholder,
  clearable,
  disabled,
  error,
  required,
  size = 'md',
}) {
  const [draft, setDraft] = useState(text)
  const [bad, setBad] = useState(false)
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setDraft(text)
    setBad(false)
  }, [text])

  const commit = () => {
    if (!editing.current) return
    editing.current = false
    if (draft === text) return setBad(false)
    if (!draft.trim()) {
      if (clearable) {
        setBad(false)
        onClear?.()
      } else setBad(!!text)
      return
    }
    setBad(!onCommit(draft))
  }

  const invalid = !!error || bad
  const hasValue = !!text
  return (
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
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-expanded={!!picker.open}
        aria-controls={picker.open ? picker.panelId : undefined}
        onClick={() => !disabled && !picker.open && picker.setOpen('pointer')}
        onChange={(e) => {
          editing.current = true
          setBad(false)
          setDraft(mask(kind, e.target.value))
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault()
            picker.setOpen('keyboard')
          } else if (e.key === 'ArrowDown' && picker.open) {
            e.preventDefault()
            picker.focusPanel()
          } else if (e.key === 'Tab' && picker.open) {
            picker.setOpen(false)
          }
        }}
        className={cx(
          controlClasses({ size: size === 'sm' ? 'md' : size, invalid }),
          size === 'sm' && 'h-7 text-sm',
          'tabular',
          picker.open && !invalid && 'border-primary shadow-focus',
          hasValue && clearable && !disabled ? 'pr-14' : 'pr-9',
        )}
      />
      {name && <input type="hidden" name={name} value={formValue ?? ''} />}
      <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5">
        {suffix && hasValue && draft === text && <span className="mr-1 text-sm text-fg-tertiary tabular">{suffix}</span>}
        {clearable && hasValue && !disabled && (
          <button
            type="button"
            aria-label={t('Clear')}
            onClick={() => {
              onClear?.()
              picker.input.current?.focus({ preventScroll: true })
            }}
            className="pointer-events-auto rounded p-1 text-fg-tertiary hover:bg-subtle hover:text-fg"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={t(iconLabel)}
          onClick={() => picker.setOpen((o) => (o ? false : 'keyboard'))}
          className={cx('pointer-events-auto rounded p-1 hover:bg-subtle disabled:cursor-not-allowed', disabled ? 'text-fg-disabled' : 'text-fg-tertiary hover:text-fg')}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}
