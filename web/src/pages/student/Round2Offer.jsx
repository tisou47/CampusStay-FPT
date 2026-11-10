import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bed } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { cx } from '@/lib/cx'
import { formatDateTime, formatVnd } from '@/lib/format'
import { RefundAccountFields, useRefundAccount } from './refundAccount'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-ASG-02 Round 2 Offer (Figma 102:2059) — a Student who was not placed in Round 1.
// GET /students/me/round2-offer → { offer: { id, expiresAt, termName,
//   application: { id, roomTypeName, roomClassName, termPrice, depositPaid },
//   options: [{ id, roomTypeName, roomClassName, block, note, fill, termPrice, difference }] } | null }
// POST /round2-offers/:id/respond { accept, optionId } → { balanceInvoiceId }

const signed = (n) => (!n ? formatVnd(0) : `${n > 0 ? '+' : '−'} ${formatVnd(Math.abs(n))}`)

function Offer({ offer }) {
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const [selected, setSelected] = useState(offer.options[0]?.id)
  const [declining, setDeclining] = useState(false)
  const account = useRefundAccount()
  const app = offer.application
  const respond = useMutation((accept) => api.round2Offers.respond(offer.id, { accept, optionId: accept ? selected : undefined }), {
    invalidates: ['home', 'applications', 'invoices', 'allocation'],
    onSuccess: (result, accept) => {
      if (accept) {
        const o = offer.options.find((x) => x.id === selected)
        notify({ title: 'Offer accepted', message: t('{type} · {cls}. Pay the balance to keep it.', { type: tr(o?.roomTypeName), cls: tr(o?.roomClassName) }) })
        navigate(result?.balanceInvoiceId ? `/student/invoices/${result.balanceInvoiceId}/pay` : '/student/room')
      } else {
        setDeclining(false)
        notify({ type: 'info', title: 'Refund requested', message: t('{id} is cancelled. The deposit is refunded after Manager approval.', { id: app.id }) })
        navigate('/student')
      }
    },
    onError: (e) => notifyError(e, 'Could not send your answer'),
  })

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Alert type="info" title="You were not placed in Round 1" className="shrink-0">
          {t('No {type} {cls} Room could be filled with matching roommates. Your deposit stays with this Application.', { type: tr(app.roomTypeName), cls: tr(app.roomClassName) })}
        </Alert>

        <Card padding="lg" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 flex-col gap-1">
            <h2 className="text-h3 font-semibold text-fg">{t('Pick a free Bed in a partly filled Room')}</h2>
            <p className="text-base text-fg-secondary">{t('Offers are held until {date}. You choose a Room Type and Class; the system picks the Bed.', { date: formatDateTime(offer.expiresAt) })}</p>
          </div>
          <Table fill>
            <THead>
              <tr>
                <Th className="w-11.5">
                  <span className="sr-only">{t('Select')}</span>
                </Th>
                <Th>Room Type and Class</Th>
                <Th className="w-33">Room fill</Th>
                <Th className="w-38">Term price</Th>
                <Th className="w-38">Difference</Th>
              </tr>
            </THead>
            <TBody>
              {offer.options.map((o) => {
                const active = selected === o.id
                return (
                  <Tr key={o.id} selected={active} onClick={() => setSelected(o.id)}>
                    <Td className="py-2.5">
                      <input
                        type="radio"
                        name="offer"
                        aria-label={`${o.roomTypeName} ${o.roomClassName}`}
                        checked={active}
                        onChange={() => setSelected(o.id)}
                        className="block size-4 appearance-none rounded-full border border-line-strong bg-surface checked:border-[5px] checked:border-primary"
                      />
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {tr(o.roomTypeName)} · {tr(o.roomClassName)}
                        </span>
                        <span className="text-sm text-fg-tertiary">{[o.block && t('Block {code}', { code: o.block }), tr(o.note)].filter(Boolean).join(' · ')}</span>
                      </div>
                    </Td>
                    <Td>{tr(o.fill)}</Td>
                    <Td>{formatVnd(o.termPrice)}</Td>
                    <Td className={cx(active && 'font-medium text-fg-brand')}>{signed(o.difference)}</Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
          <p className="shrink-0 text-sm text-fg-tertiary">
            {t('The difference is added to or taken from your balance. If you decline or do not reply, the Application is cancelled and your deposit is refunded after Manager approval.')}
          </p>
        </Card>

        <div className="flex shrink-0 justify-end gap-3">
          <Button variant="danger" size="lg" onClick={() => setDeclining(true)} disabled={respond.pending}>
            Decline and request refund
          </Button>
          <Button variant="primary" size="lg" onClick={() => respond.run(true)} disabled={!selected || respond.pending}>
            Accept offer
          </Button>
        </div>
      </div>

      <Card padding="lg" className="flex w-full shrink-0 flex-col lg:w-90 gap-3 self-start">
        <h2 className="text-h3 font-semibold text-fg">{app.id}</h2>
        {[
          ['Applied for', `${tr(app.roomTypeName)} · ${tr(app.roomClassName)}`],
          ['Deposit paid', formatVnd(app.depositPaid)],
          ['Status', 'Round 2 offer'],
        ].map(([l, v]) => (
          <div key={l} className="flex justify-between text-base">
            <span className="text-fg-secondary">{t(l)}</span>
            <span className="text-fg">{tr(v)}</span>
          </div>
        ))}
      </Card>

      <Modal
        open={declining}
        onClose={() => setDeclining(false)}
        width={560}
        title="Decline the Round 2 offer?"
        description={t('{id} will be cancelled.', { id: app.id })}
        footer={
          <>
            <Button onClick={() => setDeclining(false)}>Keep offer</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (app.depositPaid > 0 && !(await account.save())) return
                respond.run(false)
              }}
              disabled={respond.pending || account.saving || (app.depositPaid > 0 && !account.unchanged && !account.draft.accepted)}
            >
              Decline and request refund
            </Button>
          </>
        }
      >
        <p className="text-base text-fg-secondary">
          {t('Your deposit of {amount} is refunded in full to the account below after a Manager approves. You cannot apply again for {term}.', { amount: formatVnd(app.depositPaid), term: offer.termName ?? t('this Term') })}
        </p>
        {app.depositPaid > 0 && <RefundAccountFields draft={account.draft} setDraft={account.setDraft} error={account.error} disabled={account.saving} unchanged={account.unchanged} />}
      </Modal>
    </div>
  )
}

export default function Round2Offer() {
  const query = useQuery(['round2-offer'], ({ signal }) => api.me.round2Offer(undefined, { signal }))
  const offer = query.data?.offer
  return (
    <StudentPage breadcrumb={[{ label: 'Application', to: '/student/applications' }, { label: 'Round 2 offer' }]} title={offer?.termName ? t('Round 2 offer · {term}', { term: offer.termName }) : t('Round 2 offer')}>
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !offer ? (
        <EmptyBlock icon={Bed} title="No Round 2 offer" action={<Button to="/student/applications">My applications</Button>}>
          Round 2 offers go to Students who were not placed in Round 1.
        </EmptyBlock>
      ) : (
        <Offer offer={offer} />
      )}
    </StudentPage>
  )
}
