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
  Inbox,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
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
import { ChangePasswordDialog } from '@/components/layout/ChangePasswordDialog'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { useNotifications } from '@/components/layout/Notifications'
import { Button } from '@/components/ui/Button'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatRelative } from '@/lib/format'
import { RefundAccountCard, useRefundAccount } from '@/pages/student/refundAccount'
import { Chips, InfoGrid, Panel } from './profileParts'
import { ContactPanel, EmergencyPanel, useContacts } from './profileContacts'
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

/**
 * Countdown of the stay for the header card: days left while the Term's stay runs, else the day it starts.
 * Null without a Bed or dates.
 */
function stayCountdown(term, allocation) {
  if (!allocation || !term?.stayStart || !term?.stayEnd) return null
  const day = 86_400_000
  const now = new Date()
  const start = new Date(`${term.stayStart}T00:00:00`)
  const end = new Date(`${term.stayEnd}T23:59:59`)
  if (now < start) return { value: formatDate(term.stayStart), label: 'Stay starts', note: t('Term {name}', { name: term.name }) }
  if (now > end) return null
  const left = Math.max(0, Math.ceil((end - now) / day))
  return { value: t('{n} days', { n: left }), label: 'Left in the Term', note: t('Until {date}', { date: formatDate(term.stayEnd) }) }
}

/** The person at a glance: initials tile, name, status and up to three numbers, all on one centred line. */
function Hero({ name, status, subline, stats }) {
  return (
    <section className="relative shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* A soft warm wash from the left and a blurred glow behind the tile: brand colour without a heavy band. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-r from-orange-50 via-surface to-surface" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-20 -left-16 size-64 rounded-full bg-orange-200/40 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5 p-5 sm:p-6 lg:flex-row lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <span
            aria-hidden="true"
            className="flex size-18 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-orange-100 to-orange-200 text-[26px] font-bold tracking-tight text-fg-brand shadow-card ring-4 ring-surface"
          >
            {initialsOf(name)}
          </span>
          <div className="flex min-w-0 flex-col items-center gap-1.5 sm:items-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-h2 font-bold tracking-tight text-fg">{name}</h2>
              {status}
            </div>
            {subline && <p className="flex flex-wrap items-center justify-center gap-x-2 text-base text-fg-secondary sm:justify-start">{subline}</p>}
          </div>
        </div>
        {stats?.length > 0 && (
          <dl
            className="grid w-full shrink-0 gap-2 sm:gap-3 lg:flex lg:w-auto"
            style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
          >
            {stats.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}

const statTones = {
  brand: 'bg-orange-100 text-fg-brand',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info',
}

/** One number of the header card: a tinted icon, the value and what it is (with an optional small note). */
function StatCard({ icon: Glyph, value, label, note, tone = 'brand' }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-line bg-surface/90 px-3 py-3 text-center shadow-card backdrop-blur-sm sm:flex-row sm:gap-3 sm:text-left lg:min-w-44 lg:px-4">
      <span aria-hidden="true" className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', statTones[tone])}>
        <Glyph size={20} />
      </span>
      <div className="flex min-w-0 flex-col">
        <dd className="truncate text-h3 leading-tight font-bold text-fg tabular">{value}</dd>
        <dt className="text-sm text-fg-tertiary sm:whitespace-nowrap">{tx(label)}</dt>
        {note && <span className="truncate text-xs text-fg-tertiary/80 max-sm:hidden">{note}</span>}
      </div>
    </div>
  )
}

/** Where the page sits: a small pill (Home › My profile) instead of a loose breadcrumb line. */
function TrailPill({ home }) {
  return (
    <nav aria-label={t('Breadcrumb')} className="flex shrink-0 max-lg:hidden">
      <ol className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm shadow-card">
        <li>
          <Link to={home} className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-fg-secondary transition-colors hover:bg-subtle hover:text-fg">
            <Home size={14} aria-hidden="true" />
            {t('Home')}
          </Link>
        </li>
        <li aria-hidden="true" className="text-fg-disabled">
          /
        </li>
        <li aria-current="page" className="flex items-center gap-1.5 px-1 font-medium text-fg">
          <UserRound size={14} aria-hidden="true" className="text-fg-brand" />
          {t('My profile')}
        </li>
      </ol>
    </nav>
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
    <Panel
      icon={Bell}
      title="Recent activity"
      description="Your latest notifications."
      bodyClassName="max-h-[min(520px,calc(100dvh-400px))] min-h-48 overflow-y-auto overscroll-contain px-3 py-3"
    >
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
  const contacts = useContacts()

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

  // The three numbers that matter most right now: where they live, how long is left, what they owe.
  const stay = stayCountdown(al?.term, a)
  const due = home.data?.invoices?.due
  const stats = [
    a && { icon: Bed, value: a.room, label: t('Bed {bed}', { bed: a.bed }), note: a.blockLabel, tone: 'brand' },
    stay && { icon: CalendarClock, value: stay.value, label: stay.label, note: stay.note, tone: 'info' },
    home.data && { icon: Receipt, value: due ?? 0, label: 'Invoices to pay', note: due ? t('Open Payments') : t('All paid'), tone: due ? 'warning' : 'success' },
    home.data && { icon: Wrench, value: home.data.openRequests ?? 0, label: 'Open requests', tone: 'brand' },
    al?.stay && { icon: Hash, value: `${al.stay.termsUsed}/${al.stay.committedTerms}`, label: 'Terms stayed', tone: 'brand' },
  ].filter(Boolean).slice(0, 3)

  const completeness = [
    { label: 'Basic information', ok: v?.status === 'Verified' },
    { label: 'Phone number', ok: Boolean(contacts.data?.phone ?? contact.phone ?? f?.phone) },
    { label: 'Emergency contact', ok: contacts.data ? contacts.data.emergencyContacts.length > 0 : Boolean(contact.emergencyName && contact.emergencyPhone) },
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
      <TrailPill home="/student" />
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
              <ContactPanel address={a ? `${place}, ${a.blockLabel ?? t('Block {code}', { code: a.block })}` : null} />
            </>
          )}

          {tab === 'emergency' && <EmergencyPanel />}

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
    desk && blocks.length > 0 && { icon: Building, value: blocks.length, label: 'Blocks', note: blocks.join(' · '), tone: 'brand' },
    w && { icon: Inbox, value: w.open ?? 0, label: 'Open requests', tone: w.open ? 'warning' : 'success' },
    w && { icon: CheckCircle2, value: w.resolved7d ?? 0, label: 'Resolved in 7 days', tone: 'success' },
  ].filter(Boolean)
  const tabs = [
    { key: 'account', label: 'Account information', icon: UserRound },
    { key: 'security', label: 'Settings & security', icon: ShieldCheck },
    { key: 'activity', label: 'Recent activity', icon: Bell },
  ]
  return (
    <>
      <h1 className="sr-only">{t('My profile')}</h1>
      <div className="flex w-full max-w-300 flex-col gap-4">
        <TrailPill home={`/${role}`} />
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
        headerless
      >
        <StudentProfile user={user} />
      </StudentPage>
    )
  }
  return <BackOfficeProfile user={user} role={role} />
}
