import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Download, Maximize2, Repeat, SearchX, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Card, Note } from '@/components/ui/Display'
import { Field, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { SlaBadge, StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime } from '@/lib/format'
import { RoomChangeModeSwitch } from './SwapRequests'
import { t, tr } from '@/i18n'

// SCR-REQ-10 Room-Change Queue (Figma 60:2696) — next-Term Room-Change Requests of the requests window (Change Spec v2
// phase 6, spec §6.10): approving moves the student's next-Term Bed; nothing is invoiced or refunded.
// GET /room-changes?termId (none = the latest open window)&block&status&kind&page&pageSize → { items: [{ id, studentName, studentCode, kind,
//   from: { room, bed, roomTypeName, roomClassName } (the next-Term Bed), to: { roomTypeName, roomClassName }, reason, submittedAt,
//   dueAt (M4), status,
//   decision: { by, at, bed, reason, note } | null }], total, rejectReasons, window: { termId, termName, closesAt, decisionsDueAt } }
// GET /room-changes/:id/matching-beds → { items: [{ bedId, floor, roommates }] }
// POST /room-changes/:id/decision { decision: 'Approved', bedId } | { decision: 'Rejected', reason, message }

const statusFilters = [{ value: '', label: 'Status: All' }, ...['Pending', 'Approved', 'Rejected'].map((s) => ({ value: s, label: t('Status: {s}', { s: t(s) }) }))]
const changeFilters = [
  { value: '', label: 'Change: All' },
  { value: 'same', label: 'Change: Same type, other room' },
  { value: 'class', label: 'Change: room tier' },
  { value: 'type', label: 'Change: room type' },
]

// Room changes use success for Approved (a done move), unlike Application statuses.
function ChangeStatus({ status }) {
  return <StatusTag status={status} tone={status === 'Approved' ? 'success' : undefined} />
}

function Row({ label, children, valueClassName }) {
  return (
    <div className="flex items-center justify-between gap-4 text-base">
      <dt className="shrink-0 text-fg-secondary">{t(label)}</dt>
      <dd className={cx('min-w-0 text-right', valueClassName ?? 'text-fg')}>{children}</dd>
    </div>
  )
}

const target = (r) => `${tr(r.to.roomTypeName)} · ${tr(r.to.roomClassName)}${r.kind === 'same' ? ` · ${t('other room')}` : ''}`

function RejectModal({ request, reasons, onClose }) {
  const { notify } = useToast()
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [message, setMessage] = useState('')
  const reject = useMutation(() => api.roomChanges.decide(request.id, { decision: 'Rejected', reason, message: message.trim() || undefined }), {
    invalidates: ['room-changes'],
    onSuccess: () => {
      notify({ type: 'warning', title: t('{id} rejected', { id: request.id }), message: t('{name} was notified.', { name: request.studentName }) })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Reject {id}', { id: request.id })}
      description={t('{name} is notified with the reason you choose.', { name: request.studentName })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={X} onClick={() => reject.run()} disabled={!reason || (reason === 'Other' && !message.trim()) || reject.pending}>
            Reject
          </Button>
        </>
      }
    >
      {reject.error && <p className="rounded-md bg-error-bg px-3 py-2 text-base text-error-fg">{reject.error.message}</p>}
      <Field label="Reason" required>
        {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={reasons} />}
      </Field>
      <Field label="Message to the student" required={reason === 'Other'}>
        {(id) => <Textarea id={id} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: a bed may free up after the swap window closes." />}
      </Field>
    </Modal>
  )
}

// Floor filter chip in the bed list: pressed = orange wash with brand ink, like the floor buttons of the room map.
function FloorChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'h-7 shrink-0 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors',
        active ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line bg-surface text-fg-secondary hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function BedSelectionModal({ open, onClose, beds, selectedBed, onSelect, request }) {
  const [search, setSearch] = useState('')
  const [floorFilter, setFloorFilter] = useState(null)
  const [selected, setSelected] = useState(selectedBed)

  useEffect(() => {
    if (open) {
      setSelected(selectedBed)
      setSearch('')
      setFloorFilter(null)
    }
  }, [open, selectedBed])

  const floors = Array.from(new Set(beds.map((b) => b.floor))).sort((a, b) => a - b)

  const filtered = (beds ?? []).filter((b) => {
    if (floorFilter !== null && b.floor !== floorFilter) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      b.bedId.toLowerCase().includes(q) ||
      `tầng ${b.floor}`.toLowerCase().includes(q) ||
      `floor ${b.floor}`.toLowerCase().includes(q)
    )
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title={t('Free beds that match')}
      description={t('Choose a bed for {name} ({target})', { name: request.studentName, target: target(request) })}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            icon={Check}
            disabled={!selected}
            onClick={() => {
              onSelect(selected)
              onClose()
            }}
          >
            {t('Confirm selection')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            aria-label={t('Search by bed, room or floor...')}
            placeholder={t('Search by bed, room or floor...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
          />
          {floors.length > 1 && (
            <div role="group" aria-label={t('Floor')} className="flex shrink-0 items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              <FloorChip active={floorFilter === null} onClick={() => setFloorFilter(null)}>
                {t('All')}
              </FloorChip>
              {floors.map((f) => (
                <FloorChip key={f} active={floorFilter === f} onClick={() => setFloorFilter(floorFilter === f ? null : f)}>
                  {t('Floor {n}', { n: f })}
                </FloorChip>
              ))}
            </div>
          )}
        </div>

        <div role="radiogroup" aria-label={t('Free beds that match')} className="flex h-72 flex-col divide-y divide-line overflow-y-auto border-y border-line">
          {filtered.length === 0 ? (
            <EmptyBlock icon={SearchX} title={t('No beds match your search')} />
          ) : (
            filtered.map((b) => {
              const active = selected === b.bedId
              return (
                <div
                  key={b.bedId}
                  onClick={() => setSelected(b.bedId)}
                  onDoubleClick={() => {
                    setSelected(b.bedId)
                    onSelect(b.bedId)
                    onClose()
                  }}
                  className={cx(
                    'flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5 transition-colors',
                    active ? 'bg-primary-subtle' : 'hover:bg-subtle',
                  )}
                >
                  <Radio name={`modal-bed-${request.id}`} label={b.bedId} checked={active} onChange={() => setSelected(b.bedId)} />
                  <span className="shrink-0 text-sm text-fg-secondary tabular">
                    {t('Floor {n}', { n: b.floor })} · {t(b.roommates === 1 ? '{n} roommate' : '{n} roommates', { n: b.roommates })}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}

function Review({ request: r, onReject }) {
  const { notify, notifyError } = useToast()
  const pending = r.status === 'Pending'
  const beds = useQuery(['room-changes', 'beds', r.id], ({ signal }) => api.roomChanges.matchingBeds(r.id, { signal }), { enabled: pending, keepPrevious: false })
  const [bed, setBed] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  useEffect(() => setBed(beds.data?.items?.[0]?.bedId ?? null), [beds.data])
  const approve = useMutation(() => api.roomChanges.decide(r.id, { decision: 'Approved', bedId: bed }), {
    invalidates: ['room-changes'],
    onSuccess: (res) => notify({ title: t('{id} approved', { id: r.id }), message: res?.note ? tr(res.note) : t('{name} moves to {bed}.', { name: r.studentName, bed }) }),
    onError: (e) => notifyError(e, 'Could not approve'),
  })

  const bedItems = beds.data?.items ?? []

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto" aria-label={t('Review {id}', { id: r.id })}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-fg-tertiary">{r.id}</p>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 font-semibold text-fg">{r.studentName}</h2>
          {!pending && <ChangeStatus status={r.status} />}
        </div>
      </div>
      <dl className="flex flex-col gap-2.5">
        <Row label="From">
          {r.from.room} · {r.from.bed} · {tr(r.from.roomClassName)}
        </Row>
        <Row label="To">{target(r)}</Row>
        <Row label="Reason">{tr(r.reason) || '—'}</Row>
        <Row label="Decide by">{formatDateTime(r.dueAt)}</Row>
        {!pending && r.decision && (
          <>
            {r.decision.bed && <Row label="New bed">{r.decision.bed}</Row>}
            {r.decision.reason && <Row label="Rejection reason">{tr(r.decision.reason)}</Row>}
            <Row label="Decided">
              {r.decision.by} · {formatDate(r.decision.at)}
            </Row>
          </>
        )}
      </dl>

      {!pending ? (
        r.decision?.note && <Note>{tr(r.decision.note)}</Note>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-medium text-fg">{t('Free beds that match')}</p>
            {bedItems.length > 0 && (
              <Button
                variant="text"
                size="sm"
                icon={Maximize2}
                onClick={() => setModalOpen(true)}
                className="-mr-2"
              >
                {t('View all ({n})', { n: bedItems.length })}
              </Button>
            )}
          </div>
          <QueryState query={beds} compact isEmpty={(d) => !d.items?.length} empty={<Note>No free bed matches this change right now. Reject the request or wait until a bed frees up.</Note>}>
            {() => (
              <div role="radiogroup" aria-label={t('Free beds that match')} className="flex max-h-48 flex-col divide-y divide-line overflow-y-auto border-y border-line">
                {bedItems.map((b) => (
                  <div
                    key={b.bedId}
                    onClick={() => setBed(b.bedId)}
                    className={cx(
                      'flex cursor-pointer items-center justify-between gap-3 px-2.5 py-2 transition-colors',
                      bed === b.bedId ? 'bg-primary-subtle' : 'hover:bg-subtle',
                    )}
                  >
                    <Radio name={`bed-${r.id}`} label={b.bedId} checked={bed === b.bedId} onChange={() => setBed(b.bedId)} />
                    <span className="shrink-0 text-sm text-fg-secondary tabular">
                      {t('Floor {n}', { n: b.floor })} · {t(b.roommates === 1 ? '{n} roommate' : '{n} roommates', { n: b.roommates })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </QueryState>
          <div className="flex gap-2">
            <Button variant="danger" icon={X} onClick={onReject}>
              Reject
            </Button>
            <Button variant="primary" icon={Check} disabled={!bed || approve.pending} onClick={() => approve.run()}>
              {t('Approve')}
            </Button>
          </div>
          <p className="text-sm text-fg-tertiary">
            {t('The student moves to this bed at the start of the next term and pays its next-term price with the next-term fee; nothing is invoiced or refunded now.')}
          </p>
        </>
      )}

      {modalOpen && (
        <BedSelectionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          beds={bedItems}
          selectedBed={bed}
          onSelect={setBed}
          request={r}
        />
      )}
    </Card>
  )
}

export default function RoomChangeQueue() {
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const [status, setStatus] = useState('Pending')
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [rejecting, setRejecting] = useState(null)
  const [selectedId, setSelectedId] = useState(params.get('id'))

  const filters = { block: scope.block, status, kind, page, pageSize }
  const query = useQuery(['room-changes', filters], ({ signal }) => api.roomChanges.list(filters, { signal }))
  const items = query.data?.items ?? []
  const selected = items.find((r) => r.id === selectedId) ?? items[0]
  const exporting = useMutation(() => api.exports.download('room-changes', { ...filters, page: undefined, pageSize: undefined }, 'room-change-requests.csv'), { onError: (e) => notifyError(e, 'Export failed') })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Next-term room changes"
        description={query.data?.window ? t('{term} · requests until {closes}, decisions by {due}. Approving moves the next-term bed; nothing is charged now.', { term: query.data.window.termName, closes: formatDateTime(query.data.window.closesAt), due: formatDateTime(query.data.window.decisionsDueAt) }) : 'Room-change requests of the next term, in your scope.'}
        actions={
          <>
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
            <RoomChangeModeSwitch mode="changes" />
          </>
        }
      />

      <div className="flex shrink-0 items-center gap-3">
        <Select wrapperClassName="w-42" aria-label={t('Status')} value={status} onChange={filter(setStatus)} options={statusFilters} />
        <Select wrapperClassName="w-60" aria-label={t('Change')} value={kind} onChange={filter(setKind)} options={changeFilters} />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-36">Request</Th>
                <Th className="w-44">Student</Th>
                <Th>From → To</Th>
                <Th className="w-30">Submitted on</Th>
                <Th className="w-26">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} emptyIcon={Repeat} emptyTitle="No room-change requests match these filters" />
              {items.map((r) => (
                <Tr key={r.id} selected={r.id === selected?.id} onClick={() => setSelectedId(r.id)}>
                  <Td className="font-medium whitespace-nowrap text-fg-brand">{r.id}</Td>
                  <Td>
                    <TwoLine primary={r.studentName} secondary={r.studentCode} />
                  </Td>
                  <Td className="max-w-0">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate">
                        {r.from.room} · {r.from.bed} → {target(r)}
                      </span>
                      <span className="truncate text-sm text-fg-secondary">
                        {tr(r.from.roomTypeName)} · {tr(r.from.roomClassName)}
                        {r.dueAt ? ` · ${t('decide by {date}', { date: formatDate(r.dueAt) })}` : ''}
                      </span>
                    </div>
                  </Td>
                  <Td>{formatDateTime(r.submittedAt)}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <ChangeStatus status={r.status} />
                      <SlaBadge dueAt={r.dueAt} done={r.status !== 'Pending'} warnHours={48} />
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
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
        </div>

        {selected ? (
          <Review key={`${selected.id}-${selected.status}`} request={selected} onReject={() => setRejecting(selected)} />
        ) : (
          <Card className="flex w-95 shrink-0 flex-col">
            <EmptyBlock icon={Repeat} title="Select a request" />
          </Card>
        )}
      </div>

      {rejecting && <RejectModal request={rejecting} reasons={query.data?.rejectReasons ?? []} onClose={() => setRejecting(null)} />}
    </>
  )
}
