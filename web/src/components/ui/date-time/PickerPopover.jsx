import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tx } from '@/i18n'

const EDGE = 8
const GAP = 6
const MOBILE = '(max-width: 639px)'

/** True below 640 px: pickers open as a bottom sheet there. */
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
 * The panel of every picker, drawn in a portal so a Modal or a scrolling card never clips it. On a wide screen it
 * sits under its field, flips above when there is no room below and stays inside the window; below 640 px it is a
 * bottom sheet over a dimmed page. Esc and a click outside close it (Esc with focus back on the field); the first
 * element marked data-autofocus (the chosen day, the chosen time) takes the focus when it opens.
 */
export function PickerPopover({ anchor, onClose, width = 340, label, children }) {
  const ref = useRef(null)
  const mobile = useIsMobile()
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (mobile) return undefined
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const panel = ref.current
      if (!a || !panel) return
      const h = panel.scrollHeight
      const w = Math.min(width, window.innerWidth - 2 * EDGE)
      const below = window.innerHeight - a.bottom - GAP - EDGE
      const above = a.top - GAP - EDGE
      const down = below >= h || (above < h && below >= above)
      // Where neither side has room, the panel slides to stay whole on screen (over the field if it must).
      const preferred = down ? a.bottom + GAP : a.top - GAP - h
      const maxHeight = window.innerHeight - 2 * EDGE
      const top = Math.max(EDGE, Math.min(preferred, window.innerHeight - Math.min(h, maxHeight) - EDGE))
      const left = Math.max(EDGE, Math.min(a.left, window.innerWidth - w - EDGE))
      setPos({ top, left, width: w, maxHeight })
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
      e.stopPropagation() // the Modal under the picker stays open
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
    const target = ref.current?.querySelector('[data-autofocus]:not([disabled])') ?? ref.current?.querySelector('button:not([disabled])')
    target?.focus({ preventScroll: true })
  }, [])

  const dialog = {
    ref,
    role: 'dialog',
    'aria-modal': mobile || undefined,
    'aria-label': tx(label),
  }

  return createPortal(
    mobile ? (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/40">
        <div {...dialog} className="max-h-[88vh] w-full animate-pop-in overflow-y-auto rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-dropdown">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          {children}
        </div>
      </div>
    ) : (
      <div
        {...dialog}
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? width, maxHeight: pos?.maxHeight }}
        className="fixed z-[70] animate-pop-in overflow-y-auto rounded-xl border border-line bg-surface shadow-dropdown"
      >
        {children}
      </div>
    ),
    document.body,
  )
}
