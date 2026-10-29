import { Link } from 'react-router'
import { tx } from '@/i18n'
import { cx } from '@/lib/cx'

// Figma: 02 Components › Button (maps to Ant Design <Button>).
// Type: Primary (one per view), Default, Text (link-style), Danger (destructive).
// Size: md = Middle 32 px (back office), lg = Large 40 px (student web).
const variants = {
  primary: 'bg-primary font-semibold text-fg-on-brand shadow-card hover:bg-primary-hover',
  default: 'border border-line-strong bg-surface text-fg hover:border-primary hover:text-fg-brand',
  text: 'text-fg-brand hover:bg-primary-subtle',
  danger: 'bg-error text-fg-on-brand hover:bg-red-700',
  'danger-text': 'text-error-fg hover:bg-error-bg',
}

const sizes = {
  sm: 'h-7 gap-1.5 px-3',
  md: 'h-8 gap-2 px-4',
  lg: 'h-10 gap-2 px-5',
}

export function Button({
  variant = 'default',
  size = 'md',
  icon: IconBefore,
  iconAfter: IconAfter,
  iconSize = 20,
  to,
  href,
  block = false,
  className,
  children,
  type = 'button',
  ...props
}) {
  const classes = cx(
    'inline-flex shrink-0 items-center justify-center rounded-md text-base font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  )
  const content = (
    <>
      {IconBefore && <IconBefore size={iconSize} aria-hidden="true" />}
      {tx(children)}
      {IconAfter && <IconAfter size={iconSize} aria-hidden="true" />}
    </>
  )

  if ((to || href) && props.disabled) {
    const { disabled: _disabled, ...rest } = props
    return (
      <span role="link" aria-disabled="true" className={classes} {...rest}>
        {content}
      </span>
    )
  }
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {content}
      </a>
    )
  }
  return (
    <button type={type} className={classes} {...props}>
      {content}
    </button>
  )
}

/** Square icon-only button (row actions, close buttons). Always pass an aria-label. */
export function IconButton({ icon: Glyph, size = 'md', iconSize, variant = 'ghost', className, ...props }) {
  const box = { sm: 'size-7', md: 'size-8', lg: 'size-10' }[size]
  const look = {
    ghost: 'text-fg-secondary hover:bg-subtle hover:text-fg',
    outline: 'border border-line-strong bg-surface text-fg-secondary hover:border-primary hover:text-fg-brand',
  }[variant]
  return (
    <button
      type="button"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-md transition-colors', box, look, className)}
      {...props}
    >
      <Glyph size={iconSize ?? (size === 'sm' ? 16 : 20)} aria-hidden="true" />
    </button>
  )
}
