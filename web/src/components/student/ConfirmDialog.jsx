import { useEffect, useId, useRef } from 'react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

const confirmTone = {
  danger: 'bg-danger text-fg-on-brand hover:bg-danger-fg',
  primary: 'bg-primary text-fg-on-brand hover:bg-primary-hover',
}

/**
 * Asks before an irreversible action, on the native <dialog>: showModal() keeps focus inside and the page
 * inert, Esc fires `cancel`, and the browser gives focus back to the opener on close(). Focus starts on Cancel.
 * The effect only opens and closes the element to follow `open`; it holds no display state.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', pending = false, onConfirm, onCancel, children }) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Esc: keep the element open until the parent says so, so `open` stays the one source of truth.
      onCancel={(e) => {
        e.preventDefault()
        onCancel?.()
      }}
      // No close on a backdrop click: an alert dialog waits for Cancel, Confirm or Esc.
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-xl bg-surface p-0 text-text shadow-modal backdrop:bg-text/45 open:animate-pop-in"
    >
      <div className="flex flex-col gap-4 p-6">
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
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-5 text-base font-medium text-text hover:border-primary hover:text-fg-brand"
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
    </dialog>
  )
}
