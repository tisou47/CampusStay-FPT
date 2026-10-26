import { useState } from 'react'
import { DoorOpen, Plus, TriangleAlert, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDate, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-ASG-12 Terminations — Manager › Residents (spec §6.15, D-27). A stay ends early for Utility debt (automatic,
// after the final warning), because the student is not enrolled, or by a Manager's decision with a reason. Notice
// sent → the student checks out at the desk by the move-out date (Checked out); past it the termination is Overdue,
// Managers and Staff are told and the Room's door code changes. Only a Manager cancels, with a reason.
// GET /terminations?termId&block&status&page&pageSize → { items: [{ id, studentName, studentCode, room, block, reason,
//   note, status, moveOutBy, startedAt, startedBy, debt, endedAt, cancelReason }], total,
//   counts: { noticeSent, overdue }, reasons, statuses }
// POST /terminations { studentCode, reason, note } → { id, moveOutBy } · POST /terminations/:id/cancel { reason }

export default function Terminations() {
  const scope = useScopeQuery()
  const { notify } = useToast()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [starting, setStarting] = useState(false)
  const [form, setForm] = useState({ studentCode: '', reason: 'Manager decision', note: '' })
  const [cancelling, setCancelling] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  const filters = { ...scope, status, page, pageSize }
  const query = useQuery(['terminations', filters], ({ signal }) => api.terminations.list(filters, { signal }))
  const items = query.data?.items ?? []
  const counts = query.data?.counts

  const start = useMutation(() => api.terminations.start(form), {
    invalidates: ['terminations'],
    onSuccess: (r) => {
      notify({ title: 'Stay terminated', message: t('{code} must check out by {date}. The student was told.', { code: form.studentCode.trim().toUpperCase(), date: formatDate(r.moveOutBy) }) })
      setStarting(false)
      setForm({ studentCode: '', reason: 'Manager decision', note: '' })
    },
    onError: () => {},
  })
  const cancel = useMutation(() => api.terminations.cancel(cancelling.id, { reason: cancelReason.trim() }), {
    invalidates: ['terminations'],
    onSuccess: () => {
      notify({ title: 'Termination cancelled', message: t('{name} may stay. The student was told.', { name: cancelling.studentName }) })
      setCancelling(null)
      setCancelReason('')
    },
    onError: () => {},
  })
  const fields = start.error?.details?.fields ?? {}

  return (
    <>
      <PageHeader
        title="Terminations"
        description="Stays ended for Utility debt, enrollment or a Manager's decision, until the student checks out."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setStarting(true)}>
            Terminate a stay
          </Button>
        }
      />

      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" icon={DoorOpen} label="Notice sent" value={formatNumber(counts?.noticeSent)} note="Waiting for the check-out" />
        <KpiTile size="md" icon={TriangleAlert} label="Overdue" value={formatNumber(counts?.overdue)} valueTone={counts?.overdue ? 'error' : undefined} note="Move-out date passed" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Select
          wrapperClassName="w-52"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Status: All' }, ...(query.data?.statuses ?? []).map((s) => ({ value: s, label: t('Status: {s}', { s: tr(s) }) }))]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th className="w-52">Student</Th>
            <Th className="w-28">Room</Th>
            <Th className="w-44">Reason</Th>
            <Th className="w-32">Move out by</Th>
            <Th className="w-36">Status</Th>
            <Th>Details</Th>
            <Th className="w-24">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={DoorOpen} emptyTitle="No terminations" />
          {items.map((r) => (
            <Tr key={r.id} className="[&>td]:h-12">
              <Td>
                <TwoLine primary={r.studentName} secondary={r.studentCode} />
              </Td>
              <Td>{r.room}</Td>
              <Td>{tr(r.reason)}</Td>
              <Td className="whitespace-nowrap">{formatDate(r.moveOutBy)}</Td>
              <Td>
                <StatusTag status={r.status} />
              </Td>
              <Td className="text-sm text-fg-secondary">
                {[
                  r.debt != null ? t('Debt {amount}', { amount: formatVnd(r.debt) }) : null,
                  r.note,
                  t('By {name} on {date}', { name: tr(r.startedBy), date: formatDate(r.startedAt) }),
                  r.cancelReason ? t('Cancelled: {reason}', { reason: r.cancelReason }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Td>
              <Td>
                {(r.status === 'Notice sent' || r.status === 'Overdue') && (
                  <Button variant="text" onClick={() => setCancelling(r)}>
                    Cancel
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="flex shrink-0 justify-end">
        <Pagination
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>

      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title="Terminate a stay"
        footer={
          <>
            <Button onClick={() => setStarting(false)}>Cancel</Button>
            <Button variant="danger" disabled={start.pending || !form.studentCode.trim()} onClick={() => start.run()}>
              {start.pending ? t('Sending…') : t('Terminate and notify')}
            </Button>
          </>
        }
      >
        {start.error && !start.error.details?.fields && <Alert type="error" title="Could not terminate the stay">{start.error.message}</Alert>}
        <Field label="Student code" required error={fields.studentCode}>
          {(id) => <Input id={id} value={form.studentCode} onChange={(e) => setForm({ ...form, studentCode: e.target.value })} placeholder="SE190001" />}
        </Field>
        <Field label="Reason" required error={fields.reason}>
          {(id) => (
            <Select
              id={id}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              options={(query.data?.reasons ?? ['Manager decision', 'Not enrolled']).map((r) => ({ value: r, label: r }))}
            />
          )}
        </Field>
        <Field label="Note shown to the student" required={form.reason === 'Manager decision'} error={fields.note}>
          {(id) => <Textarea id={id} rows={3} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
        </Field>
        <Alert type="warning" title="What happens">
          {t('The student is told at once and must check out at the desk within the configured days. At the check-out the Utility Deposit settles the debt and the unused room fee is refunded by its rule.')}
        </Alert>
      </Modal>

      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title={cancelling ? t('Cancel the termination of {name}', { name: cancelling.studentName }) : ''}
        footer={
          <>
            <Button onClick={() => setCancelling(null)}>Back</Button>
            <Button variant="primary" icon={X} disabled={cancel.pending || !cancelReason.trim()} onClick={() => cancel.run()}>
              {cancel.pending ? t('Saving…') : t('Cancel termination')}
            </Button>
          </>
        }
      >
        {cancel.error && <Alert type="error" title="Could not cancel">{cancel.error.message}</Alert>}
        <Field label="Why is it cancelled?" required>
          {(id) => <Textarea id={id} rows={3} maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />}
        </Field>
      </Modal>
    </>
  )
}
