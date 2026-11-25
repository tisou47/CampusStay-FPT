import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Ban, Building, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Package, SearchX, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Note } from '@/components/ui/Display'
import { Field, FilterSelect, SearchInput, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { InfoTip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { countLines } from '@/lib/furniture'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { saveXlsx } from '@/lib/xlsx'
import { inventoryWorkbook } from './inventoryWorkbook'
import { DoorCodeButton } from './inventory/DoorCodeButton'
import { RoomReportList, useRoomReports } from './inventory/RoomReports'
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
// POST /door-codes/:room/reveal → { room, active, proposed } (every view is written to the Audit Log)
// Layout (UI only): the title row, one floor card (floor tabs and counts, the bed states that also filter the list), then
// the floor's rooms as a table beside the selected room's profile. The Block follows the top bar; the page offers its own
// Block picker only when the top bar is on every Block.

/** The bed states in the order of the status list (spec §11.5). */
const STATES = ['unpaid', 'paid', 'resident', 'leaving', 'next_term', 'available', 'oos']
const STATUS_OPEN_KEY = 'inventory.roomStatusOpen'

// Fill, border and ink of a bed square. Held beds orange, free beds green outlined, waiting for the door code light
// blue, out of service sand; the others keep their own mark (unpaid amber, leaving and next term dashed).
const bedLook = {
  unpaid: 'border-warning bg-warning-bg text-warning-fg',
  paid: 'border-info/60 bg-info-bg text-info-fg',
  resident: 'border-orange-400 bg-orange-100 text-orange-800',
  leaving: 'border-dashed border-orange-400 bg-orange-50 text-orange-800',
  next_term: 'border-dashed border-info bg-surface text-info-fg',
  available: 'border-success bg-surface text-success-fg',
  oos: 'border-line-strong bg-subtle text-fg-tertiary',
}
const bedTone = { unpaid: 'warning', paid: 'info', resident: 'brand', leaving: 'warning', next_term: 'info', available: 'success', oos: 'neutral' }
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

/** The system focus ring on this page's own controls. */
const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
/** Hover and selection only, short, none for reduced motion. */
const ease = 'transition-colors duration-150 motion-reduce:transition-none'
/** The room table's columns: room, beds, type, allocated, state. */
const COLUMNS = 'grid-cols-[72px_64px_minmax(0,1fr)_88px_128px] max-[560px]:grid-cols-[64px_64px_minmax(0,1fr)]'

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
const residentsOf = (room) => room.beds.filter((b) => b.state === 'resident' || b.state === 'leaving').length

/** The room's state: out of service, full, or how many beds are free. */
function RoomPill({ room, className }) {
  const free = freeOf(room)
  if (room.outOfService)
    return (
      <Tag tone="error" className={className}>
        Out of service
      </Tag>
    )
  if (free === 0)
    return (
      <Tag tone="info" className={className}>
        Full
      </Tag>
    )
  return (
    <Tag tone="success" className={className}>
      {t(free === 1 ? '{n} free bed' : '{n} free beds', { n: free })}
    </Tag>
  )
}

/** The beds drawn like bunk beds: A above B, C above D, E above F; 2, 4 or 6 beds take 1, 2 or 3 columns. */
function BedMap({ beds }) {
  return (
    <span aria-hidden="true" className="grid w-16 shrink-0 grid-flow-col auto-cols-[20px] grid-rows-[repeat(2,20px)] gap-1">
      {beds.map((b) => (
        <span key={b.id} className={cx('flex size-5 items-center justify-center rounded-sm border text-xs leading-none font-semibold tabular', bedLook[b.state])}>
          {bedLetter(b.id)}
        </span>
      ))}
    </span>
  )
}

/** One row of the room table. Below 560px its type, count and state wrap beside the bed map. */
function RoomRow({ room, selected, onSelect, onKeyDown, buttonRef }) {
  const allocated = allocatedOf(room)
  const caption = room.outOfService ? t('Out of service') : t('{n} / {total} allocated', { n: allocated, total: room.capacity })
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      aria-label={t('Room {code}, {type}, {caption}', { code: room.code, type: tr(room.roomTypeName), caption })}
      className={cx(
        'grid min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-base focus-visible:-outline-offset-2',
        COLUMNS,
        ease,
        ring,
        selected ? 'bg-primary-subtle' : room.outOfService ? 'bg-subtle/50 hover:bg-subtle' : 'hover:bg-subtle/60',
      )}
    >
      <span className={cx('font-semibold whitespace-nowrap tabular', selected ? 'text-fg-brand' : 'text-fg')}>{room.code}</span>
      <BedMap beds={room.beds} />
      <span aria-hidden="true" className="contents max-[560px]:flex max-[560px]:min-w-0 max-[560px]:flex-wrap max-[560px]:items-center max-[560px]:gap-x-3 max-[560px]:gap-y-1">
        <span className="min-w-0 truncate whitespace-nowrap text-fg-secondary">{tr(room.roomTypeName)}</span>
        <span className={cx('whitespace-nowrap tabular', room.outOfService ? 'text-error-fg' : 'text-fg')}>
          {room.outOfService ? '—' : `${allocated}/${room.capacity}`}
        </span>
        <span className="flex">
          <RoomPill room={room} />
        </span>
      </span>
    </button>
  )
}

/** Floor tabs: ← → Home End move between floors. */
function FloorTabs({ floors, floor, onPick }) {
  const refs = useRef({})
  const onKeyDown = (e) => {
    const i = floors.indexOf(floor)
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: floors.length - 1 }[e.key]
    if (to == null) return
    e.preventDefault()
    const next = floors[(to + floors.length) % floors.length]
    onPick(next)
    refs.current[next]?.focus()
  }
  return (
    <div className="flex items-center gap-3">
      <span id="inventory-floor-label" className="text-base whitespace-nowrap text-fg-secondary">
        {t('Floor')}
      </span>
      <div role="tablist" aria-labelledby="inventory-floor-label" onKeyDown={onKeyDown} className="flex flex-wrap gap-1">
        {floors.map((f) => {
          const on = f === floor
          return (
            <button
              key={f}
              ref={(el) => (refs.current[f] = el)}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              aria-label={t('Floor {n}', { n: f })}
              onClick={() => onPick(f)}
              className={cx(
                'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-base tabular',
                ease,
                ring,
                on ? 'bg-primary font-semibold text-fg-on-brand' : 'text-fg hover:bg-primary-subtle hover:text-fg-brand',
              )}
            >
              {f}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A count above its small label. */
function Metric({ label, value, className }) {
  return (
    <div className="flex flex-col-reverse whitespace-nowrap">
      <dt className="text-sm text-fg-tertiary">{t(label)}</dt>
      <dd className={cx('text-h2 font-semibold tabular', className)}>{formatNumber(value)}</dd>
    </div>
  )
}

/**
 * The floor card, one row: floor tabs, its fill bar and counts, and a Room status button that unfolds the seven bed
 * states below, each with how many beds of the floor are in it and a checkbox that shows or hides the rooms holding
 * such beds. The button says how many states are shown and turns orange while some are hidden.
 */
function FloorOverview({ floors, floor, onPick, title, floorClass, rooms, summary, counts, shown, onToggle }) {
  const beds = summary?.beds ?? 0
  const pct = (n) => (beds > 0 ? (n / beds) * 100 : 0)
  const count = (states) => rooms.reduce((a, r) => a + r.beds.filter((b) => states.includes(b.state)).length, 0)
  const segments = [
    { key: 'living', value: count(['resident', 'leaving']), fill: 'bg-primary' },
    { key: 'unpaid', value: count(['unpaid']), fill: 'bg-warning' },
    { key: 'other', value: count(['paid', 'next_term']), fill: 'bg-orange-300' },
  ]
  // The status list folds away (remembered per browser) so the room list and profile below get the height.
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(STATUS_OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const setOpen = (next) => {
    setOpenState(next)
    try {
      localStorage.setItem(STATUS_OPEN_KEY, next ? '1' : '0')
    } catch {
      /* private window: the choice lasts until reload */
    }
  }
  const filtered = shown.size < STATES.length
  return (
    <section aria-label={title} className="shrink-0 rounded-lg border border-line bg-surface px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          {floors.length > 0 && <FloorTabs floors={floors} floor={floor} onPick={onPick} />}
          {(floorClass || summary) && (
            <div className="flex flex-wrap items-center gap-2.5 pl-12 text-sm max-[560px]:pl-0">
              {floorClass && (
                <span className="inline-flex items-center rounded-md bg-primary-subtle px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-fg-brand">
                  {floorClass}
                </span>
              )}
              {summary && (
                <>
                  <div
                    role="img"
                    aria-label={t('{allocated} of {beds} beds allocated', { allocated: formatNumber(summary.allocated), beds: formatNumber(beds) })}
                    className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-subtle"
                  >
                    {segments.map((s) => (s.value > 0 ? <span key={s.key} className={cx('h-full', s.fill)} style={{ width: `${pct(s.value)}%` }} /> : null))}
                  </div>
                  <span className="font-semibold whitespace-nowrap text-fg tabular">{Math.round(pct(summary.allocated))}%</span>
                  <span className="whitespace-nowrap text-fg-tertiary tabular">
                    {t('{beds} beds · {allocated} allocated · {available} available', {
                      beds: formatNumber(summary.beds),
                      allocated: formatNumber(summary.allocated),
                      available: formatNumber(summary.available),
                    })}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-3">
          <dl className="flex gap-6">
            <Metric label="Allocated" value={summary?.allocated ?? 0} className="text-fg" />
            <Metric label="Available" value={summary?.available ?? 0} className="text-success-fg" />
            <Metric label="Out of service" value={summary?.outOfService ?? 0} className={summary?.outOfService ? 'text-error-fg' : 'text-fg-tertiary'} />
          </dl>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="inventory-room-status"
            onClick={() => setOpen(!open)}
            className={cx(
              'flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 text-base font-medium whitespace-nowrap',
              ease,
              ring,
              filtered ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line text-fg hover:bg-subtle',
            )}
          >
            {t('Room status')}
            <span className={cx('text-sm tabular', filtered ? 'text-fg-brand' : 'text-fg-tertiary')}>{t('{n} of {total}', { n: shown.size, total: STATES.length })}</span>
            <ChevronDown size={16} aria-hidden="true" className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <fieldset id="inventory-room-status" className="mt-3 min-w-0 border-t border-line pt-3">
          <legend className="sr-only">{t('Room status')}</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4">
            {STATES.map((s) => {
              const n = counts?.[s] ?? 0
              const on = shown.has(s)
              return (
                <label key={s} className={cx('flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm hover:bg-subtle/60', ease, !on && 'opacity-55')}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(s)} className={cx('size-3.5 shrink-0 cursor-pointer accent-primary', ring)} />
                  <span aria-hidden="true" className={cx('inline-block size-3 shrink-0 rounded-sm border', bedLook[s])} />
                  <span className={cx('min-w-0 whitespace-nowrap', n ? 'text-fg' : 'text-fg-tertiary')}>{t(bedLabel[s])}</span>
                  <span className={cx('ml-auto pl-2 font-semibold tabular', n ? 'text-fg' : 'text-fg-tertiary')}>{formatNumber(n)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
    </section>
  )
}

/** Label above, value below: the profile's facts. */
function Fact({ label, wrap = false, children }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-sm text-fg-tertiary">{t(label)}</dt>
      <dd className={cx('min-w-0 text-h3 font-semibold text-fg tabular', wrap ? 'break-words' : 'whitespace-nowrap')}>{children ?? '—'}</dd>
    </div>
  )
}

/** A profile section: hairline above, its title, then the content. */
function Section({ id, title, aside, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h3 id={id} className="text-h3 font-semibold text-fg">
          {t(title)}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

const useRoomDetails = (room, termId) =>
  useQuery(['inventory', 'details', room.code, termId], ({ signal }) => api.inventory.details(room.code, { termId }, { signal }))

/** The selected room: its links, facts, beds, door code, furniture and operations. */
function RoomProfile({ room, termId, prev, next, onStep, onSetOutOfService, onMaintenance, backTo }) {
  const base = useRoleBase()
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const details = useRoomDetails(room, termId)
  const d = details.data
  // Furniture: green when the room matches its class and every item is in use; the button's title says what is off.
  const c = d?.conformance
  const furnitureOk = Boolean(d) && c?.status === 'Matches' && d.furniture.every((f) => f.status === 'In use')
  const furnitureNote = c
    ? [c.missing.length ? t('Missing: {items}', { items: countLines(c.missing) }) : null, c.extra.length ? t('Remove: {items}', { items: countLines(c.extra) }) : null].filter(Boolean).join(' · ')
    : ''
  const back = useMutation(() => api.inventory.backInService(room.code), {
    invalidates: ['inventory', 'dashboard'],
    onSuccess: () => notify({ title: t('Room {code} is back in service', { code: room.code }), message: t('{n} beds can be allocated again.', { n: room.capacity }) }),
    onError: (e) => notifyError(e, 'Could not update the room'),
  })
  const allocated = allocatedOf(room)
  const residents = residentsOf(room)
  const oos = room.outOfService
  const where = t('Block {code} · Floor {n}', { code: room.block, n: room.floor })

  return (
    <article aria-label={t('Room {code} details', { code: room.code })} className="flex min-w-0 flex-col gap-5 rounded-lg border border-line bg-surface p-6 max-[720px]:p-4">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm whitespace-nowrap text-fg-tertiary">{where}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-kpi font-bold tracking-tight whitespace-nowrap text-fg tabular">{t('Room {code}', { code: room.code })}</h2>
              <RoomPill room={room} />
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <IconButton icon={ChevronLeft} variant="outline" aria-label={t('Previous room')} tip="Previous room" disabled={!prev} onClick={() => onStep(prev)} />
            <IconButton icon={ChevronRight} variant="outline" aria-label={t('Next room')} tip="Next room" disabled={!next} onClick={() => onStep(next)} />
          </div>
        </div>
        {/* Three fixed slots, one place per action: the room hub, the room's furniture (its own page, with a way back
            to this room) and the door code (seen and changed in its popover). */}
        <div className="grid grid-cols-3 gap-2 max-[720px]:grid-cols-1">
          <Button
            variant="primary"
            size="lg"
            block
            className="justify-center px-3"
            onClick={() => navigate(`${base}/rooms/${room.code}?back=${encodeURIComponent(backTo)}`, { state: { fromInventory: true } })}
          >
            Room hub
          </Button>
          <Button
            icon={Package}
            size="lg"
            block
            className="justify-center px-3"
            title={furnitureNote || undefined}
            onClick={() => navigate(`${base}/furniture?room=${room.code}&from=inventory&back=${encodeURIComponent(backTo)}`, { state: { fromInventory: true } })}
          >
            <span className="flex items-center gap-2">
              {d ? t('Furniture · {n} items', { n: d.furniture.length }) : t('Furniture')}
              {d && <span aria-hidden="true" className={cx('size-2 rounded-full', furnitureOk ? 'bg-success' : 'bg-accent')} />}
              {d && <span className="sr-only">{furnitureOk ? t('Matches') : t('Needs attention')}</span>}
            </span>
          </Button>
          <DoorCodeButton key={room.code} room={room.code} door={d?.doorCode} loading={!d} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 max-[720px]:grid-cols-1">
        <Fact label="Room type">{tr(room.roomTypeName)}</Fact>
        <Fact label="Room tier">{tr(room.roomClassName)}</Fact>
        {oos ? (
          <>
            <Fact label="Since" wrap>
              {formatDateTime(oos.since)}
            </Fact>
            <Fact label="Reason" wrap>
              {tr(oos.reason)}
            </Fact>
            <Fact label="Set by" wrap>
              {oos.by}
            </Fact>
          </>
        ) : (
          <>
            <Fact label="Location">{where}</Fact>
            <Fact label="Allocated">{`${allocated}/${room.capacity}`}</Fact>
          </>
        )}
        {d?.next && (
          <Fact label="Next term" wrap>
            {t('{term}: {roomClass}', { term: d.next.term, roomClass: tr(d.next.roomClass) })}
          </Fact>
        )}
        {!oos && (
          <div className="col-span-2 flex flex-col gap-1.5 max-[720px]:col-span-1">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-fg-tertiary">{t('Residents')}</dt>
              <dd className="text-h3 font-semibold whitespace-nowrap text-fg tabular">{`${residents}/${room.capacity}`}</dd>
            </div>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${room.capacity ? (residents / room.capacity) * 100 : 0}%` }} />
            </span>
          </div>
        )}
      </dl>
      {oos?.note && <Alert title="Note">{oos.note}</Alert>}

      <Section id="inventory-beds" title="Beds">
        <ul className="flex flex-col gap-2">
          {room.beds.map((bed) => (
            <li key={bed.id} className={cx('flex items-center gap-3 rounded-lg border px-3 py-2.5', bed.occupant ? 'border-line' : 'border-dashed border-line-strong bg-gray-25')}>
              <span aria-hidden="true" className={cx('flex size-9 shrink-0 items-center justify-center rounded-md border text-base font-semibold', bedLook[bed.state])}>
                {bedLetter(bed.id)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cx('text-base font-semibold break-words', bed.occupant ? 'text-fg' : 'text-fg-secondary')}>
                  {bed.occupant ? bed.occupant.name : oos ? t('No occupant') : t('Available')}
                </span>
                <span className="text-sm text-fg-tertiary tabular">
                  {bed.id}
                  {bed.occupant ? ` · ${bed.occupant.studentCode}` : ''}
                </span>
              </span>
              <Tag tone={bedTone[bed.state]} dot={false}>
                {t(bedLabel[bed.state] ?? bed.state)}
              </Tag>
            </li>
          ))}
        </ul>
      </Section>

      <RoomReports room={room.code} />

      <Section id="inventory-operations" title="Operations">
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
      </Section>
    </article>
  )
}


/** The room's reports (report 1, other inspections, check-in inventories), newest first. */
function RoomReports({ room }) {
  const { rows, loading } = useRoomReports(room)
  return (
    <Section id="inventory-reports" title="Reports" aside={rows.length > 0 && <span className="text-sm text-fg-tertiary tabular">{formatNumber(rows.length)}</span>}>
      <RoomReportList rows={rows} loading={loading} />
    </Section>
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

export default function Inventory() {
  const { term, block: scopeBlock } = useSession()
  const { notifyError } = useToast()
  const base = useRoleBase()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const structure = useQuery(['inventory', 'structure', scopeBlock], ({ signal }) => api.inventory.structure({ block: scopeBlock ?? undefined }, { signal }))
  const blocks = structure.data?.blocks ?? []
  const [block, setBlock] = useState(null)
  const [floor, setFloor] = useState(null)
  const [selected, setSelected] = useState(params.get('room'))
  const [settingOos, setSettingOos] = useState(false)
  // The page's state lives in the URL too (?block&floor&room&hide&q), so Back, a reload or a shared link (and the
  // way back from a room's Furniture) open the same floor, room, statuses and search.
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [shown, setShown] = useState(() => {
    const hidden = (params.get('hide') ?? '').split(',')
    return new Set(STATES.filter((s) => !hidden.includes(s)))
  })
  const rowRefs = useRef({})

  // Deep link (?room=A-0712) opens that Room's Block and floor; otherwise the first Block and floor. A Block that left
  // the scope (another Block picked in the top bar) gives way to the new scope's first Block.
  const deepLink = useQuery(['inventory', 'room', params.get('room')], ({ signal }) => api.inventory.room(params.get('room'), { signal }), { enabled: Boolean(params.get('room')) })
  useEffect(() => {
    if (block && (!blocks.length || blocks.some((b) => b.block === block))) return
    if (!block && deepLink.data) {
      setBlock(deepLink.data.block)
      setFloor(deepLink.data.floor)
    } else if (blocks.length && (block || !params.get('room') || deepLink.error)) {
      // ?block=A&floor=3 (a floor bar of Staff › Today) opens that floor while its Block is in scope.
      const wanted = !block && blocks.find((b) => b.block === params.get('block'))
      const first = wanted || blocks[0]
      const floorParam = Number(params.get('floor'))
      setBlock(first.block)
      setFloor(wanted && first.floors.includes(floorParam) ? floorParam : first.floors[0])
      setSelected(null)
    }
  }, [block, blocks, deepLink.data, deepLink.error, params])

  const floors = blocks.find((b) => b.block === block)?.floors ?? []
  const floorQuery = useQuery(['inventory', 'floor', term?.id, block, floor], ({ signal }) => api.inventory.floor({ termId: term?.id, block, floor }, { signal }), { enabled: Boolean(block && floor != null) })
  const rooms = floorQuery.data?.rooms ?? []
  const summary = floorQuery.data?.summary
  const counts = floorQuery.data ? rooms.reduce((acc, r) => (r.beds.forEach((b) => (acc[b.state] = (acc[b.state] ?? 0) + 1)), acc), {}) : null

  // Status filter: a room stays listed while one of its beds is in a ticked state.
  const allShown = shown.size === STATES.length
  const passes = (r) => allShown || r.beds.some((b) => shown.has(b.state))
  const toggle = (s) =>
    setShown((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(s)) nextSet.delete(s)
      else nextSet.add(s)
      return nextSet
    })

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
  const found = q ? (blockFloors.data ?? []).map((f) => ({ floor: f.floor, rooms: (f.data.rooms ?? []).filter((r) => matches(r) && passes(r)) })).filter((f) => f.rooms.length) : []
  const visible = q ? found.flatMap((f) => f.rooms) : rooms.filter(passes)
  const room = visible.find((r) => r.code === selected) ?? visible.find((r) => r.outOfService) ?? visible[0]
  const at = room ? visible.indexOf(room) : -1

  // Mirror the state into the URL (replace: picking rooms does not fill the history), once the floor is known.
  const ready = Boolean(block && floor != null && floorQuery.data)
  const wanted = new URLSearchParams()
  if (block) wanted.set('block', block)
  if (floor != null) wanted.set('floor', String(floor))
  if (room) wanted.set('room', room.code)
  if (shown.size < STATES.length) wanted.set('hide', STATES.filter((s) => !shown.has(s)).join(','))
  if (search.trim()) wanted.set('q', search.trim())
  const wantedText = wanted.toString()
  // Only while this page is the one on screen: during a move to another (lazy) page the URL already is that page's.
  const ownPath = useRef(location.pathname)
  const here = location.pathname === ownPath.current
  useEffect(() => {
    if (here && ready && wantedText !== params.toString()) setParams(new URLSearchParams(wantedText), { replace: true })
  }, [here, ready, wantedText, params, setParams])
  const backTo = `${location.pathname}?${wantedText}`

  // Coming back (Back, or the Furniture page's way back): the selected room is scrolled into view once.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !room || !ready) return
    scrolled.current = true
    rowRefs.current[room.code]?.scrollIntoView({ block: 'nearest' })
  }, [room, ready])

  const goFloor = (f) => {
    setFloor(f)
    setSelected(null)
  }
  // ↑ ↓ in the table and ‹ › in the profile step through the listed rooms without leaving the search.
  const step = (r) => {
    if (!r) return
    setSelected(r.code)
    rowRefs.current[r.code]?.focus()
  }
  const onRowKey = (e) => {
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: visible.length - 1 }[e.key]
    if (to == null || !visible[to]) return
    e.preventDefault()
    step(visible[to])
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

  const row = (r, { fromSearch = false } = {}) => (
    <li key={r.code}>
      <RoomRow
        room={r}
        selected={r.code === room?.code}
        buttonRef={(el) => (rowRefs.current[r.code] = el)}
        onKeyDown={onRowKey}
        onSelect={() => {
          if (fromSearch) {
            setFloor(r.floor)
            setSearch('')
          }
          setSelected(r.code)
        }}
      />
    </li>
  )
  const rowList = (list, opts) => <ul className="flex flex-col divide-y divide-line">{list.map((r) => row(r, opts))}</ul>

  const noMatch = (
    <EmptyBlock icon={SearchX} title="No rooms match">
      {t('Tick more statuses or change the search.')}
    </EmptyBlock>
  )
  const title = block ? [t('Block {code}', { code: block }), floor != null && t('Floor {n}', { n: floor }), floorClasses(floorQuery.data)].filter(Boolean).join(' · ') : t('Rooms and beds')

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-h1 font-bold tracking-tight whitespace-nowrap text-fg">{t('Rooms and beds')}</h1>
          <InfoTip label={t('Rooms and beds in your scope. Click a room to see its details on the right.')} size={16} side="bottom" align="start" />
          {/* The Block comes from the top bar's Block filter (no second picker here); on every Block the page shows
              the first one until the top bar picks another. */}
        </div>
        <div className="flex flex-wrap items-center gap-2 max-[720px]:w-full">
          <SearchInput
            wrapperClassName="w-80 max-w-full max-[720px]:flex-1"
            aria-label={t('Find a room or student in this block')}
            placeholder={t('Find a room or student in this block')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button icon={Download} onClick={() => exporting.run()} disabled={!block || exporting.pending}>
            Export
          </Button>
        </div>
      </div>

      <FloorOverview
        floors={floors}
        floor={floor}
        onPick={goFloor}
        title={title}
        floorClass={floorClasses(floorQuery.data)}
        rooms={rooms}
        summary={summary}
        counts={counts}
        shown={shown}
        onToggle={toggle}
      />

      <div className="flex shrink-0 flex-col gap-4 xl:min-h-0 xl:flex-1 xl:shrink xl:flex-row xl:items-start">
        <section
          aria-label={t('Rooms and beds')}
          className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface xl:max-h-full xl:flex-[1_1_440px]"
        >
          <div aria-hidden="true" className={cx('grid shrink-0 items-center gap-3 border-b border-line bg-subtle px-4 py-2 text-sm font-medium whitespace-nowrap text-fg-secondary max-[560px]:hidden', COLUMNS)}>
            <span>{t('Room')}</span>
            <span>{t('Beds')}</span>
            <span>{t('Room type')}</span>
            <span>{t('Allocated')}</span>
            <span>{t('Status')}</span>
          </div>
          <div className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
            {q ? (
              <QueryState query={blockFloors} isEmpty={() => found.length === 0} empty={noMatch}>
                {() =>
                  found.map((f) => (
                    <div key={f.floor} className="flex flex-col">
                      <h3 className="border-b border-line bg-gray-25 px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-fg-secondary">
                        {t('Floor {n}', { n: f.floor })} · {t(f.rooms.length === 1 ? '{n} room' : '{n} rooms', { n: f.rooms.length })}
                      </h3>
                      {rowList(f.rooms, { fromSearch: true })}
                    </div>
                  ))
                }
              </QueryState>
            ) : (
              <QueryState
                query={block ? floorQuery : structure}
                isEmpty={(d) => (block ? !d.rooms?.length : !d.blocks?.length)}
                empty={<EmptyBlock icon={Building} title={block ? 'No rooms on this floor' : 'No blocks in your scope'} />}
              >
                {() => (visible.length ? rowList(visible) : noMatch)}
              </QueryState>
            )}
          </div>
        </section>

        {room && (
          <div className="min-w-0 xl:max-h-full xl:max-w-[600px] xl:flex-[1_1_480px] xl:overflow-y-auto xl:rounded-lg xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden">
            <RoomProfile
              key={room.code}
              room={room}
              termId={term?.id}
              prev={visible[at - 1]}
              next={visible[at + 1]}
              onStep={step}
              onSetOutOfService={() => setSettingOos(true)}
              onMaintenance={() => navigate(`${base}/maintenance?room=${room.code}&from=inventory&back=${encodeURIComponent(backTo)}`, { state: { fromInventory: true } })}
              backTo={backTo}
            />
          </div>
        )}
      </div>

      {settingOos && room && <OutOfServiceModal room={room} reasons={structure.data?.outOfServiceReasons ?? []} onClose={() => setSettingOos(false)} />}
    </>
  )
}
