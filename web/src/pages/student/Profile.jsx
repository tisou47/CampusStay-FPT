import { useState } from 'react'
import { Link } from 'react-router'
import { Bed, BookOpen, Cake, CalendarCheck, CircleUser, GraduationCap, HeartHandshake, IdCard, KeyRound, Languages, Mail, MapPin, Phone, ShieldCheck, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { ChangePasswordDialog } from '@/components/layout/ChangePasswordDialog'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { useNotifications } from '@/components/layout/Notifications'
import { Button } from '@/components/ui/Button'
import { Avatar, Card, Note, ProgressBar } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { StatusBadge } from '@/components/student/StatusBadge'
import { Tabs } from '@/components/student/Tabs'
import { formatDate, formatRelative } from '@/lib/format'
import { cx } from '@/lib/cx'
import { RefundAccountCard, useRefundAccount } from './refundAccount'
import { StudentPage } from './shared'
import { t, tr, tx } from '@/i18n'

// My profile: everything the student's account already exposes, read from existing endpoints only.
// GET /students/me/profile → { name, studentCode, gender, major, cohort, hometown, contact: { phone, email,
//   emergencyName, relationship, emergencyPhone } }
// GET /students/me/verification → { status, locked, form: { studentCode, name, gender, dateOfBirth, major, cohort, phone },
//   options: { genders, majors } }
// GET /students/me/allocation?termId → { allocation, stay: { committedTerms, termsUsed }, … } (as My Room)
// GET /students/me/refund-account → { holder, number, bank } · GET /notifications (as the bell)

const TABS = [
  { key: 'personal', label: 'Personal information' },
  { key: 'emergency', label: 'Emergency contact' },
  { key: 'settings', label: 'Settings & security' },
  { key: 'activity', label: 'Recent activity' },
]

const GENDER = { M: 'Male', F: 'Female', Male: 'Male', Female: 'Female' }

/** One read-only field: icon, label, value (a dash when the account has no value). */
function Field({ icon: Glyph, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg bg-subtle px-4 py-3">
      <Glyph size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-text-muted" />
      <div className="flex min-w-0 flex-col">
        <span className="text-small text-text-muted">{tx(label)}</span>
        <span className="text-body font-medium break-words text-text">{value || '—'}</span>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <Card padding="none" className="flex flex-col">
      <div className="flex flex-col gap-0.5 border-b border-border px-6 py-4">
        <h2 className="text-card-title text-text">{tx(title)}</h2>
        {subtitle && <p className="text-small text-text-secondary">{tx(subtitle)}</p>}
      </div>
      <div className="grid gap-3 p-6 md:grid-cols-2">{children}</div>
    </Card>
  )
}

/** Share of the profile items the student can act on that are filled in (pure, from the loaded data). */
function completeness({ profile, verification, refund }) {
  const c = profile?.contact ?? {}
  const items = [
    ['Basic information', Boolean(profile?.name && profile?.studentCode && profile?.gender)],
    ['Date of birth', Boolean(verification?.form?.dateOfBirth)],
    ['Phone number', Boolean(c.phone)],
    ['Emergency contact', Boolean(c.emergencyName && c.emergencyPhone)],
    ['Refund bank account', Boolean(refund?.number)],
    ['Account verified', verification?.status === 'Verified'],
  ]
  const done = items.filter(([, ok]) => ok).length
  return { items, done, pct: Math.round((done / items.length) * 100) }
}

export default function Profile() {
  const { user, term } = useSession()
  const [tab, setTab] = useState('personal')
  const [changingPassword, setChangingPassword] = useState(false)
  const profile = useQuery(['profile'], ({ signal }) => api.me.profile(undefined, { signal }))
  const verification = useQuery(['verification'], ({ signal }) => api.me.verification({}, { signal }))
  const allocation = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
  const refund = useRefundAccount()
  const { items: notifications, query: notificationsQuery } = useNotifications()

  const p = profile.data
  const v = verification.data
  const a = allocation.data?.allocation
  const stay = allocation.data?.stay
  const contact = p?.contact ?? {}
  const majorLabel = v?.options?.majors?.find((m) => m.value === v?.form?.major)?.label ?? p?.major
  const status = a?.status ?? v?.status
  const score = completeness({ profile: p, verification: v, refund: refund.saved })

  return (
    <StudentPage flow title="My profile" description="Your details from the dormitory's student list, your Applications and your account.">
      <QueryState query={profile}>
        {() => (
          <>
            {/* Header card: who, status and the three numbers of the stay. */}
            <Card padding="none" className="overflow-hidden">
              <div className="h-16 bg-subtle" aria-hidden="true" />
              <div className="flex flex-col gap-4 px-6 pb-5 md:flex-row md:items-end md:justify-between">
                <div className="-mt-10 flex min-w-0 items-end gap-4">
                  <span className="rounded-xl border-4 border-surface bg-surface shadow-card">
                    <Avatar name={p.name} size={88} className="!text-h1 rounded-lg" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-section-title text-text">{p.name}</p>
                      {status && <StatusBadge status={status} />}
                    </div>
                    <p className="text-small text-text-secondary">
                      {t('Student code')}: <strong className="font-semibold text-text">{p.studentCode}</strong>
                      {[majorLabel && tr(majorLabel), p.cohort && t('Cohort {cohort}', { cohort: p.cohort })].filter(Boolean).map((x) => ` · ${x}`)}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-3">
                  {[
                    ['Terms in the dormitory', stay?.termsUsed ?? 0],
                    ['Contract length', stay?.committedTerms ?? allocation.data?.stayTerms ?? '—'],
                    ['Room', a ? `${a.room} · ${a.bed}` : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex min-w-24 flex-col items-center rounded-lg border border-border px-3 py-2 text-center">
                      <dd className="text-section-title text-text num nowrap">{value}</dd>
                      <dt className="text-caption text-text-muted">{t(label)}</dt>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>

            <Tabs label="My profile" items={TABS} value={tab} onChange={setTab} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-6">
              <div role="tabpanel" className="flex min-w-0 flex-col gap-4">
                {tab === 'personal' && (
                  <>
                    <Section title="Academic information" subtitle="Read only: corrections go through the dormitory office.">
                      <Field icon={IdCard} label="Student code" value={p.studentCode} />
                      <Field icon={GraduationCap} label="Major" value={majorLabel && tr(majorLabel)} />
                      <Field icon={Cake} label="Date of birth" value={v?.form?.dateOfBirth && formatDate(v.form.dateOfBirth)} />
                      <Field icon={Users} label="Gender" value={GENDER[p.gender] ? t(GENDER[p.gender]) : p.gender} />
                      <Field icon={BookOpen} label="Cohort" value={p.cohort} />
                      <Field icon={MapPin} label="Hometown" value={p.hometown && tr(p.hometown)} />
                    </Section>
                    <Section title="Contact information" subtitle="From your latest Application; you update it when you apply.">
                      <Field icon={Mail} label="Student email" value={user?.email} />
                      <Field icon={Phone} label="Phone number" value={contact.phone ?? v?.form?.phone} />
                      <Field icon={Mail} label="Contact email" value={contact.email} />
                      <Field icon={Bed} label="Current address" value={a ? t('Room {room} · Bed {bed}', { room: a.room, bed: a.bed }) + (a.block ? ` · ${t('Building {code}', { code: a.block })}` : '') : null} />
                    </Section>
                  </>
                )}

                {tab === 'emergency' && (
                  <Section title="Emergency contact" subtitle="Who the dormitory calls if something happens to you.">
                    <Field icon={CircleUser} label="Full name" value={contact.emergencyName} />
                    <Field icon={HeartHandshake} label="Relationship" value={contact.relationship && tr(contact.relationship)} />
                    <Field icon={Phone} label="Phone number" value={contact.emergencyPhone} />
                  </Section>
                )}

                {tab === 'settings' && (
                  <>
                    <Card padding="lg" className="flex flex-col gap-4">
                      <h2 className="text-card-title text-text">{t('Settings & security')}</h2>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3">
                        <span className="flex items-center gap-3">
                          <KeyRound size={20} aria-hidden="true" className="text-text-muted" />
                          <span className="flex flex-col">
                            <span className="text-body font-medium text-text">{t('Password')}</span>
                            <span className="text-small text-text-secondary">{t('Used to sign in with your email.')}</span>
                          </span>
                        </span>
                        <Button onClick={() => setChangingPassword(true)}>Change password</Button>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Languages size={20} aria-hidden="true" className="text-text-muted" />
                          <span className="flex flex-col">
                            <span className="text-body font-medium text-text">{t('Language')}</span>
                            <span className="text-small text-text-secondary">{t('Also used for your notifications and emails.')}</span>
                          </span>
                        </span>
                        <LanguageSwitch />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3">
                        <span className="flex items-center gap-3">
                          <ShieldCheck size={20} aria-hidden="true" className="text-text-muted" />
                          <span className="flex flex-col">
                            <span className="text-body font-medium text-text">{t('Account verification')}</span>
                            <span className="text-small text-text-secondary">{v?.status ? tr(v.status) : '—'}</span>
                          </span>
                        </span>
                        {v?.status && v.status !== 'Verified' && (
                          <Button to="/student/verification">See my details</Button>
                        )}
                      </div>
                    </Card>
                    <RefundAccountCard />
                  </>
                )}

                {tab === 'activity' && (
                  <Card padding="lg" className="flex flex-col gap-3">
                    <h2 className="text-card-title text-text">{t('Recent activity')}</h2>
                    <QueryState query={notificationsQuery} compact empty={<p className="text-body text-text-secondary">{t('You have no notifications.')}</p>}>
                      {() => (
                        <ul className="flex flex-col">
                          {notifications.map((n) => (
                            <li key={n.id} className="border-t border-border first:border-t-0">
                              <Link to={n.link ?? '/student/notifications'} className="flex flex-col gap-0.5 py-2.5 hover:bg-subtle">
                                <span className={cx('text-body text-text', !n.read && 'font-semibold')}>{n.title}</span>
                                <time dateTime={n.createdAt} className="text-small text-text-muted">
                                  {formatRelative(n.createdAt)}
                                </time>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </QueryState>
                    <Link to="/student/notifications" className="self-start text-body font-medium text-link hover:underline">
                      {t('All notifications')}
                    </Link>
                  </Card>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <Card padding="none" className="flex flex-col">
                  <h2 className="border-b border-border px-6 py-4 text-card-title text-text">{t('Profile completeness')}</h2>
                  <div className="flex flex-col gap-4 p-6">
                    <div className="flex items-baseline justify-between">
                      <span className="text-kpi font-semibold text-text num">{score.pct}%</span>
                      <span className="text-small text-text-muted">{t('{n} left', { n: score.items.length - score.done })}</span>
                    </div>
                    <ProgressBar value={score.pct} tone="success" />
                    <ul className="flex flex-col gap-2">
                      {score.items.map(([label, ok]) => (
                        <li key={label} className="flex items-center justify-between gap-3 text-small">
                          <span className="text-text-secondary">{t(label)}</span>
                          <span className={cx('font-medium', ok ? 'text-success-fg' : 'text-warning-fg')}>{ok ? t('Done') : t('Missing')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
                <Card padding="lg" className="flex flex-col gap-3">
                  <h2 className="flex items-center gap-2 text-card-title text-text">
                    <CalendarCheck size={20} aria-hidden="true" className="text-text-muted" />
                    {t('My stay')}
                  </h2>
                  {a ? (
                    <>
                      <p className="text-body text-text">{t('Room {room} · Bed {bed}', { room: a.room, bed: a.bed })}</p>
                      <p className="text-small text-text-secondary">{[a.roomTypeName && tr(a.roomTypeName), a.roomClassName && tr(a.roomClassName)].filter(Boolean).join(' · ')}</p>
                      <Button to="/student/room" className="self-start">
                        My Room
                      </Button>
                    </>
                  ) : (
                    <p className="text-body text-text-secondary">{t('No Room assigned yet')}</p>
                  )}
                </Card>
                <Note>Your student details come from the dormitory's student list. If something is wrong, contact the dormitory office.</Note>
              </div>
            </div>
          </>
        )}
      </QueryState>

      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
    </StudentPage>
  )
}
