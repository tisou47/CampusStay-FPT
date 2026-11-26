import { useMemo, useState } from 'react'
import { BedDouble, Check, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, Note } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { formatVnd } from '@/lib/format'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// The free Beds of an operational move, shown as Rooms grouped by Block › Floor instead of one long list.
// Tabs split them by Room Class (Basic, Standard, Premium…); chips narrow by Block, Floor and Room Type.
// "Suggested" are Beds of the same Room Type and Room Class as the student's Room now (same price), in the Rooms
// filling up first (the API sorts by roommates), so a move keeps the stay unchanged and Rooms full.

const ALL = '__all'
const SUGGESTED = 6

const roommates = (n) => t(n === 1 ? '{n} roommate' : '{n} roommates', { n })

function Chips({ label, value, onChange, options }) {
  if (options.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-sm text-fg-secondary">{t(label)}</span>
      {[{ value: ALL, label: t('All') }, ...options].map((o) => {
        const active = String(o.value) === String(value)
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-7 cursor-pointer rounded-full border px-3 text-sm transition-colors',
              active ? 'border-primary bg-primary-subtle font-medium text-fg-brand' : 'border-line-strong bg-surface text-fg hover:border-primary/60',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** One Room with its free Beds as buttons. */
function RoomCard({ room, selected, onPick, showPrice }) {
  const first = room.beds[0]
  return (
    <div className={cx('flex flex-col gap-2 rounded-lg border bg-surface p-3', room.beds.some((b) => b.bedId === selected) ? 'border-primary' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold text-fg">{room.room}</span>
          <span className="truncate text-sm text-fg-secondary">
            {tr(first.roomTypeName)} · {tr(first.roomClassName)}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm text-fg-secondary">
          <Users size={14} aria-hidden="true" />
          {roommates(first.roommates)}
        </span>
      </div>
      {showPrice && first.termPrice != null && <span className="text-sm text-fg-secondary">{formatVnd(first.termPrice)}</span>}
      <div className="flex flex-wrap gap-1.5">
        {room.beds.map((b) => {
          const active = b.bedId === selected
          return (
            <button
              key={b.bedId}
              type="button"
              onClick={() => onPick(b.bedId)}
              aria-pressed={active}
              aria-label={t('{room} · Bed {bed}', { room: b.room, bed: b.bed })}
              className={cx(
                'inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-sm transition-colors',
                active ? 'border-primary bg-primary text-fg-on-brand' : 'border-line-strong text-fg hover:border-primary hover:bg-primary-subtle',
              )}
            >
              {active ? <Check size={13} aria-hidden="true" /> : <BedDouble size={13} aria-hidden="true" />}
              {t('Bed {bed}', { bed: b.bed })}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const byRoom = (beds) => {
  const rooms = new Map()
  for (const b of beds) {
    if (!rooms.has(b.room)) rooms.set(b.room, { room: b.room, block: b.block, floor: b.floor, beds: [] })
    rooms.get(b.room).beds.push(b)
  }
  return [...rooms.values()]
}

const distinct = (beds, key, label = (v) => v) =>
  [...new Set(beds.map((b) => b[key]).filter((v) => v != null))]
    .sort((a, b) => (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))))
    .map((v) => ({ value: v, label: label(v) }))

export function BedPickerModal({ open, onClose, beds, from, value, onChange, showPrice }) {
  const [klass, setKlass] = useState(ALL)
  const [block, setBlock] = useState(ALL)
  const [floor, setFloor] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(value)

  const suggested = useMemo(() => {
    const same = beds.filter((b) => b.roomTypeName === from.roomTypeName && b.roomClassName === from.roomClassName)
    // One Bed per Room so the suggestions show different Rooms.
    const seen = new Set()
    return (same.length ? same : beds).filter((b) => !seen.has(b.room) && seen.add(b.room)).slice(0, SUGGESTED)
  }, [beds, from])
  const sameAsNow = suggested.length > 0 && suggested[0].roomTypeName === from.roomTypeName && suggested[0].roomClassName === from.roomClassName

  const classes = distinct(beds, 'roomClassName', tr)
  const inClass = klass === ALL ? beds : beds.filter((b) => b.roomClassName === klass)
  const shown = inClass.filter(
    (b) =>
      (block === ALL || b.block === block) &&
      (floor === ALL || b.floor === floor) &&
      (type === ALL || b.roomTypeName === type) &&
      (!q.trim() || b.room.toLowerCase().includes(q.trim().toLowerCase())),
  )
  const groups = useMemo(() => {
    const out = new Map()
    for (const room of byRoom(shown)) {
      const key = `${room.block}|${room.floor}`
      if (!out.has(key)) out.set(key, { block: room.block, floor: room.floor, rooms: [] })
      out.get(key).rooms.push(room)
    }
    return [...out.values()].sort((a, b) => a.block.localeCompare(b.block) || a.floor - b.floor)
  }, [shown])

  const pickedBed = beds.find((b) => b.bedId === picked)
  const confirm = () => {
    onChange(picked)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1040}
      title="Choose the new bed"
      description={t('{n} free beds in rooms the student may move to. Now: {room} · {type} · {klass}.', {
        n: beds.length,
        room: from.room,
        type: tr(from.roomTypeName),
        klass: tr(from.roomClassName),
      })}
      footer={
        <>
          <span className="mr-auto text-base text-fg-secondary">
            {pickedBed ? t('Chosen: {room} · Bed {bed}', { room: pickedBed.room, bed: pickedBed.bed }) : t('No bed chosen yet')}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!picked} onClick={confirm}>
            Choose this bed
          </Button>
        </>
      }
    >
      {suggested.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg bg-primary-subtle/40 p-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Sparkles size={16} aria-hidden="true" className="text-fg-brand" />
            {t('Suggested')}
            <span className="text-sm font-normal text-fg-secondary">
              {sameAsNow ? t('Same room type and class as now (same price), rooms filling up first') : t('Rooms filling up first')}
            </span>
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggested.map((b) => (
              <RoomCard key={b.room} room={{ room: b.room, beds: beds.filter((x) => x.room === b.room) }} selected={picked} onPick={setPicked} showPrice={showPrice} />
            ))}
          </div>
        </section>
      )}

      <Tabs
        label={t('Room class')}
        value={klass}
        onChange={(k) => setKlass(k)}
        items={[{ key: ALL, label: 'All', count: beds.length }, ...classes.map((c) => ({ key: c.value, label: c.label, count: beds.filter((b) => b.roomClassName === c.value).length }))]}
      />
      <div className="flex flex-col gap-2">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a room (e.g. A-801)" wrapperClassName="w-full sm:w-72" aria-label={t('Find a room')} />
        <Chips label="Block" value={block} onChange={setBlock} options={distinct(inClass, 'block')} />
        <Chips label="Floor" value={floor} onChange={setFloor} options={distinct(inClass, 'floor', (f) => t('Floor {n}', { n: f }))} />
        <Chips label="Room type" value={type} onChange={setType} options={distinct(inClass, 'roomTypeName', tr)} />
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={BedDouble} title="No free bed matches these filters" />
      ) : (
        groups.map((g) => (
          <section key={`${g.block}|${g.floor}`} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
              {t('Block {block} · Floor {floor}', { block: g.block, floor: g.floor })}
              <Tag tone="neutral" dot={false}>
                {t(g.rooms.length === 1 ? '{n} room' : '{n} rooms', { n: g.rooms.length })}
              </Tag>
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.rooms.map((room) => (
                <RoomCard key={room.room} room={room} selected={picked} onPick={setPicked} showPrice={showPrice} />
              ))}
            </div>
          </section>
        ))
      )}
      {beds.length >= 500 && <Note>Only the first 500 free beds are listed. Use the filters or the room search to narrow them.</Note>}
    </Modal>
  )
}
