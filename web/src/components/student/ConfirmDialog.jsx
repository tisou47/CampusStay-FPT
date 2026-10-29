import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

const confirmTone = {
  danger: 'bg-danger text-fg-on-brand hover:bg-danger-fg',
  primary: 'bg-primary text-fg-on-brand hover:bg-primary-hover',
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Asks before an irreversible action. Focus starts on Cancel, Tab stays inside the dialog, Esc cancels,
 * and focus returns to the control that opened it. The effects only move focus; they hold no display state.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', pending = false, onConfirm, onCancel }) {
  const titleId = useId()
  const descId = useId()
  const boxRef = useRef(null)
  const cancelRef = useRef(null)
  // The latest handler, so a parent re-render while the dialog is open never moves the focus again.
  const cancelHandler = useRef(onCancel)
  cancelHandler.current = onCancel

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelHandler.current?.()
        return
      }
      if (e.key !== 'Tab' || !boxRef.current) return
      const items = boxRef.current.querySelectorAll(FOCUSABLE)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-text/45" onClick={onCancel} />
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative flex w-full max-w-md animate-pop-in flex-col gap-4 rounded-xl bg-surface p-6 shadow-modal"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-section-title text-text">
            {tx(title)}
          </h2>
          {description && (
            <p id={descId} className="text-body text-text-secondary">
              {tx(description)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-5 text-base font-medium text-text hover:border-primary"
          >
            {t(cancelLabel)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cx('inline-flex h-10 items-center rounded-md px-5 text-base font-medium disabled:opacity-45', confirmTone[tone] ?? confirmTone.danger)}
          >
            {tx(confirmLabel)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
