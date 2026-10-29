import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { Building, Calendar, Check, ChevronDown, KeyRound, LogOut, Search } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { backOffice, isNavActive } from '@/app/navigation'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Avatar } from '@/components/ui/Display'
import { Popover } from '@/components/ui/Popover'
import { t, tr, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { FlowTrail } from './FlowTrail'
import { SectionTabs } from './SectionTabs'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { NotificationsButton } from './Notifications'

// Back-office shell (Change Specification v2 §11): the FPT-orange band across the top carries the logo, the Term
// and Block scope, search (pages and records), language and notifications; below it a 248 px menu grouped by the
// work it belongs to.
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
        <nav aria-label={t('Main')} className="flex min-h-0 flex-col gap-4 overflow-y-auto px-3 pt-4 pb-4">
          {config.sections.map((section, si) => (
            <div key={section.title ?? si} className="flex flex-col gap-px">
              {section.title && (
                <p className="px-3 pb-1 text-sm font-semibold text-fg-tertiary">{t(section.title)}</p>
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
                      'flex min-h-8 shrink-0 items-center gap-2.5 rounded-md px-3 py-1 text-base leading-snug transition-colors',
                      active ? 'bg-primary-subtle font-semibold text-fg-brand' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
                    )}
                  >
                    <Glyph size={18} aria-hidden="true" className={cx('shrink-0', active ? 'text-primary' : 'text-fg-tertiary')} />
                    <span className="min-w-0">{t(item.label)}</span>
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

/** Where a Term stands today, next to its name in the picker (GET /terms: current, registrationOpen, stay dates). */
function termWhen(term) {
  const now = new Date()
  if (term.current) return 'Current'
  if (term.registrationOpen) return 'Registration open'
  if (term.stayStart && new Date(term.stayStart) > now) return 'Next'
  if (term.stayEnd && new Date(term.stayEnd) < now) return 'Ended'
  return null
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
          className="flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-base font-medium whitespace-nowrap text-fg shadow-card hover:bg-primary-subtle disabled:pointer-events-none disabled:opacity-60"
          {...props}
        >
          <Glyph size={16} aria-hidden="true" className="text-fg-secondary" />
          {current?.label ?? label}
          {current?.note && <span className="text-sm font-normal text-fg-secondary">· {t(current.note)}</span>}
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
                <span className="flex items-center gap-2">
                  {opt.label}
                  {opt.note && <span className="text-sm text-fg-tertiary">{t(opt.note)}</span>}
                </span>
                {opt.value === value && <Check size={16} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}

// Where a search hit opens, per role (null: the role has no screen for it).
function hitLink(role, hit) {
  const base = `/${role}`
  const desk = role === 'staff' || role === 'manager'
  switch (hit.kind) {
    case 'student':
      return `${base}/students/${hit.id}`
    case 'room':
      return desk ? `${base}/rooms/${hit.id}` : '/admin/buildings'
    case 'invoice':
      return desk ? `${base}/payments?q=${encodeURIComponent(hit.id)}` : null
    case 'application':
      return role === 'manager' ? `${base}/applications/${hit.id}` : null
    case 'maintenance':
      return desk ? `${base}/maintenance/${hit.id}` : null
    case 'room-change':
      return desk ? `${base}/room-changes?id=${encodeURIComponent(hit.id)}` : null
    case 'swap':
      return desk ? `${base}/room-changes/swaps` : null
    case 'room-class-change':
      return desk ? `${base}/next-term/room-classes` : null
    case 'stay-request':
      return desk ? `${base}/next-term/extensions` : null
    default:
      return null
  }
}

const HIT_KINDS = {
  student: 'Student',
  room: 'Room',
  invoice: 'Invoice',
  application: 'Application',
  maintenance: 'Maintenance',
  'room-change': 'Room change',
  swap: 'Swap',
  'room-class-change': 'Room Class change',
  'stay-request': 'Stay request',
}

// Pages of the menu, and from two characters the records of the user's Blocks: student code or name, Room,
// Invoice, Application and request codes (GET /search, spec §11.3).
function QuickSearch({ role }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const navigate = useNavigate()
  // Screens joined under one entry (tabs) stay findable by their own names.
  const items = useMemo(
    () => backOffice[role].sections.flatMap((s) => s.items.flatMap((i) => (i.tabs ? i.tabs.map((tab) => ({ ...tab, icon: i.icon, section: s.title })) : [{ ...i, section: s.title }]))),
    [role],
  )
  const q = query.trim().toLowerCase()
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      document.getElementById('quick-search')?.click()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])
  const records = useQuery(['search', debounced], ({ signal }) => api.search(debounced, { signal }), { enabled: debounced.length >= 2 })
  const pages = items.filter((i) => t(i.label).toLowerCase().includes(q) || i.label.toLowerCase().includes(q)).slice(0, q ? 5 : items.length)
  const hits = debounced.length >= 2 ? (records.data?.items ?? []).map((h) => ({ ...h, to: hitLink(role, h) })).filter((h) => h.to) : []
  const go = (to, close) => {
    close()
    setQuery('')
    navigate(to)
  }
  return (
    <Popover
      width={380}
      trigger={({ toggle, props }) => (
        <button
          id="quick-search"
          type="button"
          onClick={toggle}
          aria-keyshortcuts="/"
          title={t('Search pages, students, Rooms, codes…')}
          className="flex h-8 w-72 items-center gap-2 rounded-md bg-surface px-3 text-base whitespace-nowrap text-fg-tertiary shadow-card hover:text-fg-secondary"
          {...props}
        >
          <Search size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t('Search…')}</span>
          <kbd aria-hidden="true" className="shrink-0 rounded border border-line px-1.5 font-sans text-sm text-fg-tertiary">/</kbd>
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
              placeholder={t('Student code or name, Room, MR-…, INV-…')}
              aria-label={t('Search')}
              className="h-8 w-full rounded-md px-2 text-base outline-none placeholder:text-fg-tertiary"
            />
          </div>
          <ul className="max-h-96 overflow-y-auto py-1">
            {hits.map((h) => (
              <li key={`${h.kind}:${h.id}`}>
                <button type="button" onClick={() => go(h.to, close)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-subtle">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base text-fg">{h.title}</span>
                    {h.detail && <span className="truncate text-sm text-fg-tertiary">{tr(h.detail)}</span>}
                  </span>
                  <span className="shrink-0 text-sm text-fg-tertiary">{t(HIT_KINDS[h.kind] ?? h.kind)}</span>
                </button>
              </li>
            ))}
            {debounced.length >= 2 && records.loading && !records.data && <li className="px-3 py-2 text-base text-fg-tertiary">{t('Searching…')}</li>}
            {hits.length > 0 && pages.length > 0 && <li aria-hidden="true" className="my-1 border-t border-line" />}
            {pages.map((item) => {
              const Glyph = item.icon
              return (
                <li key={item.to}>
                  <button type="button" onClick={() => go(item.to, close)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-base text-fg hover:bg-subtle">
                    <Glyph size={16} aria-hidden="true" className="text-fg-secondary" />
                    <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                    {item.section && <span className="shrink-0 text-sm text-fg-tertiary">{t(item.section)}</span>}
                  </button>
                </li>
              )
            })}
            {hits.length === 0 && pages.length === 0 && !records.loading && <li className="px-3 py-2 text-base text-fg-tertiary">{t('Nothing found')}</li>}
          </ul>
        </div>
      )}
    </Popover>
  )
}

/**
 * The person's shift (A-60): routing gives new requests to people on duty first, so Staff say when they start and
 * end work. Signing in is not the same as being on duty: an off-duty person may still look things up.
 */
function DutyToggle() {
  const { notify, notifyError } = useToast()
  const me = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }))
  const onDuty = me.data?.onDuty
  const change = useMutation((next) => api.blockStaff.setDuty({ onDuty: next }), {
    invalidates: ['me-duty', 'block-staff', 'routing'],
    onSuccess: (r) =>
      notify({
        type: 'info',
        title: r.onDuty ? 'Shift started' : 'Shift ended',
        message: r.onDuty ? 'New requests of your types can be routed to you.' : 'New requests go to colleagues on duty; your open requests stay yours.',
      }),
    onError: (e) => notifyError(e, 'Could not change your shift'),
  })
  if (!me.data) return null
  return (
    <button
      type="button"
      onClick={() => change.run(!onDuty)}
      disabled={change.pending}
      title={onDuty ? t('On duty: new requests can be routed to you. Click to end your shift.') : t('Off duty: new requests are not routed to you. Click to start your shift.')}
      className={cx(
        'flex h-8 items-center gap-2 rounded-full border px-3 text-base font-medium whitespace-nowrap transition-colors disabled:opacity-60',
        onDuty ? 'border-transparent bg-success-bg text-success-fg shadow-card hover:bg-green-100' : 'border-transparent bg-surface text-fg-secondary shadow-card hover:text-fg',
      )}
    >
      <span aria-hidden="true" className={cx('size-2 rounded-full', onDuty ? 'bg-success' : 'bg-gray-400')} />
      {onDuty ? t('On duty') : t('Off duty')}
      <span className="text-sm font-normal opacity-80">· {onDuty ? t('End shift') : t('Start shift')}</span>
    </button>
  )
}

// Term selector for every role. Block scope: Managers choose among every Block (ADR-19); Staff with several Blocks
// choose among theirs; Staff with one Block see it as a fixed label, since a Manager sets their Blocks.
function BackOfficeTopBar({ role }) {
  const { terms, term, setTermId, blocks, block, setBlock } = useSession()
  const termOptions = terms.map((x) => ({ value: x.id, label: t('Term: {name}', { name: x.name }), note: termWhen(x) }))
  const blockOptions = [
    ...(blocks.length > 1 ? [{ value: null, label: role === 'manager' ? t('All Blocks') : t('Blocks: {list}', { list: blocks.join(', ') }) }] : []),
    ...blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) })),
  ]
  const fixedBlock = role === 'staff' && blocks.length === 1
  return (
    <header data-band className="z-30 flex h-14 shrink-0 items-center gap-4 border-b border-band-line bg-band pr-6">
      <Link to={`/${role}`} aria-label={t('Home')} className="flex h-full w-62 shrink-0 items-center px-4">
        <Logo tone="band" subtitle={t(backOffice[role].portal)} />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-6">
        <SelectorButton icon={Calendar} label={t('Term')} value={term?.id} options={termOptions} onChange={setTermId} disabled={!termOptions.length} />
        {fixedBlock ? (
          <span
            title={t('Your Block. A Manager sets the Blocks of your account.')}
            className="flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-base font-medium whitespace-nowrap text-fg shadow-card"
          >
            <Building size={16} aria-hidden="true" className="text-fg-secondary" />
            {t('Block {code}', { code: blocks[0] })}
          </span>
        ) : (
          role !== 'admin' &&
          blockOptions.length > 0 && <SelectorButton icon={Building} label={t('Block scope')} value={block} options={blockOptions} onChange={setBlock} />
        )}
        {role !== 'admin' && <DutyToggle />}
      </div>
      <div className="flex items-center gap-3">
        <QuickSearch role={role} />
        <LanguageSwitch />
        <NotificationsButton onBand />
      </div>
    </header>
  )
}

// One-screen shell: the window never scrolls. Pages fill <main> and scroll inside their own lists and panels;
// <main> only scrolls as a fallback when the window is smaller than the layout needs.
export function BackOfficeLayout({ role }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <BackOfficeTopBar role={role} />
      <div className="flex min-h-0 flex-1">
        <Sidebar role={role} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <FlowTrail role={role} />
          <SectionTabs role={role} />
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
          <h1 className="text-h1 font-bold tracking-tight text-fg">{tx(title)}</h1>
          {badge}
        </div>
        {description && <p className="text-base text-fg-secondary">{tx(description)}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
