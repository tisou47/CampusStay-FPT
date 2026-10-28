import { useState } from 'react'
import { Check, Eye, Layers, Plus, Repeat2, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card, Steps } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { useRoleBase } from '@/lib/useRoleBase'

// SCR-ASG-10 Assignment Runs (Figma 35:1357)
// GET /assignment-runs?termId&block → {
//   current: { id, kind, status, statusTone, stage, startedAt, finishedAt, startedBy, snapshot, input, proposed, conflicts, waitlisted, averageFit } | null,
//   history: [{ id, kind, startedAt, startedBy, proposed, conflicts, waitlisted, status }],
//   rules: { snapshot, groups: [{ title, items: [string] }] } }
// POST /assignment-runs { termId, dryRun } → { id }

const pipeline = ['Eligibility filter', 'Priority order', 'Constraint checks', 'Proposal', 'Manager review', 'Commit per Block']

function Stat({ label, value, note, tone }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border border-line bg-subtle p-3.5">
      <p className="text-sm font-medium text-fg-tertiary">{t(label)}</p>
      <p className={cx('text-h2 font-semibold', tone === 'success' ? 'text-success-fg' : tone === 'warning' ? 'text-warning-fg' : 'text-fg')}>{value}</p>
      <p className="text-sm text-fg-secondary">{t(note)}</p>
    </div>
  )
}

// Round 2 (FR-APP-07, M8): the Waitlisted students without an open offer get held options on the free Beds (left
// by Round 1, or freed by forfeits, unpaid next-Term fees, ended stays and terminations); they accept or decline on
// their offer page before it expires (Admin › System parameters, round2.offer_hours).
function Round2Modal({ open, onClose, term }) {
  const { notify, notifyError } = useToast()
  const status = useQuery(['round2', term?.id], ({ signal }) => api.assignment.round2(term?.id, { signal }), { enabled: open && Boolean(term) })
  const s = status.data
  const run = useMutation(() => api.assignment.runRound2({ termId: term?.id }), {
    invalidates: ['round2', 'assignment-runs', 'dashboard'],
    onSuccess: (r) =>
      notify({
        title: t('Round 2 offers sent to {n} students', { n: formatNumber(r.offered) }),
        message: r.waitlisted ? t('{n} students are still waiting: no free Bed fits them.', { n: formatNumber(r.waitlisted) }) : t('Every waitlisted student has an offer to answer.'),
      }),
    onError: (e) => notifyError(e, 'Could not run Round 2'),
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Round 2 · {term}', { term: term?.name ?? '' })}
      description="Waitlisted students without an open offer get up to three held Beds of other kinds, nearest price first, in partly filled Rooms first."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Repeat2} disabled={!s?.waitlisted || !s?.freeBeds || run.pending} onClick={() => run.run()}>
            Send Round 2 offers
          </Button>
        </>
      }
    >
      <QueryState query={status} compact>
        {(d) => (
          <dl className="grid grid-cols-3 gap-3">
            {[
              ['Waitlisted without an offer', d.waitlisted],
              ['Offers waiting for an answer', d.openOffers],
              ['Free Beds', d.freeBeds],
            ].map(([label, n]) => (
              <div key={label} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                <dt className="text-sm text-fg-secondary">{t(label)}</dt>
                <dd className="text-h2 font-semibold text-fg tabular">{formatNumber(n)}</dd>
              </div>
            ))}
          </dl>
        )}
      </QueryState>
    </Modal>
  )
}

export default function AssignmentRuns() {
  const base = useRoleBase()
  const scope = useScopeQuery()
  const { term } = useSession()
  const { notify, notifyError } = useToast()
  const [starting, setStarting] = useState(null) // 'dry' | 'final'
  const [round2Open, setRound2Open] = useState(false)
  const query = useQuery(['assignment-runs', scope], ({ signal }) => api.assignment.runs(scope, { signal }))
  const run = query.data?.current
  const rules = query.data?.rules
  const start = useMutation((dryRun) => api.assignment.start({ termId: term?.id, dryRun }), {
    invalidates: ['assignment-runs', 'dashboard'],
    onSuccess: (r, dryRun) => {
      setStarting(null)
      notify({ type: 'info', title: dryRun ? 'Dry run started' : 'Assignment run started', message: t('{id} is processing. Results appear here when it finishes.', { id: r?.id ?? t('The run') }) })
    },
    onError: (e) => notifyError(e, 'Could not start the run'),
  })

  return (
    <>
      <PageHeader
        title="Assignment"
        description="The engine proposes a Room and Bed for every Approved Application. Managers resolve conflicts and commit per Block."
        actions={
          <>
            <Button icon={Eye} onClick={() => setStarting('dry')} disabled={!term}>
              Dry run
            </Button>
            <Button icon={Plus} onClick={() => setStarting('final')} disabled={!term}>
              Start new run
            </Button>
            <Button icon={Repeat2} onClick={() => setRound2Open(true)} disabled={!term}>
              Round 2
            </Button>
          </>
        }
      />
      <Round2Modal open={round2Open} onClose={() => setRound2Open(false)} term={term} />

      <Card className="flex shrink-0 flex-col gap-4">
        <QueryState query={query} compact isEmpty={(d) => !d.current} empty={<EmptyBlock icon={Layers} title="No assignment run yet">Start a dry run to preview the proposal, or a final run when review is done.</EmptyBlock>}>
          {() => (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-h2 font-semibold text-fg">
                    {run.id} · {tr(run.kind)}
                  </h2>
                  <Tag tone={run.statusTone ?? 'info'}>{run.status}</Tag>
                </div>
                <Button variant="primary" icon={Layers} to={`${base}/assignment/${run.id}`}>
                  Open proposal
                </Button>
              </div>
              <p className="text-sm text-fg-tertiary">
                {t('Started by {name} · {date}', { name: run.startedBy, date: formatDateTime(run.startedAt) })}
                {run.finishedAt ? ` · ${t('finished {time}', { time: formatTime(run.finishedAt) })}` : ` · ${t('running')}`}
                {run.snapshot ? ` · ${t('rules snapshot {v}', { v: run.snapshot })}` : ''}
              </p>
              <div className="py-1">
                <Steps steps={pipeline} current={run.stage ?? 3} compact />
              </div>
              <div className="flex gap-4">
                <Stat label="Input" value={formatNumber(run.input)} note="Approved Applications" />
                <Stat label="Proposed" value={formatNumber(run.proposed)} note="Room and Bed found" tone="success" />
                <Stat label="Conflicts" value={formatNumber(run.conflicts)} note="Need a Manager decision" tone={run.conflicts ? 'warning' : undefined} />
                <Stat label="Waitlisted" value={formatNumber(run.waitlisted)} note="No Bed of chosen type" tone={run.waitlisted ? 'warning' : undefined} />
                <Stat label="Average Room fit" value={run.averageFit != null ? `${run.averageFit} / 100` : '—'} note="Major and hometown match" />
              </div>
            </>
          )}
        </QueryState>
      </Card>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card padding="none" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <h2 className="shrink-0 px-5 py-4 text-h3 font-semibold text-fg">{t('Run history')}</h2>
          <Table bare inset="lg" fill>
            <THead>
              <tr>
                <Th className="w-36">Run</Th>
                <Th className="w-44">Started</Th>
                <Th>Result</Th>
                <Th className="w-36">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={4} rows={query.data?.history} emptyTitle="No runs yet" />
              {(query.data?.history ?? []).map((r) => (
                <Tr key={r.id} className="[&>td]:h-14">
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-medium text-fg-brand">{r.id}</span>
                      <span className="text-sm text-fg-tertiary">{tr(r.kind)}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span>{formatDateTime(r.startedAt)}</span>
                      <span className="text-sm text-fg-tertiary">{r.startedBy}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span>{t('{n} proposed', { n: formatNumber(r.proposed) })}</span>
                      <span className="text-sm text-fg-tertiary">
                        {t('{c} conflicts · {w} waitlisted', { c: r.conflicts, w: r.waitlisted })}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <StatusTag status={r.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card className="flex min-h-0 w-100 shrink-0 flex-col gap-2.5">
          <div className="flex shrink-0 items-center justify-between">
            <h2 className="text-h3 font-semibold text-fg">{t('Rules in this run')}</h2>
            {rules?.snapshot && <Tag>{t('Snapshot {v}', { v: rules.snapshot })}</Tag>}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
            {(rules?.groups ?? []).map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <p className="text-sm font-medium text-fg-tertiary uppercase">{tr(group.title)}</p>
                {group.items.map((rule) => (
                  <p key={rule} className="flex items-start gap-2 text-base text-fg">
                    <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
                    {tr(rule)}
                  </p>
                ))}
              </div>
            ))}
            {query.data && !rules?.groups?.length && <p className="text-base text-fg-secondary">{t('No rules snapshot.')}</p>}
          </div>
          <p className="shrink-0 text-sm text-fg-tertiary">
            <SlidersHorizontal size={14} aria-hidden="true" className="mr-1 inline" />
            {t('Admin edits the rules in Roommate matching.')}
          </p>
        </Card>
      </div>

      <Modal
        open={Boolean(starting)}
        onClose={() => setStarting(null)}
        title={starting === 'dry' ? 'Start a dry run?' : 'Start a new final run?'}
        description={starting === 'dry' ? 'The engine runs with the current rules. Results are shown but not saved.' : 'A new final run replaces the proposal that is in review now.'}
        footer={
          <>
            <Button onClick={() => setStarting(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => start.run(starting === 'dry')} disabled={start.pending}>
              {start.pending ? t('Starting…') : t('Start run')}
            </Button>
          </>
        }
      />
    </>
  )
}
