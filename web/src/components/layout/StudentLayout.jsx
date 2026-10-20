import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { Calendar, ChevronDown, Globe, LogOut, User } from 'lucide-react'
import { isNavActive, studentNav } from '@/app/navigation'
import { useSession } from '@/app/session'
import { Avatar } from '@/components/ui/Display'
import { MenuItem, Popover } from '@/components/ui/Popover'
import { cx } from '@/lib/cx'
import { Logo } from './Logo'
import { NotificationsButton } from './Notifications'

/** Content column used by every student page: 1200 px at 1440 (120 px side padding). */
export function StudentContainer({ className, children }) {
  return <div className={cx('mx-auto w-full max-w-[1248px] px-6', className)}>{children}</div>
}

export function LanguageToggle() {
  const [lang, setLang] = useState('EN')
  return (
    <button
      type="button"
      onClick={() => setLang((l) => (l === 'EN' ? 'VI' : 'EN'))}
      aria-label={`Language: ${lang === 'EN' ? 'English' : 'Tiếng Việt'}`}
      className="flex items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-fg-secondary hover:text-fg"
    >
      <Globe size={16} aria-hidden="true" />
      {lang}
    </button>
  )
}

// Figma: 02 Components › Shell/Student Top Bar.
function StudentTopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, term, signOut } = useSession()
  return (
    <header className="z-30 shrink-0 border-b border-line bg-surface">
      <StudentContainer className="flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-10">
          <Link to="/student" aria-label="CampusStay home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
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
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {term && (
            <span className="flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-sm font-medium whitespace-nowrap text-fg-secondary">
              <Calendar size={16} aria-hidden="true" />
              {term.name}
            </span>
          )}
          <LanguageToggle />
          <NotificationsButton />
          <span aria-hidden="true" className="h-6 w-px bg-line" />
          <Popover
            width={220}
            trigger={({ toggle, props }) => (
              <button type="button" onClick={toggle} className="flex items-center gap-2 rounded-md text-left" {...props}>
                <Avatar name={user?.name} />
                <span className="flex flex-col whitespace-nowrap">
                  <span className="text-base font-medium text-fg">{user?.name ?? 'Not signed in'}</span>
                  {user?.studentCode && <span className="text-sm text-fg-tertiary">{user.studentCode}</span>}
                </span>
                <ChevronDown size={16} aria-hidden="true" className="text-fg-secondary" />
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
                <MenuItem icon={User} onClick={() => { close(); navigate('/student/room') }}>
                  My Room
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
        </div>
      </StudentContainer>
    </header>
  )
}

// One-screen shell: the window never scrolls; each page fills the area under the top bar.
export function StudentLayout() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <StudentTopBar />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
