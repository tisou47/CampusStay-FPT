import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { Building, Calendar, Check, ChevronDown, KeyRound, LogOut, Search } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { backOffice, isNavActive } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { Popover } from '@/components/ui/Popover'
import { InfoTip, Tooltip, isTruncated } from '@/components/ui/Tooltip'
import { t, tr, tx } from '@/i18n'
import { cx } from '@/lib/cx'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { SectionTabs } from './SectionTabs'
import { ShiftConfirmHost } from './ShiftConfirm'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { NotificationsButton } from './Notifications'
import { campusToday } from '@/lib/format'

// Back-office shell (Change Specification v2 §11): the FPT-orange band across the top carries the logo, the Term
// and Block scope, search (pages and records), language and notifications; below it a 248 px menu grouped by the
// work it belongs to.
/**
 * The signed-in person at the foot of the sidebar. A long name or job title is cut with "…"; the tooltip then shows
 * both in full, otherwise it says the link opens My profile.
 */
function ProfileLink({ to, current, name, title, avatar }) {
  const nameRef = useRef(null)
  const titleRef = useRef(null)
  const label = useCallback(
    () =>
      isTruncated(nameRef.current) || isTruncated(titleRef.current) ? (
        <span className="flex flex-col">
          <span className="font-semibold">{name}</span>
          <span className="font-normal text-white/80">{title}</span>
        </span>
      ) : (
        t('My profile')
      ),
    [name, title],
  )
  return (
    <Tooltip label={label} delay={300} align="start" block className="mr-1 min-w-0 flex-1">
      {({ describedBy }) => (
        <Link
          to={to}
          aria-current={current ? 'page' : undefined}
          aria-describedby={describedBy}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-primary-subtle"
        >
          {avatar}
          <div className="flex min-w-0 flex-1 flex-col whitespace-nowrap">
            <span ref={nameRef} className="truncate text-base font-medium text-fg">{name}</span>
            <span ref={titleRef} className="truncate text-sm text-fg-tertiary">{title}</span>
          </div>
        </Link>
      )}
    </Tooltip>
  )
}

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
        <nav aria-label={t('Main')} className="scrollbar-none flex min-h-0 flex-col gap-4 overflow-y-auto px-3 pt-4 pb-4">
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
      <div className="flex items-center gap-0.5 border-t border-line px-2.5 py-3">
        <ProfileLink to={`/${role}/profile`} current={pathname === `/${role}/profile`} name={user?.name ?? t('Not signed in')} title={tx(user?.title) || t(config.roleTitle)} avatar={<Avatar name={user?.name} />} />
        {/* Staff and Managers see their shift here; Admins have no shift and keep the password shortcut
            (everyone can also change it on My profile). */}
        {role === 'admin' ? (
          <Tooltip label={t('Change password')} align="end">
            <button
              type="button"
              onClick={() => setChangingPassword(true)}
              aria-label={t('Change password')}
              className="flex size-7 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-subtle hover:text-fg"
            >
              <KeyRound size={16} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <DutyIndicator role={role} />
        )}
        <Tooltip label={t('Sign out')} align="end">
          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/signin')
            }}
            aria-label={t('Sign out')}
            className="flex size-7 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-error-bg hover:text-error-fg"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}

/** Where a Term stands today, next to its name in the picker (GET /terms: current, registrationOpen, stay dates). */
function termWhen(term) {
  const today = campusToday()
  if (term.current) return 'Current'
  if (term.registrationOpen) return 'Registration open'
  if (term.stayStart && term.stayStart > today) return 'Next'
  if (term.stayEnd && term.stayEnd < today) return 'Ended'
  return null
}

function SelectorButton({ icon: Glyph, value, options, onChange, label, disabled }) {
  const current = options.find((o) => o.value === value)
  return (
    <Popover
      align="start"
      width="max-content"
      minWidth={240}
      trigger={({ open, toggle, props }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          disabled={disabled}
          className={cx(
            'flex h-9 items-center gap-2 rounded-xl border border-white/70 bg-surface/95 px-3.5 py-1.5 text-base font-medium whitespace-nowrap text-fg shadow-card transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-60',
            open && 'bg-surface ring-2 ring-white/60',
          )}
          {...props}
        >
          <Glyph size={16} aria-hidden="true" className="text-fg-brand" />
          {current?.label ?? label}
          {current?.note ? ` · ${t(current.note)}` : ''}
          <ChevronDown size={16} aria-hidden="true" className={cx('text-fg-tertiary transition-transform', open && 'rotate-180')} />
        </button>
      )}
    >
      {({ close }) => (
        <ul className="scrollbar-none flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1.5" role="listbox" aria-label={label}>
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <li key={opt.value ?? 'all'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt.value)
                    close()
                  }}
                  className={cx(
                    'flex w-full items-center gap-6 rounded-lg px-3 py-2 text-left text-base whitespace-nowrap transition-colors',
                    selected ? 'bg-primary-subtle font-medium text-fg-brand' : 'text-fg hover:bg-subtle',
                  )}
                >
                  <span className="flex flex-1 items-center gap-2">
                    {opt.label}
                    {opt.note && (
                      <span className={cx('rounded-full px-2 text-sm font-normal', selected ? 'bg-surface text-fg-brand' : 'bg-subtle text-fg-tertiary')}>{t(opt.note)}</span>
                    )}
                  </span>
                  <Check size={16} aria-hidden="true" className={selected ? 'opacity-100' : 'opacity-0'} />
                </button>
              </li>
            )
          })}
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
          title={t('Search pages, students, rooms, codes…')}
          className="flex h-9 w-72 items-center gap-2 rounded-xl border border-white/70 bg-surface/95 px-3.5 text-base whitespace-nowrap text-fg-tertiary shadow-card transition-colors hover:bg-surface hover:text-fg-secondary"
          {...props}
        >
          <Search size={16} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t('Search…')}</span>
          <kbd aria-hidden="true" className="shrink-0 rounded-md border border-line bg-subtle px-1.5 font-sans text-sm text-fg-tertiary">/</kbd>
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
              placeholder={t('Student code or name, room, MR-…, INV-…')}
              aria-label={t('Search')}
              className="h-8 w-full rounded-md px-2 text-base outline-none placeholder:text-fg-tertiary"
            />
          </div>
          <ul className="scrollbar-none max-h-96 overflow-y-auto py-1">
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
 * The person's duty (A-60): it follows their sign-in. Signing in puts Staff and Managers on duty, signing out (or not
 * using the app for a while) takes them off; routing gives new requests to people on duty first. Read only.
 */
function DutyIndicator({ role }) {
  const me = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }))
  const onDuty = me.data?.onDuty
  if (!me.data) return null
  return (
    <Tooltip
      align="end"
      label={
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('size-1.5 rounded-full', onDuty ? 'bg-green-500' : 'bg-red-500')} />
            {onDuty ? t('On duty while you are signed in') : t('Off duty')}
          </span>
          {role === 'staff' && (
            <span className="font-normal text-white/70">
              {me.data.inShift
                ? t('Inside your shift today ({spans})', { spans: me.data.shiftToday })
                : me.data.shiftToday
                  ? t('Outside your shift (today {spans}): changes ask you to confirm', { spans: me.data.shiftToday })
                  : t('No shift now: changes ask you to confirm')}
            </span>
          )}
          <span className="font-normal text-white/70">{t('Signing out ends your shift.')}</span>
        </span>
      }
    >
      <span
        role="status"
        tabIndex={0}
        aria-label={onDuty ? t('On duty: new requests can be routed to you. Signing out ends your shift.') : t('Off duty')}
        className="flex size-7 items-center justify-center rounded-lg"
      >
        <span aria-hidden="true" className="relative flex size-2.5">
          {onDuty && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cx('relative inline-flex size-2.5 rounded-full ring-2', onDuty ? 'bg-success ring-success-bg' : 'bg-error ring-error-bg')} />
        </span>
      </span>
    </Tooltip>
  )
}

// Term selector for every role. Block scope: Managers choose among every Block (ADR-19); Staff with several Blocks
// choose among theirs; Staff with one Block see it as a fixed label, since a Manager sets their Blocks.
function BackOfficeTopBar({ role }) {
  const { terms, term, setTermId, blocks, block, setBlock } = useSession()
  const termOptions = terms.map((x) => ({ value: x.id, label: t('Term: {name}', { name: x.name }), note: termWhen(x) }))
  const blockOptions = [
    ...(blocks.length > 1 ? [{ value: null, label: role === 'manager' ? t('All blocks') : t('Blocks: {list}', { list: blocks.join(', ') }) }] : []),
    ...blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) })),
  ]
  const fixedBlock = role === 'staff' && blocks.length === 1
  return (
    <header data-band className="z-30 flex h-16 shrink-0 items-center gap-4 border-b border-band-line bg-band-gradient pr-6">
      <Link to={`/${role}`} aria-label={t('Home')} className="flex h-full w-62 shrink-0 items-center px-4">
        <Logo tone="band" subtitle={t(backOffice[role].portal)} />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-6">
        <SelectorButton icon={Calendar} label={t('Term')} value={term?.id} options={termOptions} onChange={setTermId} disabled={!termOptions.length} />
        {fixedBlock ? (
          <span
            title={t('Your block. A manager sets the blocks of your account.')}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/70 bg-surface/95 px-3.5 text-base font-medium whitespace-nowrap text-fg shadow-card"
          >
            <Building size={16} aria-hidden="true" className="text-fg-brand" />
            {t('Block {code}', { code: blocks[0] })}
          </span>
        ) : (
          role !== 'admin' &&
          blockOptions.length > 0 && <SelectorButton icon={Building} label={t('Block scope')} value={block} options={blockOptions} onChange={setBlock} />
        )}
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
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
      <BackOfficeTopBar role={role} />
      <div className="flex min-h-0 flex-1">
        <Sidebar role={role} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <SectionTabs role={role} />
          <Outlet />
          <ShiftConfirmHost />
        </main>
      </div>
    </div>
  )
}

/**
 * Page header used by every back-office screen: optional breadcrumb, H1 (+ status tag) and description
 * on the left (2 px apart), actions bottom-aligned on the right.
 */
/** tip: a "?" after the title explaining what the screen is for and when to use it. */
/** compact: one row, a 22 px title and the actions centred beside it (screens where the table needs the height). */
export function PageHeader({ title, tip, description, actions, badge, breadcrumb, compact = false, className }) {
  return (
    <div className={cx('flex shrink-0 flex-wrap justify-between gap-4 gap-y-2', compact ? 'items-center' : 'items-end', className)}>
      <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
        {breadcrumb}
        <div className={cx('flex items-center', compact ? 'gap-2' : 'gap-3')}>
          <h1 className={cx('font-bold tracking-tight text-fg', compact ? 'text-[22px] leading-8 whitespace-nowrap' : 'text-h1')}>{tx(title)}</h1>
          {tip && <InfoTip label={tip} size={16} side="bottom" align="start" />}
          {badge}
        </div>
        {description && <p className="max-w-[520px] text-base text-fg-secondary [text-wrap:pretty]">{tx(description)}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  )
}
