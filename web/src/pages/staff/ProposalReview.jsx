import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, Clock, Download, Layers } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Breadcrumb, Card } from '@/components/ui/Display'
import { Field, Input, SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber } from '@/lib/format'

// SCR-ASG-11 Assignment Proposal Review (Figma 36:1580) and "Commit Block" modal (36:1994).
// GET /assignment-runs/:runId/proposal?block&view=conflicts|proposed|all&q&page&pageSize → {
//   run: { id, status, snapshot }, blocks: [{ block, total, conflicts, status: 'review'|'submitted'|'approved' }], waitlistedCount,
//   items: [{ applicationId, studentName, studentCode, pair, preference, bed, fit, issue: { label, tone } | null, resolved, reason }], total,
//   commitSummary: { students, balanceDueAt } }
// GET /assignment-runs/:runId/conflicts/:applicationId → { applicationId, studentName, preference, bed,
//   issue: { label, title, detail, tone }, options: [{ key, label, detail, recommended }] }
// POST …/conflicts/:applicationId/resolve { optionKey } or { waitlist: true } · POST /assignment-runs/:runId/commit { block }

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded-full border px-3 py-1.25 text-base font-medium whitespace-nowrap transition-colors',
        active ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line-strong bg-surface text-fg-secondary hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function ResolveOption({ option, checked, onChange }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer flex-col gap-1 rounded-lg transition-colors',
        checked ? 'border-2 border-primary bg-brand-subtle p-2.75' : 'border border-line bg-surface p-3 hover:border-line-strong',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="flex h-5.5 w-4 shrink-0 items-center">
          <input
            type="radio"
            name="resolution"
            checked={checked}
            onChange={onChange}
            className="size-4 appearance-none rounded-full border border-line-strong bg-surface checked:border-[5px] checked:border-primary"
          />
        </span>
        <span className="flex-1 text-base text-fg">{option.label}</span>
        {option.recommended && <Tag tone="success">Recommended</Tag>}
      </span>
      {option.detail && <span className="text-sm text-fg-secondary">{option.detail}</span>}
    </label>
  )
}

function CommitModal({ runId, block, summary, open, onClose, onDone }) {
  const { notifyError } = useToast()
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (open) setTyped('')
  }, [open])
  const commit = useMutation(() => api.assignment.commit(runId, { block }), {
    invalidates: ['proposal', 'assignment-runs', 'dashboard'],
    onSuccess: onDone,
    onError: (e) => notifyError(e, 'Could not submit the Block'),
  })
  const phrase = `COMMIT ${block}`
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={`Submit Block ${block} for Manager approval?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={typed.trim().toUpperCase() !== phrase || commit.pending} onClick={() => commit.run()}>
            {commit.pending ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-4 text-base">
        {[
          ['Students allocated', formatNumber(summary?.students)],
          ['Balance Invoices issued', summary ? `${formatNumber(summary.students)}${summary.balanceDueAt ? ` · due ${formatDateTime(summary.balanceDueAt)}` : ''}` : '—'],
          ['Notifications', summary ? `Push and in-app to ${formatNumber(summary.students)} students` : '—'],
          ['Run', runId],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-fg-secondary">{label}</span>
            <span className="font-medium text-fg">{value}</span>
          </div>
        ))}
      </div>
      <Alert type="warning" title="This cannot be undone">
        Allocations are created only after the Block Manager approves. Unassigned Applications move to Round 2. Other Blocks stay in review.
      </Alert>
      <Field label={`Type ${phrase} to confirm`}>{(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoComplete="off" />}</Field>
    </Modal>
  )
}

function ConflictPanel({ runId, applicationId, block, submitted, onResolved, onCommit, readyToCommit }) {
  const { notify, notifyError } = useToast()
  const conflict = useQuery(['proposal', 'conflict', runId, applicationId], ({ signal }) => api.assignment.conflict(runId, applicationId, { signal }), { enabled: Boolean(applicationId), keepPrevious: false })
  const [choice, setChoice] = useState(null)
  useEffect(() => {
    const opts = conflict.data?.options ?? []
    setChoice(opts.find((o) => o.recommended)?.key ?? opts[0]?.key ?? null)
  }, [conflict.data])
  const resolve = useMutation((body) => api.assignment.resolveConflict(runId, applicationId, body), {
    invalidates: ['proposal', 'assignment-runs'],
    onSuccess: (r) => {
      notify({ title: 'Change applied', message: 'Written to the run audit log.' })
      onResolved(r)
    },
    onError: (e) => notifyError(e, 'Could not apply the change'),
  })

  if (!applicationId) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm font-medium text-fg-tertiary">Resolve conflict</p>
        <p className="text-h3 font-semibold text-fg">{submitted ? `Block ${block} is with the Block Manager` : `No conflicts selected in Block ${block}`}</p>
        <p className="text-base text-fg-secondary">
          {submitted ? 'Allocations are created when the Manager approves the proposal.' : readyToCommit ? 'Every conflict is resolved. Submit the Block for Manager approval.' : 'Pick a conflict in the list to resolve it.'}
        </p>
        {!submitted && readyToCommit && (
          <Button variant="primary" icon={Check} onClick={onCommit}>
            Submit Block {block} for approval
          </Button>
        )}
      </div>
    )
  }

  return (
    <QueryState query={conflict} compact>
      {(c) => (
        <>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-fg-tertiary">Resolve conflict</p>
            <p className="text-h3 font-semibold text-fg">{c.studentName}</p>
            <p className="text-sm text-fg-secondary">
              {c.applicationId} · {c.preference} · proposed {c.bed}
            </p>
          </div>
          {c.issue && (
            <Alert type={c.issue.tone === 'error' ? 'error' : 'warning'} title={c.issue.title ?? c.issue.label}>
              {c.issue.detail}
            </Alert>
          )}
          <p className="text-base font-medium text-fg">Choose a new Bed · same Room Type and Room Class</p>
          <div role="radiogroup" className="flex flex-col gap-3">
            {(c.options ?? []).map((o) => (
              <ResolveOption key={o.key} option={o} checked={choice === o.key} onChange={() => setChoice(o.key)} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" icon={Check} onClick={() => resolve.run({ optionKey: choice })} disabled={!choice || resolve.pending}>
              Apply
            </Button>
            <Button onClick={() => resolve.run({ waitlist: true })} disabled={resolve.pending}>
              Move to waitlist
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-fg-tertiary">
            <Clock size={16} aria-hidden="true" />
            Every change is written to the run audit log.
          </p>
        </>
      )}
    </QueryState>
  )
}

export default function ProposalReview() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const [tab, setTab] = useState(null) // block letter or 'waitlisted'
  const [view, setView] = useState('conflicts')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState(null)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = { block: tab ?? undefined, view: tab === 'waitlisted' ? undefined : view, q: search, page, pageSize }
  const query = useQuery(['proposal', runId, filters], ({ signal }) => api.assignment.proposal(runId, filters, { signal }))
  const data = query.data
  const blocks = data?.blocks ?? []
  const activeBlock = tab && tab !== 'waitlisted' ? blocks.find((b) => b.block === tab) : null
  const items = data?.items ?? []

  // Open the first Block once the proposal loads.
  useEffect(() => {
    if (!tab && blocks.length) setTab(blocks[0].block)
  }, [tab, blocks])

  // Keep a conflict selected while the conflicts list is shown.
  useEffect(() => {
    if (tab === 'waitlisted') return
    const conflicts = items.filter((r) => r.issue && !r.resolved)
    if (!conflicts.some((r) => r.applicationId === selectedId)) setSelectedId(conflicts[0]?.applicationId ?? null)
  }, [items, tab, selectedId])

  const exporting = useMutation(() => api.exports.download('assignment-proposal', { runId, block: tab }, `${runId}-proposal.xlsx`), { onError: (e) => notifyError(e, 'Export failed') })
  const submitted = activeBlock && activeBlock.status !== 'review'
  const ready = activeBlock && activeBlock.conflicts === 0 && !submitted

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Assignment', to: '/staff/assignment' }, { label: runId }]} />}
        title={`Proposal · ${runId}`}
        badge={activeBlock && <Tag tone={submitted ? 'info' : 'warning'}>{activeBlock.status === 'approved' ? 'Approved' : submitted ? 'Waiting for Manager approval' : 'Staff review'}</Tag>}
        actions={
          <>
            {activeBlock && !submitted && (
              <p className="text-sm text-fg-tertiary">
                {activeBlock.conflicts ? `Resolve ${activeBlock.conflicts} ${activeBlock.conflicts === 1 ? 'conflict' : 'conflicts'} in Block ${tab} to submit` : `Block ${tab} is ready to submit`}
              </p>
            )}
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
            {activeBlock && (
              <Button variant="primary" icon={Check} disabled={!ready} onClick={() => setCommitting(true)}>
                {submitted ? `Block ${tab} submitted` : `Submit Block ${tab} for approval`}
              </Button>
            )}
          </>
        }
      />

      {blocks.length > 0 && (
        <Tabs
          className="shrink-0"
          value={tab}
          onChange={(key) => {
            setTab(key)
            setView('conflicts')
            setPage(1)
          }}
          items={[
            ...blocks.map((b) => ({ key: b.block, label: `Block ${b.block} · ${formatNumber(b.total)} · ${b.conflicts ? `${b.conflicts} ${b.conflicts === 1 ? 'conflict' : 'conflicts'}` : 'ready'}` })),
            { key: 'waitlisted', label: 'Waitlisted', count: data?.waitlistedCount },
          ]}
        />
      )}

      {tab !== 'waitlisted' && (
        <div className="flex shrink-0 items-center gap-2">
          {[
            ['all', `All ${formatNumber(activeBlock?.total)}`],
            ['proposed', `Proposed ${activeBlock ? formatNumber(activeBlock.total - activeBlock.conflicts) : '—'}`],
            ['conflicts', `Conflicts ${formatNumber(activeBlock?.conflicts)}`],
          ].map(([key, label]) => (
            <Chip
              key={key}
              active={view === key}
              onClick={() => {
                setView(key)
                setPage(1)
              }}
            >
              {label}
            </Chip>
          ))}
          <span className="flex-1" />
          <SearchInput wrapperClassName="w-60" aria-label="Search" placeholder="Search student or Bed" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {tab === 'waitlisted' ? (
            <Table fill>
              <THead>
                <tr>
                  <Th className="w-60">Student</Th>
                  <Th className="w-44">Preference</Th>
                  <Th>Reason</Th>
                </tr>
              </THead>
              <TBody>
                <TableStatus query={query} colSpan={3} emptyTitle="Nobody is waitlisted" />
                {items.map((w) => (
                  <Tr key={w.applicationId}>
                    <Td>
                      <TwoLine primary={w.studentName} secondary={`${w.studentCode} · ${w.applicationId}`} />
                    </Td>
                    <Td>{w.preference}</Td>
                    <Td className="text-fg-secondary">{w.reason}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <Table fill>
              <THead>
                <tr>
                  <Th className="w-48">Student</Th>
                  <Th className="w-36">Preference</Th>
                  <Th className="w-28">Proposed Bed</Th>
                  <Th className="w-20" align="right">
                    Room fit
                  </Th>
                  <Th>Issue</Th>
                </tr>
              </THead>
              <TBody>
                <TableStatus query={query} colSpan={5} emptyIcon={Layers} emptyTitle={view === 'conflicts' ? `No conflicts left in Block ${tab ?? ''}` : 'Nothing matches the search'} />
                {items.map((r) => {
                  const isSelected = r.applicationId === selectedId
                  const open = r.issue && !r.resolved
                  return (
                    <Tr
                      key={r.applicationId}
                      selected={isSelected}
                      onClick={open ? () => setSelectedId(r.applicationId) : undefined}
                      className={cx('[&>td]:h-14', isSelected && '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-primary)]')}
                    >
                      <Td>
                        <TwoLine primary={r.studentName} secondary={r.pair ? `${r.studentCode} · pair` : r.studentCode} />
                      </Td>
                      <Td className="whitespace-nowrap">{r.preference}</Td>
                      <Td className="font-medium whitespace-nowrap">{r.bed ?? '—'}</Td>
                      <Td align="right">{r.fit ?? '—'}</Td>
                      <Td>{r.resolved ? <Tag tone="success">Resolved</Tag> : r.issue ? <Tag tone={r.issue.tone ?? 'error'}>{r.issue.label}</Tag> : <span className="text-fg-tertiary">—</span>}</Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          )}
          <div className="flex shrink-0 justify-end">
            <Pagination
              total={data?.total ?? 0}
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

        {tab !== 'waitlisted' && (
          <Card className="flex min-h-0 w-100 shrink-0 flex-col gap-3.5 overflow-y-auto">
            {data === undefined && !query.loading && query.error ? (
              <EmptyBlock title="Proposal unavailable" />
            ) : (
              <ConflictPanel
                runId={runId}
                applicationId={selectedId}
                block={tab}
                submitted={submitted}
                readyToCommit={ready}
                onCommit={() => setCommitting(true)}
                onResolved={() => setSelectedId(null)}
              />
            )}
          </Card>
        )}
      </div>

      <CommitModal
        runId={runId}
        block={tab}
        summary={data?.commitSummary}
        open={committing}
        onClose={() => setCommitting(false)}
        onDone={() => {
          setCommitting(false)
          notify({ title: `Block ${tab} sent for approval`, message: 'The Block Manager can now approve it under Approvals.' })
          navigate('/staff/assignment')
        }}
      />
    </>
  )
}
