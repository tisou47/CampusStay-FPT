import { useState } from 'react'
import { Download, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { StudentPage } from './shared'
import { t } from '@/i18n'

// SCR-AUTH-17 My data (Decree 13/2023, W3-D3)
// GET /students/me/privacy → { noticeVersion, consent: { version, acceptedAt } | null, consentCurrent,
//   erasure: { id, status, reason, requestedAt, decidedAt, note } | null }
// POST /students/me/privacy/consent { version } · GET /students/me/privacy/export (JSON download)
// POST /students/me/privacy/erasure { reason } → { id, status } (409 ERASURE_PENDING)

export default function MyData() {
  const { notify, notifyError } = useToast()
  const query = useQuery(['privacy', 'me'], ({ signal }) => api.me.privacy({}, { signal }))
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const accept = useMutation((version) => api.me.acceptPrivacy(version), {
    invalidates: ['privacy'],
    onSuccess: () => notify({ title: 'Privacy notice accepted' }),
    onError: (e) => notifyError(e, 'Could not save your answer'),
  })
  const exportData = useMutation(() => api.me.exportData(), {
    onError: (e) => notifyError(e, 'Could not download your data'),
  })
  const erase = useMutation(() => api.me.requestErasure({ reason: reason.trim() || null }), {
    invalidates: ['privacy'],
    onSuccess: () => {
      notify({ title: 'Erasure requested', message: 'A manager decides it. Your data is erased once you hold no bed and no payment is open.' })
      setAsking(false)
      setReason('')
    },
  })
  return (
    <StudentPage breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'My data' }]} title="My data" width="max-w-200">
      <QueryState query={query}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <Card padding="lg" className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
                <ShieldCheck size={20} aria-hidden="true" />
                {t('Privacy notice')}
              </h2>
              <p className="text-base text-fg-secondary">
                {t('CampusStay keeps your details to run your stay and payments, shows them only to dormitory staff, and erases them on request once you no longer hold a Bed or owe money.')}
              </p>
              {d.consentCurrent ? (
                <p className="text-sm text-fg-tertiary">
                  {t('You accepted version {version} on {time}.', { version: d.consent.version, time: formatDateTime(d.consent.acceptedAt) })}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Alert type="info" title={t('Version {version} waits for your answer', { version: d.noticeVersion })}>
                    {t('Read the notice above and accept it to keep using CampusStay.')}
                  </Alert>
                  <div className="flex justify-end">
                    <Button variant="primary" disabled={accept.pending} onClick={() => accept.run(d.noticeVersion)}>
                      Accept the privacy notice
                    </Button>
                  </div>
                </div>
              )}
            </Card>
            <Card padding="lg" className="flex flex-col gap-3">
              <h2 className="text-h3 font-semibold text-fg">{t('Download my data')}</h2>
              <p className="text-base text-fg-secondary">{t('A JSON file with your account, profile, refund account, applications, stays, invoices and requests.')}</p>
              <div className="flex justify-end">
                <Button icon={Download} disabled={exportData.pending} onClick={() => exportData.run()}>
                  Download (JSON)
                </Button>
              </div>
            </Card>
            <Card padding="lg" className="flex flex-col gap-3">
              <h2 className="text-h3 font-semibold text-fg">{t('Erase my data')}</h2>
              {d.erasure && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
                  <StatusTag status={d.erasure.status} />
                  <span>{t('Requested {time}', { time: formatDateTime(d.erasure.requestedAt) })}</span>
                  {d.erasure.note && <span>· {d.erasure.note}</span>}
                </div>
              )}
              <p className="text-base text-fg-secondary">
                {t('A manager decides your request. While you hold a bed, or an invoice or refund is open, your data is kept: the law on accounting needs it.')}
              </p>
              <div className="flex justify-end">
                <Button variant="danger" icon={Trash2} disabled={d.erasure?.status === 'Pending'} onClick={() => setAsking(true)}>
                  Ask to erase my data
                </Button>
              </div>
            </Card>
          </div>
        )}
      </QueryState>
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Ask to erase my data"
        description="Once a manager approves, your name, email, phone, date of birth, emergency contacts and refund account are removed for good and you are signed out."
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Back</Button>
            <Button variant="danger" disabled={erase.pending} onClick={() => erase.run()}>
              Send request
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {erase.error && (
            <Alert type="error" title="Could not send the request">
              {erase.error.message}
            </Alert>
          )}
          <Field label="Reason">
            {(id) => <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </div>
      </Modal>
    </StudentPage>
  )
}
