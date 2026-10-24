import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { BadgeCheck, Ban, GraduationCap, Lock, Pencil, Unlock } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Breadcrumb, Card, CardHeader, DescriptionList } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { accountTone, verificationTone } from './Students'
import { t, tr } from '@/i18n'

// SCR-AUTH-14 Student hub (spec §11.3): profile and verification, account, Bed, Applications, Allocations, Invoices,
// requests and history, with the actions a Manager may take in place.
// GET /student-accounts/:id → { id, name, email, demo, account, profile, verification, residence,
//   sections: { applications, allocations, invoices, requests }, history, actions }
// PUT /student-accounts/:id · POST /student-accounts/:id/verify · POST /student-accounts/:id/reject { reason }
// POST /student-accounts/:id/lock { reason } · POST /student-accounts/:id/unlock

const SECTIONS = [
  ['applications', 'Applications', 'No Applications yet.'],
  ['allocations', 'Beds', 'No Bed allocated yet.'],
  ['invoices', 'Invoices', 'No Invoices yet.'],
  ['requests', 'Requests', 'No requests yet.'],
]

function ReasonModal({ title, description, button, danger, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const send = useMutation(() => onSubmit(reason.trim()), { invalidates: ['student-hub', 'students'], onSuccess: onClose, onError: () => {} })
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!reason.trim() || send.pending} onClick={() => send.run()}>
            {button}
          </Button>
        </>
      }
    >
      {send.error && <Alert type="error" title="Could not save">{send.error.message}</Alert>}
      <Field label="Reason" required helper="The student sees this reason when signing in.">
        {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Modal>
  )
}

function EditModal({ hub, onClose }) {
  const { notify } = useToast()
  const p = hub.profile
  const [form, setForm] = useState({
    name: hub.name,
    studentCode: p.studentCode,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth ?? '',
    major: p.major,
    cohort: p.cohort,
    semester: p.semester ?? '',
    hometown: p.hometown ?? '',
    region: p.region ?? '',
    enrollment: p.enrollment,
    priorityGroups: (p.priorityGroups ?? []).join(', '),
    phone: p.phone ?? '',
  })
  const [fields, setFields] = useState({})
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setFields((f) => ({ ...f, [key]: undefined }))
  }
  const pending = hub.verification.status === 'Pending verification'
  const save = useMutation(
    () =>
      api.students.edit(hub.id, {
        ...form,
        dateOfBirth: form.dateOfBirth || null,
        semester: form.semester === '' ? null : Number(form.semester),
        priorityGroups: form.priorityGroups.split(',').map((g) => g.trim()).filter(Boolean),
      }),
    {
      invalidates: ['student-hub', 'students'],
      onSuccess: () => {
        notify({ title: t('{name} updated', { name: form.name }), message: 'The change is written to the Audit Log.' })
        onClose()
      },
      onError: (err) => setFields(err.fields ?? {}),
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={t('Edit {name}', { name: hub.name })}
      description="Directory fields. Students cannot change them themselves once the account is verified."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.pending} onClick={() => save.run()}>
            Save
          </Button>
        </>
      }
    >
      {save.error && !Object.keys(save.error.fields ?? {}).length && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" error={fields.name}>
          {(id) => <Input id={id} value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Student code" error={fields.studentCode} helper={pending ? null : 'Fixed once the account is verified.'}>
          {(id) => <Input id={id} value={form.studentCode} onChange={set('studentCode')} disabled={!pending} />}
        </Field>
        <Field label="Gender" error={fields.gender}>
          {(id) => <Select id={id} value={form.gender} onChange={set('gender')} options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]} />}
        </Field>
        <Field label="Date of birth" error={fields.dateOfBirth}>
          {(id) => <Input id={id} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />}
        </Field>
        <Field label="Major" error={fields.major} helper="Code or name, e.g. SE.">
          {(id) => <Input id={id} value={form.major} onChange={set('major')} />}
        </Field>
        <Field label="Cohort" error={fields.cohort}>
          {(id) => <Input id={id} value={form.cohort} onChange={set('cohort')} />}
        </Field>
        <Field label="Semester" error={fields.semester}>
          {(id) => <Input id={id} type="number" min={0} max={12} value={form.semester} onChange={set('semester')} />}
        </Field>
        <Field label="Enrollment" error={fields.enrollment}>
          {(id) => (
            <Select id={id} value={form.enrollment} onChange={set('enrollment')} options={['Enrolled', 'Suspended', 'Graduated', 'Withdrawn', 'Not enrolled']} />
          )}
        </Field>
        <Field label="Hometown" error={fields.hometown}>
          {(id) => <Input id={id} value={form.hometown} onChange={set('hometown')} />}
        </Field>
        <Field label="Region" error={fields.region} helper="Code or name, e.g. SOUTHEAST.">
          {(id) => <Input id={id} value={form.region} onChange={set('region')} />}
        </Field>
        <Field label="Priority groups" error={fields.priorityGroups} helper="Keys separated by commas, e.g. FIRST_YEAR.">
          {(id) => <Input id={id} value={form.priorityGroups} onChange={set('priorityGroups')} />}
        </Field>
        <Field label="Phone" error={fields.phone}>
          {(id) => <Input id={id} value={form.phone} onChange={set('phone')} />}
        </Field>
      </div>
    </Modal>
  )
}

function Section({ title, empty, items, linkOf }) {
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title={title} />
      {items.length ? (
        <Table size="sm" bare>
          <THead>
            <tr>
              <Th>Record</Th>
              <Th className="w-40">Status</Th>
              <Th className="w-28">Date</Th>
            </tr>
          </THead>
          <TBody>
            {items.map((item) => {
              const to = linkOf(item)
              return (
                <Tr key={`${item.kind}-${item.id}`}>
                  <Td>
                    <div className="flex flex-col">
                      {to ? (
                        <Link to={to} className="font-medium text-fg-brand hover:underline">
                          {tr(item.title ?? item.id)}
                        </Link>
                      ) : (
                        <span className="font-medium text-fg">{tr(item.title ?? item.id)}</span>
                      )}
                      <span className="text-sm text-fg-tertiary">
                        {[item.detail && tr(item.detail), item.amount != null && formatVnd(item.amount)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <StatusTag status={item.status} />
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(item.at)}</Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      ) : (
        <p className="text-base text-fg-tertiary">{t(empty)}</p>
      )}
    </Card>
  )
}

function Hub({ hub }) {
  const base = useRoleBase()
  const { user } = useSession()
  const { notify } = useToast()
  const [dialog, setDialog] = useState(null) // 'edit' | 'reject' | 'lock'
  const verify = useMutation(() => api.students.verify(hub.id), {
    invalidates: ['student-hub', 'students'],
    onSuccess: () => notify({ title: t('{name} verified', { name: hub.name }), message: 'The student can apply for a Bed now and was told.' }),
    onError: (err) => notify({ type: 'error', title: t('Could not verify'), message: err.message }),
  })
  const unlock = useMutation(() => api.students.unlock(hub.id), {
    invalidates: ['student-hub', 'students'],
    onSuccess: () => notify({ title: t('{name} unlocked', { name: hub.name }), message: 'The student can sign in again.' }),
    onError: (err) => notify({ type: 'error', title: t('Could not unlock'), message: err.message }),
  })
  const p = hub.profile
  const a = hub.actions
  const linkOf = (item) => {
    if (item.kind === 'application' && user?.role === 'manager') return `${base}/applications/${item.id}`
    if (item.kind === 'maintenance' && user?.role !== 'admin') return `${base}/maintenance/${item.id}`
    return null
  }
  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Students', to: `${base}/students` }, { label: hub.name }]} />}
        title={hub.name}
        badge={
          <div className="flex items-center gap-2">
            <Tag tone={verificationTone[hub.verification.status] ?? 'neutral'}>{hub.verification.status}</Tag>
            <Tag tone={accountTone[hub.account.status] ?? 'neutral'}>{hub.account.status}</Tag>
            {hub.demo && <Tag dot={false}>Demo</Tag>}
          </div>
        }
        description={[p?.studentCode, hub.email].filter(Boolean).join(' · ')}
        actions={
          <>
            {a.edit && (
              <Button icon={Pencil} onClick={() => setDialog('edit')}>
                Edit
              </Button>
            )}
            {a.lock && (
              <Button variant="danger-text" icon={Lock} onClick={() => setDialog('lock')}>
                Lock
              </Button>
            )}
            {a.unlock && (
              <Button icon={Unlock} disabled={unlock.pending} onClick={() => unlock.run()}>
                Unlock
              </Button>
            )}
            {a.reject && (
              <Button variant="danger-text" icon={Ban} onClick={() => setDialog('reject')}>
                Reject
              </Button>
            )}
            {a.verify && (
              <Button variant="primary" icon={BadgeCheck} disabled={verify.pending} onClick={() => verify.run()}>
                Verify
              </Button>
            )}
          </>
        }
      />
      {hub.verification.status === 'Pending verification' && (
        <Alert type="warning" title="This student signed up and waits for verification">
          {t('Check the student code, name, gender and date of birth against the student list, then verify or reject the account.')}
        </Alert>
      )}
      {hub.verification.status === 'Profile needed' && (
        <Alert type="info" title="This student has not sent their details yet">
          {t('The student signed up with Google and has not filled in the sign-up form.')}
        </Alert>
      )}
      <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto">
        <div className="flex w-110 shrink-0 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <CardHeader title="Profile" description={p ? t('Source: {source}', { source: t(p.source) }) : null} />
            {p ? (
              <DescriptionList
                columns={2}
                items={[
                  ['Student code', p.studentCode],
                  ['Gender', p.gender === 'M' ? t('Male') : t('Female')],
                  ['Date of birth', p.dateOfBirth ? formatDate(p.dateOfBirth) : '—'],
                  ['Major', p.majorLabel ? tr(p.majorLabel) : p.major],
                  ['Cohort', p.cohort],
                  ['Semester', p.semester ?? '—'],
                  ['Hometown', p.hometown ?? '—'],
                  ['Region', p.regionLabel ? tr(p.regionLabel) : '—'],
                  ['Enrollment', tr(p.enrollment)],
                  ['Priority groups', p.priorityGroups?.length ? p.priorityGroups.join(', ') : '—'],
                  ['Phone', p.phone ?? '—'],
                  ['Emergency contact', p.emergencyName ? `${p.emergencyName} · ${p.emergencyPhone ?? ''}` : '—'],
                ]}
              />
            ) : (
              <p className="text-base text-fg-tertiary">{t('No directory record yet.')}</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <CardHeader title="Account" />
            <DescriptionList
              columns={2}
              items={[
                ['Status', tr(hub.account.status)],
                ['Last sign-in', hub.account.lastSignInAt ? formatDateTime(hub.account.lastSignInAt) : '—'],
                ['Google', hub.account.google ? t('Linked') : t('Not linked')],
                ['CampusStay password', hub.account.passwordSet ? t('Set') : t('Not set')],
                ['Verification', tr(hub.verification.status)],
                [
                  'Verified or rejected',
                  hub.verification.at ? `${formatDateTime(hub.verification.at)}${hub.verification.by ? ` · ${hub.verification.by}` : ''}` : '—',
                ],
              ]}
            />
            {hub.verification.note && <Alert type="error" title="Reason given">{hub.verification.note}</Alert>}
          </Card>
          <Card className="flex flex-col gap-3">
            <CardHeader title="Bed" />
            {hub.residence ? (
              <DescriptionList
                columns={2}
                items={[
                  ['Block', hub.residence.block],
                  ['Room', hub.residence.room],
                  ['Bed', hub.residence.bed],
                  ['Checked in', hub.residence.checkedIn ? t('Yes') : t('Not yet')],
                ]}
              />
            ) : (
              <p className="text-base text-fg-tertiary">{t('No Bed now.')}</p>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {SECTIONS.map(([key, title, empty]) => (
            <Section key={key} title={title} empty={empty} items={hub.sections[key] ?? []} linkOf={linkOf} />
          ))}
          <Card className="flex flex-col gap-3">
            <CardHeader title="History" description="What was done to this account, newest first." />
            {hub.history.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {hub.history.map((h) => (
                  <li key={h.id} className="flex flex-col gap-0.5 py-2">
                    <span className="text-base text-fg">
                      {tr(h.action)} · <span className="text-fg-secondary">{h.actor}</span>
                    </span>
                    <span className="text-sm text-fg-tertiary">
                      {formatDateTime(h.at)}
                      {h.change ? ` · ${h.change}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-fg-tertiary">{t('Nothing recorded yet.')}</p>
            )}
          </Card>
        </div>
      </div>
      {dialog === 'edit' && <EditModal hub={hub} onClose={() => setDialog(null)} />}
      {dialog === 'reject' && (
        <ReasonModal
          title={t('Reject {name}', { name: hub.name })}
          description="The account is locked. The student sees the reason when signing in."
          button="Reject account"
          danger
          onSubmit={async (reason) => {
            await api.students.reject(hub.id, { reason })
            notify({ title: t('{name} rejected', { name: hub.name }), message: 'The account is locked.' })
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'lock' && (
        <ReasonModal
          title={t('Lock {name}', { name: hub.name })}
          description="The student is signed out everywhere and cannot sign in until a Manager unlocks the account."
          button="Lock account"
          danger
          onSubmit={async (reason) => {
            await api.students.lock(hub.id, { reason })
            notify({ title: t('{name} locked', { name: hub.name }), message: 'The student is signed out.' })
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

export default function StudentHub() {
  const { id } = useParams()
  const base = useRoleBase()
  const query = useQuery(['student-hub', id], ({ signal }) => api.students.hub(id, { signal }))
  if (query.data) return <Hub hub={query.data} />
  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: 'Students', to: `${base}/students` }, { label: t('Student') }]} />} title="Student" />
      {query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={GraduationCap} title="Student not found" action={<Button to={`${base}/students`}>Back to students</Button>} />
      ) : (
        <ErrorState error={query.error} onRetry={query.reload} />
      )}
    </>
  )
}
