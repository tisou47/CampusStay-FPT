import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

// Manager › Students › Erasure requests (Decree 13/2023, W3-D3)
// GET /privacy/erasure-requests?status → { items: [{ id, studentName, studentCode, reason, status, requestedAt,
//   decidedAt, decidedBy, note }], total }
// POST /privacy/erasure-requests/:id/decision { decision: 'Approved'|'Rejected', note } → 204. Approving anonymises
// the account; 409 while the student holds a Bed or owes money either way (the request stays Pending).

export default function ErasureRequests() {
  const { notify } = useToast()
  const [status, setStatus] = useState('Pending')
  const query = useQuery(['privacy', 'erasure', status], ({ signal }) => api.privacy.requests({ status, pageSize: 100 }, { signal }))
  const [decision, setDecision] = useState(null)
  const decide = useMutation(() => api.privacy.decide(decision.row.id, { decision: decision.approve ? 'Approved' : 'Rejected', note: decision.note.trim() || null }), {
    invalidates: ['privacy'],
    onSuccess: () => {
      notify({
        title: decision.approve ? 'Personal data erased' : 'Request rejected',
        message: decision.approve ? 'The account is anonymised and signed out. Invoices and stays keep their records.' : 'The student reads your reason.',
      })
      setDecision(null)
    },
  })
  const rows = query.data?.items ?? []
  return (
    <>
      <PageHeader title="Erasure requests" description="Students ask for their personal data to be erased. It can be erased once they hold no Bed and owe nothing, and nobody owes them." />
      <div className="mb-4 w-48">
        <Select
          aria-label={t('Status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={['Pending', 'Completed', 'Rejected'].map((s) => ({ value: s, label: t(s) }))}
        />
      </div>
      <Card padding="none" className="flex min-h-0 flex-1 flex-col">
        <Table fill>
          <THead>
            <tr>
              <Th>Student</Th>
              <Th>Reason</Th>
              <Th className="w-40">Requested</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-56" />
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} rows={rows} colSpan={5} emptyTitle="No erasure request" emptyIcon={ShieldCheck} />
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <TwoLine primary={r.studentName} secondary={r.studentCode} />
                </Td>
                <Td>{r.reason ?? '—'}</Td>
                <Td className="tabular">{formatDateTime(r.requestedAt)}</Td>
                <Td>
                  <StatusTag status={r.status} />
                </Td>
                <Td>
                  {r.status === 'Pending' ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setDecision({ row: r, approve: false, note: '' })}>
                        Reject
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => setDecision({ row: r, approve: true, note: '' })}>
                        Erase data
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm text-fg-secondary">{[r.decidedBy, r.note].filter(Boolean).join(' · ') || '—'}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.approve ? t('Erase the data of {name}', { name: decision?.row.studentName }) : t('Reject the request of {name}', { name: decision?.row.studentName })}
        description={decision?.approve
          ? 'Name, email, phone, date of birth, emergency contacts and the refund account are removed for good, and the account is signed out. This cannot be undone.'
          : 'Write the reason: the student reads it.'}
        footer={
          <>
            <Button onClick={() => setDecision(null)}>Back</Button>
            <Button variant={decision?.approve ? 'danger' : 'primary'} disabled={decide.pending || (!decision?.approve && !decision?.note.trim())} onClick={() => decide.run()}>
              {decision?.approve ? 'Erase for good' : 'Reject request'}
            </Button>
          </>
        }
      >
        {decision && (
          <div className="flex flex-col gap-3">
            {decide.error && (
              <Alert type="error" title="Could not save the decision">
                {decide.error.message}
              </Alert>
            )}
            <Field label="Note" required={!decision.approve}>
              {(id) => <Textarea id={id} rows={3} value={decision.note} onChange={(e) => setDecision({ ...decision, note: e.target.value })} />}
            </Field>
          </div>
        )}
      </Modal>
    </>
  )
}
