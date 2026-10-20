import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CircleCheck, Clock, Repeat } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card, Divider, Note } from '@/components/ui/Display'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, ErrorState, LoadingState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber, formatPercent, formatVnd, toDateTimeInput } from '@/lib/format'

// SCR-ASG-20 Approvals – Assignment Proposal (Figma 99:1705) and SCR-REQ-20 Approvals – Late Check-in (Figma 99:2192).
// GET /approvals/summary?termId&block → { assignment, lateCheckIn, swaps, refunds }
// GET /approvals/assignment?termId&block → { item: { runId, block, blockLabel, termName, submittedBy, submittedAt, bedsOffered,
//   conflictsResolved, conflictsTotal, applications, allocated, toRound2, averageScore, status, comment } | null }
// GET /assignment-runs/:runId/rooms?block&page → { items: [{ room, roomTypeName, roomClassName, students, note, score, flag: { label, tone } }], total }
// POST /assignment-runs/:runId/approve { block } · POST /assignment-runs/:runId/return { block, comment }
// GET /late-check-ins?termId&block → { items: [{ id, studentCode, name, allocation, reason, receivedBy, paid, payment, requestedFor,
//   evidence: { name, url }, windowClosedAt, suggestedDeadline, decision: { status, deadline, reason } | null }] }
// POST /late-check-ins/:id/decision { decision, deadline, reason }
// Cross-Block swaps: GET /swaps?status=To Manager · POST /swaps/:id/decision. Refunds: GET /refunds?status=Pending.

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  )
}

function Loading({ query, children }) {
  if (query.data === undefined && query.loading) return <LoadingState />
  if (query.data === undefined) return <ErrorState error={query.error} onRetry={query.reload} />
  return children(query.data)
}

function AssignmentTab() {
  const scope = useScopeQuery()
  const query = useQuery(['approvals', 'assignment', scope], ({ signal }) => api.approvals.assignment(scope, { signal }))
  return (
    <Loading query={query}>
      {({ item }) =>
        item ? (
          <AssignmentDecision item={item} />
        ) : (
          <Card padding="none" className="flex min-h-0 flex-1 flex-col">
            <EmptyBlock icon={CircleCheck} title="No assignment proposal is waiting">
              Staff send each Block for approval after resolving conflicts in Assignment Proposal Review.
            </EmptyBlock>
          </Card>
        )
      }
    </Loading>
  )
}

function AssignmentDecision({ item }) {
  const { notify, notifyError } = useToast()
  const [comment, setComment] = useState('')
  const [page, setPage] = useState(1)
  const rooms = useQuery(['approvals', 'rooms', item.runId, item.block, page], ({ signal }) => api.assignment.rooms(item.runId, { block: item.block, page, pageSize: 20 }, { signal }))
  const opts = { invalidates: ['approvals', 'assignment-runs', 'dashboard'] }
  const approve = useMutation(() => api.assignment.approve(item.runId, { block: item.block }), {
    ...opts,
    onSuccess: () => notify({ title: 'Proposal approved', message: `${formatNumber(item.allocated)} Allocations created. Students are notified by app and email.` }),
    onError: (e) => notifyError(e, 'Could not approve'),
  })
  const giveBack = useMutation(() => api.assignment.returnToStaff(item.runId, { block: item.block, comment: comment.trim() }), {
    ...opts,
    onSuccess: () => notify({ type: 'warning', title: 'Returned to Staff', message: 'Staff see your comment on Assignment Proposal Review.' }),
    onError: (e) => notifyError(e, 'Could not return the proposal'),
  })
  const decided = item.status !== 'Waiting'

  return (
    <>
      <div className="flex shrink-0 gap-4">
        <KpiTile label="Applications in run" value={formatNumber(item.applications)} note={`${item.runId} · Block ${item.block}`} noteTone="tertiary" />
        <KpiTile label="Allocated" value={formatNumber(item.allocated)} note={item.applications ? `${formatPercent(item.allocated / item.applications)} of run` : null} noteTone="tertiary" />
        <KpiTile label="To Round 2" value={formatNumber(item.toRound2)} note="No capacity or not enough roommates" noteTone="tertiary" />
        <KpiTile label="Average match score" value={item.averageScore != null ? item.averageScore.toFixed(2) : '—'} note="Gender, major, hometown, semester" noteTone="tertiary" />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-34">Room</Th>
                <Th>Students</Th>
                <Th className="w-18">Score</Th>
                <Th className="w-42">Note</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={rooms} colSpan={4} emptyTitle="No Rooms in this proposal" />
              {(rooms.data?.items ?? []).map((r) => (
                <Tr key={r.room} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.room} secondary={`${r.roomTypeName} ${r.roomClassName}`} />
                  </Td>
                  <Td className="max-w-0">
                    <TwoLine primary={r.students} secondary={r.note} />
                  </Td>
                  <Td className="tabular">{r.score != null ? r.score.toFixed(2) : '—'}</Td>
                  <Td>{r.flag && <Tag tone={r.flag.tone}>{r.flag.label}</Tag>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
            <Pagination total={rooms.data?.total ?? 0} page={page} onChange={setPage} showSizeChanger={false} />
          </div>
        </div>
        <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-h3 font-semibold text-fg">
              {item.runId} · Block {item.block}
            </h2>
            <p className="text-sm text-fg-secondary">
              Submitted by {item.submittedBy} · {formatDateTime(item.submittedAt)}
            </p>
          </div>
          <dl className="flex flex-col gap-3">
            <Row label="Term">{item.termName}</Row>
            <Row label="Block">{item.blockLabel ?? item.block}</Row>
            <Row label="Beds offered">{formatNumber(item.bedsOffered)}</Row>
            <Row label="Conflicts resolved">
              {item.conflictsResolved} of {item.conflictsTotal}
            </Row>
          </dl>
          <Divider />
          {decided ? (
            <Alert type={item.status === 'Approved' ? 'success' : 'warning'} title={item.status === 'Approved' ? 'Approved' : 'Returned to Staff'}>
              {item.status === 'Approved' ? 'Allocations are live. Students see their Room and Bed and can pay the balance.' : item.comment || 'Staff will revise the proposal.'}
            </Alert>
          ) : (
            <>
              <Field label="Comment (required to return)">{(id) => <Input id={id} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />}</Field>
              <Alert title="On approval">Allocations are created, Students are notified and the unassigned Applications move to Round 2.</Alert>
              <div className="flex justify-end gap-2">
                <Button onClick={() => giveBack.run()} disabled={!comment.trim() || giveBack.pending}>
                  Return to Staff
                </Button>
                <Button variant="primary" onClick={() => approve.run()} disabled={approve.pending}>
                  Approve proposal
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

function LateDecision({ req }) {
  const { notify, notifyError } = useToast()
  const [deadline, setDeadline] = useState(toDateTimeInput(req.suggestedDeadline))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => {
    setDeadline(toDateTimeInput(req.suggestedDeadline))
    setRejecting(false)
    setReason('')
  }, [req])
  const decide = useMutation((decision) => api.approvals.decideLateCheckIn(req.id, { decision, deadline: decision === 'Approved' ? new Date(deadline).toISOString() : undefined, reason: reason.trim() || undefined }), {
    invalidates: ['approvals'],
    onSuccess: (_, decision) =>
      notify({
        type: decision === 'Approved' ? 'success' : 'warning',
        title: `Late check-in ${decision.toLowerCase()}`,
        message: decision === 'Approved' ? `${req.name} can check in until ${formatDateTime(deadline)}.` : `${req.name}'s Allocation is released if they do not arrive.`,
      }),
    onError: (e) => notifyError(e, 'Could not save the decision'),
  })
  const d = req.decision

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">Late check-in · {req.name}</h2>
        {req.windowClosedAt && <p className="text-sm text-fg-secondary">Check-in window closed {formatDateTime(req.windowClosedAt)}</p>}
      </div>
      <dl className="flex flex-col gap-3">
        <Row label="Requested date">{formatDate(req.requestedFor)}</Row>
        <Row label="Balance + Utility Deposit">
          <span className={cx(!req.paid && 'text-error-fg')}>{req.payment}</span>
        </Row>
        <Row label="Evidence">
          {req.evidence?.url ? (
            <a href={req.evidence.url} target="_blank" rel="noreferrer" className="text-fg-link hover:underline">
              {req.evidence.name}
            </a>
          ) : (
            '—'
          )}
        </Row>
      </dl>
      <Divider />
      {d ? (
        <Alert type={d.status === 'Approved' ? 'success' : 'warning'} title={d.status === 'Approved' ? `Approved until ${formatDateTime(d.deadline)}` : 'Rejected'}>
          {d.status === 'Approved' ? 'Staff see the new deadline at the check-in desk.' : d.reason || 'The student was notified.'}
        </Alert>
      ) : (
        <>
          <Field label="New check-in deadline">{(id) => <Input id={id} type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}</Field>
          {rejecting && (
            <Field label="Reason shown to the student" required>
              {(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
          <Note>Approval only extends the window. The Student still checks in at the desk, and payment must be complete first.</Note>
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={() => (rejecting ? decide.run('Rejected') : setRejecting(true))} disabled={(rejecting && !reason.trim()) || decide.pending}>
              {rejecting ? 'Confirm reject' : 'Reject'}
            </Button>
            <Button variant="primary" onClick={() => decide.run('Approved')} disabled={!deadline || decide.pending}>
              Approve
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

function LateTab() {
  const scope = useScopeQuery()
  const query = useQuery(['approvals', 'late', scope], ({ signal }) => api.approvals.lateCheckIns(scope, { signal }))
  const items = query.data?.items ?? []
  const [selected, setSelected] = useState(null)
  const req = items.find((r) => r.id === selected) ?? items[0]

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-4">
      <Table fill className="min-w-0">
        <THead>
          <tr>
            <Th className="w-48">Student</Th>
            <Th>Allocation</Th>
            <Th>Reason</Th>
            <Th className="w-40">Received by</Th>
            <Th className="w-28">Payment</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} emptyIcon={Clock} emptyTitle="No late check-in requests" />
          {items.map((r) => (
            <Tr key={r.id} selected={r.id === req?.id} onClick={() => setSelected(r.id)} className="[&>td]:h-15.5">
              <Td>
                <TwoLine primary={r.name} secondary={r.studentCode} />
              </Td>
              <Td>{r.allocation}</Td>
              <Td>{r.reason}</Td>
              <Td>{r.receivedBy}</Td>
              <Td>{r.decision ? <StatusTag status={r.decision.status} tone={r.decision.status === 'Approved' ? 'success' : 'error'} /> : <Tag tone={r.paid ? 'success' : 'error'}>{r.paid ? 'Paid' : 'Unpaid'}</Tag>}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {req && <LateDecision req={req} />}
    </div>
  )
}

function SwapsTab() {
  const scope = useScopeQuery()
  const { notify, notifyError } = useToast()
  const query = useQuery(['swaps', 'manager', scope], ({ signal }) => api.swaps.list({ ...scope, status: 'To Manager' }, { signal }))
  const decide = useMutation((id, decision) => api.swaps.decide(id, { decision }), {
    invalidates: ['swaps', 'approvals'],
    onSuccess: (_, id, decision) => notify({ type: decision === 'Approved' ? 'success' : 'warning', title: `Swap ${decision.toLowerCase()}`, message: 'Both students were notified.' }),
    onError: (e) => notifyError(e, 'Could not save the decision'),
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <Loading query={query}>
        {(data) =>
          !data.items?.length ? (
            <Card padding="none" className="flex flex-1 flex-col">
              <EmptyBlock icon={Repeat} title="No cross-Block swaps are waiting" />
            </Card>
          ) : (
            data.items.map((s) => (
              <Card key={s.id} className="flex shrink-0 flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-h3 font-semibold text-fg">{s.id} · Cross-Block swap</h2>
                  <p className="text-sm text-fg-secondary">Both Students agreed on {formatDate(s.agreedAt)}</p>
                </div>
                <dl className="flex max-w-xl flex-col gap-3">
                  <Row label={`${s.a.name} · ${s.a.studentCode}`}>
                    {s.a.room} Bed {s.a.bed} → {s.b.room}
                  </Row>
                  <Row label={`${s.b.name} · ${s.b.studentCode}`}>
                    {s.b.room} Bed {s.b.bed} → {s.a.room}
                  </Row>
                </dl>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={() => decide.run(s.id, 'Rejected')} disabled={decide.pending}>
                    Reject
                  </Button>
                  <Button variant="primary" onClick={() => decide.run(s.id, 'Approved')} disabled={decide.pending}>
                    Approve swap
                  </Button>
                </div>
              </Card>
            ))
          )
        }
      </Loading>
    </div>
  )
}

function RefundsTab() {
  const scope = useScopeQuery()
  const query = useQuery(['refunds', 'pending', scope], ({ signal }) => api.finance.refunds({ ...scope, status: 'Pending' }, { signal }))
  return (
    <Table fill>
      <THead>
        <tr>
          <Th className="w-36">Refund</Th>
          <Th>Student</Th>
          <Th>Reason</Th>
          <Th className="w-36">Refund</Th>
          <Th className="w-40">
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        <TableStatus query={query} colSpan={5} emptyTitle="No refunds are waiting" />
        {(query.data?.items ?? []).map((r) => (
          <Tr key={r.id}>
            <Td className="font-medium text-fg-brand">{r.id}</Td>
            <Td>
              <TwoLine primary={r.name} secondary={r.studentCode} />
            </Td>
            <Td>{r.reason}</Td>
            <Td className="tabular">{r.proposedLabel ?? formatVnd(r.amount)}</Td>
            <Td>
              <Button variant="text" to={`/manager/finance?refund=${r.id}`}>
                Review in Finance
              </Button>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

export default function Approvals({ tab: routeTab = 'assignment' }) {
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const tab = params.get('tab') ?? routeTab
  const counts = useQuery(['approvals', 'summary', scope], ({ signal }) => api.approvals.summary(scope, { signal }))
  const c = counts.data ?? {}
  const label = (text, n) => (n == null ? text : `${text} (${n})`)

  return (
    <>
      <PageHeader title="Approvals" description="Items waiting for your decision." />
      <Tabs
        className="shrink-0"
        value={tab}
        items={[
          { key: 'assignment', label: label('Assignment proposals', c.assignment), to: '/manager/approvals' },
          { key: 'late-check-in', label: label('Late check-in', c.lateCheckIn), to: '/manager/approvals/late-check-in' },
          { key: 'swaps', label: label('Cross-Block swaps', c.swaps), to: '/manager/approvals?tab=swaps' },
          { key: 'refunds', label: label('Refunds', c.refunds), to: '/manager/approvals?tab=refunds' },
        ]}
      />
      {tab === 'assignment' && <AssignmentTab />}
      {tab === 'late-check-in' && <LateTab />}
      {tab === 'swaps' && <SwapsTab />}
      {tab === 'refunds' && <RefundsTab />}
    </>
  )
}
