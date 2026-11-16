import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tx } from '@/i18n'

const OFFSET = 8 // between the field and the panel
const EDGE = 8 // kept free at the window's edges
const MOBILE = '(max-width: 639px)'

/** True below 640 px: the pickers open as a bottom sheet there. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE).matches)
  useEffect(() => {
    const query = window.matchMedia?.(MOBILE)
    if (!query) return undefined
    const onChange = () => setMobile(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return mobile
}

/**
 * The panel of every picker, drawn in a portal so a Modal body or a scrolling card never clips it. On a wide screen
 * it sits 8 px under its field, flips above it when there is more room there (offset, flip) and slides sideways to
 * stay inside the window (shift); it follows the field while the page scrolls. Below 640 px it is a bottom sheet
 * over a dimmed page. Esc closes it without closing the Modal under it; so does a click outside. When it opens, the
 * element marked data-autofocus (the chosen day, the chosen time) takes the focus.
 * `picker` comes from usePicker(); it is closed with the reason 'escape' or 'outside'. Opened by a click in the
 * text box, the focus stays there so the value can still be typed.
 */
export function PickerPopover({ picker, width = 320, label, children }) {
  const { anchor, close: onClose, panelId, open } = picker
  const ref = useRef(null)
  const mobile = useIsMobile()
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (mobile) return undefined
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const panel = ref.current
      if (!a || !panel) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.min(width, vw - 2 * EDGE)
      const h = panel.scrollHeight + (panel.offsetHeight - panel.clientHeight) // its whole height, borders included
      const below = vh - a.bottom - OFFSET - EDGE
      const above = a.top - OFFSET - EDGE
      const down = below >= h || below >= above
      const maxHeight = Math.max(160, down ? below : above)
      const shown = Math.min(h, maxHeight)
      const top = down ? a.bottom + OFFSET : a.top - OFFSET - shown
      const left = Math.max(EDGE, Math.min(a.left, vw - w - EDGE))
      setPos({ top: Math.max(EDGE, Math.min(top, vh - shown - EDGE)), left, width: w, maxHeight, side: down ? 'bottom' : 'top' })
    }
    place()
    const observer = new ResizeObserver(place)
    if (ref.current) observer.observe(ref.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, width, mobile])

  useEffect(() => {
    const onDown = (e) => !ref.current?.contains(e.target) && !anchor.current?.contains(e.target) && onClose('outside')
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // the Modal or Drawer under the picker stays open
      onClose('escape')
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  useEffect(() => {
    if (open === 'pointer') return
    const target =
      ref.current?.querySelector('[data-autofocus]:not([disabled])') ?? ref.current?.querySelector('button:not([disabled]):not([tabindex="-1"])')
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'nearest' })
  }, [])

  const dialog = { ref, id: panelId, role: 'dialog', 'aria-modal': mobile || undefined, 'aria-label': tx(label) }

  return createPortal(
    mobile ? (
      <div className="fixed inset-0 z-[70] flex items-end bg-gray-900/45">
        <div {...dialog} className="max-h-[88vh] w-full animate-pop-in overflow-y-auto rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-modal">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          {children}
        </div>
      </div>
    ) : (
      <div
        {...dialog}
        data-side={pos?.side}
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? width, maxHeight: pos?.maxHeight }}
        className="fixed z-[70] animate-pop-in overflow-y-auto rounded-2xl border border-line bg-surface shadow-dropdown"
      >
        {children}
      </div>
    ),
    document.body,
  )
}
