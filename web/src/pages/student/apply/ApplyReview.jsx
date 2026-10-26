import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Pencil } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card, Facts } from '@/components/ui/Display'
import { formatDateTime, formatVnd } from '@/lib/format'
import { WizardActions, WizardLayout, classLabel, clearDraft, isTwoBed, roommateLabel, stepPaths, useWizard } from './wizard'
import { t, tr } from '@/i18n'

// SCR-APP-01 Application Wizard – 4 Review and submit (Figma 15:580)
// POST /applications → { id, depositInvoiceId, depositDueAt }

function SectionHead({ title, editTo }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-h3 font-semibold text-fg">{t(title)}</h2>
      {editTo && (
        <Button variant="text" icon={Pencil} onClick={() => navigate(editTo)}>
          Edit
        </Button>
      )}
    </div>
  )
}

export default function ApplyReview() {
  const navigate = useNavigate()
  const { term } = useSession()
  const { notify } = useToast()
  const wizard = useWizard()
  const { draft, helpers, roomType } = wizard
  const [confirmed, setConfirmed] = useState(false)
  const { deposit } = helpers.breakdown(draft.roomTypeId, draft.roomClassId)
  const contact = draft.contact ?? {}
  const prefs = draft.roommate.preferences ?? {}
  const twoBed = isTwoBed(roomType)
  const usePrefs = twoBed && draft.roommate.mode === 'auto' && draft.roommate.preferencesOn

  const submit = useMutation(
    () =>
      api.applications.create({
        termId: term?.id,
        roomTypeId: draft.roomTypeId,
        roomClassId: draft.roomClassId,
        roommate: twoBed
          ? {
              mode: draft.roommate.mode,
              studentCode: draft.roommate.mode === 'invite' ? draft.roommate.verifiedCode : undefined,
              preferences: usePrefs ? prefs : undefined,
            }
          : undefined,
        contact,
        consent: draft.consent,
        stayTerms: draft.stayTerms ?? 1,
      }),
    {
      onSuccess: (result) => {
        clearDraft()
        invalidate('home', 'applications', 'invoices')
        notify({
          title: 'Application submitted',
          message: result.depositDueAt
            ? t('{id} is waiting for the deposit. Pay by {date}.', { id: result.id, date: formatDateTime(result.depositDueAt) })
            : t('{id} is waiting for the deposit.', { id: result.id }),
        })
        navigate(result.depositInvoiceId ? `/student/invoices/${result.depositInvoiceId}/pay` : '/student/applications')
      },
      onError: () => {},
    },
  )

  const missing = !draft.roomTypeId || !draft.roomClassId || !contact.phone || !draft.consent.matching || !draft.consent.rules || (twoBed && !roommateLabel(draft, roomType))

  return (
    <WizardLayout
      wizard={wizard}
      stepKey="review"
      actions={
        <WizardActions
          backTo={wizard.prev('review')}
          onNext={() => submit.run()}
          nextLabel={submit.pending ? 'Submitting…' : 'Submit and pay deposit'}
          nextDisabled={!confirmed || missing || submit.pending}
        />
      }
    >
      {submit.error && (
        <Alert type="error" title="Could not submit the Application" className="shrink-0">
          {submit.error.message}
        </Alert>
      )}
      {missing && (
        <Alert type="warning" title="Some answers are missing" className="shrink-0">
          Go back and complete every step before you submit.
        </Alert>
      )}

      <Card className="flex shrink-0 flex-col gap-3">
        <SectionHead title="Term and Room preference" editTo={stepPaths.room} />
        <Facts
          items={[
            ['Term', term?.name ?? '—'],
            ['Room Type', roomType?.name ?? '—'],
            ['Room Class', classLabel(helpers.roomClass(draft.roomClassId)) ?? '—'],
            ['Roommate', roommateLabel(draft, roomType) ?? '—'],
            ['Gia hạn', t((draft.stayTerms ?? 1) === 1 ? '{n} Term' : '{n} Terms', { n: draft.stayTerms ?? 1 })],
          ]}
        />
        {usePrefs && (
          <Facts
            items={[
              ['Roommate preferences', 'Free add-on'],
              ['Region', prefs.region ?? '—'],
              ['Semester', prefs.semester ?? '—'],
              ['Major', prefs.major ?? '—'],
            ]}
          />
        )}
      </Card>

      <Card className="flex shrink-0 flex-col gap-3">
        <SectionHead title="Personal info" editTo={stepPaths.personal} />
        <Facts
          items={[
            ['Phone number', contact.phone || '—'],
            ['Personal email', contact.email || '—'],
            ['Emergency contact', contact.emergencyName ? `${contact.emergencyName}${contact.relationship ? ` (${tr(contact.relationship)})` : ''}` : '—'],
            ['Consent', draft.consent.matching && draft.consent.rules ? 'Given' : 'Not given'],
          ]}
        />
      </Card>

      <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-orange-200 bg-brand-subtle p-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-col gap-0.5">
            <p className="text-base font-medium text-fg-secondary">{t('Deposit to pay after submit')}</p>
            <p className="text-kpi font-semibold text-fg">{deposit != null ? formatVnd(deposit) : '—'}</p>
          </div>
          {term?.depositWindowHours && (
            <p className="text-base font-medium text-fg">{t('Pay within {n} hours', { n: term.depositWindowHours })}</p>
          )}
        </div>
        <p className="text-base text-fg-secondary">
          {t('Your Application reaches the dormitory office only after the deposit is paid. Unpaid Applications expire at the deadline.')}
        </p>
        <Checkbox label="I confirm the information above is correct." checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
      </section>

      <Alert type="warning" title="Room Type and Room Class are locked after submit" className="shrink-0">
        {term?.registrationClosesAt
          ? t('To change them, cancel this Application and apply again before {date}.', { date: formatDateTime(term.registrationClosesAt) })
          : t('To change them, cancel this Application and apply again while registration is open.')}
      </Alert>
    </WizardLayout>
  )
}
