import { useState } from 'react'
import { Bed, Calendar, CreditCard, Repeat, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { StatusTag } from '@/components/ui/Tag'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import { InfoRow } from './RoomAccessAndFinance'

/**
 * The next Term (spec §6.10): where the student stays, the Stay's Terms left, the next-Term fee, and while the
 * requests window is open the requests that change it (extension, end of stay, room change, swap, Room Class).
 */
export function NextTermCard({ data }) {
  const n = data.nextTerm
  const { notify } = useToast()
  const [extending, setExtending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [terms, setTerms] = useState('1')
  const [reason, setReason] = useState('')
  const done = (r) => {
    notify({ title: r.automatic ? 'Request approved' : 'Request sent', message: tr(r.note) })
    setExtending(false)
    setEnding(false)
    setReason('')
  }
  const extend = useMutation(() => api.stay.extend({ terms: Number(terms), reason: reason.trim() || undefined }), {
    invalidates: ['allocation', 'requests', 'home'],
    onSuccess: done,
    onError: () => {},
  })
  const end = useMutation(() => api.stay.end({ reason: reason.trim() || undefined }), {
    invalidates: ['allocation', 'requests', 'home'],
    onSuccess: done,
    onError: () => {},
  })
  if (!n) {
    return (
      <Card padding="lg" className="flex shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Repeat size={16} aria-hidden="true" className="text-fg-secondary" />
            <h2 className="text-h3 font-semibold text-fg">{t('Next term plan')}</h2>
          </div>
          <StatusTag status="Upcoming" tone="neutral" />
        </div>
        <p className="text-sm text-fg-secondary">
          {t('Registration for the next term is not open yet. You will be notified when extension, room change, and swap requests become available before the current term ends.')}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="default" size="sm" icon={Repeat} to="/student/requests">
            {t('View submitted requests')}
          </Button>
          <Button variant="text" size="sm" to="/student/requests/room-change/new">
            {t('Room change info')}
          </Button>
        </div>
      </Card>
    )
  }
  const w = n.window
  const filing = Boolean(w?.filing)
  // The longest stay comes from the server (stay.max_terms), not a number written here (WEB-STU-06).
  const maxTerms = data.stay?.maxTerms ?? 9
  const left = Math.max(1, maxTerms - (data.stay?.committedTerms ?? 1))

  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-fg">{t('Next term · {term}', { term: n.term?.name })}</h2>
        <StatusTag status={n.state} />
      </div>
      {n.state === 'Not continuing' ? (
        <Alert type="warning" title="No bed for the next term">
          {t('Reason: {reason}.', { reason: tr(n.endReason) })} {n.checkOutBy && t('Check out at the desk by {date}.', { date: formatDate(n.checkOutBy) })}
        </Alert>
      ) : (
        <>
          <InfoRow icon={Bed} label="Your bed next term" value={`${t('{room} · Bed {bed}', { room: n.room, bed: n.bed })} · ${tr(n.roomTypeName)} · ${tr(n.roomClassName)}`} />
          {n.termPrice != null && <InfoRow icon={CreditCard} label="Next-term fee" value={formatVnd(n.termPrice)} />}
          {n.state === 'Awaiting extension' ? (
            <Alert type="warning" title="This is the last term of your stay">
              {t('Ask for an extension before {date} to keep your bed. Otherwise it is released and you check out at the end of this term.', { date: formatDateTime(w?.closesAt) })}
            </Alert>
          ) : (
            <p className="text-sm text-fg-secondary">{t('Terms left on your stay after this one: {n}', { n: n.termsLeft })}</p>
          )}
          {n.fee && (
            <div className="flex flex-col gap-2.5 rounded-lg bg-subtle px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-base font-semibold whitespace-nowrap text-fg tabular">{formatVnd(n.fee.amount)}</span>
                {n.fee.status === 'Unpaid' ? (
                  <span className="text-sm whitespace-nowrap text-fg-secondary tabular">{t('Due {date}', { date: formatDateTime(n.fee.dueAt) })}</span>
                ) : (
                  <StatusTag status={n.fee.status} />
                )}
              </div>
              {n.fee.status === 'Unpaid' && (
                <Button variant="primary" size="lg" icon={CreditCard} block to={`/student/invoices/${n.fee.invoiceId}/pay`}>
                  Pay next-term fee
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {w && (
        <p className="text-sm text-fg-tertiary">
          {filing
            ? t('Requests for the next term are open until {date}.', { date: formatDateTime(w.closesAt) })
            : t('Requests for the next term closed on {date}.', { date: formatDateTime(w.closesAt) })}
        </p>
      )}
      {filing && n.state !== 'Not continuing' && (
        <div className="flex flex-col gap-2 pt-1">
          <Button variant={n.state === 'Awaiting extension' ? 'primary' : 'default'} size="lg" block icon={Calendar} onClick={() => setExtending(true)}>
            Extend my stay
          </Button>
          {n.state === 'Continuing' && (
            <>
              <Button tip="Ask for another room from next term. Staff decide; nothing is charged now." size="md" block icon={Repeat} to="/student/requests/room-change/new">
                Change room next term
              </Button>
              <Button tip="Invite another resident to exchange beds with you from next term." size="md" block icon={Users} to="/student/requests/swap/new">
                Swap beds for next term
              </Button>
            </>
          )}
          <Button tip="Leave the dormitory when this term ends. You keep your bed until then." variant="text" size="sm" block onClick={() => setEnding(true)}>
            End my stay after this term
          </Button>
        </div>
      )}

      <Modal
        open={extending}
        onClose={() => setExtending(false)}
        title="Extend my stay"
        footer={
          <>
            <Button onClick={() => setExtending(false)}>Cancel</Button>
            <Button variant="primary" disabled={extend.pending} onClick={() => extend.run()}>
              {extend.pending ? t('Sending…') : t('Extend')}
            </Button>
          </>
        }
      >
        {extend.error && <Alert type="error" title="Could not extend">{extend.error.details?.fields?.terms ?? extend.error.message}</Alert>}
        <Field label="Terms to add" required>
          {(id) => <Select id={id} value={terms} onChange={(e) => setTerms(e.target.value)} options={Array.from({ length: left }, (_, i) => ({ value: String(i + 1), label: t('{n} terms', { n: i + 1 }) }))} />}
        </Field>
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <Note>Approved at once when you are enrolled and owe nothing overdue; otherwise staff decide. Each term is still billed on its own.</Note>
      </Modal>

      <Modal
        open={ending}
        onClose={() => setEnding(false)}
        title="End my stay after this term"
        footer={
          <>
            <Button onClick={() => setEnding(false)}>Keep my bed</Button>
            <Button variant="danger" disabled={end.pending} onClick={() => end.run()}>
              {end.pending ? t('Sending…') : t('End my stay')}
            </Button>
          </>
        }
      >
        {end.error && <Alert type="error" title="Could not end the stay">{end.error.message}</Alert>}
        <p className="text-base text-fg-secondary">
          {t('Your bed for {term} is released at once. You check out at the desk by {date}; the utility deposit is settled then. Nothing is charged for ending now.', {
            term: n.term?.name,
            date: formatDate(w?.checkOutBy ?? n.checkOutBy) || t('the check-out day'),
          })}
        </p>
        <Field label="Reason (optional)">{(id) => <Textarea id={id} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </Modal>
    </Card>
  )
}
