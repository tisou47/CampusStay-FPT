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
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, stop } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { ActivitySwitch, StatusList, StatusRow, StudentPage } from './shared'
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
      notify(fixed ? { title: 'Thanks for confirming', message: t('{id} is now closed.', { id: r.id }) } : { type: 'info', title: 'Request reopened', message: t('{id} goes back to the maintenance staff.', { id: r.id }) })
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
      mobileTitle="Activity"
      phoneTop={<ActivitySwitch current="requests" />}
      description={query.data?.room ? t('Maintenance and Room-Change Requests for Room {room}.', { room: query.data.room }) : t('Maintenance and Room-Change Requests.')}
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

      {/* Phone: MOB-APP-01 Activity › Requests (Figma 56:441) — rows with the tag under the text,
          and a "Confirm fix" card for the first Resolved request. */}
      <QueryState
        query={query}
        compact
        className="lg:hidden"
        empty={
          tab === 'maintenance' ? (
            <EmptyBlock icon={Wrench} title="No maintenance requests" className="lg:hidden">
              Report a problem in your Room and the maintenance staff will fix it.
            </EmptyBlock>
          ) : (
            <EmptyBlock icon={Repeat} title="No room changes yet" className="lg:hidden">
              Ask the dormitory office to move you to another Room, or agree a swap with another Student.
            </EmptyBlock>
          )
        }
      >
        {(data) => {
          const resolved = tab === 'maintenance' ? data.items.find((r) => r.status === 'Resolved') : null
          return (
            <div className="flex flex-col gap-3 lg:hidden">
              <StatusList>
                {tab === 'maintenance'
                  ? data.items.map((r) => (
                      <StatusRow
                        key={r.id}
                        icon={Wrench}
                        value={r.title}
                        note={[r.id, r.visitWindow ? t('visit {window}', { window: r.visitWindow }) : tr(r.location)].filter(Boolean).join(' · ')}
                        below={<MaintenanceStatus status={r.status} />}
                        onClick={() => setOpenId(r.id)}
                      />
                    ))
                  : data.items.map((r) => (
                      <StatusRow
                        key={r.id}
                        icon={Repeat}
                        value={r.typeLabel}
                        note={[r.id, tr(r.summary)].filter(Boolean).join(' · ')}
                        below={
                          <>
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
                            {r.consentId && <ConsentButtons id={r.consentId} />}
                          </>
                        }
                      />
                    ))}
              </StatusList>
              {resolved && (
                <section className="flex flex-col gap-2 rounded-xl border border-success/25 bg-success-bg p-4">
                  <h2 className="text-base font-medium text-fg">{t('Is “{title}” fixed?', { title: resolved.title })}</h2>
                  <p className="text-sm text-fg-secondary">{t('Confirm to close {id}, or reopen it.', { id: resolved.id })}</p>
                  <div className="flex gap-2 pt-1 *:flex-1">
                    <Button size="lg" onClick={() => confirm.run(resolved, false)} disabled={confirm.pending}>
                      Reopen
                    </Button>
                    <Button variant="primary" size="lg" onClick={() => confirm.run(resolved, true)} disabled={confirm.pending}>
                      Confirm fixed
                    </Button>
                  </div>
                </section>
              )}
            </div>
          )
        }}
      </QueryState>

      {tab === 'maintenance' ? (
        <Table size="lg" fill className="max-lg:hidden">
          <THead>
            <tr>
              <Th className="w-40">Request</Th>
              <Th>Title</Th>
              <Th className="w-35">Category</Th>
              <Th className="w-44">Reported</Th>
              <Th className="w-55">Status</Th>
              <Th className="w-26">
                <span className="sr-only">{t('Actions')}</span>
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
                    <span className="text-sm text-fg-tertiary">{tr(r.location)}</span>
                  </div>
                </Td>
                <Td>{tr(r.category)}</Td>
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
        <Table size="lg" fill className="max-lg:hidden">
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
                <Td>{tr(r.typeLabel)}</Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg-secondary">{tr(r.summary)}</span>
                    {r.decision && (
                      <span className="text-sm text-fg-tertiary">
                        {tr(r.decision.note)} · {formatDateTime(r.decision.at)}
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
                    {r.consentId && <ConsentButtons id={r.consentId} />}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        {tab === 'maintenance' ? <Note className="items-center">{t('Track requests on the Android app too. Submitting new requests is done here on the web.')}</Note> : <span />}
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
