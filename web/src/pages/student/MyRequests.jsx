import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Plus, Repeat, Users, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { DetailRows, Note, ProgressTimeline } from '@/components/ui/Display'
import { Drawer } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, stop } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { StudentPage } from './shared'

// SCR-MNT-01 My Maintenance Requests (Figma 41:1522) — Maintenance and Room changes tabs.
// GET /students/me/requests?kind=maintenance|room-changes&termId&page&pageSize →
//   { items, total, counts: { maintenance, roomChanges }, room }
//   maintenance item: { id, title, location, category, reportedAt, status, assignee, visitWindow }
//   room-change item: { id, typeLabel, summary, submittedAt, status, decision: { note, at } | null, invoiceId, invitationId }
// GET /maintenance-requests/:id → { …item, room, description, events: [{ who, at, message }] }
// POST /maintenance-requests/:id/confirm { fixed }

function MaintenanceStatus({ status }) {
  if (status === 'Resolved') return <Tag tone="success">Resolved · confirm the fix</Tag>
  return <StatusTag status={status} />
}

function progressOf(r) {
  const fixed = ['Resolved', 'Closed'].includes(r.status)
  return [
    { title: 'Submitted', time: formatDateTime(r.reportedAt), state: 'done' },
    {
      title: r.assignee ? `Assigned to ${r.assignee}` : 'Assigned to maintenance staff',
      time: r.status === 'Submitted' ? 'Usually within 24 hours' : r.visitWindow ? `Visit ${r.visitWindow}` : 'Done',
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
      description={r ? [r.id, r.category, r.location].filter(Boolean).join(' · ') : id}
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
              <span className="text-sm text-fg-tertiary">Reported {formatDateTime(req.reportedAt)}</span>
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
              <h3 className="text-h3 font-semibold text-fg">Progress</h3>
              <ProgressTimeline events={progressOf(req)} />
            </div>
            {updates.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-h3 font-semibold text-fg">Updates from the dormitory office</h3>
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

export default function MyRequests() {
  const [params, setParams] = useSearchParams()
  const tab = ['room-changes', 'swaps'].includes(params.get('tab')) ? 'room-changes' : 'maintenance'
  const { term } = useSession()
  const { notify, notifyError } = useToast()
  const [openId, setOpenId] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery(['requests', tab, term?.id, page, pageSize], ({ signal }) => api.me.requests({ kind: tab, termId: term?.id, page, pageSize }, { signal }))
  const items = query.data?.items ?? []
  const counts = query.data?.counts

  const confirm = useMutation((r, fixed) => api.maintenance.confirm(r.id, { fixed }), {
    invalidates: ['requests', 'maintenance', 'home'],
    onSuccess: (_, r, fixed) => {
      notify(fixed ? { title: 'Thanks for confirming', message: `${r.id} is now closed.` } : { type: 'info', title: 'Request reopened', message: `${r.id} goes back to the maintenance staff.` })
      setOpenId(null)
    },
    onError: (e) => notifyError(e, 'Could not update the request'),
  })

  const switchTab = (key) => {
    setPage(1)
    setParams(key === 'maintenance' ? {} : { tab: key })
  }

  return (
    <StudentPage
      title="Requests"
      description={query.data?.room ? `Maintenance and Room-Change Requests for Room ${query.data.room}.` : 'Maintenance and Room-Change Requests.'}
      actions={
        tab === 'maintenance' ? (
          <Button variant="primary" size="lg" icon={Plus} to="/student/requests/maintenance/new">
            New maintenance request
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
      <Tabs
        className="shrink-0"
        value={tab}
        onChange={switchTab}
        items={[
          { key: 'maintenance', label: 'Maintenance', count: counts?.maintenance },
          { key: 'room-changes', label: 'Room changes', count: counts?.roomChanges },
        ]}
      />

      {tab === 'maintenance' ? (
        <Table size="lg" fill>
          <THead>
            <tr>
              <Th className="w-40">Request</Th>
              <Th>Title</Th>
              <Th className="w-35">Category</Th>
              <Th className="w-44">Reported</Th>
              <Th className="w-55">Status</Th>
              <Th className="w-26">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={6} emptyIcon={Wrench} emptyTitle="No maintenance requests" emptyText="Report a problem in your Room and the maintenance staff will fix it." />
            {items.map((r) => (
              <Tr key={r.id} onClick={() => setOpenId(r.id)} className="[&>td]:h-15">
                <Td className="font-medium text-fg-brand">{r.id}</Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-sm text-fg-tertiary">{r.location}</span>
                  </div>
                </Td>
                <Td>{r.category}</Td>
                <Td>{formatDateTime(r.reportedAt)}</Td>
                <Td>
                  <MaintenanceStatus status={r.status} />
                </Td>
                <Td onClick={stop}>
                  {r.status === 'Resolved' ? (
                    <Button onClick={() => confirm.run(r, true)} disabled={confirm.pending}>
                      Confirm
                    </Button>
                  ) : (
                    <Button variant="text" onClick={() => setOpenId(r.id)}>
                      View
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <Table size="lg" fill>
          <THead>
            <tr>
              <Th className="w-40">Request</Th>
              <Th className="w-44">Type</Th>
              <Th>Details</Th>
              <Th className="w-44">Submitted</Th>
              <Th className="w-55">Status</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={5} emptyIcon={Repeat} emptyTitle="No room changes yet" emptyText="Ask the dormitory office to move you to another Room, or agree a swap with another Student." />
            {items.map((r) => (
              <Tr key={r.id} className="[&>td]:h-15">
                <Td className="font-medium text-fg-brand">{r.id}</Td>
                <Td>{r.typeLabel}</Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg-secondary">{r.summary}</span>
                    {r.decision && (
                      <span className="text-sm text-fg-tertiary">
                        {r.decision.note} · {formatDateTime(r.decision.at)}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>{formatDateTime(r.submittedAt)}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <StatusTag status={r.status} tone={r.status === 'Approved' ? 'success' : undefined} />
                    {r.invoiceId && (
                      <Button size="sm" variant="primary" to={`/student/invoices/${r.invoiceId}/pay`}>
                        Pay
                      </Button>
                    )}
                    {r.invitationId && (
                      <Button size="sm" variant="primary" to={`/student/requests/swap/invitations/${r.invitationId}`}>
                        Answer
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <div className="flex shrink-0 items-center justify-between gap-4">
        {tab === 'maintenance' ? <Note className="items-center">Track requests on the Android app too. Submitting new requests is done here on the web.</Note> : <span />}
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

      <RequestDrawer id={openId} onClose={() => setOpenId(null)} onConfirm={(r, fixed) => confirm.run(r, fixed)} confirming={confirm.pending} />
    </StudentPage>
  )
}
