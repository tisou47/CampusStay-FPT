import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '@/lib/cx'

function useOverlayBehaviour(open, onClose) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])
}

// Scrim (#101828 at 45%) + Elevation/3 Modal card: 12 px radius, 24 px padding, 16 px between
// sections, H2 title with a 20 px close glyph, right-aligned footer (Payments – Confirm manual payment).
export function Modal({ open, onClose, title, description, icon, children, footer, width = 480, className }) {
  useOverlayBehaviour(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-gray-900/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: width }}
        className={cx('relative flex max-h-[calc(100vh-32px)] w-full animate-pop-in flex-col gap-4 rounded-xl bg-surface p-6 shadow-modal', className)}
      >
        <div className="flex items-start gap-4">
          {icon}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-h2 font-semibold text-fg">
              {title}
            </h2>
            {description && <p className="text-base text-fg-secondary">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// Right-hand drawer (480 px), as in "Room Types – Edit drawer".
export function Drawer({ open, onClose, title, description, children, footer, width = 480 }) {
  useOverlayBehaviour(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-gray-900/45" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width }}
        className="absolute inset-y-0 right-0 flex max-w-full animate-slide-in-right flex-col bg-surface shadow-modal"
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-h2 font-semibold text-fg">
              {title}
            </h2>
            {description && <p className="text-base text-fg-secondary">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line p-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
