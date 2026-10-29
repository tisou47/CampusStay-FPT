import { useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Plus, Repeat, Users, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { DetailRows, Note, ProgressTimeline } from '@/components/ui/Display'
import { Drawer } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { DataTable } from '@/components/student/DataTable'
import { EmptyState } from '@/components/student/EmptyState'
import { ReasonLine } from '@/components/student/ReasonLine'
import { Tabs } from '@/components/student/Tabs'
import { formatDate, formatDateTime } from '@/lib/format'
import { ActivitySwitch, StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-MNT-01 My Maintenance Requests (Figma 41:1522) — Maintenance and Room changes tabs.
// GET /students/me/requests?kind=maintenance|room-changes&termId&page&pageSize →
//   { items, total, counts: { maintenance, roomChanges }, room }
//   maintenance item: { id, title, location, category, reportedAt, status, assignee, visitWindow }
//   room-change item (next-Term requests: room change, swap, Room Class change, extension, end of stay):
//     { id, typeLabel, summary, submittedAt, status, decision: { note, at } | null, invoiceId, invitationId, consentId }
// POST /room-class-changes/:id/consent { agree }
// GET /maintenance-requests/:id → { …item, room, description, events: [{ who, at, message }] }
// POST /maintenance-requests/:id/confirm { fixed }

/** A Room Class change of the student's Room waits for their answer (spec §6.11): agree or decline. */
function ConsentButtons({ id }) {
  const { notify, notifyError } = useToast()
  const answer = useMutation((agree) => api.roomClassChanges.consent(id, { agree }), {
    invalidates: ['requests', 'allocation'],
    onSuccess: (_, agree) => notify(agree ? { title: 'You agreed', message: 'When everyone agrees, Staff check the furniture and decide.' } : { type: 'info', title: 'You declined', message: 'The change is cancelled; your roommates are told.' }),
    onError: (e) => notifyError(e, 'Could not send your answer'),
  })
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => answer.run(true)} disabled={answer.pending}>
        Agree
      </Button>
      <Button size="sm" onClick={() => answer.run(false)} disabled={answer.pending}>
        Decline
      </Button>
    </>
  )
}

function MaintenanceStatus({ status }) {
  if (status === 'Resolved') return <Tag tone="success">Resolved · confirm the fix</Tag>
  return <StatusTag status={status} />
}

function progressOf(r) {
  const fixed = ['Resolved', 'Closed'].includes(r.status)
  return [
    { title: 'Submitted', time: formatDateTime(r.reportedAt), state: 'done' },
    {
      title: r.assignee ? t('Assigned to {name}', { name: r.assignee }) : 'Assigned to maintenance staff',
      time: r.status === 'Submitted' ? 'Usually within 24 hours' : r.visitWindow ? t('Visit {window}', { window: r.visitWindow }) : 'Done',
      state: r.status === 'Submitted' ? 'current' : 'done',
    },
    { title: 'Fixed by maintenance staff', time: r.status === 'In progress' ? 'Work in progress' : '—', state: fixed ? 'done' : ['Assigned', 'In progress'].includes(r.status) ? 'current' : 'upcoming' },
    { title: 'Confirmed by you', time: r.status === 'Closed' ? 'Closed' : '—', state: r.status === 'Closed' ? 'done' : r.status === 'Resolved' ? 'current' : 'upcoming' },
  ]
}

function RequestDrawer({ id, onClose, onConfirm, confirming }) {
  const query = useQuery(['maintenance', id], ({ signal }) => api.maintenance.get(id, { signal }), { enabled: Boolean(id) })
  const r = query.data
  const updates = (r?.events ?? []).filter((e) => e.message)
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={r?.title ?? 'Maintenance request'}
      description={r ? [r.id, tr(r.category), tr(r.location)].filter(Boolean).join(' · ') : id}
      footer={
        r?.status === 'Resolved' ? (
          <>
            <Button onClick={() => onConfirm(r, false)} disabled={confirming}>
              Not fixed yet
            </Button>
            <Button variant="primary" onClick={() => onConfirm(r, true)} disabled={confirming}>
              Confirm the fix
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <QueryState query={query} compact>
        {(req) => (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <MaintenanceStatus status={req.status} />
              <span className="text-sm text-fg-tertiary">{t('Reported {date}', { date: formatDateTime(req.reportedAt) })}</span>
            </div>
            <DetailRows
              rows={[
                ['Room', req.room ?? '—'],
                ['Location', req.location ?? '—'],
                ['Category', req.category ?? '—'],
                ...(req.assignee ? [['Assigned to', req.assignee]] : []),
                ...(req.visitWindow ? [['Visit window', req.visitWindow]] : []),
                ['Description', req.description ?? '—'],
              ]}
            />
            <div className="flex flex-col gap-3">
              <h3 className="text-card-title text-fg">{t('Progress')}</h3>
              <ProgressTimeline events={progressOf(req)} />
            </div>
            {updates.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-card-title text-fg">{t('Updates from the dormitory office')}</h3>
                {updates.map((e) => (
                  <div key={`${e.at}-${e.message}`} className="flex flex-col gap-0.5 rounded-lg bg-subtle px-3 py-2.5">
                    <p className="text-base text-fg">{e.message}</p>
                    <p className="text-sm text-fg-tertiary">
                      {e.who} · {formatDateTime(e.at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </QueryState>
    </Drawer>
  )
}


/** Maintenance columns; the request code opens its drawer, as the row click did before. */
function maintenanceColumns(openDrawer, confirmFixed, confirming) {
  return [
    {
      key: 'id',
      header: 'Request',
      render: (r) => (
        <button type="button" onClick={() => openDrawer(r.id)} className="rounded-sm font-medium text-link hover:underline">
          {r.id}
        </button>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (r) => (
        <span className="flex flex-col gap-0.5 max-md:items-end">
          <span className="font-medium">{r.title}</span>
          <span className="text-small text-text-muted">{tr(r.location)}</span>
        </span>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => tr(r.category) },
    { key: 'reportedAt', header: 'Reported', render: (r) => <span className="nowrap">{formatDate(r.reportedAt)}</span> },
    { key: 'status', header: 'Status', render: (r) => <MaintenanceStatus status={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      actions: true,
      render: (r) =>
        r.status === 'Resolved' ? (
          <Button onClick={() => confirmFixed(r, true)} disabled={confirming}>
            Confirm
          </Button>
        ) : (
          <Button variant="text" onClick={() => openDrawer(r.id)}>
            View
          </Button>
        ),
    },
  ]
}

/** Next-Term request columns (static: every action is a link or its own component). */
const ROOM_CHANGE_COLUMNS = [
  { key: 'id', header: 'Request', render: (r) => <span className="font-medium text-text">{r.id}</span> },
  { key: 'typeLabel', header: 'Type', render: (r) => tr(r.typeLabel) },
  {
    key: 'summary',
    header: 'Details',
    render: (r) => (
      <span className="flex flex-col gap-0.5 max-md:items-end">
        <span className="text-text-secondary">{tr(r.summary)}</span>
        {r.decision && (
          <span className="text-small text-text-muted">
            {tr(r.decision.note)} · {formatDateTime(r.decision.at)}
          </span>
        )}
      </span>
    ),
  },
  { key: 'submittedAt', header: 'Submitted on', render: (r) => <span className="nowrap">{formatDate(r.submittedAt)}</span> },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (
      <span className="flex flex-wrap items-center gap-2 max-md:justify-end">
        <StatusTag status={r.status} tone={r.status === 'Approved' ? 'success' : undefined} />
        {r.invoiceId && (
          <Button size="sm" to={`/student/invoices/${r.invoiceId}/pay`}>
            Pay
          </Button>
        )}
        {r.invitationId && (
          <Button size="sm" to={`/student/requests/swap/invitations/${r.invitationId}`}>
            Answer
          </Button>
        )}
        {r.consentId && <ConsentButtons id={r.consentId} />}
      </span>
    ),
  },
]

const TAB_ITEMS = [
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'room-changes', label: 'Room changes' },
]

export default function MyRequests() {
  const [params, setParams] = useSearchParams()
  const tab = ['room-changes', 'swaps'].includes(params.get('tab')) ? 'room-changes' : 'maintenance'
  const { term } = useSession()
  const { notify, notifyError } = useToast()
  const reasonId = useId()
  const panelId = useId()
  const [openId, setOpenId] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery(['requests', tab, term?.id, page, pageSize], ({ signal }) => api.me.requests({ kind: tab, termId: term?.id, page, pageSize }, { signal }))
  const counts = query.data?.counts
  // A Room is needed to report a problem; the form page refuses without one, so the button says so up front.
  const noRoom = query.data !== undefined && !query.data.room

  const confirm = useMutation((r, fixed) => api.maintenance.confirm(r.id, { fixed }), {
    invalidates: ['requests', 'maintenance', 'home'],
    onSuccess: (_, r, fixed) => {
      notify(fixed ? { title: 'Thanks for confirming', message: t('{id} is now closed.', { id: r.id }) } : { type: 'info', title: 'Request reopened', message: t('{id} goes back to the maintenance staff.', { id: r.id }) })
      setOpenId(null)
    },
    onError: (e) => notifyError(e, 'Could not update the request'),
  })
  const maintenanceCols = useMemo(() => maintenanceColumns(setOpenId, confirm.run, confirm.pending), [confirm.run, confirm.pending])

  const switchTab = (key) => {
    setPage(1)
    setParams(key === 'maintenance' ? {} : { tab: key })
  }
  const tabs = TAB_ITEMS.map((item) => ({ ...item, controls: panelId, count: item.key === 'maintenance' ? counts?.maintenance : counts?.roomChanges }))

  const empty =
    tab === 'maintenance' ? (
      noRoom ? (
        <EmptyState icon={Wrench} title="No maintenance requests" description="You can send requests once you have moved into your Room." />
      ) : (
        <EmptyState
          icon={Wrench}
          title="No maintenance requests"
          description="Report a problem in your Room and the maintenance staff will fix it."
          action={
            <Button size="lg" icon={Plus} to="/student/requests/maintenance/new">
              Create request
            </Button>
          }
        />
      )
    ) : (
      <EmptyState
        icon={Repeat}
        title="No room changes yet"
        description="Ask the dormitory office to move you to another Room, or agree a swap with another Student."
        action={
          <Button size="lg" icon={Plus} to="/student/requests/room-change/new">
            New room-change request
          </Button>
        }
      />
    )

  return (
    <StudentPage
      flow
      title="Requests"
      mobileTitle="Activity"
      phoneTop={<ActivitySwitch current="requests" />}
      description={query.data?.room ? t('Maintenance and Room-Change Requests for Room {room}.', { room: query.data.room }) : t('Maintenance and Room-Change Requests.')}
      actions={
        tab === 'maintenance' ? (
          <Button variant="primary" size="lg" icon={Plus} to={noRoom ? undefined : '/student/requests/maintenance/new'} disabled={noRoom} aria-describedby={noRoom ? reasonId : undefined}>
            Create request
          </Button>
        ) : (
          <>
            <Button size="lg" icon={Users} to="/student/requests/swap/new">
              Swap with a Student
            </Button>
            <Button variant="primary" size="lg" icon={Plus} to="/student/requests/room-change/new">
              New room-change request
            </Button>
          </>
        )
      }
    >
      {tab === 'maintenance' && noRoom && <ReasonLine id={reasonId}>You can send requests once you have moved into your Room.</ReasonLine>}

      <Tabs label="Requests" items={tabs} value={tab} onChange={switchTab} />

      <div id={panelId} role="tabpanel" className="flex flex-col gap-3">
        <QueryState query={query} empty={empty}>
          {(data) => {
            const resolved = tab === 'maintenance' ? data.items.find((r) => r.status === 'Resolved') : null
            return (
              <>
                {/* Phone: a "Confirm fix" card for the first Resolved request. */}
                {resolved && (
                  <section className="flex flex-col gap-2 rounded-lg border border-success/25 bg-success-bg p-4 md:hidden">
                    <h2 className="text-card-title text-text">{t('Is “{title}” fixed?', { title: resolved.title })}</h2>
                    <p className="text-small text-text-secondary">{t('Confirm to close {id}, or reopen it.', { id: resolved.id })}</p>
                    <div className="flex gap-2 pt-1 *:flex-1">
                      <Button size="lg" onClick={() => confirm.run(resolved, false)} disabled={confirm.pending}>
                        Reopen
                      </Button>
                      <Button size="lg" onClick={() => confirm.run(resolved, true)} disabled={confirm.pending}>
                        Confirm fixed
                      </Button>
                    </div>
                  </section>
                )}
                <DataTable
                  caption="Requests"
                  columns={tab === 'maintenance' ? maintenanceCols : ROOM_CHANGE_COLUMNS}
                  rows={data.items}
                  total={data.total}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n)
                    setPage(1)
                  }}
                  noun={['request', 'requests']}
                />
              </>
            )
          }}
        </QueryState>
        {tab === 'maintenance' && <Note>{t('Track requests on the Android app too. Submitting new requests is done here on the web.')}</Note>}
      </div>

      <RequestDrawer id={openId} onClose={() => setOpenId(null)} onConfirm={confirm.run} confirming={confirm.pending} />
    </StudentPage>
  )
}
