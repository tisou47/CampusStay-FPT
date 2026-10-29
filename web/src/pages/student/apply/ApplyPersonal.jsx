import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Card, Facts } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { WizardActions, WizardLayout, useProfileDefaults, useWizard } from './wizard'
import { t } from '@/i18n'

// SCR-APP-01 Application Wizard – 3 Personal info (Figma 15:352)
// GET /students/me/profile → { name, studentCode, gender, major, cohort, hometown, contact }
const required = ['phone', 'emergencyName', 'relationship', 'emergencyPhone']

export default function ApplyPersonal() {
  const navigate = useNavigate()
  const { term } = useSession()
  const wizard = useWizard()
  const { draft, setDraft, catalog } = wizard
  const profile = useProfileDefaults(wizard)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const contact = draft.contact ?? {}
  const setContact = (key) => (e) => setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: e.target.value } }))
  const setConsent = (key) => (e) => setDraft((d) => ({ ...d, consent: { ...d.consent, [key]: e.target.checked } }))
  const complete = required.every((k) => String(contact[k] ?? '').trim()) && draft.consent.matching && draft.consent.rules

  return (
    <WizardLayout
      wizard={wizard}
      stepKey="personal"
      actions={<WizardActions backTo={wizard.prev('personal')} onNext={() => navigate(wizard.next('personal'))} nextDisabled={!complete} />}
    >
      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-card-title text-fg">{t('From FPT student records')}</h2>
          <Tag>Read-only</Tag>
        </div>
        <QueryState query={profile} compact>
          {(p) => (
            <div className="flex flex-col gap-4">
              <Facts
                items={[
                  ['Full name', p.name ?? '—'],
                  ['Student code', p.studentCode ?? '—'],
                  ['Gender', p.gender ?? '—'],
                ]}
              />
              <Facts
                items={[
                  ['Major', p.major ?? '—'],
                  ['Cohort', p.cohort ?? '—'],
                  ['Hometown', p.hometown ?? '—'],
                ]}
              />
            </div>
          )}
        </QueryState>
      </Card>

      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <h2 className="text-card-title text-fg">{t('Contact and emergency contact')}</h2>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          <Field label="Phone number" required className="flex-1">
            {(id) => <Input id={id} size="lg" type="tel" value={contact.phone ?? ''} onChange={setContact('phone')} />}
          </Field>
          <Field label="Personal email" className="flex-1">
            {(id) => <Input id={id} size="lg" type="email" value={contact.email ?? ''} onChange={setContact('email')} />}
          </Field>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          <Field label="Emergency contact name" required className="flex-1">
            {(id) => <Input id={id} size="lg" value={contact.emergencyName ?? ''} onChange={setContact('emergencyName')} />}
          </Field>
          <Field label="Relationship" required className="flex-1">
            {(id) => (
              <Select
                id={id}
                size="lg"
                value={contact.relationship ?? ''}
                onChange={setContact('relationship')}
                options={[{ value: '', label: 'Choose…', disabled: true }, ...(catalog.data?.relationships ?? [])]}
              />
            )}
          </Field>
          <Field label="Emergency contact phone" required className="flex-1">
            {(id) => <Input id={id} size="lg" type="tel" value={contact.emergencyPhone ?? ''} onChange={setContact('emergencyPhone')} />}
          </Field>
        </div>
      </Card>

      <Card padding="lg" className="flex shrink-0 flex-col items-start gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-card-title text-fg">{t('Consent')}</h2>
          <p className="text-sm text-fg-tertiary">{t('Required under the Personal Data Protection Law 91/2025/QH15.')}</p>
        </div>
        <Checkbox
          label={term ? t('I agree that CampusStay uses my gender, major and hometown to match roommates for {term}.', { term: term.name }) : t('I agree that CampusStay uses my gender, major and hometown to match roommates.')}
          checked={draft.consent.matching}
          onChange={setConsent('matching')}
        />
        <Checkbox label="I have read the dormitory rules and the Privacy Notice." checked={draft.consent.rules} onChange={setConsent('rules')} />
        <Button variant="text" onClick={() => setPrivacyOpen(true)}>
          Read the Privacy Notice
        </Button>
      </Card>

      <Modal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="Privacy Notice"
        description="CampusStay FPT"
        width={560}
        footer={
          <Button variant="primary" onClick={() => setPrivacyOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-3 text-base text-fg-secondary">
          <p>{t('CampusStay processes your name, student code, gender, major, cohort, hometown and contact details to review your Application, match roommates and assign a Room and Bed.')}</p>
          <p>{t('Matching data (gender, major, hometown) is used only for the Term you apply for. The dormitory office keeps Application records for the period required by FPT University regulations, then deletes them.')}</p>
          <p>{t('You can ask the dormitory office to see, correct or withdraw consent for your data at any time, as set out in the Personal Data Protection Law 91/2025/QH15 and Decree 356/2025/NĐ-CP.')}</p>
        </div>
      </Modal>
    </WizardLayout>
  )
}
