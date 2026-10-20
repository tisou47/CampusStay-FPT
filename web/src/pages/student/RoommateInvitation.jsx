import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, CircleCheck, Clock, CreditCard, FileText, Users, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { StudentContainer } from '@/components/layout/StudentLayout'
import { Button } from '@/components/ui/Button'
import { Card, DetailRows, Note } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'

// SCR-APP-04 Roommate Invitation (Figma 40:1439) — centred 720 px card.
// GET /students/me/roommate-invitation → { invitation: { id, fromName, expiresAt, termName, stayStart, stayEnd,
//   roomTypeName, roomClassName, surchargeRate, termPrice, deposit, depositWindowHours, registrationClosesAt } | null }
// POST /roommate-invitations/:id/respond { accept } → { applicationId, depositInvoiceId }

const steps = [
  [FileText, 'Confirm your contact details and matching consent'],
  [CreditCard, 'Pay your own deposit with VietQR'],
  [CircleCheck, 'When both deposits are paid, both Applications go to the dormitory office together'],
]

function useTimeLeft(iso) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!iso) return null
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000))
  const h = Math.floor(minutes / 60)
  return minutes === 0 ? 'Expired' : h ? `${h} h ${minutes % 60} min` : `${minutes} min`
}

function Invitation({ inv }) {
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const left = useTimeLeft(inv.expiresAt)
  const firstName = inv.fromName?.trim().split(/\s+/).at(-1)
  const respond = useMutation((accept) => api.roommateInvitations.respond(inv.id, { accept }), {
    invalidates: ['home', 'applications', 'invoices', 'notifications'],
    onSuccess: (result, accept) => {
      if (accept) {
        notify({ title: 'Invitation accepted', message: 'Pay your deposit so both Applications reach the dormitory office.' })
        navigate(result?.depositInvoiceId ? `/student/invoices/${result.depositInvoiceId}/pay` : '/student/applications')
      } else {
        notify({ type: 'info', title: 'Invitation declined', message: `${firstName ?? 'The other Student'} only sees that the invitation was not accepted.` })
        navigate('/student')
      }
    },
    onError: (e) => notifyError(e, 'Could not send your answer'),
  })

  return (
    <Card className="mx-auto flex max-h-full w-full max-w-180 flex-col gap-4 overflow-y-auto p-8">
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-fg-brand">
          <Users size={24} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-fg-tertiary">Roommate invitation</p>
          <h1 className="text-h2 font-semibold text-fg">
            {inv.fromName} invited you to share a {inv.roomTypeName} Room
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-warning-bg p-4">
        <Clock size={20} aria-hidden="true" className="shrink-0 text-warning" />
        <div className="flex flex-col">
          <p className="text-base font-medium text-warning-fg">{left === 'Expired' ? 'This invitation has expired' : `Answer within ${left}`}</p>
          <p className="text-sm text-fg-secondary">The invitation expires at {formatDateTime(inv.expiresAt)}</p>
        </div>
      </div>

      <DetailRows
        rowClassName="py-2.5 border-b border-line"
        rows={[
          ['Term', `${inv.termName}${inv.stayStart ? ` · ${formatDate(inv.stayStart)} – ${formatDate(inv.stayEnd)}` : ''}`],
          ['Room Type', `${inv.roomTypeName} (shared with ${inv.fromName})`],
          ['Room Class', `${inv.roomClassName}${inv.surchargeRate != null ? ` (+${Math.round(inv.surchargeRate * 100)}%)` : ''}`],
          ['Your Term price per Bed', formatVnd(inv.termPrice)],
          [
            'Your deposit',
            <span className="font-medium text-fg-brand">
              {formatVnd(inv.deposit)}
              {inv.depositWindowHours ? ` · within ${inv.depositWindowHours} hours after you accept` : ''}
            </span>,
          ],
        ]}
      />

      <p className="text-base font-medium text-fg">If you accept</p>
      <ol className="flex flex-col gap-2">
        {steps.map(([Glyph, text]) => (
          <li key={text} className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
              <Glyph size={16} aria-hidden="true" />
            </span>
            <span className="text-base text-fg">{text}</span>
          </li>
        ))}
      </ol>

      <Note>
        Declining is private: {firstName ?? 'they'} only see that the invitation was not accepted. You can still apply on your own
        {inv.registrationClosesAt ? ` before ${formatDateTime(inv.registrationClosesAt)}` : ''}.
      </Note>

      <div className="flex justify-end gap-3">
        <Button size="lg" icon={X} onClick={() => respond.run(false)} disabled={respond.pending || left === 'Expired'}>
          Decline
        </Button>
        <Button variant="primary" size="lg" icon={Check} onClick={() => respond.run(true)} disabled={respond.pending || left === 'Expired'}>
          Accept invitation
        </Button>
      </div>
    </Card>
  )
}

export default function RoommateInvitation() {
  const query = useQuery(['roommate-invitation'], ({ signal }) => api.me.roommateInvitation(undefined, { signal }))
  return (
    <StudentContainer className="flex h-full min-h-0 flex-col justify-center py-6">
      {!query.data?.invitation && <h1 className="sr-only">Roommate invitation</h1>}
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !query.data?.invitation ? (
        <EmptyBlock icon={Users} title="No roommate invitation" action={<Button to="/student">Back to Home</Button>}>
          When another Student invites you to share a 2-bed Room, the invitation appears here.
        </EmptyBlock>
      ) : (
        <Invitation inv={query.data.invitation} />
      )}
    </StudentContainer>
  )
}
