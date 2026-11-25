import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, CalendarClock, Check, ChevronRight, Download, Maximize2, Repeat, SearchX, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Avatar, Card, Note } from '@/components/ui/Display'
import { Field, FilterSelect, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { SlaBadge, StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'
import { RoomChangeModeSwitch } from './SwapRequests'
import { t, tr } from '@/i18n'
import { useRoleBase } from '@/lib/useRoleBase'

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
  { value: 'type', label: 'Change: room type' },
]

// Room changes use success for Approved (a done move), unlike Application statuses.
function ChangeStatus({ status }) {
  return <StatusTag status={status} tone={status === 'Approved' ? 'success' : undefined} />
}

function Row({ label, children, valueClassName }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
      <dt className="shrink-0 text-fg-secondary">{t(label)}</dt>
      <dd className={cx('min-w-0 font-medium text-right', valueClassName ?? 'text-fg')}>{children}</dd>
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

function Review({ request: r, onReject, onClose }) {
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
  const changeKindLabel =
    r.kind === 'same' ? t('Same type, other room') : r.kind === 'class' ? t('Change room class') : t('Change room type')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4" aria-label={t('Review {id}', { id: r.id })}>
      {/* Top Back Button & Breadcrumb Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" icon={ArrowLeft} onClick={onClose}>
            {t('Back')}
          </Button>
          <nav aria-label={t('Breadcrumb')} className="flex flex-wrap items-center gap-1.5 text-sm text-fg-secondary">
            <button type="button" onClick={onClose} className="cursor-pointer hover:text-fg-brand">
              {t('Next-term room changes')}
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-mono font-medium text-fg">{r.id}</span>
          </nav>
        </div>
      </div>

      {/* Student Header + Horizontal Move Strip */}
      <Card className="flex shrink-0 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar name={r.studentName} size={48} />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="truncate text-h2 font-semibold text-fg">{r.studentName}</h1>
                {r.studentCode && (
                  <span className="rounded-md bg-subtle px-2 py-0.5 font-mono text-xs font-semibold text-fg-secondary">
                    {r.studentCode}
                  </span>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-secondary tabular">
                <span className="font-mono font-semibold text-fg">{r.id}</span>
                <span>·</span>
                <span>{t('Submitted on')}: {formatDateTime(r.submittedAt)}</span>
                {r.dueAt && (
                  <>
                    <span>·</span>
                    <span>{t('Decide by')}: {formatDateTime(r.dueAt)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChangeStatus status={r.status} />
            <SlaBadge dueAt={r.dueAt} done={r.status !== 'Pending'} warnHours={48} />
          </div>
        </div>

        {/* Horizontal From -> To Comparison */}
        <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-line bg-subtle/40 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3">
            <span className="text-xs font-medium tracking-wide text-fg-tertiary uppercase">{t('Current allocation')}</span>
            <span className="text-base font-semibold text-fg tabular">
              {r.from.room} · {t('Bed {bed}', { bed: r.from.bed })}
            </span>
            <span className="text-xs text-fg-secondary">
              {tr(r.from.roomTypeName)} · {tr(r.from.roomClassName)}
            </span>
          </div>

          <div className="flex items-center justify-center">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-subtle text-fg-brand max-sm:rotate-90">
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-orange-200 bg-brand-subtle/40 px-4 py-3">
            <span className="text-xs font-medium tracking-wide text-fg-brand uppercase">{t('Requested change')}</span>
            <div className="flex flex-wrap items-center gap-2">
              {r.decision?.bed && (
                <span className="rounded-md bg-success-bg px-2 py-0.5 font-mono text-sm font-semibold text-success-fg tabular">
                  {r.decision.bed}
                </span>
              )}
              <span className="text-base font-semibold text-fg">{target(r)}</span>
            </div>
            <span className="text-xs text-fg-secondary">
              {r.decision?.bed ? `${t('New bed')}: ${r.decision.bed} · ${changeKindLabel}` : changeKindLabel}
            </span>
          </div>
        </div>
      </Card>

      {/* Equal-Height Details & Decision Grid */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div className="flex flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Request details')}</h2>
            <dl className="flex flex-col divide-y divide-line">
              <Row label="Request" valueClassName="font-mono text-fg tabular">
                {r.id}
              </Row>
              <Row label="Change type">{changeKindLabel}</Row>
              <Row label="Reason" valueClassName="text-fg">
                {tr(r.reason) || '—'}
              </Row>
              <Row label="Submitted on">
                <span className="tabular">{formatDateTime(r.submittedAt)}</span>
              </Row>
              <Row label="Decide by">
                <span className="inline-flex flex-wrap items-center justify-end gap-2 tabular">
                  {formatDateTime(r.dueAt)}
                  {pending && <SlaBadge dueAt={r.dueAt} done={false} warnHours={48} />}
                </span>
              </Row>
            </dl>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-4 p-5">
          {!pending ? (
            <div className="flex flex-1 flex-col justify-between gap-4">
              <div className="flex flex-col gap-3">
                <h2 className="text-h3 font-semibold text-fg">{t('Decision result')}</h2>
                <dl className="flex flex-col divide-y divide-line">
                  <Row label="Status">
                    <ChangeStatus status={r.status} />
                  </Row>
                  {r.decision?.bed && (
                    <Row label="New bed" valueClassName="font-semibold text-fg-brand tabular">
                      {r.decision.bed}
                    </Row>
                  )}
                  {r.decision?.reason && <Row label="Rejection reason">{tr(r.decision.reason)}</Row>}
                  {r.decision && (
                    <>
                      <Row label="Decided by">{r.decision.by}</Row>
                      <Row label="Decided">
                        <span className="tabular">{formatDate(r.decision.at)}</span>
                      </Row>
                    </>
                  )}
                </dl>
              </div>
              {r.decision?.note && <Note>{tr(r.decision.note)}</Note>}
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3 font-semibold text-fg">{t('Free beds that match')}</h2>
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
                  <div role="radiogroup" aria-label={t('Free beds that match')} className="flex max-h-60 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
                    {bedItems.map((b) => (
                      <div
                        key={b.bedId}
                        onClick={() => setBed(b.bedId)}
                        className={cx(
                          'flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors',
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
              <div className="mt-auto flex flex-col gap-2.5 pt-1">
                <div className="flex gap-2.5">
                  <Button variant="danger" icon={X} className="flex-1" onClick={onReject}>
                    Reject
                  </Button>
                  <Button variant="primary" icon={Check} className="flex-1" disabled={!bed || approve.pending} onClick={() => approve.run()}>
                    {t('Approve')}
                  </Button>
                </div>
                <p className="text-xs text-fg-tertiary">
                  {t('The student moves to this bed at the start of the next term and pays its next-term price with the next-term fee; nothing is invoiced or refunded now.')}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

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
    </div>
  )
}

export default function RoomChangeQueue() {
  const atManager = useRoleBase() === '/manager'
  const [params] = useSearchParams()
  const scope = useScopeQuery()
  const { notifyError } = useToast()
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [rejecting, setRejecting] = useState(null)
  const [selectedId, setSelectedId] = useState(params.get('id'))

  const filters = { block: scope.block, status, kind, page, pageSize }
  const query = useQuery(['room-changes', filters], ({ signal }) => api.roomChanges.list(filters, { signal }))
  const items = query.data?.items ?? []
  // Only open the right-hand review panel when a request is explicitly clicked or linked via ?id=.
  const selected = selectedId ? items.find((r) => r.id === selectedId) ?? null : null
  const missing = Boolean(selectedId) && !selected && !query.loading
  const exporting = useMutation(() => api.exports.download('room-changes', { ...filters, page: undefined, pageSize: undefined }, 'room-change-requests.csv'), { onError: (e) => notifyError(e, 'Export failed') })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  if (selected) {
    return (
      <>
        <Review
          key={`${selected.id}-${selected.status}`}
          request={selected}
          onReject={() => setRejecting(selected)}
          onClose={() => setSelectedId(null)}
        />
        {rejecting && <RejectModal request={rejecting} reasons={query.data?.rejectReasons ?? []} onClose={() => setRejecting(null)} />}
      </>
    )
  }

  if (missing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div>
          <Button size="sm" icon={ArrowLeft} onClick={() => setSelectedId(null)}>
            {t('Next-term room changes')}
          </Button>
        </div>
        <Card className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock icon={Repeat} title="Request not on this page">
            {t('{id} is not in this list. Change the filters or the page, or pick another request.', { id: selectedId })}
          </EmptyBlock>
        </Card>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Next-term room changes"
        description={atManager ? undefined : query.data?.window ? t('{term} · requests until {closes}, decisions by {due}. Approving moves the next-term bed; nothing is charged now.', { term: query.data.window.termName, closes: formatDateTime(query.data.window.closesAt), due: formatDateTime(query.data.window.decisionsDueAt) }) : 'Room-change requests of the next term, in your scope.'}
        actions={
          <>
            <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
              Export
            </Button>
            <RoomChangeModeSwitch mode="changes" />
          </>
        }
      />

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => filter(setStatus)({ target: { value: v } })}
          options={statusFilters.map((o) => ({ value: o.value, label: t(o.label).replace(/^[^:]*:\s*/, '') }))}
        />
        <FilterSelect
          label="Change"
          value={kind}
          onChange={(v) => filter(setKind)({ target: { value: v } })}
          options={changeFilters.map((o) => ({ value: o.value, label: t(o.label).replace(/^[^:]*:\s*/, '') }))}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th className="w-36">Request</Th>
              <Th className="w-48">Student</Th>
              <Th>From → To</Th>
              <Th className="w-32">Submitted on</Th>
              <Th className="w-40">Status</Th>
              <Th className="w-10">
                <span className="sr-only">{t('Open')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={6} emptyIcon={Repeat} emptyTitle="No room-change requests match these filters" />
            {items.map((r) => (
              <Tr
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="cursor-pointer"
              >
                <Td className="font-medium whitespace-nowrap text-fg-brand tabular">{r.id}</Td>
                <Td>
                  <TwoLine primary={r.studentName} secondary={r.studentCode} />
                </Td>
                <Td className="max-w-0">
                  {/* From on the first line, the requested target under it: nothing is cut in the middle of the move. */}
                  <div className="flex min-w-0 flex-col gap-0.5" title={`${r.from.room} · ${r.from.bed} · ${tr(r.from.roomTypeName)} · ${tr(r.from.roomClassName)} → ${target(r)}`}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-medium text-fg tabular">
                        {r.from.room} · {r.from.bed}
                      </span>
                      <span className="truncate text-sm text-fg-tertiary">
                        {tr(r.from.roomTypeName)} · {tr(r.from.roomClassName)}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg-secondary">
                      <ArrowRight size={14} className="shrink-0 text-fg-tertiary" aria-label={t('To')} />
                      {r.decision?.bed && (
                        <span className="shrink-0 rounded bg-success-bg px-1.5 py-0.5 font-mono text-xs font-semibold text-success-fg tabular">
                          {r.decision.bed}
                        </span>
                      )}
                      <span className="truncate">{target(r)}</span>
                    </span>
                  </div>
                </Td>
                <Td className="whitespace-nowrap tabular">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg">{formatDate(r.submittedAt)}</span>
                    <span className="text-sm text-fg-tertiary">{formatTime(r.submittedAt)}</span>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ChangeStatus status={r.status} />
                      <SlaBadge dueAt={r.dueAt} done={r.status !== 'Pending'} warnHours={48} />
                    </span>
                    {r.dueAt && (
                      <span className="flex items-center gap-1 text-sm whitespace-nowrap text-fg-tertiary tabular" title={t('decide by {date}', { date: formatDateTime(r.dueAt) })}>
                        <CalendarClock size={13} aria-hidden="true" />
                        <span className="sr-only">{t('Decide by')}</span>
                        {formatDate(r.dueAt)}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  <ChevronRight size={16} aria-hidden="true" className="text-fg-tertiary" />
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

      {rejecting && <RejectModal request={rejecting} reasons={query.data?.rejectReasons ?? []} onClose={() => setRejecting(null)} />}
    </>
  )
}
