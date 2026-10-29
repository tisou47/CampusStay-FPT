import { useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { Calendar, ChevronDown, KeyRound, LogOut, ShieldAlert, User, UserRound } from 'lucide-react'
import { isNavActive, studentNav } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { MobileAppBar, MobileBarProvider, MobileBottomNav } from './MobileBar'
import { NotificationsButton } from './Notifications'

/**
 * Content column used by every student page: 1200 px at 1440 (120 px side padding). Below 1024 px
 * (phone shell) 16 px sides, and on a portrait tablet the single column stays at most 680 px wide.
 */
export function StudentContainer({ className, children }) {
  return <div className={cx('mx-auto w-full max-w-170 px-4 lg:max-w-[1248px] lg:px-6', className)}>{children}</div>
}

// Figma: 02 Components › Shell/Student Top Bar.
function StudentTopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, term, signOut } = useSession()
  const [changingPassword, setChangingPassword] = useState(false)
  const avatarRef = useRef(null)
  return (
    <header className="z-30 hidden shrink-0 border-b border-line bg-surface lg:block">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      <StudentContainer className="flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-10">
          <Link to="/student" aria-label={t('Home')}>
            <Logo />
          </Link>
          <nav aria-label={t('Main')} className="flex items-center gap-1">
            {studentNav.map((item) => {
              const active = isNavActive(item, pathname)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-16 items-center border-b-2 px-3 pt-0.5 text-base font-medium whitespace-nowrap transition-colors',
                    active ? 'border-primary text-fg-brand' : 'border-transparent text-fg-secondary hover:text-fg',
                  )}
                >
                  {t(item.label)}
                </Link>
              )
            })}
          </nav>
        </div>
        {/* Term chip, language and the name next to the avatar need 1280 px; the avatar menu still names the user. */}
        <div className="flex items-center gap-4">
          {term && (
            <span className="hidden items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-sm font-medium whitespace-nowrap text-fg-secondary xl:flex">
              <Calendar size={16} aria-hidden="true" />
              {term.name}
            </span>
          )}
          {/* Each VI/EN button at least 32 × 32 px (the shared switch is sized from here). */}
          <span className="flex [&_button]:min-h-8 [&_button]:min-w-8">
            <LanguageSwitch size="sm" />
          </span>
          <NotificationsButton />
          <span aria-hidden="true" className="h-6 w-px bg-line" />
          <Popover
            width={240}
            trigger={({ toggle, props }) => (
              <button ref={avatarRef} type="button" onClick={toggle} className="flex items-center gap-2 rounded-md text-left" {...props}>
                <Avatar name={user?.name} />
                <span className="hidden flex-col whitespace-nowrap xl:flex">
                  <span className="text-base font-medium text-fg">{user?.name ?? t('Not signed in')}</span>
                  {user?.studentCode && <span className="text-sm text-fg-tertiary">{user.studentCode}</span>}
                </span>
                <ChevronDown size={16} aria-hidden="true" className="text-fg-secondary" />
              </button>
            )}
          >
            {({ close }) => (
              // Esc closes the menu (Popover) and focus goes back to the avatar button.
              <div role="menu" tabIndex={-1} className="flex flex-col py-1" onKeyDown={(e) => e.key === 'Escape' && avatarRef.current?.focus()}>
                {user && (
                  <div className="border-b border-line px-3 pt-1.5 pb-2.5">
                    <p className="text-base font-medium text-fg">{user.name}</p>
                    <p className="text-sm text-fg-tertiary">{user.email}</p>
                  </div>
                )}
                <MenuItem icon={UserRound} onClick={() => { close(); navigate('/student/profile') }}>
                  {t('My profile')}
                </MenuItem>
                <MenuItem icon={User} onClick={() => { close(); navigate('/student/room') }}>
                  {t('My Room')}
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
        </div>
      </StudentContainer>
    </header>
  )
}

/** While a Manager has not verified the account the student can look around but not apply (ADR-26). */
function VerificationBanner() {
  const { user } = useSession()
  const { pathname } = useLocation()
  if (user?.verification !== 'Pending verification' || pathname === '/student/verification') return null
  return (
    <div className="shrink-0 border-b border-warning/30 bg-warning-bg">
      <StudentContainer className="flex items-center gap-2 py-2 text-sm text-warning-fg">
        <ShieldAlert size={16} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1">{t('Your account is waiting for a Manager to verify it. You can look around; you can apply once it is verified.')}</span>
        <Link to="/student/verification" className="shrink-0 font-semibold underline">
          {t('See my details')}
        </Link>
      </StudentContainer>
    </div>
  )
}

// One-screen shell: the window never scrolls; each page fills the area under the top bar.
// On a phone the App Bar and Bottom Nav stay in place and the page scrolls between them.
// .student-ui switches the student tokens on (index.css); <main> keeps its scrollbar gutter so the
// content does not shift between short and long pages.
export function StudentLayout() {
  return (
    <MobileBarProvider>
      <div className="student-ui flex h-dvh flex-col overflow-hidden bg-canvas">
        <StudentTopBar />
        <MobileAppBar />
        <VerificationBanner />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </MobileBarProvider>
  )
}
