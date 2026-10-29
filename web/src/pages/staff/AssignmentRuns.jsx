import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Check, ChevronRight, Eye, Info, Layers, Plus, Repeat2, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Card, Note, Steps } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
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

const offerTone = { Pending: 'warning', Accepted: 'success', Declined: 'neutral', Expired: 'error', Withdrawn: 'neutral', 'No offer': 'info' }

function signed(n) {
  if (!n) return t('same price')
  return `${n > 0 ? '+' : '−'}${formatVnd(Math.abs(n))}`
}

/** Who Round 2 reached: the students with an offer and those still waiting for one (FR-APP-07, M8). */
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
        message: r.waitlisted ? t('{n} students are still waiting: no free Bed fits them.', { n: formatNumber(r.waitlisted) }) : t('Every waitlisted student has an offer to answer.'),
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

  return (
    <>
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Waitlisted without an offer" value={formatNumber(s?.waitlisted)} note="Get options when you send Round 2" noteTone={s?.waitlisted ? 'warning' : 'tertiary'} />
        <KpiTile size="md" label="Offers waiting for an answer" value={formatNumber(s?.openOffers)} note="Their Beds are held until the offer expires" noteTone="tertiary" />
        <KpiTile size="md" label="Accepted" value={formatNumber(c?.accepted)} note="Allocated, with a Balance to pay" noteTone="tertiary" />
        <KpiTile size="md" label="Free Beds" value={formatNumber(s?.freeBeds)} note="Nobody holds them in this Term" noteTone="tertiary" />
      </div>

      <Card className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
          <p className="text-base text-fg-secondary">
            {t('Waitlisted students without an open offer get up to three held Beds of other kinds, nearest price first, in partly filled Rooms first. They choose one or decline on their offer page; an unanswered offer expires and the Application is cancelled with its Deposit refunded.')}
          </p>
        </div>
        <Button variant="primary" icon={Repeat2} disabled={!term || !s?.waitlisted || !s?.freeBeds || run.pending} onClick={() => setConfirming(true)}>
          Send Round 2 offers
        </Button>
      </Card>

      <Card padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-end justify-between gap-4 px-5 pt-2">
          <Tabs
            items={tabs}
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
            placeholder={t('Student name or code, Application')}
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
                    <span className="text-sm text-fg-tertiary">{t('No free Bed fitted yet')}</span>
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
          {t('{n} waitlisted students get held options among {beds} free Beds. Each student is notified in the app and by email and answers before the offer expires.', {
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
  return (
    <>
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
              {run.input === 0 && run.finishedAt && (
                <Note>
                  {t('Nothing to propose: no Approved Application is waiting for a Bed. Applications are placed by the run that was committed; students left without a Bed are Waitlisted and reached by Round 2.')}
                </Note>
              )}
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
          <div className="flex shrink-0 items-baseline justify-between gap-3 px-5 py-4">
            <h2 className="text-h3 font-semibold text-fg">{t('Run history')}</h2>
            <span className="text-sm text-fg-tertiary">{t('Open a run to see each student, Room and Bed it proposed')}</span>
          </div>
          <Table bare inset="lg" fill>
            <THead>
              <tr>
                <Th className="w-36">Run</Th>
                <Th className="w-44">Started</Th>
                <Th>Result</Th>
                <Th className="w-36">Status</Th>
                <Th className="w-24">
                  <span className="sr-only">{t('Actions')}</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} rows={query.data?.history} emptyTitle="No runs yet" />
              {(query.data?.history ?? []).map((r) => (
                <Tr key={r.id} onClick={() => navigate(`${base}/assignment/${r.id}`)} className="cursor-pointer [&>td]:h-14">
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
                      <span className="text-sm text-fg-tertiary">{t('{c} conflicts · {w} waitlisted', { c: r.conflicts, w: r.waitlisted })}</span>
                    </div>
                  </Td>
                  <Td>
                    <StatusTag status={r.status} />
                  </Td>
                  <Td>
                    <Button variant="text" size="sm" iconAfter={ChevronRight} iconSize={16} to={`${base}/assignment/${r.id}`} onClick={(e) => e.stopPropagation()}>
                      View
                    </Button>
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
    </>
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
        description="The engine proposes a Room and Bed for every Approved Application. Managers resolve conflicts and commit per Block; Round 2 then offers the free Beds to waitlisted students."
        actions={
          tab === 'runs' && (
            <>
              <Button icon={Eye} onClick={() => setStarting('dry')} disabled={!term}>
                Dry run
              </Button>
              <Button icon={Plus} onClick={() => setStarting('final')} disabled={!term}>
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
