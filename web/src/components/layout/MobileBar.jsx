import { createContext, useContext, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowLeft, Bell, Calendar, KeyRound, LogOut } from 'lucide-react'
import { isNavActive, studentTabs } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { cx } from '@/lib/cx'
import { ChangePasswordDialog } from './ChangePasswordDialog'
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
    <header className="z-30 flex h-16 shrink-0 items-center gap-4 bg-surface px-4 lg:hidden">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      {bar?.back && (
        <Link to={bar.back} aria-label="Back" className="-ml-1 rounded-md p-1 text-fg hover:bg-subtle">
          <ArrowLeft size={24} aria-hidden="true" />
        </Link>
      )}
      <p className="min-w-0 flex-1 truncate text-h2 font-semibold text-fg">{bar?.title ?? 'CampusStay'}</p>
      <Link
        to="/student/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative size-6 shrink-0 text-fg-secondary"
      >
        <Bell size={24} aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true" className="absolute top-0 left-4 size-2 rounded-full bg-error" />}
      </Link>
      <Popover
        width={240}
        trigger={({ toggle, props }) => (
          <button type="button" onClick={toggle} aria-label="Account" className="shrink-0 rounded-full" {...props}>
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
            <MenuItem icon={KeyRound} onClick={() => { close(); setChangingPassword(true) }}>
              Change password
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
              Sign out
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
    <nav aria-label="Main" className="flex h-20 shrink-0 border-t border-line bg-surface lg:hidden">
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
            <span className={cx('text-sm whitespace-nowrap', active ? 'font-medium text-fg-brand' : 'text-fg-secondary')}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
