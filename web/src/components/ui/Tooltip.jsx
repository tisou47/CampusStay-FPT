import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

const GAP = 8 // between the anchor and the bubble
const EDGE = 8 // kept free at the window's edges
const SHOW_DELAY = 120

/**
 * Small dark tooltip shown on hover and keyboard focus of its child.
 * The bubble is drawn in a portal with fixed positioning, so tables, drawers and scrolling panels never clip it;
 * it flips to the other side when there is no room and stays inside the window.
 * side: where the bubble sits ("top" | "bottom"); align: which edge it lines up with ("center" | "start" | "end").
 * title: optional bold first line, label then reads as the explanation below it.
 */
export function Tooltip({ label, title, children, side = 'top', align = 'center', className, bubbleClassName }) {
  const anchor = useRef(null)
  const bubble = useRef(null)
  const timer = useRef(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)

  const show = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), SHOW_DELAY)
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setOpen(false)
    setPos(null)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  // Place the bubble once it is measured; follow scrolling and resizing while it is open.
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const b = bubble.current?.getBoundingClientRect()
      if (!a || !b) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      let s = side
      if (s === 'top' && a.top - b.height - GAP < EDGE && a.bottom + b.height + GAP <= vh - EDGE) s = 'bottom'
      else if (s === 'bottom' && a.bottom + b.height + GAP > vh - EDGE && a.top - b.height - GAP >= EDGE) s = 'top'
      const top = s === 'top' ? a.top - b.height - GAP : a.bottom + GAP
      let left = align === 'start' ? a.left - 4 : align === 'end' ? a.right - b.width + 4 : a.left + a.width / 2 - b.width / 2
      left = Math.min(Math.max(left, EDGE), vw - b.width - EDGE)
      const arrow = Math.min(Math.max(a.left + a.width / 2 - left, 12), b.width - 12)
      setPos({ top, left, side: s, arrow })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, side, align, label, title])

  // Escape closes it, as on any tooltip.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && hide()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, hide])

  if (!label && !title) return children
  return (
    <span
      ref={anchor}
      className={cx('relative inline-flex', className)}
      onPointerEnter={(e) => e.pointerType !== 'touch' && show()}
      onPointerLeave={hide}
      onFocus={(e) => e.target.matches?.(':focus-visible') && show()}
      onBlur={hide}
      onPointerDown={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={bubble}
            id={id}
            role="tooltip"
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            className={cx(
              'pointer-events-none fixed z-[1000] w-max max-w-80 rounded-lg bg-gray-900 px-2.5 py-1.5 text-left text-sm font-medium whitespace-normal text-white shadow-dropdown',
              'transition-[opacity,translate] duration-150',
              pos ? 'translate-y-0 opacity-100' : 'opacity-0',
              bubbleClassName,
            )}
          >
            {title ? (
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{tx(title)}</span>
                {label && <span className="font-normal text-white/80">{tx(label)}</span>}
              </span>
            ) : (
              tx(label)
            )}
            {pos && (
              <span
                aria-hidden="true"
                style={{ left: pos.arrow - 4 }}
                className={cx('absolute size-2 rotate-45 bg-gray-900', pos.side === 'top' ? '-bottom-1' : '-top-1')}
              />
            )}
          </span>,
          document.body,
        )}
    </span>
  )
}

/**
 * A small "?" next to a label, a heading or a figure, explaining what it means or what happens next.
 * Keyboard users reach it with Tab; the text is also its accessible name.
 */
export function InfoTip({ label, title, side = 'top', align = 'center', size = 14, className }) {
  if (!label && !title) return null
  const name = [title, label].filter((x) => typeof x === 'string').map(tx).join('. ')
  return (
    <Tooltip label={label} title={title} side={side} align={align} className="align-middle">
      <button
        type="button"
        aria-label={name || undefined}
        onClick={(e) => e.preventDefault()}
        className={cx(
          'inline-flex shrink-0 cursor-help items-center justify-center rounded-full text-fg-tertiary transition-colors hover:text-fg-brand focus-visible:text-fg-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
          className,
        )}
      >
        <CircleHelp size={size} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
