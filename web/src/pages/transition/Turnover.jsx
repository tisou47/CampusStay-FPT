import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { ArrowRightLeft, Check, ChevronDown, ClipboardCheck, DoorOpen, KeyRound, LogOut, Shuffle, Sofa, TriangleAlert, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { InfoTip, Tooltip } from '@/components/ui/Tooltip'
import { SetCodeModal } from '@/pages/staff/DoorCodes'
import { CheckOutPanel } from '@/pages/staff/CheckOutDesk'
import { IconButton } from '@/components/ui/Button'
import { formatDate, formatNumber, formatVnd } from '@/lib/format'
import { cx } from '@/lib/cx'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr, useI18n } from '@/i18n'

// Term transition › Turnover (spec §5.1 M9, §6.16): between the current Term's check-out day and the next Term's
// check-in start leavers check out at the desk, movers move to their next-Term Bed (they live there once its door code
// is released to them), and every Room whose residents change needs a new door code; Rooms whose
// class changes are listed too (their furniture moves). Rooms whose furniture does not match their next-Term class are
// a Manager's task (set the class back or finish the moves).
// GET /turnover?termId&block → { term, previousTerm, checkOutBy, checkInStart, counts: { leavers, checkedOut, overdue,
//   movers, staying, arriving, rooms, codesToSet, notMatching }, leavers: [{ allocationId, student: { name, studentCode },
//   room, bed, block, status (To check out, Checked out, Overdue) }], movers: [{ student, from, to, fee, moved }],
//   rooms: [{ room, block, leaving, arriving, doorCodeReady, roomClass, matches }] }
// GET /inventory/rooms/:code/details?termId → conformance { missing, extra: [{ typeId, type, typeVi, quantity }] },
//   furniture; GET /furniture?block&location=store&typeId → store items; POST /furniture/moves { items, toRoom | toStore }
// GET /check-out/:allocationId, POST /check-out/:allocationId: a leaver checks out in a side sheet, without leaving
//
// Layout: a summary bar (counts only, and a search of rooms and students) stays on top; under it the rooms to hand
// over scroll. Each row does its tasks in place: the door code (random codes for every room at once, or one room at a
// time), the furniture of the next-term tier (missing or extra items moved from or to the Block store) and, in rooms
// someone leaves, each leaver's check-out (meter, key, damage per item and the Utility Deposit, in a side sheet; the
// damage charged shows once done). Movers fold under the rooms. Filtering and ordering use the loaded rows.

/* ---------------------------------------------------------------- random door codes for many rooms */

// POST /door-codes/:room {} draws a random code (proposed); POST /door-codes/:room/confirm once the lock uses it.
function RandomCodesModal({ rooms, onClose }) {
  const { notify, notifyError } = useToast()
  const [drawn, setDrawn] = useState(null) // [{ room, code, error }]
  const [confirmed, setConfirmed] = useState(() => new Set())
  // Rooms whose confirmation failed, with the server's reason (WEB-OPS-10): shown in their row.
  const [failed, setFailed] = useState({})
  const draw = useMutation(
    async () => {
      const out = []
      for (const r of rooms) {
        try {
          const res = await api.doorCodes.propose(r.room, {})
          out.push({ room: r.room, code: res.code })
        } catch (e) {
          out.push({ room: r.room, error: e.message })
        }
      }
      return out
    },
    { invalidates: ['door-codes', 'inventory'], onSuccess: setDrawn, onError: (e) => notifyError(e, 'Could not draw the codes') },
  )
  const confirm = useMutation(
    async (list) => {
      const done = []
      const errors = {}
      for (const room of list) {
        try {
          await api.doorCodes.confirm(room)
          done.push(room)
        } catch (e) {
          errors[room] = e.message // left unconfirmed: confirm it again here or on Door codes
        }
      }
      return { done, errors }
    },
    {
      invalidates: ['door-codes', 'inventory', 'turnover'],
      onSuccess: ({ done, errors }) => {
        setConfirmed((all) => new Set([...all, ...done]))
        setFailed((all) => ({ ...Object.fromEntries(Object.entries(all).filter(([room]) => !done.includes(room))), ...errors }))
        if (Object.keys(errors).length) notifyError(new Error(t('{n} codes were not confirmed: see their rows.', { n: Object.keys(errors).length })), 'Some codes were not confirmed')
        if (done.length) notify({ title: t('{n} door codes confirmed', { n: done.length }), message: 'Their residents are told that the code changed (never the code itself).' })
      },
      onError: (e) => notifyError(e, 'Could not confirm the codes'),
    },
  )
  const open = (drawn ?? []).filter((x) => x.code && !confirmed.has(x.room)).map((x) => x.room)
  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('Random door codes · {n} rooms', { n: rooms.length })}
      description={drawn ? 'Set each code on its lock and try it, then confirm. The current codes stay active until then.' : 'A random 6-digit code is drawn for every room below. The current codes stay active until you confirm the new ones.'}
      footer={
        drawn ? (
          <>
            <Button onClick={onClose}>{open.length ? t('Confirm later') : t('Close')}</Button>
            <Button variant="primary" icon={Check} disabled={!open.length || confirm.pending} onClick={() => confirm.run(open)}>
              {t('The locks use these codes ({n})', { n: open.length })}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={Shuffle} disabled={draw.pending} onClick={() => draw.run()}>
              {draw.pending ? t('Drawing…') : t('Draw the codes')}
            </Button>
          </>
        )
      }
    >
      {drawn ? (
        <Table bare size="sm">
          <THead>
            <tr>
              <Th>Room</Th>
              <Th>New code</Th>
              <Th className="w-40">
                <span className="sr-only">{t('Actions')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {drawn.map((x) => (
              <Tr key={x.room}>
                <Td className="font-medium">{x.room}</Td>
                <Td>{x.code ? <span className="font-mono text-base font-semibold tracking-[0.2em] tabular">{x.code}</span> : <span className="text-sm text-error-fg">{x.error}</span>}</Td>
                <Td align="right">
                  {confirmed.has(x.room) ? (
                    <Tag tone="success">{t('Confirmed')}</Tag>
                  ) : failed[x.room] ? (
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-sm text-error-fg">{failed[x.room]}</span>
                      <Button size="sm" disabled={confirm.pending} onClick={() => confirm.run([x.room])}>
                        Try again
                      </Button>
                    </span>
                  ) : (
                    x.code && (
                      <Button size="sm" disabled={confirm.pending} onClick={() => confirm.run([x.room])}>
                        Confirm
                      </Button>
                    )
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="text-base text-fg">{rooms.map((r) => r.room).join(', ')}</p>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- check-out in a side sheet */

function CheckOutSheet({ allocationId, onClose }) {
  const detail = useQuery(['check-out', 'detail', allocationId], ({ signal }) => api.desk.checkOutDetail(allocationId, { signal }), { keepPrevious: false })
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('Check-out')}>
      <button type="button" aria-label={t('Close')} className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[520px] flex-col bg-surface shadow-xl">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-h3 font-semibold text-fg">{t('Check-out')}</h2>
          <IconButton icon={X} aria-label={t('Close')} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <QueryState query={detail}>{(d) => <CheckOutPanel key={`${d.allocationId}-${d.status}`} d={d} embedded />}</QueryState>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------------------------------------- dates in the page header */

const DAY = 86400000
const dayOf = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const today = () => {
  const n = new Date()
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
}
const daysLeftText = (days) => (days > 0 ? t('{n} days left', { n: days }) : days === 0 ? t('today') : t('{n} days ago', { n: -days }))

function DateChips({ checkOutBy, checkInStart }) {
  const now = today()
  const out = Math.round((dayOf(checkOutBy) - now) / DAY)
  const into = Math.round((dayOf(checkInStart) - now) / DAY)
  const overlap = Math.round((dayOf(checkOutBy) - dayOf(checkInStart)) / DAY)
  const chip = 'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm whitespace-nowrap'
  return (
    <>
      <span className={cx(chip, 'border-line bg-surface text-fg-secondary')}>
        <LogOut size={14} aria-hidden="true" className="text-fg-tertiary max-[1439px]:hidden" />
        {t('Check out by {date}', { date: formatDate(checkOutBy) })}
        <span className="text-fg-tertiary">· {daysLeftText(out)}</span>
      </span>
      <span className={cx(chip, 'border-line bg-surface text-fg-secondary')}>
        <DoorOpen size={14} aria-hidden="true" className="text-fg-tertiary max-[1439px]:hidden" />
        {t('Check-in from {date}', { date: formatDate(checkInStart) })}
        <span className="text-fg-tertiary">· {daysLeftText(into)}</span>
      </span>
      {overlap > 0 && (
        <Tooltip label={t('A room with residents leaving and new residents arriving must be checked out before the new residents check in.')} side="bottom" align="end">
          <span tabIndex={0} className={cx(chip, 'cursor-help border-warning/30 bg-warning-bg font-medium text-warning-fg')}>
            <TriangleAlert size={14} aria-hidden="true" />
            {t('{n} days overlap', { n: overlap })}
          </span>
        </Tooltip>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- the summary bar */

// One look for every item of the bar: a pill with an icon, a label and a number. People are neutral; the tasks left
// are amber (rooms left), green once done everywhere. Display only: the search filters the lists.
function Pill({ icon: Glyph, label, value, tone = 'neutral', tip }) {
  const look = cx(
    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors',
    tone === 'warning'
        ? 'border-warning/30 bg-warning-bg text-warning-fg'
        : tone === 'success'
          ? 'border-success/25 bg-success-bg text-success-fg'
          : tone === 'error'
            ? 'border-error/30 bg-error-bg text-error-fg'
            : 'border-line bg-surface text-fg-secondary',
  )
  const body = (
    <>
      {tone === 'success' ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <Glyph size={14} aria-hidden="true" />}
      <span>{label}</span>
      {value != null && <span className="font-semibold tabular">{value}</span>}
    </>
  )
  const el = (
    <span tabIndex={tip ? 0 : undefined} className={look}>
      {body}
    </span>
  )
  return tip ? <Tooltip label={tip}>{el}</Tooltip> : el
}

/* ---------------------------------------------------------------- furniture of one room, fixed in a side sheet */

function FurnitureSheet({ room, termId, onClose }) {
  const { notify, notifyError } = useToast()
  const { lang } = useI18n()
  const details = useQuery(['inventory', 'details', room.room, termId], ({ signal }) => api.inventory.details(room.room, { termId }, { signal }), {
    keepPrevious: false,
  })
  const store = useQuery(['furniture', 'store', room.block], ({ signal }) => api.furniture.list({ block: room.block, location: 'store', pageSize: 100 }, { signal }))
  const free = (typeId) => (store.data?.items ?? []).filter((i) => i.typeId === typeId && i.status === 'In store' && !i.plannedMove)
  const move = useMutation((body) => api.furniture.move({ ...body, planned: false }), {
    invalidates: ['turnover', 'inventory', 'furniture'],
    onSuccess: (res) => notify({ title: t('{n} items moved', { n: res?.moved ?? 0 }), message: t('Room {room} is checked again against its tier.', { room: room.room }) }),
    onError: (e) => notifyError(e, 'Could not move the furniture'),
  })
  const reason = t('Turnover: Room {room} matches its tier of next term', { room: room.room })
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('Furniture · Room {room}', { room: room.room })}>
      <button type="button" aria-label={t('Close')} className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-surface shadow-xl">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-h3 font-semibold text-fg">{t('Furniture · Room {room}', { room: room.room })}</h2>
          <IconButton icon={X} aria-label={t('Close')} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <QueryState query={details}>
            {(d) => {
              const c = d.conformance ?? { missing: [], extra: [] }
              const inRoom = (typeId) => (d.furniture ?? []).filter((i) => i.typeId === typeId && !i.plannedMove)
              const name = (x) => (lang === 'vi' && x.typeVi ? x.typeVi : tr(x.type))
              return (
                <>
                  <p className="text-base text-fg-secondary">
                    {t('Next term this room is {tier}. Bring in what is missing from the Block {block} store, and take what is extra back to it.', { tier: tr(room.roomClass), block: room.block })}
                  </p>
                  {c.missing.length === 0 && c.extra.length === 0 && (
                    <p className="flex items-center gap-2 rounded-md bg-success-bg px-3 py-2 text-base text-success-fg">
                      <Check size={16} strokeWidth={3} aria-hidden="true" />
                      {t('The furniture matches the {tier} tier of next term.', { tier: tr(room.roomClass) })}
                    </p>
                  )}
                  {c.missing.map((x) => {
                    const items = free(x.typeId)
                    const n = Math.min(x.quantity, items.length)
                    return (
                      <div key={`m-${x.typeId}`} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
                        <span className="flex flex-col">
                          <span className="text-base font-medium text-fg">{t('Missing: {n} × {type}', { n: x.quantity, type: name(x) })}</span>
                          <span className="text-sm text-fg-tertiary">{store.loading ? t('Checking the store…') : t('{n} free in the Block {block} store', { n: items.length, block: room.block })}</span>
                        </span>
                        <Button size="sm" variant="primary" disabled={!n || move.pending} onClick={() => move.run({ items: items.slice(0, n).map((i) => i.id), toRoom: room.room, reason })}>
                          {t('Bring in {n}', { n })}
                        </Button>
                      </div>
                    )
                  })}
                  {c.extra.map((x) => {
                    const items = inRoom(x.typeId).slice(0, x.quantity)
                    return (
                      <div key={`e-${x.typeId}`} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
                        <span className="flex flex-col">
                          <span className="text-base font-medium text-fg">{t('Extra: {n} × {type}', { n: x.quantity, type: name(x) })}</span>
                          <span className="text-sm text-fg-tertiary">{items.map((i) => i.assetCode).join(', ')}</span>
                        </span>
                        <Button size="sm" disabled={!items.length || move.pending} onClick={() => move.run({ items: items.map((i) => i.id), toStore: room.block, reason })}>
                          {t('Back to the store')}
                        </Button>
                      </div>
                    )
                  })}
                </>
              )
            }}
          </QueryState>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------------------------------------- the "To do" cell */

function TaskChip({ done, icon: Glyph, label, tip, onClick, to }) {
  const look = cx(
    'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
    done ? 'border-success/25 bg-success-bg text-success-fg' : 'border-warning/30 bg-warning-bg text-warning-fg',
    !done && (onClick || to) && 'hover:border-warning',
    done && onClick && 'hover:border-success/60',
  )
  const body = (
    <>
      {done ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : <Glyph size={13} aria-hidden="true" />}
      {label}
    </>
  )
  const name = `${label}: ${tip}`
  return (
    <Tooltip label={tip}>
      {to ? (
        <Link to={to} aria-label={name} className={look}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" aria-label={name} onClick={onClick} className={look}>
          {body}
        </button>
      ) : (
        <span tabIndex={0} aria-label={name} className={look}>
          {body}
        </span>
      )}
    </Tooltip>
  )
}

// Door code, tier furniture; and the check-out with its damage check when someone leaves the room (done once all are out).
const tasksOf = (r, leavers) => [r.doorCodeReady, r.matches, ...(leavers.length ? [leavers.every((l) => l.status === 'Checked out')] : [])]
const doneCount = (r, leavers) => tasksOf(r, leavers).filter(Boolean).length

/* ---------------------------------------------------------------- folded sections */

function Fold({ id, title, open, onToggle, children }) {
  return (
    <section id={id} className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex h-10 shrink-0 items-center gap-2 px-4 text-left hover:bg-subtle">
        <ChevronDown size={16} aria-hidden="true" className={cx('shrink-0 text-fg-tertiary transition-transform', !open && '-rotate-90')} />
        {title}
      </button>
      {open && <div className="max-h-60 overflow-y-auto border-t border-line">{children}</div>}
    </section>
  )
}

function EmptyLine({ children }) {
  return <p className="shrink-0 px-1 text-base text-fg-tertiary">{children}</p>
}

/* ---------------------------------------------------------------- screen */

export default function Turnover({ termId, headerSlot }) {
  const base = useRoleBase()
  const scope = useScopeQuery()
  const [coding, setCoding] = useState(null)
  const [checkingOut, setCheckingOut] = useState(null)
  const [drawing, setDrawing] = useState(null) // rooms to draw codes for
  const [furnishing, setFurnishing] = useState(null) // the room whose furniture is fixed in the side sheet
  const [search, setSearch] = useState('')
  const [moversOpen, setMoversOpen] = useState(false)
  const filters = { termId, block: scope.block }
  const query = useQuery(['turnover', filters], ({ signal }) => api.renewals.turnover(filters, { signal }))
  return (
    <QueryState query={query} isEmpty={() => false}>
      {(d) => {
        const leaversOf = (r) => d.leavers.filter((l) => l.block === r.block && l.room === r.room)
        const q = search.trim().toLowerCase()
        const hit = (...texts) => !q || texts.some((x) => x && String(x).toLowerCase().includes(q))
        const leaverHit = (l) => hit(l.room, l.student?.name, l.student?.studentCode)
        // Rooms with the most left to do first, rooms with nothing left last (the API's order otherwise).
        const share = ({ r, lv }) => doneCount(r, lv) / tasksOf(r, lv).length
        const rooms = d.rooms
          .map((r, i) => ({ r, i, lv: leaversOf(r) }))
          .filter(({ r, lv }) => hit(r.room) || lv.some(leaverHit))
          .sort((a, b) => share(a) - share(b) || a.i - b.i)
        const movers = d.movers.filter((m) => hit(m.from, m.to, m.student?.name, m.student?.studentCode))
        const damageLeft = d.rooms.filter((r) => leaversOf(r).some((l) => l.status !== 'Checked out')).length
        return (
          // The summary bar stays on top; only the rooms table scrolls. Leavers are listed in the row of their room.
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {headerSlot && createPortal(<DateChips checkOutBy={d.checkOutBy} checkInStart={d.checkInStart} />, headerSlot)}

            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 xl:flex-nowrap">
              <Pill
                icon={LogOut}
                label={t('Checked out')}
                value={`${formatNumber(d.counts.checkedOut)}/${formatNumber(d.counts.leavers)}`}
                tone={d.counts.overdue ? 'error' : 'neutral'}
              />
              <Pill
                icon={ArrowRightLeft}
                label={t('Movers')}
                value={formatNumber(d.counts.movers)}
              />
              <Pill icon={DoorOpen} label={t('Arriving')} value={formatNumber(d.counts.arriving)} />
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
              {[
                ['code', KeyRound, t('Door codes'), d.counts.codesToSet],
                ['furniture', Sofa, t('Matches tier'), d.counts.notMatching],
                ['damage', ClipboardCheck, t('Damage check'), damageLeft],
              ].map(([key, icon, label, left]) => (
                <Pill key={key} icon={icon} label={label} value={left ? left : null} tone={left ? 'warning' : 'success'} tip={left ? t('{n} rooms left', { n: formatNumber(left) }) : t('Done in every room')} />
              ))}
              <SearchInput
                wrapperClassName="ml-auto min-w-44 max-w-72 flex-1"
                aria-label={t('Search room or student')}
                placeholder="Search room or student"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 whitespace-nowrap">
                <h2 className="text-h3 font-semibold text-fg">{t('Rooms to hand over')}</h2>
                <InfoTip label={t('Rooms whose residents or class change. The meter readings are recorded at each leaver\'s check-out.')} />
                <span className="text-sm text-fg-tertiary tabular">· {t('{n} rooms', { n: formatNumber(rooms.length) })}</span>
                <span className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
                  {d.rooms.some((r) => !r.doorCodeReady) && (
                    <Button size="sm" icon={Shuffle} iconSize={14} onClick={() => setDrawing(d.rooms.filter((r) => !r.doorCodeReady))} tip="Draw a random code for every room whose code must change, then confirm them once the locks use them.">
                      {t('Random codes ({n})', { n: d.rooms.filter((r) => !r.doorCodeReady).length })}
                    </Button>
                  )}
                </span>
              </div>
              {d.rooms.length === 0 ? (
                <p className="px-4 py-3 text-base text-fg-tertiary">{t('No room changes residents or class.')}</p>
              ) : (
                <Table fill bare>
                  <THead>
                    <tr>
                      <Th className="w-28">Room</Th>
                      <Th className="w-56">Room tier next term</Th>
                      <Th className="w-32">Door code</Th>
                      <Th className="w-80">Leavers</Th>
                      <Th className="w-52">Damage check</Th>
                      <Th>Progress</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {rooms.length === 0 && (
                      <Tr>
                        <Td colSpan={6} className="text-fg-tertiary">
                          {t('No room or student matches "{q}".', { q: search.trim() })}
                        </Td>
                      </Tr>
                    )}
                    {rooms.map(({ r, lv }) => {
                      const total = tasksOf(r, lv).length
                      const done = doneCount(r, lv)
                      const finished = done === total
                      const tier = tr(r.roomClass)
                      return (
                        <Tr key={`${r.block}-${r.room}`} className={cx('[&>td]:h-12 [&>td]:py-1.5', finished && 'bg-success-bg/30')}>
                          <Td>
                            <TwoLine
                              primary={r.room}
                              secondary={[scope.block ? null : t('Block {code}', { code: r.block }), r.arriving ? t('{n} arriving', { n: formatNumber(r.arriving) }) : null].filter(Boolean).join(' · ') || null}
                            />
                          </Td>
                          <Td>
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              <span className="w-24 shrink-0 truncate">{tier}</span>
                              <TaskChip
                                done={r.matches}
                                icon={Sofa}
                                label={r.matches ? t('Matches') : t('Add items')}
                                tip={
                                  r.matches
                                    ? t('The room has the furniture of the {tier} tier of next term.', { tier })
                                    : t('The room lacks (or has extra) furniture for the {tier} tier of next term. Click to bring the missing items in from the store, or take the extra ones back.', { tier })
                                }
                                onClick={r.matches ? undefined : () => setFurnishing(r)}
                              />
                            </span>
                          </Td>
                          <Td>
                            <TaskChip
                              done={r.doorCodeReady}
                              icon={KeyRound}
                              label={r.doorCodeReady ? t('Ready') : t('Set code')}
                              tip={
                                r.doorCodeReady
                                  ? t('Door code ready: confirmed, with no change waiting.')
                                  : t('Residents change, so the door code must change. Click to set a new code, then confirm it once the lock uses it.')
                              }
                              onClick={r.doorCodeReady ? undefined : () => setCoding(r)}
                            />
                          </Td>
                          {/* One line per leaver in both columns, at the same height, so a name sits next to its check. */}
                          <Td>
                            {lv.length === 0 ? (
                              <Tooltip label={t('Nobody leaves this room.')}>
                                <span tabIndex={0} className="text-fg-tertiary">
                                  —
                                </span>
                              </Tooltip>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {lv.map((l) => (
                                  <li key={l.allocationId} className="flex h-8 items-center gap-1">
                                    <Tooltip label={`${l.student.studentCode} · ${t('Bed {bed}', { bed: `${l.room}-${l.bed}` })}`}>
                                      <span tabIndex={0} className={cx('min-w-0 truncate', l.status === 'Checked out' ? 'text-fg-secondary' : 'text-fg')}>
                                        {l.student.name}
                                      </span>
                                    </Tooltip>
                                    <span className="shrink-0 text-sm whitespace-nowrap text-fg-tertiary">· {t('Bed {bed}', { bed: l.bed })}</span>
                                    {l.status === 'Overdue' && (
                                      <Tag tone="error" className="ml-1">
                                        {t('Overdue')}
                                      </Tag>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Td>
                          <Td>
                            {lv.length === 0 ? (
                              <Tooltip label={t('Nobody leaves this room: no damage check.')}>
                                <span tabIndex={0} className="text-fg-tertiary">
                                  —
                                </span>
                              </Tooltip>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {lv.map((l) => (
                                  <li key={l.allocationId} className="flex h-8 items-center">
                                    {l.status === 'Checked out' ? (
                                      <TaskChip
                                        done
                                        icon={ClipboardCheck}
                                        label={l.damage ? formatVnd(l.damage) : t('No damage')}
                                        tip={l.damage ? t('Checked out; damage charged: {amount}.', { amount: formatVnd(l.damage) }) : t('Checked out, with no damage charged.')}
                                      />
                                    ) : (
                                      <TaskChip
                                        done={false}
                                        icon={ClipboardCheck}
                                        label={t('Check & check out')}
                                        tip={t('Check the furniture of {name} for damage, record the meter and the key, and settle the Utility Deposit.', { name: l.student.name })}
                                        onClick={() => setCheckingOut(l.allocationId)}
                                      />
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Td>
                          <Td>
                            <Tooltip label={finished ? t('Ready to hand over: every task of this room is done.') : t('{done} of {total} tasks done', { done, total })}>
                              <span tabIndex={0} className="flex items-center gap-2">
                                <span className="w-7 text-sm font-medium text-fg tabular">
                                  {done}/{total}
                                </span>
                                {finished ? (
                                  <Tag tone="success">{t('Ready to hand over')}</Tag>
                                ) : (
                                  <ProgressBar value={done} max={total} tone="warning" className="w-16" />
                                )}
                              </span>
                            </Tooltip>
                          </Td>
                        </Tr>
                      )
                    })}
                  </TBody>
                </Table>
              )}
            </section>

            {d.movers.length === 0 ? (
              <EmptyLine>
                {t('No student changes room')} · {t('{n} stay in their room', { n: formatNumber(d.counts.staying) })}
              </EmptyLine>
            ) : (
              <Fold
                id="turnover-movers"
                open={moversOpen || (search.trim() !== '' && movers.length > 0)}
                onToggle={() => setMoversOpen(!moversOpen)}
                title={
                  <span className="flex min-w-0 items-center gap-2 text-base">
                    <span className="font-semibold text-fg">{t('Movers')}</span>
                    <span className="text-fg-secondary tabular">
                      ({formatNumber(d.counts.movers)} · {t('{n} stay in their room', { n: formatNumber(d.counts.staying) })})
                    </span>
                  </span>
                }
              >
                <Table bare>
                  <THead>
                    <tr>
                      <Th>Student</Th>
                      <Th className="w-48">From → To</Th>
                      <Th className="w-36">Next-term fee</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {movers.map((m) => (
                      <Tr key={`${m.student.studentCode}-${m.to}`} className="[&>td]:h-11 [&>td]:py-1">
                        <Td>
                          <TwoLine primary={m.student.name} secondary={m.student.studentCode} />
                        </Td>
                        <Td>
                          <span className="flex items-center gap-2">
                            {m.from} → {m.to}
                            {m.moved && <Tag tone="success">Moved</Tag>}
                          </span>
                        </Td>
                        <Td>{m.fee ? <StatusTag status={m.fee} /> : <span className="text-fg-tertiary">{t('Not issued')}</span>}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Fold>
            )}

            {drawing && (
              <RandomCodesModal
                rooms={drawing}
                onClose={() => {
                  setDrawing(null)
                  query.reload()
                }}
              />
            )}
            {furnishing && <FurnitureSheet room={furnishing} termId={termId} onClose={() => setFurnishing(null)} />}
            {checkingOut && <CheckOutSheet allocationId={checkingOut} onClose={() => setCheckingOut(null)} />}
            {coding && (
              <SetCodeModal
                room={coding}
                onClose={() => {
                  setCoding(null)
                  query.reload()
                }}
              />
            )}
          </div>
        )
      }}
    </QueryState>
  )
}
