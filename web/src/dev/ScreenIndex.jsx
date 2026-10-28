import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { LayoutGrid, Search, X } from 'lucide-react'
import { roles, screens } from '@/app/screens'
import { cx } from '@/lib/cx'

/*
 * Development tool (not shipped in production builds): jump to any screen. Toggle with Alt+D.
 */
export function ScreenIndex() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'd') setOpen((o) => !o)
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // A path with a parameter (/staff/rooms/:code) is a detail page: it opens from its list, not from here.
    return screens.filter((s) => !s.path.includes('/:') && (!q || `${s.code} ${s.title} ${s.path}`.toLowerCase().includes(q)))
  }, [query])

  if (!open) return null
  return (
    <div className="fixed right-5 bottom-5 z-55 flex max-h-[min(720px,calc(100dvh-40px))] w-100 animate-pop-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-modal">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <LayoutGrid size={18} aria-hidden="true" className="mt-0.5 text-fg-secondary" />
          <div>
            <p className="text-h3 font-semibold text-fg">Screens</p>
            <p className="text-sm text-fg-tertiary">Development only · Alt+D</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close screen index" className="rounded-md p-1 text-fg-tertiary hover:bg-subtle hover:text-fg">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-tertiary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SCR code or title"
            className="h-8 w-full rounded-md border border-line-strong pr-3 pl-9 text-base outline-none placeholder:text-fg-tertiary focus:border-focus focus:shadow-focus"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {Object.entries(roles).map(([role, info]) => {
          const list = filtered.filter((s) => s.role === role)
          if (!list.length) return null
          return (
            <section key={role} className="px-3">
              <p className="px-1 pt-2 pb-1 text-sm font-medium text-fg-tertiary uppercase">{info.label}</p>
              <ul className="flex flex-col">
                {list.map((s) => (
                  <li key={s.path}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(s.path)
                        setOpen(false)
                      }}
                      className={cx('flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-base hover:bg-subtle', pathname === s.path && 'bg-primary-subtle')}
                    >
                      <span className="w-23 shrink-0 text-sm font-medium text-fg-tertiary tabular">{s.code}</span>
                      <span className="text-fg">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
