import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Ban, Building, Check, ChevronDown, Download, KeyRound, Package, SearchX, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, FilterSelect, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { countLines, typeName } from '@/lib/furniture'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { saveXlsx } from '@/lib/xlsx'
import { inventoryWorkbook } from './inventoryWorkbook'
import { t, tr } from '@/i18n'

// SCR-INV-10 Room and Bed Inventory (Figma 37:2075). Shared with the Manager portal.
// GET /inventory/structure?block → { blocks: [{ block, floors }], outOfServiceReasons }
// GET /inventory/rooms?termId&block&floor → { roomClassName, rooms: [{ code, block, floor, roomTypeName, roomClassName, capacity,
//   outOfService: { since, reason, by, note } | null, beds: [{ id, state, occupant: { name, studentCode } | null }] }],
//   summary: { beds, allocated, available, outOfService, residents } }
// Bed states (spec §11.5): unpaid (Assigned – unpaid, yellow), paid (Balance paid, door code not released yet),
// resident (door code released or desk check-in, orange), leaving (a resident without a Bed in the next Term once its
// requests window opened: orange outline), next_term (a continuing resident's Bed of this coming Term: blue), available, oos.
// The Term picker switches the map between the current and the next Term.
// GET /inventory/rooms/:code → { code, block, floor } (deep link ?room=)
// POST /inventory/rooms/:code/out-of-service { reason, note } · POST /inventory/rooms/:code/back-in-service
// Layout (UI only): floor summary with a fill bar, the legend counting the floor's beds, room cards whose bed squares
// open who holds the bed, and a room panel with actions first, furniture folded behind "Show details".

// Light fills on purpose (a floor shows up to ~60 squares at once): each state differs by fill weight, border style and
// the letter's ink, never by a loud solid colour.
const bedLook = {
  unpaid: 'border-warning/70 bg-warning/20',
  paid: 'border-orange-300 bg-orange-50',
  resident: 'border-orange-300 bg-orange-200',
  leaving: 'border-2 border-dashed border-orange-300 bg-surface',
  next_term: 'border-info/50 bg-info-bg',
  available: 'border-success/60 bg-surface',
  oos: 'border-line-strong bg-subtle',
}
// The bed letter printed on the square.
const bedInk = {
  unpaid: 'text-warning-fg',
  paid: 'text-fg-brand',
  resident: 'text-orange-800',
  leaving: 'text-fg-brand',
  next_term: 'text-info-fg',
  available: 'text-success-fg',
  oos: 'text-fg-tertiary',
}
const bedTone = { unpaid: 'warning', paid: 'brand', resident: 'brand', leaving: 'warning', next_term: 'info', available: 'success', oos: 'neutral' }
const bedLabel = {
  unpaid: 'Assigned – unpaid',
  paid: 'Paid – waiting for the door code',
  resident: 'Resident',
  leaving: 'Leaving at the end of the term',
  next_term: 'Moving in next term',
  available: 'Available',
  oos: 'Out of service',
}
const HELD = ['unpaid', 'paid', 'resident', 'leaving', 'next_term']

/** "A-101-B" → "B": the letter printed on the bed square. */
const bedLetter = (id) => String(id).split('-').pop()

function BedMark({ state }) {
  return <span aria-hidden="true" className={cx('inline-block size-3.5 shrink-0 rounded-sm border', bedLook[state])} />
}

/** A bed square with its letter (room cards and the panel's bed list). */
function BedSquare({ bed, className }) {
  return (
    <span aria-hidden="true" className={cx('flex size-7 shrink-0 items-center justify-center rounded-md border text-sm font-semibold tabular', bedLook[bed.state], bedInk[bed.state], className)}>
      {bedLetter(bed.id)}
    </span>
  )
}

/** Legend of the bed states, each with how many beds of the floor are in it. */
function Legend({ counts }) {
  return (
    <ul aria-label={t('Legend')} className="flex flex-wrap items-center gap-2">
      {Object.keys(bedLook).map((s) => {
        const n = counts?.[s] ?? 0
        return (
          <li
            key={s}
            className={cx('flex h-7 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm whitespace-nowrap text-fg-secondary', counts && !n && 'opacity-60')}
          >
            <BedMark state={s} />
            <span>{t(bedLabel[s])}</span>
            {counts && <span className="font-semibold text-fg tabular">{formatNumber(n)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** Room Classes from lowest to highest: a floor whose rooms differ is labelled by its lowest class only. */
const CLASS_ORDER = ['Basic', 'Standard', 'Premium']
const classRank = (c) => {
  const i = CLASS_ORDER.indexOf(c)
  return i === -1 ? CLASS_ORDER.length : i
}

/** The floor's Room Class; when the rooms differ, only the floor's lowest class ("Standard", not "Standard / Premium"). */
const floorClasses = (data) => {
  if (!data) return ''
  if (data.roomClassName) return tr(data.roomClassName)
  const classes = [...new Set((data.rooms ?? []).map((r) => r.roomClassName).filter(Boolean))]
  if (!classes.length) return ''
  return tr(classes.reduce((low, c) => (classRank(c) < classRank(low) ? c : low)))
}

const allocatedOf = (room) => room.beds.filter((b) => HELD.includes(b.state)).length
const freeOf = (room) => room.beds.filter((b) => b.state === 'available').length

function RoomBadge({ room }) {
  const free = freeOf(room)
  if (room.outOfService) return <Tag tone="error">Out of service</Tag>
  if (free === 0) return <Tag tone="info">Full</Tag>
  return <Tag tone="success">{t(free === 1 ? '{n} free bed' : '{n} free beds', { n: free })}</Tag>
}

/** A room on the floor map. A click anywhere on the card selects the room (the header is its keyboard button). */
function RoomCard({ room, selected, onSelect }) {
  const allocated = allocatedOf(room)
  const pct = room.capacity ? Math.round((allocated / room.capacity) * 100) : 0
  const caption = room.outOfService ? t('Out of service') : t('{n} / {total} allocated', { n: allocated, total: room.capacity })
  return (
    <div
      onClick={onSelect}
      className={cx(
        'relative flex min-w-0 cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors',
        selected ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-300' : room.outOfService ? 'border-line bg-subtle/40 hover:border-line-strong' : 'border-line bg-surface hover:border-line-strong hover:bg-subtle/40',
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        aria-pressed={selected}
        aria-label={t('Room {code}, {type}, {caption}', { code: room.code, type: tr(room.roomTypeName), caption })}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm text-left whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="text-h3 font-semibold text-fg tabular">{room.code}</span>
        <RoomBadge room={room} />
      </button>
      {/* Bed squares only show the states; the room's details (who holds each bed) are in the panel on the right. */}
      <span className="flex flex-wrap items-center gap-1.5">
        {room.beds.map((b) => (
          <BedSquare key={b.id} bed={b} />
        ))}
      </span>
      <span className="flex flex-col gap-1" aria-hidden="true">
        <span className="flex items-center justify-between gap-2 text-sm whitespace-nowrap">
          <span className="text-fg-secondary">{tr(room.roomTypeName)}</span>
          <span className={cx('font-medium tabular', room.outOfService ? 'text-error-fg' : 'text-fg')}>{caption}</span>
        </span>
        <span className="block h-1 overflow-hidden rounded-full bg-subtle">
          <span className={cx('block h-full rounded-full', pct >= 100 ? 'bg-orange-400' : 'bg-orange-300')} style={{ width: `${room.outOfService ? 0 : pct}%` }} />
        </span>
      </span>
    </div>
  )
}

/** Label above, value below: the panel's facts in two columns. */
function Fact({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-sm text-fg-tertiary">{t(label)}</dt>
      <dd className="min-w-0 text-base font-semibold text-fg tabular">{children ?? '—'}</dd>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 text-base">
      <dt className="shrink-0 text-fg-secondary">{t(label)}</dt>
      <dd className="min-w-0 text-right font-medium text-fg tabular">{children}</dd>
    </div>
  )
}

function RoomDetail({ room, termId, onSetOutOfService, onMaintenance }) {
  const { notify, notifyError } = useToast()
  const back = useMutation(() => api.inventory.backInService(room.code), {
    invalidates: ['inventory', 'dashboard'],
    onSuccess: () => notify({ title: t('Room {code} is back in service', { code: room.code }), message: t('{n} beds can be allocated again.', { n: room.capacity }) }),
    onError: (e) => notifyError(e, 'Could not update the room'),
  })
  const allocated = allocatedOf(room)
  const oos = room.outOfService
  const rows = oos
    ? [
        ['Room type', tr(room.roomTypeName)],
        ['Room tier', tr(room.roomClassName)],
        ['Since', formatDateTime(oos.since)],
        ['Reason', tr(oos.reason)],
        ['Set by', oos.by],
      ]
    : [
        ['Room type', tr(room.roomTypeName)],
        ['Room tier', tr(room.roomClassName)],
        ['Location', t('Block {code} · Floor {n}', { code: room.block, n: room.floor })],
        ['Allocated', `${allocated} / ${room.capacity}`],
        ['Residents', `${room.beds.filter((b) => b.state === 'resident' || b.state === 'leaving').length} / ${room.capacity}`],
      ]

  return (
    <Card padding="none" className="flex min-h-0 w-96 shrink-0 flex-col overflow-hidden" aria-label={t('Room {code} details', { code: room.code })}>
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-5 pt-4 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm text-fg-tertiary">{t('Block {code} · Floor {n}', { code: room.block, n: room.floor })}</span>
            <h2 className="text-h2 font-semibold text-fg tabular">{t('Room {code}', { code: room.code })}</h2>
          </div>
          <RoomBadge room={room} />
        </div>
        <RoomLinks room={room} termId={termId} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line px-5 py-4">
          {rows.map(([label, value]) => (
            <Fact key={label} label={label}>
              {value}
            </Fact>
          ))}
        </dl>
        {oos?.note && (
          <div className="px-5 pt-4">
            <Alert title="Note">{oos.note}</Alert>
          </div>
        )}
        <section className="flex flex-col gap-2 border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-fg">{t('Beds')}</h3>
          <ul className="flex flex-col gap-2" aria-label={t('Beds')}>
            {room.beds.map((bed) => (
              <li key={bed.id} className={cx('flex items-center gap-3 rounded-md border px-2.5 py-2', bed.occupant ? 'border-line' : 'border-dashed border-line-strong')}>
                <BedSquare bed={bed} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cx('truncate text-base', bed.occupant ? 'font-medium text-fg' : 'text-fg-secondary')}>
                    {bed.occupant ? bed.occupant.name : oos ? t('No occupant') : t('Available')}
                  </span>
                  <span className="truncate text-sm text-fg-tertiary tabular">
                    {bed.id}
                    {bed.occupant ? ` · ${bed.occupant.studentCode}` : ''}
                  </span>
                </span>
                <Tag tone={bedTone[bed.state]} dot={false} className="shrink-0">
                  {t(bedLabel[bed.state] ?? bed.state)}
                </Tag>
              </li>
            ))}
          </ul>
        </section>
        <RoomExtras room={room} termId={termId} />
        <section className="flex flex-col gap-2.5 px-5 py-4">
          <h3 className="text-base font-semibold text-fg">{t('Operations')}</h3>
          <div className="flex flex-wrap gap-2">
            <Button icon={Wrench} onClick={onMaintenance}>
              Maintenance
            </Button>
            {oos ? (
              <Button variant="primary" icon={Check} onClick={() => back.run()} disabled={back.pending}>
                Back in service
              </Button>
            ) : (
              <Button icon={Ban} onClick={onSetOutOfService} disabled={allocated > 0}>
                Set out of service
              </Button>
            )}
          </div>
          {!oos && allocated > 0 && <Note>{t('Move the {n} residents before you set this room out of service.', { n: allocated })}</Note>}
        </section>
      </div>
    </Card>
  )
}

const useRoomDetails = (room, termId) =>
  useQuery(['inventory', 'details', room.code, termId], ({ signal }) => api.inventory.details(room.code, { termId }, { signal }))

/** Room hub, furniture and door code: the panel's first actions. */
function RoomLinks({ room, termId }) {
  const base = useRoleBase()
  const navigate = useNavigate()
  const d = useRoomDetails(room, termId).data
  return (
    // Three fixed slots: the door code button is always there (disabled until the room's details say it has a door
    // code), so the panel does not jump when another room or floor is picked.
    <div className="grid grid-cols-3 gap-2">
      <Button variant="primary" className="w-full justify-center px-2" onClick={() => navigate(`${base}/rooms/${room.code}`)}>
        Room hub
      </Button>
      <Button icon={Package} className="w-full justify-center px-2" onClick={() => navigate(`${base}/furniture?room=${room.code}`)}>
        Furniture
      </Button>
      <Button
        icon={KeyRound}
        className="w-full justify-center px-2"
        disabled={!d?.doorCode}
        title={d && !d.doorCode ? t('This room has no door code.') : undefined}
        onClick={() => navigate(`${base}/door-codes?room=${room.code}`)}
      >
        Door code
      </Button>
    </div>
  )
}

/** Room Class of the next Term, door code state, furniture and its conformance (spec §11.3 "Room"). */
function RoomExtras({ room, termId }) {
  const [open, setOpen] = useState(false)
  const query = useRoomDetails(room, termId)
  const d = query.data
  if (!d)
    return (
      <section className="border-b border-line px-5 py-4" aria-busy="true">
        <div className="h-24 animate-pulse rounded-lg bg-subtle" />
      </section>
    )
  const c = d.conformance
  const inUse = d.furniture.filter((f) => f.status === 'In use').length
  return (
    <section className="flex flex-col gap-3 border-b border-line px-5 py-4">
      {(d.next || d.doorCode) && (
        <dl className="flex flex-col gap-2.5">
          {d.next && (
            <Row label="Next term">
              {t('{term}: {roomClass}', { term: d.next.term, roomClass: tr(d.next.roomClass) })}
            </Row>
          )}
          {d.doorCode && (
            <Row label="Door code">
              <span className="inline-flex items-center gap-1.5">
                <StatusTag status={d.doorCode.status} />
                {d.doorCode.proposed && <Tag tone="info" dot={false}>New code waiting</Tag>}
              </span>
            </Row>
          )}
        </dl>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-subtle/60 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Package size={18} className="shrink-0 text-fg-tertiary" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold text-fg">{t('Furniture')}</span>
            <span className="truncate text-sm text-fg-tertiary">
              {d.furniture.length ? t('{n} items · {inUse} in use', { n: d.furniture.length, inUse }) : t('No furniture recorded in this room.')}
            </span>
          </span>
          <StatusTag status={c.status} className="shrink-0" />
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-fg-brand">
            {open ? t('Hide') : t('Show details')}
            <ChevronDown size={14} aria-hidden="true" className={cx('transition-transform', open && 'rotate-180')} />
          </span>
        </button>
        {(c.missing.length > 0 || c.extra.length > 0) && (
          <div className="flex flex-col gap-1 border-t border-line px-3 py-2 text-sm text-fg-secondary">
            {c.missing.length > 0 && <p className="text-error-fg">{t('Missing: {items}', { items: countLines(c.missing) })}</p>}
            {c.extra.length > 0 && <p>{t('Remove: {items}', { items: countLines(c.extra) })}</p>}
          </div>
        )}
        {open && (
          <ul className="flex flex-col divide-y divide-line border-t border-line px-3" aria-label={t('Furniture')}>
            {d.furniture.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 py-2 text-sm">
                <span className="shrink-0 font-medium text-fg tabular">{f.assetCode}</span>
                <span className="min-w-0 flex-1 truncate text-fg-secondary">{typeName(f)}</span>
                <StatusTag status={f.status} className="shrink-0" />
              </li>
            ))}
            {!d.furniture.length && <li className="py-2 text-sm text-fg-tertiary">{t('No furniture recorded in this room.')}</li>}
          </ul>
        )}
      </div>
    </section>
  )
}

function OutOfServiceModal({ room, reasons, onClose }) {
  const { notify } = useToast()
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [note, setNote] = useState('')
  const save = useMutation(() => api.inventory.setOutOfService(room.code, { reason, note: note.trim() || undefined }), {
    invalidates: ['inventory', 'dashboard'],
    onSuccess: () => {
      notify({ type: 'warning', title: t('Room {code} is out of service', { code: room.code }), message: 'Its beds are skipped by the next assignment run.' })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Set Room {code} out of service', { code: room.code })}
      description="The assignment engine skips this room and its beds until it is back in service."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Ban} onClick={() => save.run()} disabled={!reason || save.pending}>
            Set out of service
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not update the room">{save.error.message}</Alert>}
      <Field label="Reason" required>
        {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={reasons} />}
      </Field>
      <Field label="Note" helper="Shown to staff and managers.">
        {(id) => <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened and what is needed to fix it" />}
      </Field>
    </Modal>
  )
}

/** Floor title, its fill bar and the three counts that matter (allocated, available, out of service). */
function FloorSummary({ title, rooms, summary }) {
  const beds = summary?.beds ?? 0
  const pct = (n) => (beds > 0 ? (n / beds) * 100 : 0)
  const count = (states) => rooms.reduce((a, r) => a + r.beds.filter((b) => states.includes(b.state)).length, 0)
  const segments = [
    { key: 'living', value: count(['resident', 'leaving']), fill: 'bg-orange-400' },
    { key: 'unpaid', value: count(['unpaid']), fill: 'bg-warning/70' },
    { key: 'other', value: count(['paid', 'next_term']), fill: 'bg-orange-200' },
  ]
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line bg-surface px-5 py-3.5">
      <div className="flex min-w-0 flex-col">
        <h2 className="text-h3 font-semibold text-fg">{title}</h2>
        {summary && (
          <p className="text-sm text-fg-tertiary tabular">
            {t('{beds} beds · {allocated} allocated · {available} available', { beds: formatNumber(summary.beds), allocated: formatNumber(summary.allocated), available: formatNumber(summary.available) })}
            {summary.outOfService > 0 && ` · ${t('{n} out of service', { n: formatNumber(summary.outOfService) })}`}
          </p>
        )}
      </div>
      {summary && (
        <>
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <div
              role="img"
              aria-label={t('{allocated} of {beds} beds allocated', { allocated: formatNumber(summary.allocated), beds: formatNumber(beds) })}
              className="flex h-2.5 overflow-hidden rounded-full bg-subtle"
            >
              {segments.map((s) => (s.value > 0 ? <span key={s.key} className={cx('h-full', s.fill)} style={{ width: `${pct(s.value)}%` }} /> : null))}
            </div>
            <span className="text-sm text-fg-secondary tabular">{t('{pct}% allocated', { pct: Math.round(pct(summary.allocated)) })}</span>
          </div>
          <dl className="flex gap-5">
            <div>
              <dt className="text-sm text-fg-tertiary">{t('Allocated')}</dt>
              <dd className="text-h3 font-semibold text-fg tabular">{formatNumber(summary.allocated)}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-tertiary">{t('Available')}</dt>
              <dd className="text-h3 font-semibold text-success-fg tabular">{formatNumber(summary.available)}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-tertiary">{t('Out of service')}</dt>
              <dd className={cx('text-h3 font-semibold tabular', summary.outOfService ? 'text-error-fg' : 'text-fg-tertiary')}>{formatNumber(summary.outOfService)}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  )
}

export default function Inventory() {
  const atManager = useRoleBase() === '/manager'
  const { term, block: scopeBlock } = useSession()
  const { notifyError } = useToast()
  const base = useRoleBase()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const structure = useQuery(['inventory', 'structure', scopeBlock], ({ signal }) => api.inventory.structure({ block: scopeBlock ?? undefined }, { signal }))
  const blocks = structure.data?.blocks ?? []
  const [block, setBlock] = useState(null)
  const [floor, setFloor] = useState(null)
  const [selected, setSelected] = useState(params.get('room'))
  const [settingOos, setSettingOos] = useState(false)
  const [search, setSearch] = useState('')

  // Deep link (?room=A-0712) opens that Room's Block and floor; otherwise the first Block and floor.
  const deepLink = useQuery(['inventory', 'room', params.get('room')], ({ signal }) => api.inventory.room(params.get('room'), { signal }), { enabled: Boolean(params.get('room')) })
  useEffect(() => {
    if (block) return
    if (deepLink.data) {
      setBlock(deepLink.data.block)
      setFloor(deepLink.data.floor)
    } else if (blocks.length && (!params.get('room') || deepLink.error)) {
      setBlock(blocks[0].block)
      setFloor(blocks[0].floors[0])
    }
  }, [block, blocks, deepLink.data, deepLink.error, params])

  const floors = blocks.find((b) => b.block === block)?.floors ?? []
  const floorQuery = useQuery(['inventory', 'floor', term?.id, block, floor], ({ signal }) => api.inventory.floor({ termId: term?.id, block, floor }, { signal }), { enabled: Boolean(block && floor != null) })
  const rooms = floorQuery.data?.rooms ?? []
  const summary = floorQuery.data?.summary
  const counts = floorQuery.data ? rooms.reduce((acc, r) => (r.beds.forEach((b) => (acc[b.state] = (acc[b.state] ?? 0) + 1)), acc), {}) : null

  // Search looks through every floor of the Block (the same floor view, once per floor): room code, student name or code.
  const q = search.trim().toLowerCase()
  const blockFloors = useQuery(
    ['inventory', 'block-floors', term?.id, block, floors.join()],
    async ({ signal }) => {
      const list = await Promise.all(floors.map((f) => api.inventory.floor({ termId: term?.id, block, floor: f }, { signal })))
      return floors.map((f, i) => ({ floor: f, data: list[i] }))
    },
    { enabled: Boolean(q && block && floors.length) },
  )
  const matches = (r) =>
    r.code.toLowerCase().includes(q) || r.beds.some((b) => b.occupant && (b.occupant.name.toLowerCase().includes(q) || String(b.occupant.studentCode).toLowerCase().includes(q)))
  const found = q ? (blockFloors.data ?? []).map((f) => ({ floor: f.floor, rooms: (f.data.rooms ?? []).filter(matches) })).filter((f) => f.rooms.length) : []
  const pool = q ? found.flatMap((f) => f.rooms) : rooms
  const room = pool.find((r) => r.code === selected) ?? rooms.find((r) => r.code === selected) ?? rooms.find((r) => r.outOfService) ?? rooms[0]

  const goFloor = (f) => {
    setFloor(f)
    setSelected(null)
  }

  // The export is an XLSX workbook built here (one sheet per floor); the server still checks and records it.
  const exporting = useMutation(
    async () => {
      const [list] = await Promise.all([
        Promise.all(floors.map((f) => api.inventory.floor({ termId: term?.id, block, floor: f }))),
        api.exports.record('inventory', { termId: term?.id, block }),
      ])
      const bytes = inventoryWorkbook({ block, termName: term?.name, floors: floors.map((f, i) => ({ floor: f, data: list[i] })) })
      saveXlsx(bytes, `inventory-block-${block}.xlsx`)
    },
    { onError: (e) => notifyError(e, 'Export failed') },
  )

  const card = (r, { fromSearch = false } = {}) => (
    <RoomCard
      key={r.code}
      room={r}
      selected={r.code === room?.code}
      onSelect={() => {
        if (fromSearch) {
          setFloor(r.floor)
          setSearch('')
        }
        setSelected(r.code)
      }}
    />
  )

  return (
    <>
      <PageHeader
        title="Rooms and beds"
        tip="Rooms and beds in your scope. Click a room to see its details on the right."
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={!block || exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <FilterSelect
          aria-label={t('Block')}
          value={block ?? ''}
          onChange={(val) => {
            const b = blocks.find((x) => x.block === val)
            setBlock(b.block)
            goFloor(b.floors[0])
          }}
          options={blocks.map((b) => ({ value: b.block, label: t('Block {code}', { code: b.block }) }))}
          disabled={!blocks.length}
        />
        {floors.length > 0 && (
          <div role="group" aria-label={t('Floor')} className="flex flex-wrap items-stretch overflow-hidden rounded-md border border-line-strong bg-surface">
            <span className="flex h-8 items-center border-r border-line px-3 text-base text-fg-tertiary">{t('Floor')}</span>
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={f === floor}
                aria-label={t('Floor {n}', { n: f })}
                onClick={() => goFloor(f)}
                className={cx(
                  'flex h-8 min-w-9 shrink-0 cursor-pointer items-center justify-center border-r border-line px-3 text-base tabular transition-colors last:border-r-0 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus',
                  f === floor ? 'bg-primary-subtle font-semibold text-fg-brand' : 'text-fg hover:bg-subtle',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        <SearchInput
          wrapperClassName="ml-auto w-72 max-w-full"
          aria-label={t('Find a room or student in this block')}
          placeholder={t('Find a room or student in this block')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <section aria-label={t('Rooms and beds')} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <FloorSummary
            title={block ? [t('Block {code}', { code: block }), floor != null && t('Floor {n}', { n: floor }), floorClasses(floorQuery.data)].filter(Boolean).join(' · ') : t('Rooms and beds')}
            rooms={rooms}
            summary={summary}
          />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {q ? (
              <QueryState query={blockFloors} isEmpty={() => found.length === 0} empty={<EmptyBlock icon={SearchX} title="No room or student matches your search" />}>
                {() =>
                  found.map((f) => (
                    <section key={f.floor} className="flex flex-col gap-2" aria-label={t('Floor {n}', { n: f.floor })}>
                      <h3 className="text-sm font-semibold text-fg-secondary">
                        {t('Floor {n}', { n: f.floor })} · {t(f.rooms.length === 1 ? '{n} room' : '{n} rooms', { n: f.rooms.length })}
                      </h3>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">{f.rooms.map((r) => card(r, { fromSearch: true }))}</div>
                    </section>
                  ))
                }
              </QueryState>
            ) : (
              <>
                <Legend counts={counts} />
                <QueryState
                  query={block ? floorQuery : structure}
                  isEmpty={(d) => (block ? !d.rooms?.length : !d.blocks?.length)}
                  empty={<EmptyBlock icon={Building} title={block ? 'No rooms on this floor' : 'No blocks in your scope'} />}
                >
                  {() => <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">{rooms.map((r) => card(r))}</div>}
                </QueryState>
              </>
            )}
          </div>
        </section>

        {room && <RoomDetail key={room.code} room={room} termId={term?.id} onSetOutOfService={() => setSettingOos(true)} onMaintenance={() => navigate(`${base}/maintenance?room=${room.code}`)} />}
      </div>

      {settingOos && room && <OutOfServiceModal room={room} reasons={structure.data?.outOfServiceReasons ?? []} onClose={() => setSettingOos(false)} />}
    </>
  )
}
