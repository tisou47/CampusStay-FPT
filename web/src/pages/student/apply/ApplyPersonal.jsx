import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Card, Facts } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { WizardActions, WizardLayout, useWizard } from './wizard'
import { t } from '@/i18n'

// SCR-APP-01 Application Wizard – 3 Personal info (Figma 15:352): the student record and the consent. The wizard asks
// for no contact (R-16): the Application keeps the one on the student's profile.
// GET /students/me/profile → { name, studentCode, gender, major, cohort, hometown, contact }

export default function ApplyPersonal() {
  const navigate = useNavigate()
  const { term } = useSession()
  const wizard = useWizard()
  const { draft, setDraft } = wizard
  const profile = useQuery(['profile'], ({ signal }) => api.me.profile(undefined, { signal }))
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const setConsent = (key) => (e) => setDraft((d) => ({ ...d, consent: { ...d.consent, [key]: e.target.checked } }))
  const complete = draft.consent.matching && draft.consent.rules

  return (
    <WizardLayout
      wizard={wizard}
      stepKey="personal"
      actions={<WizardActions backTo={wizard.prev('personal')} onNext={() => navigate(wizard.next('personal'))} nextDisabled={!complete} />}
    >
      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-fg">{t('From FPT student records')}</h2>
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

      <Card padding="lg" className="flex shrink-0 flex-col items-start gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">{t('Consent')}</h2>
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
