import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { ArrowRight, CircleHelp } from 'lucide-react'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'

const GAP = 8 // between the anchor and the bubble
const EDGE = 8 // kept free at the window's edges
const SHOW_DELAY = 120

/** True when an element's text is cut: by its width (text-overflow: ellipsis) or by its lines (line-clamp). */
export const isTruncated = (el) => Boolean(el) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)

/**
 * Small dark tooltip shown on hover and keyboard focus of its child.
 * The bubble is drawn in a portal with fixed positioning, so tables, drawers and scrolling panels never clip it;
 * it flips to the other side when there is no room and stays inside the window.
 * side: where the bubble sits ("top" | "bottom"); align: which edge it lines up with ("center" | "start" | "end").
 * title: optional bold first line, label then reads as the explanation below it (label may be any node).
 * delay: ms of hovering before it shows. when(): checked before showing (e.g. only when the text is cut).
 * touch: on a touch screen a tap opens it as a popover (the tap does not follow the link it sits in), a tap
 *   outside closes it; `action` ({ label, to }) then adds a button, e.g. "Open details".
 * block: the anchor is a flex box taking its width (for a row's text) instead of an inline box.
 * label may be a function, read when the tooltip opens; children may be a function of { describedBy }.
 */
export function Tooltip({ label, title, children, side = 'top', align = 'center', delay = SHOW_DELAY, when, touch = false, action, block = false, className, bubbleClassName }) {
  const anchor = useRef(null)
  const bubble = useRef(null)
  const timer = useRef(null)
  const pointer = useRef('mouse')
  const id = useId()
  const [open, setOpen] = useState(false) // false | 'hover' | 'touch'
  const [pos, setPos] = useState(null)

  const allowed = useCallback(() => (when ? when() : true), [when])
  const show = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => allowed() && setOpen((o) => o || 'hover'), delay)
  }, [allowed, delay])
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
      const arrowAt = align === 'start' ? Math.min(a.left + 16, a.right) : a.left + a.width / 2
      const arrow = Math.min(Math.max(arrowAt - left, 12), b.width - 12)
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

  // Escape closes it, as on any tooltip; a tap outside closes the touch popover.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && hide()
    const onDown = (e) => {
      if (anchor.current?.contains(e.target) || bubble.current?.contains(e.target)) return
      hide()
    }
    document.addEventListener('keydown', onKey)
    if (open === 'touch') document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, hide])

  // children may be a function of { describedBy }, to put aria-describedby on the element that takes focus.
  const describedBy = open ? id : undefined
  const content = typeof children === 'function' ? children({ describedBy }) : children
  if (!label && !title) return content
  const interactive = open === 'touch'
  const text = typeof label === 'function' ? (open ? label() : null) : label
  return (
    <span
      ref={anchor}
      className={cx(block ? 'relative flex min-w-0' : 'relative inline-flex', className)}
      onPointerEnter={(e) => e.pointerType !== 'touch' && show()}
      onPointerLeave={(e) => e.pointerType !== 'touch' && hide()}
      onFocus={(e) => e.target.matches?.(':focus-visible') && show()}
      onBlur={(e) => !interactive && !anchor.current?.contains(e.relatedTarget) && hide()}
      onPointerDown={(e) => {
        pointer.current = e.pointerType
        if (e.pointerType !== 'touch') hide()
      }}
      onClickCapture={(e) => {
        // A tap on cut text shows the whole of it first; the link it sits in opens from the popover's button.
        if (!touch || pointer.current !== 'touch' || open === 'touch' || !allowed()) return
        e.preventDefault()
        e.stopPropagation()
        setOpen('touch')
      }}
      aria-describedby={typeof children === 'function' ? undefined : describedBy}
    >
      {content}
      {open &&
        createPortal(
          <span
            ref={bubble}
            id={id}
            role="tooltip"
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            className={cx(
              'fixed z-[1000] w-max max-w-80 rounded-lg bg-gray-900 px-2.5 py-1.5 text-left text-sm font-medium whitespace-normal text-white shadow-dropdown',
              'transition-[opacity,translate] duration-150',
              interactive ? 'pointer-events-auto' : 'pointer-events-none',
              pos ? 'translate-y-0 opacity-100' : 'opacity-0',
              bubbleClassName,
            )}
          >
            {title ? (
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{tx(title)}</span>
                {text && <span className="font-normal text-white/80">{tx(text)}</span>}
              </span>
            ) : (
              tx(text)
            )}
            {interactive && action?.to && (
              <Link
                to={action.to}
                onClick={hide}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {tx(action.label ?? t('Open details'))}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
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
 * One line of text cut with "…" when it does not fit; hovering it for 300 ms, focusing it or tapping it shows the
 * whole text (or `tip`), and only when it really is cut. `as` picks the element (span by default); lines={2} wraps
 * the text over two lines before cutting it.
 */
export function Truncate({ children, tip, as: Tag = 'span', side = 'top', align = 'start', lines = 1, className, tipClassName }) {
  const ref = useRef(null)
  const when = useCallback(() => isTruncated(ref.current), [])
  const content = tip ?? children
  return (
    <Tooltip label={content} when={when} delay={300} touch side={side} align={align} block className={tipClassName}>
      <Tag ref={ref} className={cx('min-w-0', lines === 2 ? 'line-clamp-2 break-words' : 'truncate', className)}>
        {tx(children)}
      </Tag>
    </Tooltip>
  )
}

/**
 * A small "?" next to a label, a heading or a figure, explaining what it means or what happens next.
 * Keyboard users reach it with Tab; the text is also its accessible name.
 */
export function InfoTip({ label, title, side = 'top', align = 'center', size = 14, ariaLabel, className }) {
  if (!label && !title) return null
  const name = ariaLabel ?? [title, label].filter((x) => typeof x === 'string').map(tx).join('. ')
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
