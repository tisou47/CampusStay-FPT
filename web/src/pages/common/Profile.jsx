import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BadgeCheck, KeyRound, LogOut, Pencil } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { backOffice } from '@/app/navigation'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { ChangePasswordDialog } from '@/components/layout/ChangePasswordDialog'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { Button } from '@/components/ui/Button'
import { Avatar, Card, CardHeader, DetailRows } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { formatDate } from '@/lib/format'
import { RefundAccountCard } from '@/pages/student/refundAccount'
import { StudentPage } from '@/pages/student/shared'
import { t, tx } from '@/i18n'

// My profile (review item R-20), for every role: opened from the avatar menu (student, top right and the phone App
// Bar) and from the account block at the foot of the back-office menu. Reads the session user (GET /auth/me);
// students also see their directory details (GET /students/me/verification) and the refund account (A-62).

const statusTone = { Verified: 'success', 'Pending verification': 'warning', 'Profile needed': 'info' }

function AccountCard({ user, role }) {
  const roleLabel = role === 'student' ? 'Student' : backOffice[role]?.roleTitle
  // Under the name: the student code, or the email for back-office accounts (then not repeated below).
  const rows = [
    ...(user.studentCode ? [['Email', user.email]] : []),
    ['Role', t(roleLabel)],
    ...(user.title ? [['Job title', tx(user.title)]] : []),
    ...(role === 'staff' || role === 'manager' ? [['Blocks', user.blocks?.length ? user.blocks.join(', ') : '—']] : []),
  ]
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} size={56} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-h2 font-semibold text-fg">{user.name}</h2>
          <p className="truncate text-base text-fg-secondary">{user.studentCode ?? user.email}</p>
        </div>
      </div>
      <DetailRows rows={rows} />
    </Card>
  )
}

/** The student's directory details: read-only here; the sign-up form corrects them until a Manager verifies them. */
function StudentDetailsCard() {
  const query = useQuery(['verification'], ({ signal }) => api.me.verification({}, { signal }))
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <CardHeader
        title="Student details"
        actions={query.data && <Tag tone={statusTone[query.data.status] ?? 'neutral'}>{query.data.status}</Tag>}
      />
      <QueryState query={query} compact>
        {(data) => {
          const f = data.form
          const gender = data.options.genders.find((g) => g.value === f.gender)?.label ?? (f.gender === 'M' ? 'Male' : f.gender === 'F' ? 'Female' : '—')
          return (
            <>
              <DetailRows
                rows={[
                  ['Student code', f.studentCode ?? '—'],
                  ['Full name', f.name ?? '—'],
                  ['Gender', gender],
                  ['Date of birth', f.dateOfBirth ? formatDate(f.dateOfBirth) : '—'],
                  ['Major', data.options.majors.find((m) => m.value === f.major)?.label ?? f.major ?? '—'],
                  ['Cohort', f.cohort ?? '—'],
                  ['Phone', f.phone ?? '—'],
                ]}
              />
              {data.locked ? (
                <p className="flex items-start gap-2 text-sm text-fg-tertiary">
                  <BadgeCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
                  {t('These details come from the student list. Ask a Manager to correct them.')}
                </p>
              ) : (
                <div className="flex justify-end">
                  <Button to="/student/verification" icon={Pencil} iconSize={16}>
                    Correct your details
                  </Button>
                </div>
              )}
            </>
          )
        }}
      </QueryState>
    </Card>
  )
}

function SettingRow({ title, description, children }) {
  return (
    <div className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-base font-medium text-fg">{tx(title)}</p>
        {description && <p className="text-sm text-fg-tertiary">{tx(description)}</p>}
      </div>
      <div className="flex shrink-0">{children}</div>
    </div>
  )
}

function SignInCard() {
  const navigate = useNavigate()
  const { signOut } = useSession()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <Card padding="lg" className="flex flex-col">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      <CardHeader title="Sign-in and language" />
      <div className="flex flex-col divide-y divide-line">
        <SettingRow title="Language" description="Screens, notifications, push and emails follow it.">
          <LanguageSwitch />
        </SettingRow>
        <SettingRow title="Password" description="Changing it signs out your other devices.">
          <Button icon={KeyRound} iconSize={16} onClick={() => setChangingPassword(true)}>
            Change password
          </Button>
        </SettingRow>
        <SettingRow title="This device" description="Sign out when you use a shared computer.">
          <Button
            variant="danger-text"
            icon={LogOut}
            iconSize={16}
            onClick={async () => {
              await signOut()
              navigate('/signin')
            }}
          >
            Sign out
          </Button>
        </SettingRow>
      </div>
    </Card>
  )
}

export default function Profile({ role }) {
  const { user } = useSession()
  if (!user) return null
  // Two columns from lg: the account and its sign-in settings on the left, a student's details on the right.
  if (role === 'student') {
    return (
      <StudentPage
        breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'My profile' }]}
        title="My profile"
        description="Your account, student details and sign-in settings."
      >
        <div className="grid items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:overflow-y-auto">
          <div className="flex flex-col gap-4">
            <AccountCard user={user} role={role} />
            <SignInCard />
          </div>
          <div className="flex flex-col gap-4">
            <StudentDetailsCard />
            <RefundAccountCard />
          </div>
        </div>
      </StudentPage>
    )
  }
  return (
    <>
      <PageHeader title="My profile" description="Your account and sign-in settings." />
      <div className="grid w-full max-w-300 items-start gap-4 lg:grid-cols-2">
        <AccountCard user={user} role={role} />
        <SignInCard />
      </div>
    </>
  )
}
