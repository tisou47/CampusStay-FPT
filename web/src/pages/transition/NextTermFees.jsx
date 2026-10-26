import { useState } from 'react'
import { Banknote, CircleCheck, Send, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// Term transition › Next-Term fees — Managers (spec §5.1 M6, §6.10 step 4, D-15). Each continuing resident receives one
// Invoice "Room fee · Term" = 100 % of the next Term's price of their next-Term Bed; no Deposit, the Utility Deposit
// stays held. Possible once filing closed, every request is decided and the enrolled list is reconciled. Leavers then
// receive their end-of-stay notice. Issuing again only bills those without a fee (nobody is charged twice).
// GET /next-term-fees?termId → { term, dueAt, count, total, groups: [{ block, roomType, roomClass, count, total }],
//   blockers: [{ code, text }], issued: { at, by, count, paid, total } | null, leavers }
// POST /next-term-fees/issue { termId } → { issued, total, notices }

export default function NextTermFees({ termId }) {
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const query = useQuery(['next-term-fees', termId], ({ signal }) => api.renewals.fees({ termId }, { signal }))
  const issue = useMutation(() => api.renewals.issueFees({ termId }), {
    invalidates: ['next-term-fees', 'renewal-overview'],
    onSuccess: (r) => {
      notify({ title: 'Next-Term fees issued', message: t('{n} Invoices, {total}. {notices} leavers were told when to check out.', { n: r.issued, total: formatVnd(r.total), notices: r.notices }) })
      setConfirming(false)
    },
    onError: () => {},
  })
  return (
    <QueryState query={query} isEmpty={() => false}>
      {(p) => (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="flex shrink-0 flex-wrap gap-4">
            <KpiTile size="md" icon={Users} label="To bill now" value={formatNumber(p.count)} note={t('Due {date}', { date: formatDateTime(p.dueAt) })} />
            <KpiTile size="md" icon={Banknote} label="Total" value={formatVnd(p.total)} note="100 % of the next Term's price" />
            <KpiTile size="md" icon={CircleCheck} label="Issued · paid" value={p.issued ? `${formatNumber(p.issued.count)} · ${formatNumber(p.issued.paid)}` : '—'} note={p.issued ? t('{total} · by {name}', { total: formatVnd(p.issued.total), name: p.issued.by ?? '—' }) : 'Not issued yet'} />
            <KpiTile size="md" icon={Users} label="Leavers" value={formatNumber(p.leavers)} note="Told to check out when fees are issued" />
          </div>
          {p.blockers.length > 0 ? (
            <Alert type="warning" title="The fees cannot be issued yet">
              <ul className="flex flex-col gap-1">
                {p.blockers.map((b) => (
                  <li key={b.code}>{tr(b.text)}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            p.count > 0 && (
              <Alert type="info" title="Ready to issue" action={<Button variant="primary" icon={Send} onClick={() => setConfirming(true)}>Issue next-Term fees</Button>}>
                {t('Next-Term Beds are fixed once the fees are issued; only a Manager can still move a student.')}
              </Alert>
            )
          )}
          <Card padding="none" className="flex shrink-0 flex-col">
            <Table>
              <THead>
                <tr>
                  <Th className="w-24">Block</Th>
                  <Th>Room Type</Th>
                  <Th>Room Class</Th>
                  <Th align="right" className="w-28">Residents</Th>
                  <Th align="right" className="w-40">Total</Th>
                </tr>
              </THead>
              <TBody>
                {p.groups.length === 0 && (
                  <Tr>
                    <Td colSpan={5} className="text-fg-secondary">
                      {t('Nobody to bill now.')}
                    </Td>
                  </Tr>
                )}
                {p.groups.map((g) => (
                  <Tr key={`${g.block}-${g.roomType}-${g.roomClass}`}>
                    <Td>{g.block}</Td>
                    <Td>{tr(g.roomType)}</Td>
                    <Td>{tr(g.roomClass)}</Td>
                    <Td align="right">{formatNumber(g.count)}</Td>
                    <Td align="right">{formatVnd(g.total)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
          <Modal
            open={confirming}
            onClose={() => setConfirming(false)}
            title={t('Issue {n} next-Term fees, {total}', { n: formatNumber(p.count), total: formatVnd(p.total) })}
            footer={
              <>
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="primary" disabled={issue.pending} onClick={() => issue.run()}>
                  {issue.pending ? t('Issuing…') : t('Issue the fees')}
                </Button>
              </>
            }
          >
            {issue.error && <Alert type="error" title="Could not issue the fees">{issue.error.message}</Alert>}
            <p className="text-base text-fg-secondary">
              {t('Each continuing resident is told in the app. Unpaid by {date} with no transfer claimed, the Bed for the next Term is released and the student checks out at the end of this Term.', { date: formatDateTime(p.dueAt) })}
            </p>
          </Modal>
        </div>
      )}
    </QueryState>
  )
}
