import { cx } from '@/lib/cx'
import { tx } from '@/i18n'

// Building blocks of My profile (Profile.jsx and profileContacts.jsx).

/** Rounded panel with a title row (and optional description and actions) over a divider. */
export function Panel({ icon: Glyph, title, description, actions, children, className, bodyClassName }) {
  return (
    <section className={cx('flex flex-col rounded-2xl border border-line bg-surface shadow-card', className)}>
      <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
            {Glyph && <Glyph size={18} aria-hidden="true" className="text-fg-brand" />}
            {tx(title)}
          </h2>
          {description && <p className="text-sm text-fg-tertiary">{tx(description)}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cx('p-6', bodyClassName)}>{children}</div>
    </section>
  )
}

/** One fact as a soft tile: icon, label, value. Empty values are left out by the callers. */
export function InfoTile({ icon: Glyph, label, children, wide }) {
  return (
    <div className={cx('flex min-w-0 items-start gap-3 rounded-xl bg-subtle/70 px-4 py-3', wide && 'sm:col-span-2')}>
      <Glyph size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-tertiary" />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-fg-tertiary">{tx(label)}</span>
        <span className="text-base font-medium break-words text-fg">{children}</span>
      </div>
    </div>
  )
}

/** Tiles in two columns; rows whose value is empty are dropped so no "—" fills the page. */
export function InfoGrid({ items }) {
  const shown = items.filter((i) => i && i.value != null && i.value !== '' && !(Array.isArray(i.value) && !i.value.length))
  if (!shown.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {shown.map((i) => (
        <InfoTile key={i.label} icon={i.icon} label={i.label} wide={i.wide}>
          {i.value}
        </InfoTile>
      ))}
    </div>
  )
}

export function Chips({ items }) {
  return (
    <span className="flex flex-wrap gap-1.5 pt-0.5">
      {items.map((x) => (
        <span key={x} className="rounded-full bg-surface px-2.5 text-sm font-medium text-fg-secondary ring-1 ring-line">
          {x}
        </span>
      ))}
    </span>
  )
}

