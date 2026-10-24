import { useEffect, useRef, useState } from 'react'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

/**
 * Minimal anchored popover (Elevation/2 Dropdown). `trigger` receives { open, toggle, props }.
 */
export function Popover({ trigger, children, align = 'end', width = 320, className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), props: { 'aria-expanded': open, 'aria-haspopup': 'true' } })}
      {open && (
        <div
          style={{ width }}
          className={cx(
            'absolute top-full z-40 mt-2 animate-pop-in rounded-lg border border-line bg-surface shadow-dropdown',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon: Glyph, children, onClick, danger, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 px-3 py-2 text-left text-base transition-colors hover:bg-subtle',
        danger ? 'text-error-fg' : 'text-fg',
        className,
      )}
    >
      {Glyph && <Glyph size={16} aria-hidden="true" className={danger ? 'text-error' : 'text-fg-secondary'} />}
      {tx(children)}
    </button>
  )
}
