import { useNavigate } from 'react-router'
import { CircleCheck, CircleX } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Alert, Card, Facts, Note } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime } from '@/lib/format'
import { WizardActions, WizardLayout, useWizard } from './wizard'
import { t, tr } from '@/i18n'

// SCR-APP-01 Application Wizard – 1 Term and eligibility (Figma 14:156)
// GET /applications/eligibility → { term, eligible, checks: [{ title, detail, passed }] }
export default function ApplyTerm() {
  const navigate = useNavigate()
  const wizard = useWizard()
  const { term } = useSession()
  const eligibility = useQuery(['eligibility', term?.id], ({ signal }) => api.applications.eligibility({ termId: term?.id }, { signal }), { enabled: Boolean(term) })
  const info = eligibility.data?.term ?? term

  return (
    <WizardLayout
      wizard={wizard}
      stepKey="term"
      actions={<WizardActions backLabel="Cancel" backTo="/student" showBackIcon={false} onNext={() => navigate(wizard.next('term'))} nextDisabled={!eligibility.data?.eligible} />}
    >
      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <h2 className="text-h3 font-semibold text-fg">{t('Term')}</h2>
        <Facts
          items={[
            ['Term', info?.name ?? '—'],
            ['Stay dates', info?.stayStart ? `${formatDate(info.stayStart)} – ${formatDate(info.stayEnd)}` : '—'],
            ['Registration closes', info?.registrationClosesAt ? formatDateTime(info.registrationClosesAt) : '—'],
            ['Deposit window', info?.depositWindowHours ? t('{n} hours after submit', { n: info.depositWindowHours }) : '—'],
          ]}
        />
        <Note>Registration opens only for the upcoming Term. The Term is set by the dormitory office and cannot be changed here.</Note>
      </Card>

      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-fg">{t('Eligibility check')}</h2>
          {eligibility.data && <Tag tone={eligibility.data.eligible ? 'success' : 'error'}>{eligibility.data.eligible ? t('Eligible') : t('Not eligible')}</Tag>}
        </div>
        <QueryState query={eligibility} compact isEmpty={(d) => !d?.checks?.length}>
          {(data) => (
            <ul className="flex flex-col gap-3">
              {data.checks.map((c) => (
                <li key={c.title} className="flex items-start gap-3">
                  {c.passed ? (
                    <CircleCheck size={20} aria-hidden="true" className="mt-px shrink-0 text-success" />
                  ) : (
                    <CircleX size={20} aria-hidden="true" className="mt-px shrink-0 text-error" />
                  )}
                  <div className="flex flex-col gap-0.5">
                    <p className="text-base font-medium text-fg">{tr(c.title)}</p>
                    {c.detail && <p className="text-sm text-fg-secondary">{tr(c.detail)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>

      <Alert type="info" title="Something looks wrong?" className="shrink-0">
        Your enrollment data comes from FPT student records. Contact the dormitory office before you continue.
      </Alert>
    </WizardLayout>
  )
}
