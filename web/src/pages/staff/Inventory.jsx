import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Ban, Building, Check, Download, KeyRound, Package, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { countLines, typeName } from '@/lib/furniture'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
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

const bedLook = {
  unpaid: 'bg-yellow-400',
  paid: 'border-[1.5px] border-accent bg-orange-100',
  resident: 'bg-accent',
  leaving: 'border-2 border-dashed border-accent bg-surface',
  next_term: 'bg-info',
  available: 'border-[1.5px] border-success bg-surface',
  oos: 'bg-line-strong',
}
const bedLabel = {
  unpaid: 'Assigned – unpaid',
  paid: 'Paid – waiting for the door code',
  resident: 'Resident',
  leaving: 'Leaving at the end of the Term',
  next_term: 'Moving in next Term',
  available: 'Available',
  oos: 'Out of service',
}
const HELD = ['unpaid', 'paid', 'resident', 'leaving', 'next_term']

function BedMark({ state }) {
  return <span aria-hidden="true" className={cx('size-3.5 shrink-0 rounded-sm', bedLook[state])} />
}

function Legend() {
  return (
    <ul aria-label={t('Legend')} className="flex items-center gap-4">
      {Object.keys(bedLook).map((s) => (
        <li key={s} className="flex items-center gap-1.5 text-sm whitespace-nowrap text-fg-secondary">
          <BedMark state={s} />
          {t(bedLabel[s])}
        </li>
      ))}
    </ul>
  )
}

const allocatedOf = (room) => room.beds.filter((b) => HELD.includes(b.state)).length

function RoomCard({ room, selected, onSelect }) {
  const allocated = allocatedOf(room)
  const caption = room.outOfService ? t('Out of service') : t('{n} / {total} allocated', { n: allocated, total: room.capacity })
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={t('Room {code}, {type}, {caption}', { code: room.code, type: tr(room.roomTypeName), caption })}
      className={cx(
        'flex min-w-0 flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-subtle inset-ring inset-ring-primary' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span className="flex w-full items-center justify-between gap-2 whitespace-nowrap">
        <span className="text-base font-medium text-fg">{room.code}</span>
        <span className="text-sm text-fg-tertiary">{tr(room.roomTypeName)}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        {room.beds.map((b) => (
          <span key={b.id} title={`${b.id} · ${t(bedLabel[b.state] ?? b.state)}${b.occupant ? ` · ${b.occupant.name}` : ''}`}>
            <BedMark state={b.state} />
          </span>
        ))}
      </span>
      <span className={cx('text-sm whitespace-nowrap', room.outOfService ? 'text-error-fg' : 'text-fg-secondary')}>{caption}</span>
    </button>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="shrink-0 text-fg-secondary">{t(label)}</dt>
      <dd className="min-w-0 text-right font-medium text-fg">{children}</dd>
    </div>
  )
}

function RoomDetail({ room, termId, onSetOutOfService, onMaintenance }) {
  const { notify, notifyError } = useToast()
  const back = useMutation(() => api.inventory.backInService(room.code), {
    invalidates: ['inventory', 'dashboard'],
    onSuccess: () => notify({ title: t('Room {code} is back in service', { code: room.code }), message: t('{n} Beds can be allocated again.', { n: room.capacity }) }),
    onError: (e) => notifyError(e, 'Could not update the Room'),
  })
  const allocated = allocatedOf(room)
  const free = room.beds.filter((b) => b.state === 'available').length
  const oos = room.outOfService
  const rows = oos
    ? [
        ['Room Type', tr(room.roomTypeName)],
        ['Room Class', tr(room.roomClassName)],
        ['Since', formatDateTime(oos.since)],
        ['Reason', tr(oos.reason)],
        ['Set by', oos.by],
      ]
    : [
        ['Room Type', tr(room.roomTypeName)],
        ['Room Class', tr(room.roomClassName)],
        ['Location', t('Block {code} · Floor {n}', { code: room.block, n: room.floor })],
        ['Allocated', `${allocated} / ${room.capacity}`],
        ['Residents', `${room.beds.filter((b) => b.state === 'resident' || b.state === 'leaving').length} / ${room.capacity}`],
      ]

  return (
    <Card className="flex min-h-0 w-90 shrink-0 flex-col gap-3.5 overflow-y-auto" aria-label={t('Room {code} details', { code: room.code })}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 font-semibold text-fg">{t('Room {code}', { code: room.code })}</h2>
        {oos ? <Tag tone="error">Out of service</Tag> : free === 0 ? <Tag tone="info">Full</Tag> : <Tag tone="success">{t(free === 1 ? '{n} free Bed' : '{n} free Beds', { n: free })}</Tag>}
      </div>
      <dl className="flex flex-col gap-3.5">
        {rows.map(([label, value]) => (
          <Row key={label} label={label}>
            {value ?? '—'}
          </Row>
        ))}
      </dl>
      {oos?.note && <Alert title="Note">{oos.note}</Alert>}
      <p className="text-base font-medium text-fg">{t('Beds')}</p>
      <ul className="flex flex-col gap-3">
        {room.beds.map((bed) => (
          <li key={bed.id} className="flex items-center gap-2.5">
            <BedMark state={bed.state} />
            <span className="text-base whitespace-nowrap text-fg">{bed.id}</span>
            <span className={cx('ml-auto min-w-0 truncate text-sm', bed.occupant ? 'text-fg-secondary' : 'text-fg-tertiary')}>
              {bed.occupant ? `${bed.occupant.name} · ${bed.occupant.studentCode}` : oos ? t('No occupant') : t('Available')}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {oos ? (
          <Button variant="primary" icon={Check} onClick={() => back.run()} disabled={back.pending}>
            Back in service
          </Button>
        ) : (
          <Button icon={Ban} onClick={onSetOutOfService} disabled={allocated > 0}>
            Set out of service
          </Button>
        )}
        <Button icon={Wrench} onClick={onMaintenance}>
          Maintenance
        </Button>
      </div>
      {!oos && allocated > 0 && (
        <Note>
          {t('Move the {n} residents before you set this Room out of service.', { n: allocated })}
        </Note>
      )}
      <RoomExtras room={room} termId={termId} />
    </Card>
  )
}

/** Room Class of the next Term, furniture and its conformance, door code state (spec §11.3 "Room"). */
function RoomExtras({ room, termId }) {
  const base = useRoleBase()
  const navigate = useNavigate()
  const query = useQuery(['inventory', 'details', room.code, termId], ({ signal }) => api.inventory.details(room.code, { termId }, { signal }))
  const d = query.data
  if (!d) return null
  const c = d.conformance
  return (
    <>
      <dl className="flex flex-col gap-3.5 border-t border-line pt-3.5">
        {d.next && (
          <Row label="Next Term">
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
        <Row label="Furniture">
          <StatusTag status={c.status} />
        </Row>
      </dl>
      {c.missing.length > 0 && <p className="text-sm text-fg-secondary">{t('Missing: {items}', { items: countLines(c.missing) })}</p>}
      {c.extra.length > 0 && <p className="text-sm text-fg-secondary">{t('Remove: {items}', { items: countLines(c.extra) })}</p>}
      <ul className="flex flex-col gap-2" aria-label={t('Furniture')}>
        {d.furniture.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium text-fg">{f.assetCode}</span>
            <span className="min-w-0 truncate text-fg-secondary">{typeName(f)}</span>
            <StatusTag status={f.status} className="ml-auto" />
          </li>
        ))}
        {!d.furniture.length && <li className="text-sm text-fg-tertiary">{t('No furniture recorded in this Room.')}</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => navigate(`${base}/rooms/${room.code}`)}>
          Room hub
        </Button>
        <Button icon={Package} onClick={() => navigate(`${base}/furniture?room=${room.code}`)}>
          Furniture
        </Button>
        {d.doorCode && (
          <Button icon={KeyRound} onClick={() => navigate(`${base}/door-codes?room=${room.code}`)}>
            Door code
          </Button>
        )}
      </div>
    </>
  )
}

function OutOfServiceModal({ room, reasons, onClose }) {
  const { notify } = useToast()
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [note, setNote] = useState('')
  const save = useMutation(() => api.inventory.setOutOfService(room.code, { reason, note: note.trim() || undefined }), {
    invalidates: ['inventory', 'dashboard'],
    onSuccess: () => {
      notify({ type: 'warning', title: t('Room {code} is out of service', { code: room.code }), message: 'Its Beds are skipped by the next assignment run.' })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Set Room {code} out of service', { code: room.code })}
      description="The assignment engine skips this Room and its Beds until it is back in service."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={Ban} onClick={() => save.run()} disabled={!reason || save.pending}>
            Set out of service
          </Button>
        </>
      }
    >
      {save.error && <Alert type="error" title="Could not update the Room">{save.error.message}</Alert>}
      <Field label="Reason" required>
        {(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={reasons} />}
      </Field>
      <Field label="Note" helper="Shown to Staff and Managers.">
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
  const [params] = useSearchParams()
  const structure = useQuery(['inventory', 'structure', scopeBlock], ({ signal }) => api.inventory.structure({ block: scopeBlock ?? undefined }, { signal }))
  const blocks = structure.data?.blocks ?? []
  const [block, setBlock] = useState(null)
  const [floor, setFloor] = useState(null)
  const [selected, setSelected] = useState(params.get('room'))
  const [settingOos, setSettingOos] = useState(false)

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
  const room = rooms.find((r) => r.code === selected) ?? rooms.find((r) => r.outOfService) ?? rooms[0]
  const summary = floorQuery.data?.summary

  const exporting = useMutation(() => api.exports.download('inventory', { termId: term?.id, block }, `inventory-block-${block}.csv`), { onError: (e) => notifyError(e, 'Export failed') })

  return (
    <>
      <PageHeader
        title="Rooms and Beds"
        description="Rooms and Beds in your scope. Click a Room for details."
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={!block || exporting.pending}>
            Export
          </Button>
        }
      />

      <div className="flex shrink-0 items-center gap-2">
        <Select
          aria-label={t('Block')}
          wrapperClassName="w-30 shrink-0"
          value={block ?? ''}
          onChange={(e) => {
            const b = blocks.find((x) => x.block === e.target.value)
            setBlock(b.block)
            setFloor(b.floors[0])
            setSelected(null)
          }}
          options={blocks.map((b) => ({ value: b.block, label: t('Block {code}', { code: b.block }) }))}
          disabled={!blocks.length}
        />
        <div role="group" aria-label={t('Floor')} className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {floors.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={f === floor}
              aria-label={t('Floor {n}', { n: f })}
              onClick={() => {
                setFloor(f)
                setSelected(null)
              }}
              className={cx(
                'flex h-8 w-9 shrink-0 items-center justify-center rounded-md border text-base transition-colors',
                f === floor ? 'border-primary bg-primary-subtle font-medium text-fg-brand' : 'border-line bg-surface text-fg-secondary hover:border-line-strong hover:text-fg',
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Legend />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-center justify-between gap-4 whitespace-nowrap">
            <h2 className="text-h3 font-semibold text-fg">{block ? [t('Block {code}', { code: block }), floor != null && t('Floor {n}', { n: floor }), tr(floorQuery.data?.roomClassName)].filter(Boolean).join(' · ') : t('Rooms and Beds')}</h2>
            {summary && (
              <p className="text-sm text-fg-secondary">
                {t('{beds} Beds · {allocated} allocated · {available} available', { beds: formatNumber(summary.beds), allocated: formatNumber(summary.allocated), available: formatNumber(summary.available) })}
                {summary.outOfService > 0 && ` · ${t('{n} out of service', { n: formatNumber(summary.outOfService) })}`}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <QueryState
              query={block ? floorQuery : structure}
              isEmpty={(d) => (block ? !d.rooms?.length : !d.blocks?.length)}
              empty={<EmptyBlock icon={Building} title={block ? 'No Rooms on this floor' : 'No Blocks in your scope'} />}
            >
              {() => (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                  {rooms.map((r) => (
                    <RoomCard key={r.code} room={r} selected={r.code === room?.code} onSelect={() => setSelected(r.code)} />
                  ))}
                </div>
              )}
            </QueryState>
          </div>
        </Card>

        {room && <RoomDetail room={room} termId={term?.id} onSetOutOfService={() => setSettingOos(true)} onMaintenance={() => navigate(`${base}/maintenance?room=${room.code}`)} />}
      </div>

      {settingOos && room && <OutOfServiceModal room={room} reasons={structure.data?.outOfServiceReasons ?? []} onClose={() => setSettingOos(false)} />}
    </>
  )
}
