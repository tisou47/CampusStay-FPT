import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { BadgeCheck, Clock, Send } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Facts } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { formatDate } from '@/lib/format'
import { StudentPage } from './shared'
import { t } from '@/i18n'
import { DateInput } from '@/components/ui/DatePicker'

// SCR-AUTH-06 Student sign-up form and verification (ADR-26, spec §6.1)
// A student whose Google account is not in the imported student list sends these details once; a Manager then
// verifies the account. Until the form is sent every portal page leads here (API: 403 PROFILE_REQUIRED).
// GET /students/me/verification → { status, locked, note, form: { studentCode, name, gender, dateOfBirth, major,
//   cohort, phone }, options: { genders, majors } }
// PUT /students/me/verification { studentCode, name, gender, dateOfBirth, major, cohort, phone } → 204
// (400 per field, 409 ALREADY_VERIFIED)

const statusTone = { Verified: 'success', 'Pending verification': 'warning', 'Profile needed': 'info' }

function DetailsForm({ data, onSent }) {
  const { notify } = useToast()
  const [form, setForm] = useState(() => ({ ...data.form, dateOfBirth: data.form.dateOfBirth ?? '' }))
  const [fields, setFields] = useState({})
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setFields((f) => ({ ...f, [key]: undefined }))
  }
  const first = data.status === 'Profile needed'
  const send = useMutation(
    () =>
      api.me.sendVerification({
        studentCode: form.studentCode?.trim(),
        name: form.name?.trim(),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth || null,
        major: form.major,
        cohort: form.cohort?.trim(),
        phone: form.phone?.trim(),
      }),
    {
      invalidates: ['verification'],
      onSuccess: () => {
        notify({
          title: first ? t('Details sent') : t('Details updated'),
          message: 'A Manager checks them against the student list and verifies your account.',
        })
        onSent(first)
      },
      onError: (err) => setFields(err.fields ?? {}),
    },
  )
  const ready = ['studentCode', 'name', 'gender', 'dateOfBirth', 'major', 'cohort', 'phone'].every((k) => String(form[k] ?? '').trim())
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-fg">{first ? t('Your student details') : t('Correct your details')}</h2>
      {send.error && !Object.keys(send.error.fields ?? {}).length && (
        <Alert type="error" title="Could not send your details">
          {send.error.message}
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Student code" required error={fields.studentCode} helper="Two letters and six digits, as on your student card.">
          {(id) => <Input id={id} value={form.studentCode ?? ''} onChange={set('studentCode')} placeholder="SE190421" autoCapitalize="characters" />}
        </Field>
        <Field label="Full name" required error={fields.name} helper="As in the FPT student records, with accents.">
          {(id) => <Input id={id} value={form.name ?? ''} onChange={set('name')} autoComplete="name" />}
        </Field>
        <Field label="Gender" required error={fields.gender}>
          {(id) => (
            <Select
              id={id}
              value={form.gender ?? ''}
              onChange={set('gender')}
              options={[{ value: '', label: 'Choose…' }, ...data.options.genders.map((g) => ({ value: g.value, label: g.label }))]}
            />
          )}
        </Field>
        <Field label="Date of birth" required error={fields.dateOfBirth}>
          {(id) => <DateInput id={id} value={form.dateOfBirth ?? ''} onChange={set('dateOfBirth')} />}
        </Field>
        <Field label="Major" required error={fields.major}>
          {(id) => (
            <Select
              id={id}
              value={form.major ?? ''}
              onChange={set('major')}
              options={[{ value: '', label: 'Choose…' }, ...data.options.majors.map((m) => ({ value: m.value, label: m.label }))]}
            />
          )}
        </Field>
        <Field label="Cohort" required error={fields.cohort} helper="For example K19.">
          {(id) => <Input id={id} value={form.cohort ?? ''} onChange={set('cohort')} placeholder="K19" autoCapitalize="characters" />}
        </Field>
        <Field label="Phone" required error={fields.phone}>
          {(id) => <Input id={id} type="tel" inputMode="tel" value={form.phone ?? ''} onChange={set('phone')} autoComplete="tel" />}
        </Field>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:justify-end">
        <Button variant="primary" size="lg" icon={Send} disabled={!ready || send.pending} onClick={() => send.run()}>
          {first ? t('Send for verification') : t('Save changes')}
        </Button>
      </div>
    </Card>
  )
}

export default function Verification() {
  const navigate = useNavigate()
  const { refreshUser } = useSession()
  const query = useQuery(['verification'], ({ signal }) => api.me.verification({}, { signal }))
  const status = query.data?.status

  // The session learns the new status, so the portal opens once the form is sent.
  useEffect(() => {
    if (status && status !== 'Profile needed') refreshUser().catch(() => {})
  }, [status, refreshUser])

  return (
    <StudentPage
      breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'Account verification' }]}
      title="Account verification"
      description="CampusStay checks every student account against the student list before you can apply for a Bed."
      badge={status && <Tag tone={statusTone[status] ?? 'neutral'}>{status}</Tag>}
      width="max-w-200"
    >
      <QueryState query={query}>
        {(data) => (
          <div className="flex flex-col gap-4">
            {data.status === 'Profile needed' && (
              <Alert type="info" title="Your account was not found in the student list">
                {t('Send your details below. A Manager checks them and verifies your account; you can look around meanwhile, and apply once it is verified.')}
              </Alert>
            )}
            {data.status === 'Pending verification' && (
              <Alert type="warning" title="Waiting for a Manager">
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={16} aria-hidden="true" />
                  {t('Your details were sent. You can apply for a Bed once a Manager verifies your account. You can still correct them below.')}
                </span>
              </Alert>
            )}
            {data.locked ? (
              <Card padding="lg" className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <BadgeCheck size={20} aria-hidden="true" className="text-success" />
                  <h2 className="text-h3 font-semibold text-fg">{t('Your account is verified')}</h2>
                </div>
                <Facts
                  items={[
                    ['Student code', data.form.studentCode ?? '—'],
                    ['Full name', data.form.name ?? '—'],
                    ['Gender', data.form.gender === 'M' ? 'Male' : data.form.gender === 'F' ? 'Female' : '—'],
                  ]}
                />
                <Facts
                  items={[
                    ['Date of birth', data.form.dateOfBirth ? formatDate(data.form.dateOfBirth) : '—'],
                    ['Major', data.options.majors.find((m) => m.value === data.form.major)?.label ?? data.form.major ?? '—'],
                    ['Cohort', data.form.cohort ?? '—'],
                  ]}
                />
                <p className="text-sm text-fg-tertiary">{t('These details come from the student list. Ask a Manager to correct them.')}</p>
              </Card>
            ) : (
              <DetailsForm
                data={data}
                onSent={async (first) => {
                  await refreshUser().catch(() => {})
                  if (first) navigate('/student', { replace: true })
                }}
              />
            )}
          </div>
        )}
      </QueryState>
    </StudentPage>
  )
}
