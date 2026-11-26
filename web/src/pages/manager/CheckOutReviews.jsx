import { useState } from 'react'
import { Scale } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Field, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { formatVnd } from '@/lib/format'
import { t } from '@/i18n'

// Manager › Approvals › Check-out charges: furniture charges a student did not accept at the desk.
// GET /check-out-reviews?block → [{ allocationId, itemId, assetCode, type, room, studentName, condition, amount, note, claimId }]
// POST /check-out-reviews/:allocationId/:itemId { keep, note } — kept after the check-out: a DAMAGE invoice.
// POST /check-out-reviews/claims/:claimId { keep, note } — shared damage the student declined (claimId set).

export default function CheckOutReviews() {
  const { notify, notifyError } = useToast()
  const scope = useScopeQuery()
  const query = useQuery(['check-out-furniture', 'reviews', scope.block], ({ signal }) => api.checkOutFurniture.reviews({ block: scope.block }, { signal }))
  const [decision, setDecision] = useState(null)
  const decide = useMutation(() => {
    const body = { keep: decision.keep, note: decision.note }
    const r = decision.row
    return r.claimId ? api.checkOutFurniture.decideClaim(r.claimId, body) : api.checkOutFurniture.decide(r.allocationId, r.itemId, body)
  }, {
    invalidates: ['check-out-furniture', 'check-out', 'work-summary'],
    onSuccess: () => {
      notify({ title: decision.keep ? 'Charge kept' : 'Charge dropped', message: decision.keep ? 'The student pays it in the settlement or by invoice.' : 'Nobody pays for this item.' })
      setDecision(null)
    },
    onError: (e) => notifyError(e, 'Could not save the decision'),
  })
  const rows = query.data ?? []
  return (
    <>
      <PageHeader title="Check-out charges" description="Furniture charges a student did not accept at the desk. Decide the same day: until then the item is not charged." />
      <Card padding="none" className="flex min-h-0 flex-1 flex-col">
        <Table fill>
          <THead>
            <tr>
              <Th>Student</Th>
              <Th>Item</Th>
              <Th className="w-28">Condition</Th>
              <Th className="w-32" align="right">
                Charge
              </Th>
              <Th>Note</Th>
              <Th className="w-48" />
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} rows={rows} colSpan={6} emptyTitle="No charge to decide" emptyIcon={Scale} />
            {rows.map((r) => (
              <Tr key={r.claimId ? `claim-${r.claimId}` : `${r.allocationId}-${r.itemId}`}>
                <Td>
                  <TwoLine primary={r.studentName} secondary={r.room} />
                </Td>
                <Td>
                  <TwoLine primary={r.type} secondary={r.assetCode} />
                </Td>
                <Td>{t(r.condition)}</Td>
                <Td align="right">{formatVnd(r.amount)}</Td>
                <Td>{r.claimId ? <TwoLine primary={t('Declined by the student')} secondary={r.note} /> : r.note}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setDecision({ row: r, keep: false, note: '' })}>
                      Drop charge
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setDecision({ row: r, keep: true, note: '' })}>
                      Keep charge
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.keep ? 'Keep this charge' : 'Drop this charge'}
        description="Write the reason: the student reads it."
        footer={
          <>
            <Button onClick={() => setDecision(null)}>Back</Button>
            <Button variant="primary" disabled={!decision?.note.trim() || decide.pending} onClick={() => decide.run()}>
              Save decision
            </Button>
          </>
        }
      >
        {decision && (
          <Field label="Reason" required>
            <Textarea rows={3} value={decision.note} onChange={(e) => setDecision({ ...decision, note: e.target.value })} />
          </Field>
        )}
      </Modal>
    </>
  )
}
