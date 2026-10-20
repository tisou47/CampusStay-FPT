import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Download, Repeat, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Card, Note } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { RoomChangeModeSwitch } from './SwapRequests'

// SCR-REQ-10 Room-Change Queue (Figma 60:2696)
// GET /room-changes?termId&block&status&kind&page&pageSize → { items: [{ id, studentName, studentCode, kind,
//   from: { room, bed, roomTypeName, roomClassName }, to: { roomTypeName, roomClassName }, reason, difference, submittedAt, status,
//   decision: { by, at, bed, reason, note } | null }], total, rejectReasons }
// GET /room-changes/:id/matching-beds → { items: [{ bedId, floor, roommates }] }
// POST /room-changes/:id/decision { decision: 'Approved', bedId } | { decision: 'Rejected', reason, message }

const statusFilters = [{ value: '', label: 'Status: All' }, ...['Pending', 'Approved', 'Rejected'].map((s) => ({ value: s, label: `Status: ${s}` }))]
const changeFilters = [
  { value: '', label: 'Change: All' },
  { value: 'same', label: 'Change: Same type, other Room' },
  { value: 'class', label: 'Change: Room Class' },
  { value: 'type', label: 'Change: Room Type' },
]

// Room changes use success for Approved (a done move), unlike Application statuses.
function ChangeStatus({ status }) {
  return <StatusTag status={status} tone={status === 'Approved' ? 'success' : undefined} />
}

function Row({ label, children, valueClassName }) {
  return (
    <div className="flex items-center justify-between gap-4 text-base">
      <dt className="shrink-0 text-fg-secondary">{label}</dt>
      <dd className={cx('min-w-0 text-right', valueClassName ?? 'text-fg')}>{children}</dd>
    </div>
  )
}

const target = (r) => `${r.to.roomTypeName} · ${r.to.roomClassName}${r.kind === 'same' ? ' · other Room' : ''}`

function RejectModal({ request, reasons, onClose }) {
  const { notify } = useToast()
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [message, setMessage] = useState('')
  const reject = useMutation(() => api.roomChanges.decide(request.id, { decision: 'Rejected', reason, message: message.trim() || undefined }), {
    invalidates: ['room-changes'],
    onSuccess: () => {
      notify({ type: 'warning', title: `${request.id} rejected`, message: `${request.studentName} was notified.` })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${request.id}`}
      description={`${request.studentName} is notified with the reason you choose.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={X} onClick={() => reject.run()} disabled={!reason || (reason === 'Other' && !message.trim()) || reject.pending}>
            Reject
          </Button>
        </>
      }
    >
      {reject.error && <p className="rounded-md bg-error-bg px-3 py-2 text-base text-error-fg">{reject.error.message}</p>}
      <Field label="Reason" required>
        {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={reasons} />}
      </Field>
      <Field label="Message to the student" required={reason === 'Other'}>
        {(id) => <Textarea id={id} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: a Bed may free up after the swap window closes." />}
      </Field>
    </Modal>
  )
}

function Review({ request: r, onReject }) {
  const { notify, notifyError } = useToast()
  const pending = r.status === 'Pending'
  const beds = useQuery(['room-changes', 'beds', r.id], ({ signal }) => api.roomChanges.matchingBeds(r.id, { signal }), { enabled: pending, keepPrevious: false })
  const [bed, setBed] = useState(null)
  useEffect(() => setBed(beds.data?.items?.[0]?.bedId ?? null), [beds.data])
  const approve = useMutation(() => api.roomChanges.decide(r.id, { decision: 'Approved', bedId: bed }), {
    invalidates: ['room-changes'],
    onSuccess: (res) => notify({ title: `${r.id} approved`, message: res?.note ?? `${r.studentName} moves to ${bed}.` }),
    onError: (e) => notifyError(e, 'Could not approve'),
  })
  const diff = r.difference ?? 0

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3.5 overflow-y-auto" aria-label={`Review ${r.id}`}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-fg-tertiary">{r.id}</p>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 font-semibold text-fg">{r.studentName}</h2>
          {!pending && <ChangeStatus status={r.status} />}
        </div>
      </div>
      <dl className="flex flex-col gap-3.5">
        <Row label="From">
          {r.from.room} · {r.from.bed} · {r.from.roomClassName}
        </Row>
        <Row label="To">{target(r)}</Row>
        <Row label="Reason">{r.reason ?? '—'}</Row>
        <Row label="Difference" valueClassName={cx('font-medium', diff > 0 ? 'text-fg-brand' : diff < 0 ? 'text-success-fg' : 'text-fg')}>
          {diff > 0 ? `+${formatVnd(diff)}` : diff < 0 ? `−${formatVnd(-diff)} refund` : 'None'}
        </Row>
        {!pending && r.decision && (
          <>
            {r.decision.bed && <Row label="New Bed">{r.decision.bed}</Row>}
            {r.decision.reason && <Row label="Rejection reason">{r.decision.reason}</Row>}
            <Row label="Decided">
              {r.decision.by} · {formatDate(r.decision.at)}
            </Row>
          </>
        )}
      </dl>

      {!pending ? (
        r.decision?.note && <Note>{r.decision.note}</Note>
      ) : (
        <>
          <p className="text-base font-medium text-fg">Free Beds that match</p>
          <QueryState query={beds} compact isEmpty={(d) => !d.items?.length} empty={<Note>No free Bed matches this change right now. Reject the request or wait until a Bed frees up.</Note>}>
            {(data) => (
              <div role="radiogroup" aria-label="Free Beds that match" className="flex flex-col gap-3">
                {data.items.map((b) => (
                  <div
                    key={b.bedId}
                    onClick={() => setBed(b.bedId)}
                    className={cx(
                      'flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 transition-colors',
                      bed === b.bedId ? 'border-primary bg-brand-subtle inset-ring inset-ring-primary' : 'border-line bg-surface hover:border-line-strong',
                    )}
                  >
                    <Radio name={`bed-${r.id}`} label={b.bedId} checked={bed === b.bedId} onChange={() => setBed(b.bedId)} />
                    <span className="pl-6 text-sm text-fg-secondary">
                      Floor {b.floor} · {b.roommates} {b.roommates === 1 ? 'roommate' : 'roommates'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </QueryState>
          <div className="flex gap-2">
            <Button variant="danger" icon={X} onClick={onReject}>
              Reject
            </Button>
            <Button variant="primary" icon={Check} disabled={!bed || approve.pending} onClick={() => approve.run()}>
              {diff > 0 ? 'Approve and invoice' : diff < 0 ? 'Approve and refund' : 'Approve'}
            </Button>
          </div>
          <p className="text-sm text-fg-tertiary">
            {diff > 0
              ? `Approving issues a ${formatVnd(diff)} Invoice; the student moves after paying.`
              : diff < 0
                ? `Approving refunds ${formatVnd(-diff)} to the student; the student moves on the agreed date.`
                : 'The student moves on the agreed date; no Invoice is issued.'}
          </p>
        </>
      )}
    </Card>
  )
}

export default function RoomChangeQueue() {
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const [status, setStatus] = useState('Pending')
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [rejecting, setRejecting] = useState(null)
  const [selectedId, setSelectedId] = useState(params.get('id'))

  const filters = { ...scope, status, kind, page, pageSize }
  const query = useQuery(['room-changes', filters], ({ signal }) => api.roomChanges.list(filters, { signal }))
  const items = query.data?.items ?? []
  const selected = items.find((r) => r.id === selectedId) ?? items[0]
  const exporting = useMutation(() => api.exports.download('room-changes', { ...filters, page: undefined, pageSize: undefined }, 'room-change-requests.csv'), { onError: (e) => notifyError(e, 'Export failed') })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Room changes"
        description="Room-Change Requests in your Blocks. Approve only when a Bed is free."
        actions={
          <>
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
            <RoomChangeModeSwitch mode="changes" />
          </>
        }
      />

      <div className="flex shrink-0 items-center gap-3">
        <Select wrapperClassName="w-42" aria-label="Status" value={status} onChange={filter(setStatus)} options={statusFilters} />
        <Select wrapperClassName="w-60" aria-label="Change" value={kind} onChange={filter(setKind)} options={changeFilters} />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-36">Request</Th>
                <Th className="w-44">Student</Th>
                <Th>From → To</Th>
                <Th className="w-30">Submitted</Th>
                <Th className="w-26">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} emptyIcon={Repeat} emptyTitle="No Room-Change Requests match these filters" />
              {items.map((r) => (
                <Tr key={r.id} selected={r.id === selected?.id} onClick={() => setSelectedId(r.id)} className="[&>td]:h-14">
                  <Td className="font-medium whitespace-nowrap text-fg-brand">{r.id}</Td>
                  <Td>
                    <TwoLine primary={r.studentName} secondary={r.studentCode} />
                  </Td>
                  <Td className="max-w-0">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate">
                        {r.from.room} · {r.from.bed} → {target(r)}
                      </span>
                      <span className="truncate text-sm text-fg-secondary">
                        {r.from.roomTypeName} · {r.from.roomClassName}
                        {r.difference ? ` · ${r.difference > 0 ? '+' : '−'}${formatVnd(Math.abs(r.difference))}` : ''}
                      </span>
                    </div>
                  </Td>
                  <Td>{formatDateTime(r.submittedAt)}</Td>
                  <Td>
                    <ChangeStatus status={r.status} />
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
        </div>

        {selected ? (
          <Review key={`${selected.id}-${selected.status}`} request={selected} onReject={() => setRejecting(selected)} />
        ) : (
          <Card className="flex w-95 shrink-0 flex-col">
            <EmptyBlock icon={Repeat} title="Select a request" />
          </Card>
        )}
      </div>

      {rejecting && <RejectModal request={rejecting} reasons={query.data?.rejectReasons ?? []} onClose={() => setRejecting(null)} />}
    </>
  )
}
