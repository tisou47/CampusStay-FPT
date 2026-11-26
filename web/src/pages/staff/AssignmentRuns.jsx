import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Check, ChevronRight, CircleCheck, Eye, Layers, Plus, Repeat2, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card, Note, ProgressBar, Steps } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { InfoTip } from '@/components/ui/Tooltip'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber, formatTime, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import { useRoleBase } from '@/lib/useRoleBase'

// SCR-ASG-10 Assignment Runs (Figma 35:1357), with the Round 2 tab (A-58).
// GET /assignment-runs?termId&block → {
//   current: { id, kind, status, statusTone, stage, startedAt, finishedAt, startedBy, snapshot, input, proposed, conflicts, waitlisted, averageFit } | null,
//   history: [{ id, kind, startedAt, startedBy, proposed, conflicts, waitlisted, status }],
//   rules: { snapshot, groups: [{ title, items: [string] }] } }
// POST /assignment-runs { termId, dryRun } → { id }
// GET /round2?termId → { waitlisted, openOffers, freeBeds } · POST /round2/run { termId } → { offered, waitlisted, freeBeds }
// GET /round2/offers?termId&status&q&page&pageSize → { items, total, counts: { pending, accepted, declined, expired, withdrawn, noOffer } }

const pipeline = ['Eligibility filter', 'Priority order', 'Constraint checks', 'Proposal', 'Manager review', 'Commit per block']

const offerTone = { Pending: 'warning', Accepted: 'success', Declined: 'neutral', Expired: 'error', Withdrawn: 'neutral', 'No offer': 'info' }

function signed(n) {
  if (!n) return t('same price')
  return `${n > 0 ? '+' : '−'}${formatVnd(Math.abs(n))}`
}

/** Who Round 2 reached: the students with an offer and those still waiting for one (FR-APP-07, M8). */
// One Round 2 figure: a compact box with the number over its label and why it matters.
function Count({ label, value, note, tone }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-0.5 rounded-lg bg-subtle px-3.5 py-3">
      <dt className="flex flex-col">
        <span className="truncate text-sm font-medium text-fg-secondary">{t(label)}</span>
        <span className="truncate text-sm text-fg-tertiary" title={t(note)}>
          {t(note)}
        </span>
      </dt>
      <dd className={cx('text-h2 font-semibold tabular', tone === 'warning' ? 'text-warning-fg' : tone === 'success' ? 'text-success-fg' : 'text-fg')}>{formatNumber(value ?? 0)}</dd>
    </div>
  )
}

function Round2Tab({ term }) {
  const { notify, notifyError } = useToast()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [confirming, setConfirming] = useState(false)
  const summary = useQuery(['round2', term?.id], ({ signal }) => api.assignment.round2(term?.id, { signal }), { enabled: Boolean(term) })
  const filters = { termId: term?.id, status: status || undefined, q: q.trim() || undefined, page, pageSize }
  const offers = useQuery(['round2', 'offers', filters], ({ signal }) => api.assignment.round2Offers(filters, { signal }), { enabled: Boolean(term) })
  const s = summary.data
  const c = offers.data?.counts
  const run = useMutation(() => api.assignment.runRound2({ termId: term?.id }), {
    invalidates: ['round2', 'assignment-runs', 'dashboard'],
    onSuccess: (r) => {
      setConfirming(false)
      setStatus('Pending')
      setPage(1)
      notify({
        title: t('Round 2 offers sent to {n} students', { n: formatNumber(r.offered) }),
        message: r.waitlisted ? t('{n} students are still waiting: no free bed fits them.', { n: formatNumber(r.waitlisted) }) : t('Every waitlisted student has an offer to answer.'),
      })
    },
    onError: (e) => notifyError(e, 'Could not run Round 2'),
  })
  const tabs = [
    { key: '', label: 'All' },
    { key: 'No offer', label: 'Waiting, no offer', count: c?.noOffer },
    { key: 'Pending', label: 'Waiting for an answer', count: c?.pending },
    { key: 'Accepted', label: 'Accepted', count: c?.accepted },
    { key: 'Declined', label: 'Declined', count: c?.declined },
    { key: 'Expired', label: 'Expired', count: c?.expired },
  ]
  const items = offers.data?.items ?? []

  // Nothing to offer and nobody reached yet: the list would be empty, so the page says so instead.
  const reached = c ? Object.values(c).some(Boolean) : false
  const idle = Boolean(s) && !s.waitlisted && !s.openOffers && !reached && !offers.loading
  const visibleTabs = tabs.filter((x) => x.key === '' || x.key === status || x.count)

  return (
    <>
      {/* One card: where Round 2 stands, in four figures, and the button that sends it. */}
      <Card className="flex shrink-0 flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
              {t('Round 2 offers')}
              <InfoTip label="Waitlisted students without an open offer get up to three held beds of other kinds, nearest price first, in partly filled rooms first. They choose one or decline on their offer page; an unanswered offer expires and the application is cancelled with its deposit refunded." />
            </h2>
            <p className="text-base text-fg-secondary">{t('Free beds of other kinds are offered to students left on the waitlist after Round 1.')}</p>
          </div>
          <Button tip="Offer the free beds to waitlisted students. Needs waitlisted students and free beds in this term." variant="primary" icon={Repeat2} disabled={!term || !s?.waitlisted || !s?.freeBeds || run.pending} onClick={() => setConfirming(true)}>
            Send Round 2 offers
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Count label="Waitlisted without an offer" value={s?.waitlisted} note="Get options when you send Round 2" tone={s?.waitlisted ? 'warning' : undefined} />
          <Count label="Offers waiting for an answer" value={s?.openOffers} note="Their beds are held until the offer expires" />
          <Count label="Accepted" value={c?.accepted} note="Allocated, with a balance to pay" tone={c?.accepted ? 'success' : undefined} />
          <Count label="Free beds" value={s?.freeBeds} note="Nobody holds them in this term" />
        </dl>
      </Card>

      {idle ? (
        <Card className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyBlock icon={CircleCheck} title="Round 2 is not needed now">
            {t('Nobody is on the waitlist: every approved application got a bed in Round 1. {n} beds are still free in this term.', { n: formatNumber(s.freeBeds) })}
          </EmptyBlock>
        </Card>
      ) : (
        <Card padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-end justify-between gap-4 px-5 pt-2">
            <Tabs
              items={visibleTabs}
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPage(1)
              }}
              className="border-b-0"
            />
            <SearchInput
              wrapperClassName="mb-2 w-72"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder={t('Student name or code, application')}
              aria-label={t('Search')}
            />
          </div>
          <Table bare inset="lg" fill className="border-t border-line">
            <THead>
              <tr>
                <Th>Student</Th>
                <Th className="w-56">Asked for</Th>
                <Th>Options offered</Th>
                <Th className="w-44">Offered · answer by</Th>
                <Th className="w-40">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={offers} colSpan={5} rows={items} emptyIcon={Repeat2} emptyTitle={status ? 'No student in this list' : 'Round 2 has not reached anyone yet'} />
              {items.map((o) => (
                <Tr key={o.id ?? o.applicationId} className="[&>td]:py-2.5 [&>td]:align-top">
                  <Td>
                    <TwoLine primary={o.studentName} secondary={`${o.studentCode} · ${o.applicationId}`} />
                  </Td>
                  <Td className="text-fg-secondary">{tr(o.requested)}</Td>
                  <Td>
                    {o.options.length ? (
                      <ul className="flex flex-col gap-1">
                        {o.options.map((x, i) => (
                          <li key={i} className={cx('flex items-center gap-1.5 text-sm', x.chosen ? 'font-medium text-success-fg' : 'text-fg')}>
                            {x.chosen && <Check size={14} aria-hidden="true" />}
                            {t('Block {code}', { code: x.block })} · {tr(x.roomTypeName)} {tr(x.roomClassName)}
                            <span className="text-fg-tertiary">· {signed(x.difference)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-sm text-fg-tertiary">{t('No free bed fitted yet')}</span>
                    )}
                  </Td>
                  <Td>
                    {o.offeredAt ? (
                      <TwoLine
                        primary={formatDateTime(o.offeredAt)}
                        secondary={o.respondedAt ? t('Answered {date}', { date: formatDateTime(o.respondedAt) }) : t('Until {date}', { date: formatDateTime(o.expiresAt) })}
                      />
                    ) : (
                      <span className="text-fg-tertiary">—</span>
                    )}
                  </Td>
                  <Td>
                    <Tag tone={offerTone[o.status] ?? 'neutral'}>{o.status === 'No offer' ? 'Waiting, no offer' : o.status === 'Pending' ? 'Waiting for an answer' : o.status}</Tag>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end border-t border-line px-5 py-2">
            <Pagination
              total={offers.data?.total ?? 0}
              page={page}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </div>
        </Card>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('Send Round 2 offers · {term}', { term: term?.name ?? '' })}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" icon={Repeat2} disabled={run.pending} onClick={() => run.run()}>
              {run.pending ? t('Sending…') : t('Send offers')}
            </Button>
          </>
        }
      >
        <p className="text-base text-fg-secondary">
          {t('{n} waitlisted students get held options among {beds} free beds. Each student is notified in the app and by email and answers before the offer expires.', {
            n: formatNumber(s?.waitlisted ?? 0),
            beds: formatNumber(s?.freeBeds ?? 0),
          })}
        </p>
      </Modal>
    </>
  )
}

function RunsTab({ query, base }) {
  const navigate = useNavigate()
  const run = query.data?.current
  const rules = query.data?.rules
  const history = query.data?.history ?? []
  return (
    // Two columns fill the screen: the run in force with the history under it | the rules at full height.
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-4">
        {/* The run in force: who started it, then one result line — how many applications got a bed. */}
        <Card className="flex shrink-0 flex-col gap-4">
          <QueryState query={query} compact isEmpty={(d) => !d.current} empty={<EmptyBlock icon={Layers} title="No assignment run yet">Start a dry run to preview the proposal, or a final run when review is done.</EmptyBlock>}>
            {() => <CurrentRun run={run} base={base} />}
          </QueryState>
        </Card>

        <Card className="flex min-h-[240px] flex-1 flex-col gap-3 xl:min-h-0">
          <div className="flex shrink-0 items-baseline justify-between gap-3">
            <h2 className="text-h3 font-semibold text-fg">
              {t('Run history')} <span className="text-sm font-normal text-fg-tertiary">{history.length}</span>
            </h2>
            <span className="truncate text-sm text-fg-tertiary">{t('Open a run to see each student, room and bed it proposed')}</span>
          </div>
          <QueryState query={query} compact isEmpty={() => !history.length} empty={<p className="text-base text-fg-secondary">{t('No runs yet')}</p>}>
            {() => (
              <ul className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
                {history.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`${base}/assignment/${r.id}`)}
                      className="flex w-full items-center gap-4 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="flex w-32 shrink-0 flex-col">
                        <span className="font-medium text-fg-brand">{r.id}</span>
                        <span className="text-sm text-fg-tertiary">{tr(r.kind)}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-base text-fg">{t('{n} proposed', { n: formatNumber(r.proposed) })}</span>
                        <span className="truncate text-sm text-fg-tertiary">
                          {formatDateTime(r.startedAt)} · {r.startedBy} · {t('{c} conflicts · {w} waitlisted', { c: r.conflicts, w: r.waitlisted })}
                        </span>
                      </span>
                      <StatusTag status={r.status} />
                      <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-fg-tertiary" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-h3 font-semibold text-fg">{t('Rules in this run')}</h2>
          {rules?.snapshot && <Tag>{t('Snapshot {v}', { v: rules.snapshot })}</Tag>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {(rules?.groups ?? []).map((group) => (
            <details key={group.title} open className="group rounded-md border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-fg-secondary [&::-webkit-details-marker]:hidden">
                <span className="uppercase">{tr(group.title)}</span>
                <span className="flex items-center gap-1 text-fg-tertiary">
                  {group.items.length}
                  <ChevronRight size={16} aria-hidden="true" className="transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <ul className="flex flex-col gap-1.5 px-3 pb-3">
                {group.items.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-base text-fg">
                    <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
                    {tr(rule)}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {query.data && !rules?.groups?.length && <p className="text-base text-fg-secondary">{t('No rules snapshot.')}</p>}
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-sm text-fg-tertiary">
          <SlidersHorizontal size={14} aria-hidden="true" />
          {t('Admin edits the rules in roommate matching.')}
        </p>
      </Card>
    </div>
  )
}

function CurrentRun({ run, base }) {
  const committed = run.status === 'Committed'
  const input = run.input ?? 0
  const proposed = run.proposed ?? 0
  const pct = input ? Math.round((proposed / input) * 100) : 0
  const attention = run.conflicts > 0 || run.waitlisted > 0
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <h2 className="text-h2 font-semibold text-fg">
              {run.id} · {tr(run.kind)}
            </h2>
            <Tag tone={run.statusTone ?? 'info'}>{run.status}</Tag>
          </div>
          <p className="text-sm text-fg-tertiary">
            {t('Started by {name} · {date}', { name: run.startedBy, date: formatDateTime(run.startedAt) })}
            {run.finishedAt ? ` · ${t('finished {time}', { time: formatTime(run.finishedAt) })}` : ` · ${t('running')}`}
            {run.snapshot ? ` · ${t('rules snapshot {v}', { v: run.snapshot })}` : ''}
          </p>
        </div>
        <Button variant="primary" icon={Layers} to={`${base}/assignment/${run.id}`}>
          {run.conflicts > 0 && !committed ? 'Resolve conflicts' : committed ? 'View result' : 'Open proposal'}
        </Button>
      </div>

      {run.input === 0 && run.finishedAt && (
        <Note>
          {t('Nothing to propose: no Approved application is waiting for a bed. Applications are placed by the run that was committed; students left without a bed are Waitlisted and reached by Round 2.')}
        </Note>
      )}

      {/* The engine's stages only matter while the run is moving; a committed run shows its result alone. */}
      {!committed && (
        <div className="py-1">
          <Steps steps={pipeline} current={run.stage ?? 3} compact />
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg bg-subtle px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-base text-fg-secondary">
            <span className="text-h2 font-semibold text-fg tabular">{formatNumber(proposed)}</span>
            <span className="tabular"> / {formatNumber(input)} </span>
            {t('approved applications have a room and bed')}
          </p>
          <span className={cx('text-h3 font-semibold tabular', attention ? 'text-warning-fg' : 'text-success-fg')}>{pct}%</span>
        </div>
        <ProgressBar value={proposed} max={input || 1} tone={attention ? 'warning' : 'success'} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <Figure label="Conflicts" value={run.conflicts} warn={run.conflicts > 0} note="need a manager decision" />
          <Figure label="Waitlisted" value={run.waitlisted} warn={run.waitlisted > 0} note="no bed of the chosen type" />
        </div>
      </div>
    </>
  )
}

// A small count under the result bar: amber with its reason when it needs someone, quiet when it is zero.
function Figure({ label, value, warn, note }) {
  return (
    <span className={warn ? 'text-warning-fg' : 'text-fg-secondary'}>
      {t(label)}: <span className={cx('font-semibold tabular', warn ? 'text-warning-fg' : 'text-fg')}>{formatNumber(value ?? 0)}</span>
      {warn && <span> · {t(note)}</span>}
    </span>
  )
}

export default function AssignmentRuns() {
  const base = useRoleBase()
  const scope = useScopeQuery()
  const { term } = useSession()
  const { notify, notifyError } = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'round2' ? 'round2' : 'runs'
  const [starting, setStarting] = useState(null) // 'dry' | 'final'
  const query = useQuery(['assignment-runs', scope], ({ signal }) => api.assignment.runs(scope, { signal }))
  const round2 = useQuery(['round2', term?.id], ({ signal }) => api.assignment.round2(term?.id, { signal }), { enabled: Boolean(term) })
  const start = useMutation((dryRun) => api.assignment.start({ termId: term?.id, dryRun }), {
    invalidates: ['assignment-runs', 'dashboard'],
    onSuccess: (r, dryRun) => {
      setStarting(null)
      notify({ type: 'info', title: dryRun ? 'Dry run started' : 'Assignment run started', message: t('{id} is processing. Results appear here when it finishes.', { id: r?.id ?? t('The run') }) })
    },
    onError: (e) => notifyError(e, 'Could not start the run'),
  })
  const waiting = round2.data ? round2.data.waitlisted + round2.data.openOffers : null

  return (
    <>
      <PageHeader
        title="Assignment"
        tip="Managers resolve conflicts and commit per block; Round 2 then offers the free beds to waitlisted students."
        actions={
          tab === 'runs' && (
            <>
              <Button tip="Try the engine without saving anything, to preview its proposals before a real run." icon={Eye} onClick={() => setStarting('dry')} disabled={!term}>
                Dry run
              </Button>
              <Button tip="Run the engine for real. Its proposals are then reviewed and committed block by block." icon={Plus} onClick={() => setStarting('final')} disabled={!term}>
                Start new run
              </Button>
            </>
          )
        }
      />
      <Tabs
        className="shrink-0"
        items={[
          { key: 'runs', label: 'Round 1 · runs', count: query.data?.history?.length },
          { key: 'round2', label: 'Round 2 · offers', count: waiting ?? undefined },
        ]}
        value={tab}
        onChange={(key) => setParams(key === 'round2' ? { tab: 'round2' } : {}, { replace: true })}
      />

      {tab === 'round2' ? <Round2Tab term={term} /> : <RunsTab query={query} base={base} />}

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
