import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { Calendar, ChevronDown, KeyRound, LogOut, ShieldAlert, User } from 'lucide-react'
import { isNavActive, studentNav } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { AssistantChat } from './AssistantChat'
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
  return (
    <header data-band className="z-30 hidden shrink-0 border-b border-band-line bg-band-gradient lg:block">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      {/* Full-width top bar: flex layout prevents 1fr column inflation so the student name never overflows the right edge. */}
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 lg:px-6">
        <Link to="/student" aria-label={t('Home')} className="shrink-0">
          <Logo tone="band" />
        </Link>
        <nav aria-label={t('Main')} className="flex min-w-0 flex-1 items-center justify-center gap-0.5 xl:gap-1">
          {studentNav.map((item) => {
            const active = isNavActive(item, pathname)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-9 items-center rounded-md px-2.5 text-sm font-semibold whitespace-nowrap transition-colors xl:px-3 xl:text-base',
                  active ? 'bg-surface text-fg-brand shadow-card' : 'text-band-fg hover:bg-band-hover',
                )}
              >
                {t(item.label)}
              </Link>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2.5 xl:gap-3.5">
          {term && (
            <span className="hidden items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium whitespace-nowrap text-fg shadow-card xl:flex xl:px-3 xl:text-sm">
              <Calendar size={15} aria-hidden="true" />
              {term.name}
            </span>
          )}
          <LanguageSwitch size="sm" />
          <NotificationsButton onBand />
          <span aria-hidden="true" className="h-6 w-px bg-band-line" />
          <Popover
            width={220}
            trigger={({ toggle, props }) => (
              <button
                type="button"
                onClick={toggle}
                className="flex shrink-0 items-center gap-2 rounded-md py-1 pr-1 text-left transition-colors hover:bg-band-hover"
                {...props}
              >
                <Avatar name={user?.name} />
                <span className="hidden min-w-0 flex-col xl:flex">
                  <span className="max-w-36 truncate text-sm leading-tight font-semibold text-band-fg 2xl:max-w-44">
                    {user?.name ?? t('Not signed in')}
                  </span>
                  {user?.studentCode && (
                    <span className="truncate text-xs leading-tight text-band-fg/90">{user.studentCode}</span>
                  )}
                </span>
                <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-band-fg" />
              </button>
            )}
          >
            {({ close }) => (
              <div className="flex flex-col py-1">
                {user && (
                  <div className="border-b border-line px-3 pt-1.5 pb-2.5">
                    <p className="text-base font-medium text-fg">{user.name}</p>
                    <p className="text-sm text-fg-tertiary">{user.email}</p>
                  </div>
                )}
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
        </div>
      </div>
    </header>
  )
}

/** While a Manager has not verified the account the student can look around but not apply (ADR-26). */
function VerificationBanner() {
  const { user } = useSession()
  const { pathname } = useLocation()
  if (user?.verification !== 'Pending verification' || pathname === '/student/verification') return null
  return (
    <div className="shrink-0 border-b border-orange-200 bg-warning-bg">
      <StudentContainer className="flex items-center gap-2 py-2 text-sm text-warning-fg">
        <ShieldAlert size={16} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1">{t('Your account is waiting for a manager to verify it. You can look around; you can apply once it is verified.')}</span>
        <Link to="/student/verification" className="shrink-0 font-semibold underline">
          {t('See my details')}
        </Link>
      </StudentContainer>
    </div>
  )
}

// One-screen shell: the window never scrolls; each page fills the area under the top bar.
// On a phone the App Bar and Bottom Nav stay in place and the page scrolls between them.
export function StudentLayout() {
  return (
    <MobileBarProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
        <StudentTopBar />
        <MobileAppBar />
        <VerificationBanner />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
        <MobileBottomNav />
        <AssistantChat />
      </div>
    </MobileBarProvider>
  )
}
