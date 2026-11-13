import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  BadgeCheck,
  Bed,
  Bell,
  BookOpen,
  Briefcase,
  Building,
  Cake,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  CircleDashed,
  Contact,
  GraduationCap,
  Hash,
  HeartHandshake,
  Home,
  IdCard,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  User,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { backOffice } from '@/app/navigation'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { ChangePasswordDialog } from '@/components/layout/ChangePasswordDialog'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { useNotifications } from '@/components/layout/Notifications'
import { Button } from '@/components/ui/Button'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatRelative } from '@/lib/format'
import { RefundAccountCard, useRefundAccount } from '@/pages/student/refundAccount'
import { StudentPage } from '@/pages/student/shared'
import { t, tx } from '@/i18n'

// My profile (review item R-20), for every role: opened from the avatar menu (student, top right and the phone App
// Bar) and from the account block at the foot of the back-office menu. Only what the API returns is shown:
// everyone: GET /auth/me and the latest notifications; Staff and Managers: GET /block-staff/me (shift, workload);
// students: GET /students/me/profile, /verification, /allocation, /home and the refund account (A-62).

const verificationTone = { Verified: 'success', 'Pending verification': 'warning', 'Profile needed': 'info' }

const initialsOf = (name) =>
  (name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/* ------------------------------------------------------------------ building blocks */

/** Rounded panel with a title row (and optional description and actions) over a divider. */
function Panel({ icon: Glyph, title, description, actions, children, className, bodyClassName }) {
  return (
    <section className={cx('flex flex-col rounded-2xl border border-line bg-surface shadow-card', className)}>
      <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
            {Glyph && <Glyph size={18} aria-hidden="true" className="text-fg-brand" />}
            {tx(title)}
          </h2>
          {description && <p className="text-sm text-fg-tertiary">{tx(description)}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cx('p-6', bodyClassName)}>{children}</div>
    </section>
  )
}

/** One fact as a soft tile: icon, label, value. Empty values are left out by the callers. */
function InfoTile({ icon: Glyph, label, children, wide }) {
  return (
    <div className={cx('flex min-w-0 items-start gap-3 rounded-xl bg-subtle/70 px-4 py-3', wide && 'sm:col-span-2')}>
      <Glyph size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-tertiary" />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-fg-tertiary">{tx(label)}</span>
        <span className="text-base font-medium break-words text-fg">{children}</span>
      </div>
    </div>
  )
}

/** Tiles in two columns; rows whose value is empty are dropped so no "—" fills the page. */
function InfoGrid({ items }) {
  const shown = items.filter((i) => i && i.value != null && i.value !== '' && !(Array.isArray(i.value) && !i.value.length))
  if (!shown.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {shown.map((i) => (
        <InfoTile key={i.label} icon={i.icon} label={i.label} wide={i.wide}>
          {i.value}
        </InfoTile>
      ))}
    </div>
  )
}

function Chips({ items }) {
  return (
    <span className="flex flex-wrap gap-1.5 pt-0.5">
      {items.map((x) => (
        <span key={x} className="rounded-full bg-surface px-2.5 text-sm font-medium text-fg-secondary ring-1 ring-line">
          {x}
        </span>
      ))}
    </span>
  )
}

function StatBox({ value, label }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl bg-subtle/70 px-2 py-2.5 text-center sm:min-w-28 sm:px-4 sm:py-3">
      <span className="text-h3 font-bold text-fg tabular sm:text-h2">{value}</span>
      <span className="text-sm text-fg-secondary sm:whitespace-nowrap">{tx(label)}</span>
    </div>
  )
}

/** The person at a glance: a soft brand strip, the initials tile, name, status and up to three numbers. */
function Hero({ name, status, subline, stats }) {
  return (
    <section className="relative shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div aria-hidden="true" className="bg-band-gradient h-16 opacity-45 sm:h-20" />
      <div className="flex flex-col gap-4 px-4 pb-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        {/* Phones: centred under the strip; from sm the tile sits left with the name beside it. */}
        <div className="relative -mt-10 flex min-w-0 flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:gap-4 sm:text-left">
          <span
            aria-hidden="true"
            className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[28px] font-bold text-fg-brand shadow-dropdown ring-4 ring-surface sm:size-22 sm:text-[32px]"
          >
            {initialsOf(name)}
          </span>
          <div className="flex min-w-0 flex-col items-center gap-1 pb-1 sm:items-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-h2 font-bold tracking-tight text-fg">{name}</h2>
              {status}
            </div>
            {subline && <p className="flex flex-wrap items-center justify-center gap-x-2 text-base text-fg-secondary sm:justify-start">{subline}</p>}
          </div>
        </div>
        {stats?.length > 0 && (
          <div className="relative grid grid-flow-col auto-cols-fr gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
            {stats.map((s) => (
              <StatBox key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/** Pill tabs under the hero. */
function PillTabs({ items, value, onChange }) {
  return (
    <div role="tablist" className="flex w-fit max-w-full shrink-0 gap-1 overflow-x-auto rounded-xl bg-subtle p-1 scrollbar-none">
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cx(
              'flex items-center gap-2 rounded-lg px-4 py-1.5 text-base font-medium whitespace-nowrap transition-colors',
              active ? 'bg-surface text-fg shadow-card' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {item.icon && <item.icon size={16} aria-hidden="true" className={active ? 'text-fg-brand' : 'text-fg-tertiary'} />}
            {tx(item.label)}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ shared sections */

function SettingRow({ icon: Glyph, title, description, children }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-fg-secondary">
          <Glyph size={18} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base font-medium text-fg">{tx(title)}</p>
          {description && <p className="text-sm text-fg-tertiary">{tx(description)}</p>}
        </div>
      </div>
      <div className="flex shrink-0">{children}</div>
    </div>
  )
}

function SecurityPanel() {
  const navigate = useNavigate()
  const { signOut } = useSession()
  const [changingPassword, setChangingPassword] = useState(false)
  return (
    <Panel icon={ShieldCheck} title="Settings & security" description="Language, password and this device.">
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
      <div className="flex flex-col divide-y divide-line">
        <SettingRow icon={Languages} title="Language" description="Screens, notifications, push and emails follow it.">
          <LanguageSwitch />
        </SettingRow>
        <SettingRow icon={KeyRound} title="Password" description="Changing it signs out your other devices.">
          <Button icon={KeyRound} iconSize={16} onClick={() => setChangingPassword(true)}>
            Change password
          </Button>
        </SettingRow>
        <SettingRow icon={LogOut} title="This device" description="Sign out when you use a shared computer.">
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
    </Panel>
  )
}

/** Recent activity: the person's latest notifications (the only per-person history the API gives every role). */
function ActivityPanel() {
  const { query, markOne } = useNotifications()
  return (
    <Panel icon={Bell} title="Recent activity" description="Your latest notifications." bodyClassName="px-3 py-3">
      <QueryState query={query} compact empty={<p className="px-3 py-8 text-center text-base text-fg-secondary">{t('You have no notifications.')}</p>}>
        {(data) => (
          <ol className="flex flex-col">
            {data.items.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.link ?? '#'}
                  onClick={() => !n.read && markOne.run(n.id)}
                  className="flex gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-subtle"
                >
                  <span aria-hidden="true" className={cx('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-line-strong' : 'bg-primary')} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-medium text-fg">{n.title}</span>
                    {n.body && <span className="text-sm text-fg-secondary">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-sm whitespace-nowrap text-fg-tertiary">{formatRelative(n.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
    </Panel>
  )
}

/* ------------------------------------------------------------------ student */

function CompletenessPanel({ items }) {
  const done = items.filter((i) => i.ok).length
  const percent = Math.round((done / items.length) * 100)
  return (
    <Panel title="Profile completeness">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <span className="text-kpi font-bold text-fg tabular">{percent}%</span>
          <span className="text-sm text-fg-tertiary">{done === items.length ? t('All done') : t('{n} items left', { n: items.length - done })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-subtle">
          <div className={cx('h-full rounded-full transition-[width]', percent === 100 ? 'bg-success' : 'bg-accent')} style={{ width: `${percent}%` }} />
        </div>
        <ul className="flex flex-col gap-2.5">
          {items.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2 text-fg-secondary">
                {i.ok ? <CheckCircle2 size={16} aria-hidden="true" className="text-success" /> : <CircleDashed size={16} aria-hidden="true" className="text-warning" />}
                {tx(i.label)}
              </span>
              <span className={cx('text-sm font-medium', i.ok ? 'text-success-fg' : 'text-warning-fg')}>{i.ok ? t('Provided') : t('Missing')}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

function StudentProfile({ user }) {
  const { term } = useSession()
  const [tab, setTab] = useState('personal')
  const profile = useQuery(['profile'], ({ signal }) => api.me.profile(undefined, { signal }))
  const verification = useQuery(['verification'], ({ signal }) => api.me.verification({}, { signal }))
  const allocationQ = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
  const home = useQuery(['home', term?.id], ({ signal }) => api.me.home({ termId: term?.id }, { signal }))
  const refund = useRefundAccount()

  const p = profile.data
  const v = verification.data
  const f = v?.form
  const al = allocationQ.data
  const a = al?.allocation
  const contact = p?.contact ?? {}
  const resident = a?.status === 'Resident'
  const majorLabel = v?.options?.majors.find((m) => m.value === f?.major)?.label ?? p?.major ?? f?.major
  const gender = p?.gender ?? (f?.gender === 'M' ? 'Male' : f?.gender === 'F' ? 'Female' : null)
  const place = a ? `${a.room} · ${t('Bed {bed}', { bed: a.bed })}` : null

  const status = resident ? (
    <Tag tone="success">{t('In residence')}</Tag>
  ) : v?.status ? (
    <Tag tone={verificationTone[v.status] ?? 'neutral'}>{v.status}</Tag>
  ) : null

  const subline = [user.studentCode, majorLabel ? t(majorLabel) : null, p?.cohort ?? f?.cohort].filter(Boolean).map((x, i) => (
    <span key={x} className="flex items-center gap-2">
      {i > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-fg-disabled" />}
      <span className={i === 0 ? 'font-semibold text-fg' : undefined}>{x}</span>
    </span>
  ))

  const stats = [
    al?.stay && { value: `${al.stay.termsUsed}/${al.stay.committedTerms}`, label: 'Terms stayed' },
    a && { value: a.room, label: 'Room' },
    home.data && { value: home.data.openRequests ?? 0, label: 'Open requests' },
  ].filter(Boolean)

  const completeness = [
    { label: 'Basic information', ok: v?.status === 'Verified' },
    { label: 'Phone number', ok: Boolean(contact.phone ?? f?.phone) },
    { label: 'Emergency contact', ok: Boolean(contact.emergencyName && contact.emergencyPhone) },
    { label: 'Refund bank account', ok: refund.complete },
  ]

  const tabs = [
    { key: 'personal', label: 'Personal information', icon: UserRound },
    { key: 'emergency', label: 'Emergency contact', icon: HeartHandshake },
    { key: 'stay', label: 'Accommodation', icon: Home },
    { key: 'security', label: 'Settings & security', icon: ShieldCheck },
    { key: 'activity', label: 'Recent activity', icon: Bell },
  ]

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-2">
      <Hero name={p?.name ?? user.name} status={status} subline={subline} stats={stats} />
      <PillTabs items={tabs} value={tab} onChange={setTab} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {tab === 'personal' && (
            <>
              <Panel
                icon={GraduationCap}
                title="Academic information"
                description={v?.locked ? 'Read-only: from the student list. Ask a Manager to correct it.' : 'You can still correct these until a Manager verifies them.'}
                actions={
                  v && !v.locked ? (
                    <Button to="/student/verification" icon={Pencil} iconSize={16}>
                      Edit
                    </Button>
                  ) : v?.locked ? (
                    <BadgeCheck size={20} aria-label={t('Verified')} className="text-success" />
                  ) : null
                }
              >
                <QueryState query={verification} compact>
                  {() => (
                    <InfoGrid
                      items={[
                        { icon: IdCard, label: 'Student code', value: f?.studentCode ?? user.studentCode },
                        { icon: BookOpen, label: 'Major', value: majorLabel ? t(majorLabel) : null },
                        { icon: Cake, label: 'Date of birth', value: f?.dateOfBirth ? formatDate(f.dateOfBirth) : null },
                        { icon: Users, label: 'Gender', value: gender ? t(gender) : null },
                        { icon: CalendarRange, label: 'Cohort', value: p?.cohort ?? f?.cohort },
                        { icon: MapPin, label: 'Hometown', value: p?.hometown },
                      ]}
                    />
                  )}
                </QueryState>
              </Panel>
              <Panel icon={Contact} title="Contact information">
                <InfoGrid
                  items={[
                    { icon: Mail, label: 'Student email', value: user.email },
                    { icon: Phone, label: 'Phone number', value: contact.phone ?? f?.phone },
                    { icon: Mail, label: 'Personal email', value: contact.email },
                    { icon: Home, label: 'Current address', value: a ? `${place}, ${a.blockLabel ?? t('Block {code}', { code: a.block })}` : null },
                  ]}
                />
              </Panel>
            </>
          )}

          {tab === 'emergency' && (
            <Panel icon={HeartHandshake} title="Emergency contact" description="Who the dormitory calls if something happens to you.">
              <QueryState query={profile} compact>
                {() =>
                  contact.emergencyName || contact.emergencyPhone ? (
                    <InfoGrid
                      items={[
                        { icon: User, label: 'Full name', value: contact.emergencyName },
                        { icon: Users, label: 'Relationship', value: contact.relationship ? t(contact.relationship) : null },
                        { icon: Phone, label: 'Phone number', value: contact.emergencyPhone },
                      ]}
                    />
                  ) : (
                    <p className="py-6 text-center text-base text-fg-secondary">{t('No emergency contact yet. You give one when you apply for a Bed.')}</p>
                  )
                }
              </QueryState>
            </Panel>
          )}

          {tab === 'stay' && (
            <Panel icon={Bed} title="Accommodation" description={al?.term ? t('Term {name}', { name: al.term.name }) : null}>
              <QueryState query={allocationQ} compact>
                {() =>
                  a ? (
                    <div className="flex flex-col gap-4">
                      <InfoGrid
                        items={[
                          { icon: Bed, label: 'Room and Bed', value: place },
                          { icon: Building, label: 'Block', value: a.blockLabel ? `${a.blockLabel}${a.floor != null ? ` · ${t('Floor {n}', { n: a.floor })}` : ''}` : null },
                          { icon: Home, label: 'Room', value: [a.roomTypeName && t(a.roomTypeName), a.roomClassName && t(a.roomClassName)].filter(Boolean).join(' · ') },
                          { icon: CalendarRange, label: 'Stay', value: al.term?.stayStart ? `${formatDate(al.term.stayStart)} – ${formatDate(al.term.stayEnd)}` : null },
                          { icon: CalendarClock, label: 'Resident since', value: a.residentSince ? formatDate(a.residentSince) : null },
                          { icon: Hash, label: 'Terms stayed', value: al.stay ? t('{used} of {total} Terms · {left} left', { used: al.stay.termsUsed, total: al.stay.committedTerms, left: al.stay.termsLeft }) : null },
                          { icon: Users, label: 'Roommates', value: al.roommates?.length ? <Chips items={al.roommates.map((r) => `${r.name} · ${r.bed}`)} /> : null, wide: true },
                        ]}
                      />
                      <div className="flex justify-end">
                        <Button to="/student/room" variant="text">
                          {t('My Room')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-base text-fg-secondary">{t('You have no Bed this Term yet.')}</p>
                  )
                }
              </QueryState>
            </Panel>
          )}

          {tab === 'security' && <SecurityPanel />}
          {tab === 'activity' && <ActivityPanel />}
        </div>

        <aside className="flex flex-col gap-4">
          <CompletenessPanel items={completeness} />
          <RefundAccountCard />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ back office */

function BackOfficeProfile({ user, role }) {
  const [tab, setTab] = useState('account')
  const desk = role === 'staff' || role === 'manager'
  const work = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }), { enabled: desk })
  const w = desk ? work.data : null
  const roleTitle = t(backOffice[role]?.roleTitle ?? role)
  const blocks = user.blocks ?? []
  const status = w ? (
    <Tag tone={w.onDuty ? 'success' : 'neutral'}>{w.onDuty ? t('On duty') : t('Off duty')}</Tag>
  ) : (
    <Tag tone="info" dot={false}>
      {roleTitle}
    </Tag>
  )
  const subline = [user.email, user.title ? tx(user.title) : roleTitle].map((x, i) => (
    <span key={i} className="flex items-center gap-2">
      {i > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-fg-disabled" />}
      {x}
    </span>
  ))
  const stats = [
    desk && blocks.length > 0 && { value: blocks.length, label: 'Blocks' },
    w && { value: w.open ?? 0, label: 'Open requests' },
    w && { value: w.resolved7d ?? 0, label: 'Resolved in 7 days' },
  ].filter(Boolean)
  const tabs = [
    { key: 'account', label: 'Account information', icon: UserRound },
    { key: 'security', label: 'Settings & security', icon: ShieldCheck },
    { key: 'activity', label: 'Recent activity', icon: Bell },
  ]
  return (
    <>
      <PageHeader title="My profile" description="Your account, work and sign-in settings." />
      <div className="flex w-full max-w-300 flex-col gap-4">
        <Hero name={user.name} status={status} subline={subline} stats={stats} />
        <PillTabs items={tabs} value={tab} onChange={setTab} />
        {tab === 'account' && (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Panel icon={UserRound} title="Account information" description="Set by an Admin. Ask one to change it.">
              <InfoGrid
                items={[
                  { icon: User, label: 'Full name', value: user.name },
                  { icon: Mail, label: 'Email', value: user.email },
                  { icon: ShieldCheck, label: 'Role', value: roleTitle },
                  { icon: Briefcase, label: 'Job title', value: user.title ? tx(user.title) : null },
                  { icon: Languages, label: 'Language', value: user.locale ? (user.locale === 'vi' ? 'Tiếng Việt' : 'English') : null },
                  { icon: Building, label: 'Blocks', value: desk && blocks.length ? <Chips items={blocks.map((b) => t('Block {code}', { code: b }))} /> : null, wide: true },
                ]}
              />
            </Panel>
            {w && (
              <Panel icon={Wrench} title="Shift and work">
                <ul className="flex flex-col gap-3 text-base">
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-fg-secondary">{t('Shift')}</span>
                    <span className={cx('flex items-center gap-2 font-medium', w.onDuty ? 'text-success-fg' : 'text-error-fg')}>
                      <span aria-hidden="true" className={cx('size-2 rounded-full', w.onDuty ? 'bg-success' : 'bg-error')} />
                      {w.onDuty ? t('Recording your shift') : t('Shift off')}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-fg-secondary">{t('Open requests')}</span>
                    <span className="font-semibold text-fg tabular">{w.open ?? 0}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-fg-secondary">{t('Resolved in 7 days')}</span>
                    <span className="font-semibold text-fg tabular">{w.resolved7d ?? 0}</span>
                  </li>
                  {w.handles?.length > 0 && (
                    <li className="flex flex-col gap-1.5">
                      <span className="text-fg-secondary">{t('Request types you handle')}</span>
                      <Chips items={w.handles.map((h) => t(typeof h === 'string' ? h : (h.label ?? h.type ?? String(h))))} />
                    </li>
                  )}
                </ul>
              </Panel>
            )}
          </div>
        )}
        {tab === 'security' && <SecurityPanel />}
        {tab === 'activity' && <ActivityPanel />}
      </div>
    </>
  )
}

export default function Profile({ role }) {
  const { user } = useSession()
  if (!user) return null
  if (role === 'student') {
    return (
      <StudentPage
        breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'My profile' }]}
        title="My profile"
        description="Your account, student details and sign-in settings."
      >
        <StudentProfile user={user} />
      </StudentPage>
    )
  }
  return <BackOfficeProfile user={user} role={role} />
}
