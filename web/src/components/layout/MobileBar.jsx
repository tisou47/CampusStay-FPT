import { createContext, useContext, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowLeft, Bell, Calendar, KeyRound, LogOut, User } from 'lucide-react'
import { isNavActive, studentTabs } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { cx } from '@/lib/cx'
import { t, tx } from '@/i18n'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { LanguageSwitch } from './LanguageSwitch'
import { useNotifications } from './Notifications'

// Student shell below lg (1024 px, phones and tablets in portrait): Figma 09 Android – Student › App Bar
// (64 dp) and Bottom Nav (80 dp). The desktop top bar and two-column pages need at least 1024 px.
// Each page names itself with useMobileBar; a page with `back` is a detail page and hides the Bottom Nav.

const MobileBarContext = createContext({ bar: null, setBar: () => {} })

export function MobileBarProvider({ children }) {
  const [bar, setBar] = useState(null)
  return <MobileBarContext.Provider value={{ bar, setBar }}>{children}</MobileBarContext.Provider>
}

/** Title and optional back target shown in the App Bar while the calling page is mounted. */
export function useMobileBar(title, back) {
  const { setBar } = useContext(MobileBarContext)
  useEffect(() => {
    setBar({ title, back })
    return () => setBar(null)
  }, [setBar, title, back])
}

export function MobileAppBar() {
  const navigate = useNavigate()
  const { bar } = useContext(MobileBarContext)
  const { user, term, signOut } = useSession()
  const { unread } = useNotifications()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <header data-band className="z-30 flex h-16 shrink-0 items-center gap-4 border-b border-band-line bg-band px-4 lg:hidden">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      {bar?.back && (
        <Link to={bar.back} aria-label={t('Back')} className="-ml-1 rounded-md p-1 text-band-fg hover:bg-band-hover">
          <ArrowLeft size={24} aria-hidden="true" />
        </Link>
      )}
      <p className="min-w-0 flex-1 truncate text-h2 font-bold tracking-tight text-band-fg">{tx(bar?.title) ?? 'CampusStay'}</p>
      <Link
        to="/student/notifications"
        aria-label={unread ? t('Notifications, {n} unread', { n: unread }) : t('Notifications')}
        className="relative size-6 shrink-0 text-band-fg"
      >
        <Bell size={24} aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true" className="absolute top-0 left-4 size-2.5 rounded-full border-[1.5px] border-surface bg-error" />}
      </Link>
      <Popover
        width={240}
        trigger={({ toggle, props }) => (
          <button type="button" onClick={toggle} aria-label={t('Account')} className="shrink-0 rounded-full" {...props}>
            <Avatar name={user?.name} />
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col py-1">
            {user && (
              <div className="border-b border-line px-3 pt-1.5 pb-2.5">
                <p className="text-base font-medium text-fg">{user.name}</p>
                <p className="truncate text-sm text-fg-tertiary">{user.studentCode ?? user.email}</p>
                {term && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-secondary">
                    <Calendar size={14} aria-hidden="true" />
                    {term.name}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
              <span className="text-sm text-fg-secondary">{t('Language')}</span>
              <LanguageSwitch size="sm" />
            </div>
            <MenuItem icon={User} onClick={() => { close(); navigate('/student/profile') }}>
              {t('My profile')}
            </MenuItem>
            <MenuItem icon={KeyRound} onClick={() => { close(); setChangingPassword(true) }}>
              {t('Change password')}
            </MenuItem>
            <MenuItem
              icon={LogOut}
              danger
              onClick={async () => {
                close()
                await signOut()
                navigate('/signin')
              }}
            >
              {t('Sign out')}
            </MenuItem>
          </div>
        )}
      </Popover>
    </header>
  )
}

export function MobileBottomNav() {
  const { pathname } = useLocation()
  const { bar } = useContext(MobileBarContext)
  if (bar?.back) return null
  return (
    <nav aria-label={t('Main')} className="flex h-20 shrink-0 border-t border-line bg-surface lg:hidden">
      {studentTabs.map((tab) => {
        const active = isNavActive(tab, pathname)
        const Glyph = tab.icon
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
          >
            <span className={cx('flex h-8 w-16 items-center justify-center rounded-full', active && 'bg-primary-subtle')}>
              <Glyph size={24} aria-hidden="true" className={active ? 'text-fg-brand' : 'text-fg-secondary'} />
            </span>
            <span className={cx('text-sm whitespace-nowrap', active ? 'font-semibold text-fg-brand' : 'text-fg-secondary')}>{t(tab.label)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
