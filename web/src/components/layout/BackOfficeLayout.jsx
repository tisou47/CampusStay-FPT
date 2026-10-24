import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { Building, Calendar, Check, ChevronDown, KeyRound, LogOut, Search } from 'lucide-react'
import { backOffice, isNavActive } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { Popover } from '@/components/ui/Popover'
import { t, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { NotificationsButton } from './Notifications'

// Back-office shell (Change Specification v2 §11): a 248 px sidebar with the menu grouped by the work it
// belongs to, and a top bar with the Term and Block scope, page search, language and notifications.
function Sidebar({ role }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const config = backOffice[role]
  const { user, signOut } = useSession()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <aside className="flex h-full w-62 shrink-0 flex-col justify-between border-r border-line bg-surface">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      <div className="flex min-h-0 flex-col">
        <div className="px-4 pt-4 pb-2">
          <Link to={`/${role}`} aria-label={t('Home')}>
            <Logo subtitle={t(config.portal)} />
          </Link>
        </div>
        <nav aria-label={t('Main')} className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pt-2 pb-4">
          {config.sections.map((section, si) => (
            <div key={section.title ?? si} className="flex flex-col gap-px">
              {section.title && (
                <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-fg-tertiary uppercase">{t(section.title)}</p>
              )}
              {section.items.map((item) => {
                const active = isNavActive(item, pathname)
                const Glyph = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex h-8 shrink-0 items-center gap-2.5 rounded-md px-3 text-base whitespace-nowrap transition-colors',
                      active ? 'bg-primary-subtle font-medium text-fg-brand' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
                    )}
                  >
                    <Glyph size={18} aria-hidden="true" />
                    <span className="truncate">{t(item.label)}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2.5 border-t border-line p-4">
        <Avatar name={user?.name} />
        <div className="flex min-w-0 flex-1 flex-col whitespace-nowrap">
          <span className="truncate text-base font-medium text-fg">{user?.name ?? t('Not signed in')}</span>
          <span className="truncate text-sm text-fg-tertiary">{tx(user?.title) || t(config.roleTitle)}</span>
        </div>
        <button
          type="button"
          onClick={() => setChangingPassword(true)}
          aria-label={t('Change password')}
          title={t('Change password')}
          className="rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg"
        >
          <KeyRound size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/signin')
          }}
          aria-label={t('Sign out')}
          title={t('Sign out')}
          className="rounded-md p-1 text-fg-secondary hover:bg-subtle hover:text-fg"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}

function SelectorButton({ icon: Glyph, value, options, onChange, label, disabled }) {
  const current = options.find((o) => o.value === value)
  return (
    <Popover
      align="start"
      width={240}
      trigger={({ toggle, props }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          disabled={disabled}
          className="flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-base font-medium whitespace-nowrap text-fg hover:border-primary disabled:pointer-events-none disabled:opacity-60"
          {...props}
        >
          <Glyph size={16} aria-hidden="true" className="text-fg-secondary" />
          {current?.label ?? label}
          <ChevronDown size={16} aria-hidden="true" className="text-fg-secondary" />
        </button>
      )}
    >
      {({ close }) => (
        <ul className="flex max-h-80 flex-col overflow-y-auto py-1" role="listbox" aria-label={label}>
          {options.map((opt) => (
            <li key={opt.value ?? 'all'}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value)
                  close()
                }}
                className={cx('flex w-full items-center justify-between px-3 py-2 text-left text-base hover:bg-subtle', opt.value === value ? 'font-medium text-fg-brand' : 'text-fg')}
              >
                {opt.label}
                {opt.value === value && <Check size={16} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}

function QuickSearch({ role }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const items = useMemo(() => backOffice[role].sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))), [role])
  const q = query.trim().toLowerCase()
  const results = items.filter((i) => t(i.label).toLowerCase().includes(q) || i.label.toLowerCase().includes(q))
  return (
    <Popover
      width={320}
      trigger={({ toggle, props }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-56 items-center gap-2 rounded-md border border-line bg-canvas px-3 text-base text-fg-tertiary hover:border-line-strong"
          {...props}
        >
          <Search size={16} aria-hidden="true" />
          {t('Go to page…')}
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Go to page…')}
              className="h-8 w-full rounded-md px-2 text-base outline-none placeholder:text-fg-tertiary"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.map((item) => {
              const Glyph = item.icon
              return (
                <li key={item.to}>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      navigate(item.to)
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-base text-fg hover:bg-subtle"
                  >
                    <Glyph size={16} aria-hidden="true" className="text-fg-secondary" />
                    <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                    {item.section && <span className="shrink-0 text-sm text-fg-tertiary">{t(item.section)}</span>}
                  </button>
                </li>
              )
            })}
            {results.length === 0 && <li className="px-3 py-2 text-base text-fg-tertiary">{t('No matching page')}</li>}
          </ul>
        </div>
      )}
    </Popover>
  )
}

// Term selector for every role; Block scope for Staff (their Blocks) and Managers (every Block, ADR-19).
function BackOfficeTopBar({ role }) {
  const { terms, term, setTermId, blocks, block, setBlock } = useSession()
  const termOptions = terms.map((x) => ({ value: x.id, label: t('Term: {name}', { name: x.name }) }))
  const blockOptions = [
    ...(blocks.length > 1 ? [{ value: null, label: role === 'manager' ? t('All Blocks') : t('Blocks: {list}', { list: blocks.join(', ') }) }] : []),
    ...blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) })),
  ]
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
      <div className="flex items-center gap-3">
        <SelectorButton icon={Calendar} label={t('Term')} value={term?.id} options={termOptions} onChange={setTermId} disabled={!termOptions.length} />
        {role !== 'admin' && blockOptions.length > 0 && (
          <SelectorButton icon={Building} label={t('Block scope')} value={block} options={blockOptions} onChange={setBlock} />
        )}
      </div>
      <div className="flex items-center gap-3">
        <QuickSearch role={role} />
        <LanguageSwitch />
        <NotificationsButton />
      </div>
    </header>
  )
}

// One-screen shell: the window never scrolls. Pages fill <main> and scroll inside their own lists and panels;
// <main> only scrolls as a fallback when the window is smaller than the layout needs.
export function BackOfficeLayout({ role }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BackOfficeTopBar role={role} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * Page header used by every back-office screen: optional breadcrumb, H1 (+ status tag) and description
 * on the left (2 px apart), actions bottom-aligned on the right.
 */
export function PageHeader({ title, description, actions, badge, breadcrumb, className }) {
  return (
    <div className={cx('flex shrink-0 items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        {breadcrumb}
        <div className="flex items-center gap-3">
          <h1 className="text-h1 font-semibold text-fg">{tx(title)}</h1>
          {badge}
        </div>
        {description && <p className="text-base text-fg-secondary">{tx(description)}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
