import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { ArrowRightLeft, Check, ChevronDown, DoorOpen, Gauge, KeyRound, LogOut, Sofa, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, ProgressBar } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { InfoTip, Tooltip, Truncate } from '@/components/ui/Tooltip'
import { SetCodeModal } from '@/pages/staff/DoorCodes'
import { formatDate, formatNumber } from '@/lib/format'
import { cx } from '@/lib/cx'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// Term transition › Turnover (spec §5.1 M9, §6.16): between the current Term's check-out day and the next Term's
// check-in start leavers check out at the desk, movers move to their next-Term Bed (they live there once its door code
// is released to them), and every Room whose residents change needs a meter reading and a new door code; Rooms whose
// class changes are listed too (their furniture moves). Rooms whose furniture does not match their next-Term class are
// a Manager's task (set the class back or finish the moves).
// GET /turnover?termId&block → { term, previousTerm, checkOutBy, checkInStart, counts: { leavers, checkedOut, overdue,
//   movers, staying, arriving, rooms, codesToSet, notMatching }, leavers: [{ allocationId, student: { name, studentCode },
//   room, bed, block, status (To check out, Checked out, Overdue) }], movers: [{ student, from, to, fee, moved }],
//   rooms: [{ room, block, leaving, arriving, doorCodeReady, roomClass, matches, lastMeterCut }] }
// POST /turnover/meter-cuts { room, electricity, water } → 204
//
// Layout: the rooms to hand over are the screen (filter chips above, one "To do" cell with the door code, furniture
// and meter tasks); leavers and movers fold under it. Filtering and ordering only use the rows already loaded.

function MeterCut({ room, onClose }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ electricity: '', water: '' })
  const save = useMutation(() => api.renewals.meterCut({ room: room.room, electricity: Number(form.electricity), water: Number(form.water) }), {
    invalidates: ['turnover'],
    onSuccess: () => {
      notify({ title: 'Meter reading saved', message: t('Room {room}: the month is split between those who leave and those who arrive.', { room: room.room }) })
      onClose()
    },
    onError: () => {},
  })
  const fields = save.error?.details?.fields ?? {}
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Meter reading · Room {room}', { room: room.room })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.pending || form.electricity === '' || form.water === ''} onClick={() => save.run()}>
            {save.pending ? t('Saving…') : t('Save reading')}
          </Button>
        </>
      }
    >
      {save.error && !save.error.details?.fields && <Alert type="error" title="Could not save">{save.error.message}</Alert>}
      <Field
        label="Electricity (kWh)"
        required
        error={fields.electricity}
        helper={
          room.previousMeters
            ? t('Previous reading: {value} kWh (recorded {date})', {
                value: formatNumber(room.previousMeters.electricity),
                date: formatDate(room.previousMeters.date),
              })
            : undefined
        }
      >
        {(id) => <Input id={id} type="number" min="0" step="0.1" value={form.electricity} onChange={(e) => setForm({ ...form, electricity: e.target.value })} />}
      </Field>
      <Field
        label="Water (m³)"
        required
        error={fields.water}
        helper={
          room.previousMeters
            ? t('Previous reading: {value} m³ (recorded {date})', {
                value: formatNumber(room.previousMeters.water),
                date: formatDate(room.previousMeters.date),
              })
            : undefined
        }
      >
        {(id) => <Input id={id} type="number" min="0" step="0.1" value={form.water} onChange={(e) => setForm({ ...form, water: e.target.value })} />}
      </Field>
    </Modal>
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

/* ---------------------------------------------------------------- totals (the former KPI cards, clickable) */

function StatTile({ icon: Glyph, label, value, note, tone, active, onClick, tip }) {
  const valueTone = tone === 'error' ? 'text-error-fg' : tone === 'warning' ? 'text-warning-fg' : tone === 'success' ? 'text-success-fg' : 'text-fg'
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg-secondary">
        <Glyph size={14} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className={cx('text-h3 font-semibold whitespace-nowrap tabular', valueTone)}>{value}</span>
      <span className="truncate text-sm leading-4 text-fg-tertiary" title={note}>
        {note}
      </span>
    </>
  )
  const box = 'flex min-w-0 flex-col rounded-lg border px-3 py-1.5 text-left transition-colors'
  if (!onClick) return <div className={cx(box, 'border-line bg-surface')}>{body}</div>
  return (
    <Tooltip label={tip} block>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cx(box, 'w-full', active ? 'border-primary bg-primary-subtle' : 'border-line bg-surface hover:border-primary')}
      >
        {body}
      </button>
    </Tooltip>
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

const tasksOf = (r) => [r.doorCodeReady, r.matches, Boolean(r.lastMeterCut)]
const doneCount = (r) => tasksOf(r).filter(Boolean).length

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
  const [reading, setReading] = useState(null)
  const [coding, setCoding] = useState(null)
  const [filter, setFilter] = useState('all')
  const [leaversOpen, setLeaversOpen] = useState(null) // null: open only when someone is overdue
  const [moversOpen, setMoversOpen] = useState(false)
  const filters = { termId, block: scope.block }
  const query = useQuery(['turnover', filters], ({ signal }) => api.renewals.turnover(filters, { signal }))
  return (
    <QueryState query={query} isEmpty={() => false}>
      {(d) => {
        const pending = new Set(d.leavers.filter((l) => l.status !== 'Checked out').map((l) => `${l.block}|${l.room}`))
        const notCheckedOut = (r) => pending.has(`${r.block}|${r.room}`)
        const tests = {
          all: () => true,
          checkOut: notCheckedOut,
          code: (r) => !r.doorCodeReady,
          furniture: (r) => !r.matches,
          meter: (r) => !r.lastMeterCut,
        }
        const filterLabels = {
          checkOut: t('Leavers'),
          code: t('Codes to set'),
          furniture: t('Furniture to fix'),
          meter: t('Meter readings to record'),
        }
        // Rooms with the most left to do first, rooms with nothing left last (the API's order otherwise).
        const rooms = d.rooms
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => (tests[filter] ?? tests.all)(r))
          .sort((a, b) => doneCount(a.r) - doneCount(b.r) || a.i - b.i)
          .map(({ r }) => r)
        const toggle = (key) => setFilter(filter === key ? 'all' : key)
        const meterMissing = d.rooms.filter((r) => !r.lastMeterCut).length
        const leftToCheckOut = d.counts.leavers - d.counts.checkedOut
        const showLeavers = leaversOpen ?? d.counts.overdue > 0
        const onlyThese = t('Click to show only these rooms; click again to show every room.')
        return (
          // One scroll for the whole tab, only when the window is too short: the rooms table keeps at least five rows
          // and scrolls inside when it is longer; leavers and movers are never cut.
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {headerSlot && createPortal(<DateChips checkOutBy={d.checkOutBy} checkInStart={d.checkInStart} />, headerSlot)}

            <div className="grid shrink-0 grid-cols-3 gap-2 xl:grid-cols-6">
              <StatTile
                icon={LogOut}
                label={t('Leavers')}
                value={`${formatNumber(d.counts.checkedOut)} / ${formatNumber(d.counts.leavers)}`}
                note={t('Checked out / all')}
                tone={d.counts.overdue ? 'error' : undefined}
                active={filter === 'checkOut'}
                tip={t('Click to show the rooms where someone has not checked out yet, and the list of leavers.')}
                onClick={() => {
                  toggle('checkOut')
                  setLeaversOpen(true)
                }}
              />
              <StatTile
                icon={ArrowRightLeft}
                label={t('Movers')}
                value={formatNumber(d.counts.movers)}
                note={t('{n} stay in their room', { n: formatNumber(d.counts.staying) })}
                tip={t('Click to open the list of movers.')}
                onClick={
                  d.movers.length
                    ? () => {
                        setMoversOpen(true)
                        setTimeout(() => document.getElementById('turnover-movers')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
                      }
                    : undefined
                }
              />
              <StatTile icon={DoorOpen} label={t('Arriving')} value={formatNumber(d.counts.arriving)} note={t('New students of the next term')} />
              <StatTile
                icon={KeyRound}
                label={t('Codes to set')}
                value={formatNumber(d.counts.codesToSet)}
                note={t('{n} rooms to prepare', { n: formatNumber(d.counts.rooms) })}
                tone={d.counts.codesToSet ? 'warning' : 'success'}
                active={filter === 'code'}
                tip={onlyThese}
                onClick={() => toggle('code')}
              />
              <StatTile
                icon={Sofa}
                label={t('Furniture to fix')}
                value={formatNumber(d.counts.notMatching)}
                note={t('Rooms not matching their class')}
                tone={d.counts.notMatching ? 'warning' : 'success'}
                active={filter === 'furniture'}
                tip={onlyThese}
                onClick={() => toggle('furniture')}
              />
              <StatTile
                icon={Gauge}
                label={t('Meter readings to record')}
                value={formatNumber(meterMissing)}
                note={t('Rooms with no meter reading yet')}
                tone={meterMissing ? 'warning' : 'success'}
                active={filter === 'meter'}
                tip={onlyThese}
                onClick={() => toggle('meter')}
              />
            </div>

            <section className={cx('flex flex-initial flex-col overflow-hidden rounded-lg border border-line bg-surface', rooms.length > 5 ? 'min-h-[332px] [@media(min-height:1000px)]:min-h-[476px]' : 'shrink-0')}>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 whitespace-nowrap">
                <h2 className="text-h3 font-semibold text-fg">{t('Rooms to hand over')}</h2>
                <InfoTip label={t('Rooms whose residents or class change')} />
                <span className="text-sm text-fg-tertiary tabular">· {t('{n} rooms', { n: formatNumber(rooms.length) })}</span>
                {filter !== 'all' && (
                  <span className="flex items-center gap-1.5">
                    <Tag tone="brand" dot={false}>
                      {t('Filter: {label}', { label: filterLabels[filter] })}
                    </Tag>
                    <Button size="sm" variant="text" onClick={() => setFilter('all')}>
                      Show all rooms
                    </Button>
                  </span>
                )}
                <span className="ml-auto flex min-w-0 flex-1 justify-end">
                  <Truncate className="text-sm text-fg-tertiary" align="end">
                    {t('Each room has 3 tasks. Orange: click it to do it. Green: done. 3/3: ready to hand over.')}
                  </Truncate>
                </span>
              </div>
              {d.rooms.length === 0 ? (
                <p className="px-4 py-3 text-base text-fg-tertiary">{t('No room changes residents or class.')}</p>
              ) : (
                <Table fill bare>
                  <THead>
                    <tr>
                      <Th className="w-28">Room</Th>
                      <Th className="w-44">Residents change</Th>
                      <Th>Room tier next term</Th>
                      <Th className="w-[340px]">Tasks to do</Th>
                      <Th className="w-44">Progress</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {rooms.length === 0 && (
                      <Tr>
                        <Td colSpan={5} className="text-fg-tertiary">
                          {t('No room matches this filter.')}
                        </Td>
                      </Tr>
                    )}
                    {rooms.map((r) => {
                      const done = doneCount(r)
                      const finished = done === 3
                      const tier = tr(r.roomClass)
                      return (
                        <Tr key={`${r.block}-${r.room}`} className={cx('[&>td]:h-12 [&>td]:py-1.5', finished && 'bg-success-bg/30')}>
                          <Td>
                            <TwoLine primary={r.room} secondary={scope.block ? null : t('Block {code}', { code: r.block })} />
                          </Td>
                          <Td>
                            <span className="tabular">
                              {t('{leaving} leaving → {arriving} arriving', { leaving: formatNumber(r.leaving), arriving: formatNumber(r.arriving) })}
                            </span>
                          </Td>
                          <Td>
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              {tier}
                              <StatusTag status={r.matches ? 'Matches' : 'Does not match'} />
                            </span>
                          </Td>
                          <Td>
                            <span className="flex items-center gap-1.5">
                              <TaskChip
                                done={r.doorCodeReady}
                                icon={KeyRound}
                                label={t('Door code')}
                                tip={
                                  r.doorCodeReady
                                    ? t('Door code ready: confirmed, with no change waiting.')
                                    : t('Residents change, so the door code must change. Click to set a new code, then confirm it once the lock uses it.')
                                }
                                onClick={r.doorCodeReady ? undefined : () => setCoding(r)}
                              />
                              <TaskChip
                                done={r.matches}
                                icon={Sofa}
                                label={t('Furniture')}
                                tip={
                                  r.matches
                                    ? t('The furniture matches the {tier} tier of next term.', { tier })
                                    : t('The furniture does not match the {tier} tier of next term. Click to open this room on the Furniture page and move the missing items in (or the extra ones out); a manager can also set the room tier back.', { tier })
                                }
                                to={r.matches ? undefined : `${base}/furniture?room=${encodeURIComponent(r.room)}`}
                              />
                              <TaskChip
                                done={Boolean(r.lastMeterCut)}
                                icon={Gauge}
                                label={r.lastMeterCut ? formatDate(r.lastMeterCut) : t('Meter')}
                                tip={
                                  r.lastMeterCut
                                    ? t('Last meter reading {date}. Click to record a new one.', { date: formatDate(r.lastMeterCut) })
                                    : t('No meter reading yet. Click to record electricity and water, so the month is split between those who leave and those who arrive.')
                                }
                                onClick={() => setReading(r)}
                              />
                            </span>
                          </Td>
                          <Td>
                            <Tooltip label={finished ? t('Ready to hand over: the door code, the furniture and the meter reading are done.') : t('{done} of 3 tasks done', { done })}>
                              <span tabIndex={0} className="flex items-center gap-2">
                                <span className="w-7 text-sm font-medium text-fg tabular">{done}/3</span>
                                {finished ? (
                                  <Tag tone="success">{t('Ready to hand over')}</Tag>
                                ) : (
                                  <ProgressBar value={done} max={3} tone="warning" className="w-16" />
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

            {d.leavers.length === 0 ? (
              <EmptyLine>{t('Nobody leaves.')}</EmptyLine>
            ) : (
              <Fold
                open={showLeavers}
                onToggle={() => setLeaversOpen(!showLeavers)}
                title={
                  <span className="flex min-w-0 items-center gap-2 text-base">
                    <span className="font-semibold text-fg">{t('Leavers')}</span>
                    <span className="text-fg-secondary tabular">
                      ({t('{done}/{n} checked out', { done: formatNumber(d.counts.checkedOut), n: formatNumber(d.counts.leavers) })}
                      {leftToCheckOut > 0 ? ` · ${t('{n} to check out', { n: formatNumber(leftToCheckOut) })}` : ''})
                    </span>
                    {d.counts.overdue > 0 && <Tag tone="error">{t('{n} overdue', { n: formatNumber(d.counts.overdue) })}</Tag>}
                  </span>
                }
              >
                <Table bare size="md">
                  <THead>
                    <tr>
                      <Th>Student</Th>
                      <Th className="w-32">Bed</Th>
                      <Th className="w-36">Status</Th>
                      <Th className="w-36">
                        <span className="sr-only">{t('Check-out desk')}</span>
                      </Th>
                    </tr>
                  </THead>
                  <TBody>
                    {d.leavers.map((l) => (
                      <Tr key={l.allocationId} className="[&>td]:h-11 [&>td]:py-1">
                        <Td>
                          <TwoLine primary={l.student.name} secondary={l.student.studentCode} />
                        </Td>
                        <Td>
                          {l.room}-{l.bed}
                        </Td>
                        <Td>
                          <StatusTag status={l.status} tone={l.status === 'To check out' ? 'warning' : undefined} />
                        </Td>
                        <Td align="right">
                          {l.status !== 'Checked out' && (
                            <Button size="sm" icon={LogOut} iconSize={14} to={`${base}/check-out`} tip="Open the check-out desk">
                              Check out at the desk
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Fold>
            )}

            {d.movers.length === 0 ? (
              <EmptyLine>
                {t('No student changes room')} · {t('{n} stay in their room', { n: formatNumber(d.counts.staying) })}
              </EmptyLine>
            ) : (
              <Fold
                id="turnover-movers"
                open={moversOpen}
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
                    {d.movers.map((m) => (
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

            {reading && <MeterCut room={reading} onClose={() => setReading(null)} />}
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
