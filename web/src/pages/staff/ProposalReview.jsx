import { useEffect, useRef, useState } from 'react'
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
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'
import { useRoleBase } from '@/lib/useRoleBase'

// SCR-ASG-11 Assignment Proposal Review (Figma 36:1580) and "Commit Block" modal (36:1994).
// A Manager commits a Block: Allocations, Balance Invoices and notifications are created at once (ADR-19, C-38).
// GET /assignment-runs/:runId/proposal?block&view=conflicts|proposed|all&q&page&pageSize → {
//   run: { id, kind, status, statusTone, startedAt, finishedAt, startedBy, snapshot, input, proposed, conflicts, waitlisted, averageFit },
//   editable (false: a dry run or a run that is committed, discarded or failed, shown read only), blocks: [{ block, total, conflicts, status: 'review'|'submitted'|'approved' }], waitlistedCount,
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
        <span className="flex-1 text-base text-fg">{tr(option.label)}</span>
        {option.recommended && <Tag tone="success">{t('Recommended')}</Tag>}
      </span>
      {option.detail && <span className="text-sm text-fg-secondary">{tr(option.detail)}</span>}
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
    onError: (e) => notifyError(e, 'Could not commit the block'),
  })
  const phrase = `COMMIT ${block}`
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={t('Commit Block {code}?', { code: block })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={typed.trim().toUpperCase() !== phrase || commit.pending} onClick={() => commit.run()}>
            {commit.pending ? t('Committing…') : t('Commit block')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-4 text-base">
        {[
          ['Students allocated', formatNumber(summary?.students)],
          ['Balance invoices issued', summary ? `${formatNumber(summary.students)}${summary.balanceDueAt ? ` · ${t('due {date}', { date: formatDateTime(summary.balanceDueAt) })}` : ''}` : '—'],
          ['Notifications', summary ? t('Push and in-app to {n} students', { n: formatNumber(summary.students) }) : '—'],
          ['Run', runId],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-fg-secondary">{t(label)}</span>
            <span className="font-medium text-fg">{value}</span>
          </div>
        ))}
      </div>
      <Alert type="warning" title="This cannot be undone">
        {t('Allocations, balance invoices and notifications are created now. Unassigned applications move to Round 2. Other blocks stay in review.')}
      </Alert>
      <Field label={t('Type {phrase} to confirm', { phrase })}>{(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoComplete="off" />}</Field>
    </Modal>
  )
}

/** One block in the left list: its name and size, with its state on the right. */
function BlockButton({ active, onClick, title, note, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
        active ? 'bg-primary-subtle shadow-[inset_3px_0_0_var(--color-primary)]' : 'hover:bg-subtle',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className={cx('text-base font-medium', active ? 'text-fg-brand' : 'text-fg')}>{title}</span>
        <span className="truncate text-sm text-fg-tertiary">{note}</span>
      </span>
      {children}
    </button>
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
        <p className="text-sm font-medium text-fg-tertiary">{t('Resolve conflict')}</p>
        <p className="text-h3 font-semibold text-fg">{submitted ? t('Block {code} is committed', { code: block }) : t('No conflicts selected in Block {code}', { code: block })}</p>
        <p className="text-base text-fg-secondary">
          {submitted ? t('Its allocations and balance invoices are created.') : readyToCommit ? t('Every conflict is resolved. Commit the block to create its allocations.') : t('Pick a conflict in the list to resolve it.')}
        </p>
        {!submitted && readyToCommit && (
          <Button variant="primary" icon={Check} onClick={onCommit}>
            {t('Commit Block {code}', { code: block })}
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
            <p className="text-sm font-medium text-fg-tertiary">{t('Resolve conflict')}</p>
            <p className="text-h3 font-semibold text-fg">{c.studentName}</p>
            <p className="text-sm text-fg-secondary">
              {c.applicationId} · {tr(c.preference)} · {t('proposed {bed}', { bed: c.bed ?? '—' })}
            </p>
          </div>
          {c.issue && (
            <Alert type={c.issue.tone === 'error' ? 'error' : 'warning'} title={tr(c.issue.title ?? c.issue.label)}>
              {tr(c.issue.detail)}
            </Alert>
          )}
          <p className="text-base font-medium text-fg">{t('Choose how to resolve it')}</p>
          <div role="radiogroup" className="flex flex-col gap-3">
            {(c.options ?? []).map((o) => (
              <ResolveOption key={o.key} option={o} checked={choice === o.key} onChange={() => setChoice(o.key)} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" icon={Check} onClick={() => resolve.run({ optionKey: choice })} disabled={!choice || resolve.pending}>
              Apply
            </Button>
            <Button tip="Leave this application without a bed for now. It can still get one in Round 2." onClick={() => resolve.run({ waitlist: true })} disabled={resolve.pending}>
              Move to waitlist
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-fg-tertiary">
            <Clock size={16} aria-hidden="true" />
            {t('Every change is written to the run audit log.')}
          </p>
        </>
      )}
    </QueryState>
  )
}

export default function ProposalReview() {
  const base = useRoleBase()
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
  const readOnly = data?.editable === false

  // A run that can no longer change has no conflicts left to work on: show its whole proposal.
  const viewChosen = useRef(false)
  useEffect(() => {
    if (readOnly && !viewChosen.current && view === 'conflicts') setView('all')
    if (data) viewChosen.current = true
  }, [readOnly, data, view])

  // Open the first Block once the proposal loads.
  useEffect(() => {
    if (!tab && blocks.length) setTab(blocks[0].block)
  }, [tab, blocks])

  // Keep a conflict selected while the conflicts list is shown.
  useEffect(() => {
    if (tab === 'waitlisted' || readOnly) return
    const conflicts = items.filter((r) => r.issue && !r.resolved)
    if (!conflicts.some((r) => r.applicationId === selectedId)) setSelectedId(conflicts[0]?.applicationId ?? null)
  }, [items, tab, selectedId, readOnly])

  const exporting = useMutation(() => api.exports.download('assignment-proposal', { runId, block: tab }, `${runId}-proposal.xlsx`), { onError: (e) => notifyError(e, 'Export failed') })
  const submitted = activeBlock && activeBlock.status !== 'review'
  const ready = activeBlock && activeBlock.conflicts === 0 && !submitted && !readOnly
  const run = data?.run
  const choose = (key) => {
    const b = blocks.find((x) => x.block === key)
    setTab(key)
    setView(!readOnly && b?.conflicts ? 'conflicts' : 'all')
    setPage(1)
  }

  const committed = run?.status === 'Committed'
  const blockState = (b) => (b.status !== 'review' ? { label: 'Committed', tone: 'success' } : readOnly ? { label: 'Preview', tone: 'neutral' } : b.conflicts ? { label: t('{n} conflicts', { n: b.conflicts }), tone: 'warning' } : { label: 'Ready to commit', tone: 'info' })
  const showIssues = !readOnly
  const columns = showIssues ? 4 : 3

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Assignment', to: `${base}/assignment` }, { label: runId }]} />}
        title={committed ? t('Assignment result · {id}', { id: runId }) : t('Proposal · {id}', { id: runId })}
        badge={run && <Tag tone={run.statusTone ?? 'neutral'}>{run.status}</Tag>}
        actions={
          <>
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
            {activeBlock && !readOnly && (
              <Button tip="Fix the proposed beds of this block for good. Every conflict must be resolved first." variant="primary" icon={Check} disabled={!ready} onClick={() => setCommitting(true)}>
                {submitted ? t('Block {code} committed', { code: tab }) : t('Commit Block {code}', { code: tab })}
              </Button>
            )}
          </>
        }
      />

      {/* Blocks on the left, the chosen block's students in the middle, the conflict being resolved on the right
          (only while the run can still change). */}
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card padding="none" className="flex min-h-0 w-60 shrink-0 flex-col overflow-hidden">
          <p className="shrink-0 px-4 pt-4 pb-2 text-sm font-medium text-fg-tertiary">{t('Blocks')}</p>
          <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
            {blocks.map((b) => {
              const state = blockState(b)
              return (
                <li key={b.block}>
                  <BlockButton active={tab === b.block} onClick={() => choose(b.block)} title={t('Block {code}', { code: b.block })} note={t('{n} students', { n: formatNumber(b.total) })}>
                    <Tag tone={state.tone}>{state.label}</Tag>
                  </BlockButton>
                </li>
              )
            })}
            {blocks.length > 0 && (
              <li className="mt-1 border-t border-line pt-1">
                <BlockButton active={tab === 'waitlisted'} onClick={() => choose('waitlisted')} title={t('Waitlisted')} note={t('No bed of the chosen type')}>
                  <span className={cx('text-base font-semibold tabular', data?.waitlistedCount ? 'text-warning-fg' : 'text-fg-tertiary')}>{formatNumber(data?.waitlistedCount ?? 0)}</span>
                </BlockButton>
              </li>
            )}
          </ul>
          {readOnly && <p className="shrink-0 border-t border-line px-4 py-3 text-sm text-fg-tertiary">{run?.kind === 'Dry run' ? t('A dry run is a preview: nothing in it can be changed or committed.') : t('This run can no longer change: its proposal is shown read only.')}</p>}
        </Card>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="mr-2 text-h3 font-semibold whitespace-nowrap text-fg">
              {tab === 'waitlisted' ? t('Waitlisted') : tab ? t('Block {code}', { code: tab }) : ''}
              {activeBlock && <span className="ml-2 text-sm font-normal text-fg-tertiary">{t('{n} students', { n: formatNumber(activeBlock.total) })}</span>}
            </h2>
            {tab !== 'waitlisted' &&
              !readOnly &&
              [
                ['all', `${t('All')} ${formatNumber(activeBlock?.total)}`],
                ['conflicts', `${t('Conflicts')} ${formatNumber(activeBlock?.conflicts)}`],
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
            {activeBlock && !submitted && !readOnly && (
              <p className="text-sm text-fg-tertiary">
                {activeBlock.conflicts ? t('Resolve {n} conflicts in Block {code} to commit it', { n: activeBlock.conflicts, code: tab }) : t('Block {code} is ready to commit', { code: tab })}
              </p>
            )}
            <SearchInput wrapperClassName="w-60" aria-label={t('Search')} placeholder="Search student or bed" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

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
                    <Td>{tr(w.preference)}</Td>
                    <Td className="text-fg-secondary">{tr(w.reason)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <Table fill>
              <THead>
                <tr>
                  <Th>Student</Th>
                  <Th className="w-[28%]">Preference</Th>
                  <Th className="w-[22%]">{committed ? 'Bed' : 'Proposed bed'}</Th>
                  {showIssues && <Th className="w-[22%]">Issue</Th>}
                </tr>
              </THead>
              <TBody>
                <TableStatus query={query} colSpan={columns} emptyIcon={Layers} emptyTitle={!blocks.length ? t('This run has no proposal to show') : view === 'conflicts' ? t('No conflicts left in Block {code}', { code: tab ?? '' }) : t('Nothing matches the search')} />
                {items.map((r) => {
                  const isSelected = r.applicationId === selectedId
                  const open = r.issue && !r.resolved && !readOnly
                  return (
                    <Tr
                      key={r.applicationId}
                      selected={isSelected}
                      onClick={open ? () => setSelectedId(r.applicationId) : undefined}
                      className={cx('[&>td]:h-13', isSelected && '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-primary)]')}
                    >
                      <Td>
                        <TwoLine primary={r.studentName} secondary={r.pair ? `${r.studentCode} · ${t('pair')}` : r.studentCode} />
                      </Td>
                      <Td className="whitespace-nowrap text-fg-secondary">{tr(r.preference)}</Td>
                      <Td className="font-medium whitespace-nowrap">{r.bed ?? <span className="text-fg-tertiary">—</span>}</Td>
                      {showIssues && <Td>{r.resolved ? <Tag tone="success">{t('Resolved')}</Tag> : r.issue ? <Tag tone={r.issue.tone ?? 'error'}>{r.issue.label}</Tag> : <span className="text-fg-tertiary">—</span>}</Td>}
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

        {tab !== 'waitlisted' && !readOnly && (
          <Card className="flex min-h-0 w-96 shrink-0 flex-col gap-3.5 overflow-y-auto">
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
          notify({ title: t('Block {code} committed', { code: tab }), message: t('Allocations, balance invoices and notifications were created.') })
          navigate(`${base}/assignment`)
        }}
      />
    </>
  )
}
