import { cx } from '@/lib/cx'

/**
 * Small dark tooltip shown on hover and keyboard focus of its child (CSS only, no portal).
 * side: where the bubble sits ("top" | "bottom"); align: which edge it lines up with ("center" | "start" | "end").
 */
export function Tooltip({ label, children, side = 'top', align = 'center', className, bubbleClassName }) {
  if (!label) return children
  return (
    <span className={cx('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 w-max max-w-80 rounded-lg bg-gray-900 px-2.5 py-1.5 text-sm font-medium text-white opacity-0 shadow-dropdown transition-[opacity,translate] duration-150',
          'group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-has-[:focus-visible]/tip:translate-y-0 group-has-[:focus-visible]/tip:opacity-100',
          side === 'top' ? 'bottom-full mb-2 translate-y-1' : 'top-full mt-2 -translate-y-1',
          align === 'center' && 'left-1/2 -translate-x-1/2',
          align === 'start' && '-left-1',
          align === 'end' && '-right-1',
          bubbleClassName,
        )}
      >
        {label}
        <span
          aria-hidden="true"
          className={cx(
            'absolute size-2 rotate-45 bg-gray-900',
            side === 'top' ? '-bottom-1' : '-top-1',
            align === 'center' && 'left-1/2 -ml-1',
            align === 'start' && 'left-3',
            align === 'end' && 'right-3',
          )}
        />
      </span>
    </span>
  )
}
