import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Clock, Repeat } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Divider, Note } from '@/components/ui/Display'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatVnd, toDateInput } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-REQ-20 Decisions (Figma 99:2192): late check-ins, cross-Block swaps and refunds waiting for a Manager.
// The assignment is committed on the proposal itself (ADR-19), so it has no tab here.
// GET /approvals/summary?termId&block → { lateCheckIn, swaps, refunds, … }
// GET /late-check-ins?termId&block → { items: [{ id, studentCode, name, allocation, reason, receivedBy, paid, payment, requestedFor,
//   evidence: { name, url }, windowClosedAt, suggestedDeadline, decision: { status, deadline, reason } | null,
//   source (Online: asked by the student; Desk: recorded by Staff) }] }
// POST /late-check-ins/:id/decision { decision, deadline, reason } — deadline is a calendar day YYYY-MM-DD (contract C-02),
// at most late_check_in.max_days after the check-in end; approving it also moves the Balance deadline (spec §6.9).
// Cross-Block swaps: GET /swaps?status=To Manager · POST /swaps/:id/decision. Refunds: GET /refunds?status=Pending.

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{t(label)}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  )
}

function Loading({ query, children }) {
  if (query.data === undefined && query.loading) return <LoadingState />
  if (query.data === undefined) return <ErrorState error={query.error} onRetry={query.reload} />
  return children(query.data)
}

function LateDecision({ req }) {
  const { notify, notifyError } = useToast()
  const [deadline, setDeadline] = useState(toDateInput(req.suggestedDeadline))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => {
    setDeadline(toDateInput(req.suggestedDeadline))
    setRejecting(false)
    setReason('')
  }, [req])
  const decide = useMutation((decision) => api.approvals.decideLateCheckIn(req.id, { decision, deadline: decision === 'Approved' ? deadline : undefined, reason: reason.trim() || undefined }), {
    invalidates: ['approvals'],
    onSuccess: (_, decision) =>
      notify({
        type: decision === 'Approved' ? 'success' : 'warning',
        title: decision === 'Approved' ? 'Late check-in approved' : 'Late check-in rejected',
        message: decision === 'Approved' ? t('{name} can check in until {date}.', { name: req.name, date: formatDate(deadline) }) : t('{name}’s Allocation is released if they do not arrive.', { name: req.name }),
      }),
    onError: (e) => notifyError(e, 'Could not save the decision'),
  })
  const d = req.decision

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{t('Late check-in · {name}', { name: req.name })}</h2>
        {req.windowClosedAt && <p className="text-sm text-fg-secondary">{t('Check-in window closed {date}', { date: formatDateTime(req.windowClosedAt) })}</p>}
      </div>
      <dl className="flex flex-col gap-3">
        <Row label="Requested date">{formatDate(req.requestedFor)}</Row>
        <Row label="Balance + Utility Deposit">
          <span className={cx(!req.paid && 'text-error-fg')}>{tr(req.payment)}</span>
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
        <Alert type={d.status === 'Approved' ? 'success' : 'warning'} title={d.status === 'Approved' ? t('Approved until {date}', { date: formatDate(d.deadline) }) : 'Rejected'}>
          {d.status === 'Approved' ? t('Staff see the new deadline at the check-in desk.') : d.reason || t('The student was notified.')}
        </Alert>
      ) : (
        <>
          <Field label="New check-in deadline">{(id) => <Input id={id} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}</Field>
          {rejecting && (
            <Field label="Reason shown to the student" required>
              {(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
          <Note>Approval only extends the window. The Student still checks in at the desk, and payment must be complete first.</Note>
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={() => (rejecting ? decide.run('Rejected') : setRejecting(true))} disabled={(rejecting && !reason.trim()) || decide.pending}>
              {rejecting ? t('Confirm reject') : t('Reject')}
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
              <Td>{tr(r.allocation)}</Td>
              <Td>{r.reason}</Td>
              <Td>{r.source === 'Online' ? <Tag tone="info">Online</Tag> : r.receivedBy}</Td>
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
    onSuccess: (_, id, decision) => notify({ type: decision === 'Approved' ? 'success' : 'warning', title: decision === 'Approved' ? 'Swap approved' : 'Swap rejected', message: 'Both students were notified.' }),
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
                  <h2 className="text-h3 font-semibold text-fg">{s.id} · {t('Cross-Block swap')}</h2>
                  <p className="text-sm text-fg-secondary">{t('Both Students agreed on {date}', { date: formatDate(s.agreedAt) })}</p>
                </div>
                <dl className="flex max-w-xl flex-col gap-3">
                  <Row label={`${s.a.name} · ${s.a.studentCode}`}>
                    {t('{room} · Bed {bed}', { room: s.a.room, bed: s.a.bed })} → {s.b.room}
                  </Row>
                  <Row label={`${s.b.name} · ${s.b.studentCode}`}>
                    {t('{room} · Bed {bed}', { room: s.b.room, bed: s.b.bed })} → {s.a.room}
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
            <span className="sr-only">{t('Actions')}</span>
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
            <Td>{tr(r.reason)}</Td>
            <Td className="tabular">{r.proposedLabel ? tr(r.proposedLabel) : formatVnd(r.amount)}</Td>
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

export default function Approvals({ tab: routeTab = 'late-check-in' }) {
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const tab = params.get('tab') ?? routeTab
  const counts = useQuery(['approvals', 'summary', scope], ({ signal }) => api.approvals.summary(scope, { signal }))
  const c = counts.data ?? {}
  const label = (text, n) => (n == null ? t(text) : `${t(text)} (${n})`)

  return (
    <>
      <PageHeader title="Decisions" description="Late check-ins, cross-Block swaps and refunds waiting for a Manager." />
      <Tabs
        className="shrink-0"
        value={tab}
        items={[
          { key: 'late-check-in', label: label('Late check-in', c.lateCheckIn), to: '/manager/approvals' },
          { key: 'swaps', label: label('Cross-Block swaps', c.swaps), to: '/manager/approvals?tab=swaps' },
          { key: 'refunds', label: label('Refunds', c.refunds), to: '/manager/approvals?tab=refunds' },
        ]}
      />
      {tab === 'late-check-in' && <LateTab />}
      {tab === 'swaps' && <SwapsTab />}
      {tab === 'refunds' && <RefundsTab />}
    </>
  )
}
