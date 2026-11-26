import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Escape closes, the page behind stops scrolling, and keyboard focus moves into the dialog, stays there while
 * Tab cycles, and goes back to the control that opened it on close. A field that focuses itself (autoFocus) keeps it.
 */
function useOverlayBehaviour(open, onClose, panelRef) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.()
      // Tab wraps inside the dialog; a layer opened above it (a date picker) handles its own focus.
      if (e.key !== 'Tab' || !panel || !panel.contains(document.activeElement)) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open, panelRef])
}

// Scrim (gray-900 at 45%) + Elevation/3 Modal card: 12 px radius, 24 px padding, 16 px between
// sections, H2 title with a 20 px close glyph, right-aligned footer (Payments – Confirm manual payment).
// On a phone the footer buttons stack full width, the main action on top, instead of running past the card.
export function Modal({ open, onClose, title, description, icon, children, footer, width = 480, className }) {
  const panelRef = useRef(null)
  useOverlayBehaviour(open, onClose, panelRef)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-gray-900/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className={cx('relative flex max-h-[calc(100dvh-32px)] w-full animate-pop-in flex-col gap-4 rounded-xl bg-surface p-6 shadow-modal outline-none max-sm:p-5', className)}
      >
        <div className="flex items-start gap-4">
          {icon}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-h2 font-semibold text-fg">
              {tx(title)}
            </h2>
            {description && <p className="text-base text-fg-secondary">{tx(description)}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="-mr-1 rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&_button]:h-auto max-sm:[&_button]:min-h-10 max-sm:[&_button]:py-2 max-sm:[&_button]:text-center max-sm:[&_button]:whitespace-normal">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Admin and Manager pages show their drawers as a centred dialog with more room to work in (user decisions
 * 22/11/2026 and 24/11/2026); Staff and students keep the side drawer.
 */
const centredHere = () => typeof window !== 'undefined' && /^\/(admin|manager)(\/|$)/.test(window.location.pathname)

// Right-hand drawer (480 px), as in "Room Types – Edit drawer". On Admin pages (or with placement="center") the same
// content opens in the middle of the screen, about 40% wider, so forms and lists have more space.
export function Drawer({ open, onClose, title, description, children, footer, width = 480, placement }) {
  const panelRef = useRef(null)
  useOverlayBehaviour(open, onClose, panelRef)
  const titleId = useId()
  if (!open) return null
  if (placement === 'center' || (placement !== 'side' && centredHere())) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 max-sm:p-3">
        <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-gray-900/45" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={panelRef}
          tabIndex={-1}
          style={{ maxWidth: Math.min(Math.round(width * 1.4), 1120) }}
          className="relative flex max-h-[calc(100dvh-48px)] w-full animate-pop-in flex-col rounded-xl bg-surface shadow-modal outline-none"
        >
          <div className="flex items-start gap-4 border-b border-line px-6 pt-6 pb-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id={titleId} className="text-h2 font-semibold text-fg">
                {tx(title)}
              </h2>
              {description && <p className="text-base text-fg-secondary">{tx(description)}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label={t('Close')} className="-mr-1 rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </div>
      </div>,
      document.body,
    )
  }
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-gray-900/45" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        tabIndex={-1}
        style={{ width }}
        className="absolute inset-y-0 right-0 flex max-w-full animate-slide-in-right flex-col bg-surface shadow-modal outline-none"
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-h2 font-semibold text-fg">
              {tx(title)}
            </h2>
            {description && <p className="text-base text-fg-secondary">{tx(description)}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="-mr-1 rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
