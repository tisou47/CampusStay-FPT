import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Building, Check, CircleHelp, Download, FileSpreadsheet, Gauge, PanelRightOpen, RotateCcw, TriangleAlert, Upload, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate, useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert, Divider, ProgressBar } from '@/components/ui/Display'
import { controlClasses, Field, Input, Select } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { QueryState, Spinner, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { Tooltip, Truncate } from '@/components/ui/Tooltip'
import { formatDate, formatDateRange, formatNumber, formatPercent } from '@/lib/format'
import { parseReading } from '@/lib/numbers'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// SCR-UTL-10 Meter Readings (Figma 95:3302)
// GET /meter-periods?block → { items: [{ id, label, closed }] }
// GET /meter-periods/:id/readings?block&status&page&pageSize → { period: { id, label, closed, dueAt },
//   summary: { roomsDue, entered, missing, segments }, items: [{ room, roomTypeName, roomClassName, residents,
//   electricity: { previous, current, cut: { date, value } | null }, water: { … }, status }], total }
// GET /meter-periods/:id/readings/:room → { …item, priceKwh, priceM3, roundingNote,
//   segments: [{ from, to, residents, kwh, m3, electricityCost, waterCost }], shares: [{ label, amount }] }
// PUT …/readings/:room { electricity, water } · POST …/readings/:room/confirm · POST /meter-periods/:id/close
// GET /meter-periods/:id/template (XLSX to fill in) · POST /meter-periods/:id/import (the file filled in, XLSX or CSV) → { imported, skipped }
//
// The table is the screen: readings are typed in the rows (Tab electricity → water, Enter next row, Shift+Enter
// previous row, Esc undoes the row) and a row saves itself 500 ms after the focus leaves it. The rows shown stay in
// place while readings are saved (a saved row does not leave the "Missing" filter until the page reloads); only the
// summary strip refreshes. The split preview of a room opens in a drawer.

const statusTone = { Entered: 'success', Confirmed: 'info', Missing: 'warning', 'Check value': 'error' }
const asText = (v) => (v == null ? '' : String(v))
const parse = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const SAVE_DELAY = 500
const GUIDE_KEY = 'meterGuideDismissed'

function guideDismissed() {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}
function rememberGuide(dismissed) {
  try {
    if (dismissed) localStorage.setItem(GUIDE_KEY, '1')
    else localStorage.removeItem(GUIDE_KEY)
  } catch {
    // Storage unavailable: the choice lasts until the page is closed.
  }
}

/* ---------------------------------------------------------------- guide and summary */

const GUIDE = [
  'Download the template: one line per room with last month’s values.',
  'Fill the electricity and water columns in Excel; leave rooms you have not read blank.',
  'Upload it (XLSX or CSV). Every line is checked before any is saved.',
]

function GuideBanner({ onDismiss }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface pr-1 pl-3 text-sm text-fg-secondary">
      <FileSpreadsheet size={16} aria-hidden="true" className="shrink-0 text-fg-brand" />
      <ol className="flex min-w-0 flex-1 items-center gap-2">
        {GUIDE.map((step, i) => (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
            {i > 0 && <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-fg-tertiary" />}
            <Truncate tip={`${i + 1}. ${t(step)}`}>
              <strong className="font-medium text-fg">{i + 1}.</strong> {t(step)}
            </Truncate>
          </li>
        ))}
      </ol>
      <IconButton icon={X} size="sm" iconSize={14} aria-label={t('Hide the guide')} onClick={onDismiss} />
    </div>
  )
}

function Segment({ tip, children, className }) {
  return (
    <Tooltip label={tip} block className={cx('items-center gap-2 border-l border-line px-4 whitespace-nowrap first:border-l-0', className)}>
      {children}
    </Tooltip>
  )
}

function SummaryStrip({ block, s, status, onMissing }) {
  const due = s?.roomsDue ?? 0
  const entered = s?.entered ?? 0
  const missingOnly = status === 'Missing'
  return (
    <div className="flex h-11 shrink-0 items-stretch overflow-x-auto rounded-lg border border-line bg-surface text-base text-fg-secondary">
      <Segment tip={t('Rooms due this period')}>
        <Building size={16} aria-hidden="true" className="text-fg-brand" />
        {block && <span className="font-medium text-fg">{t('Block {code}', { code: block })}</span>}
        {block && <span aria-hidden="true">·</span>}
        <span className="tabular">{t('{n} rooms', { n: formatNumber(due) })}</span>
      </Segment>
      <Segment tip={t('Readings entered')} className="min-w-0 flex-1">
        <span>{t('Entered')}</span>
        <span className="font-semibold text-fg tabular">
          {formatNumber(entered)}/{formatNumber(due)}
        </span>
        <ProgressBar value={entered} max={due || 1} tone="success" className="max-w-48 min-w-16 flex-1" />
        <span className="tabular">{formatPercent(due ? entered / due : 0, 0)}</span>
      </Segment>
      <div className="flex items-center border-l border-line px-1.5">
        <Tooltip label={missingOnly ? t('Show every room') : t('Show only rooms without a reading. Bills held until entered.')}>
          <button
            type="button"
            aria-pressed={missingOnly}
            onClick={onMissing}
            className={cx(
              'flex h-8 items-center gap-2 rounded-md px-2.5 whitespace-nowrap transition-colors',
              missingOnly ? 'bg-warning-bg text-warning-fg' : 'hover:bg-subtle hover:text-fg',
            )}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
            {t('Missing')}: <span className="font-semibold tabular">{formatNumber(s?.missing ?? 0)}</span>
          </button>
        </Tooltip>
      </div>
      <Segment tip={t('Check-in, check-out, room change')}>
        {t('Segments this month')}: <span className="font-semibold text-fg tabular">{formatNumber(s?.segments ?? 0)}</span>
      </Segment>
    </div>
  )
}

/* ---------------------------------------------------------------- one row, typed in place */

const numberInput = (invalid) =>
  cx(
    controlClasses({ invalid }).replace('w-full ', ''),
    'w-24 shrink-0 text-right tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
  )

function MeterInput({ meter, value, onChange, low, failed, field, label, closed, onKeyDown }) {
  const draft = parse(value)
  const delta = draft != null && meter?.previous != null && !low ? draft - meter.previous : null
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        data-field={field}
        aria-label={label}
        aria-invalid={low || failed || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.target.select()}
        disabled={closed}
        className={numberInput(Boolean(low || failed))}
      />
      <div className="flex max-w-44 min-w-0 flex-col text-sm leading-4 whitespace-nowrap">
        <span
          className="truncate text-fg-tertiary tabular"
          title={
            meter?.previous != null && meter?.previousDate
              ? t('Previous reading: {value} (recorded {date})', {
                  value: formatNumber(meter.previous),
                  date: formatDate(meter.previousDate),
                })
              : undefined
          }
        >
          {meter?.previous != null && meter?.previousDate
            ? t('Previous: {n} ({date})', { n: formatNumber(meter.previous), date: formatDate(meter.previousDate) })
            : t('previous: {n}', { n: meter?.previous == null ? '—' : formatNumber(meter.previous) })}
        </span>
        {low ? (
          <span className="truncate font-medium text-error-fg">{t('Lower than previous')}</span>
        ) : delta != null ? (
          <span className="truncate font-medium text-fg-secondary tabular" title={t('Use this period (estimate)')}>
            Δ {formatNumber(delta)}
          </span>
        ) : meter?.cut ? (
          <Truncate className="text-fg-tertiary">{t('Segment cut {date} at {value}', { date: formatDate(meter.cut.date), value: formatNumber(meter.cut.value) })}</Truncate>
        ) : null}
      </div>
    </div>
  )
}

function MeterRow({ r, index, periodId, closed, onSaved, onOpen, onMove }) {
  const { notifyError } = useToast()
  const server = { e: asText(r.electricity?.current), w: asText(r.water?.current) }
  const base = useRef(server)
  const [e, setE] = useState(server.e)
  const [w, setW] = useState(server.w)
  const [state, setState] = useState({ kind: 'idle' }) // idle | saving | error
  const [confirming, setConfirming] = useState(false)
  const [inRow, setInRow] = useState(false)
  const timer = useRef(null)

  // New values from the server (a save, the drawer, an upload) replace a field that was not edited.
  useEffect(() => {
    const prev = base.current
    base.current = server
    setE((cur) => (cur === prev.e ? server.e : cur))
    setW((cur) => (cur === prev.w ? server.w : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.e, server.w])

  const eN = parse(e)
  const wN = parse(w)
  const eFloor = r.electricity?.cut?.value ?? r.electricity?.previous
  const wFloor = r.water?.cut?.value ?? r.water?.previous
  const eLow = eN != null && eFloor != null && eN < eFloor
  const wLow = wN != null && wFloor != null && wN < wFloor
  const dirty = e !== base.current.e || w !== base.current.w
  const incomplete = dirty && (eN == null) !== (wN == null)
  const ready = dirty && eN != null && wN != null && !eLow && !wLow && !closed

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    timer.current = null
    const values = { e, w }
    setState({ kind: 'saving' })
    try {
      await api.meters.save(periodId, r.room, { electricity: parse(values.e), water: parse(values.w) })
      base.current = values
      await onSaved(r.room)
      setState({ kind: 'idle' })
    } catch (err) {
      setState({ kind: 'error', message: err?.fields?.electricity ?? err?.fields?.water ?? err?.summary ?? err?.message ?? t('Could not save the reading') })
    }
  }, [e, w, periodId, r.room, onSaved])

  // A save still waiting when the row goes away (another page, another filter) is sent at once.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        saveRef.current()
      }
    },
    [],
  )

  const undo = () => {
    clearTimeout(timer.current)
    timer.current = null
    setE(base.current.e)
    setW(base.current.w)
    setState({ kind: 'idle' })
  }

  const onKeyDown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      onMove(ev.shiftKey ? index - 1 : index + 1)
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      undo()
    }
  }

  const confirm = async () => {
    setConfirming(true)
    try {
      await api.meters.confirm(periodId, r.room)
      await onSaved(r.room)
    } catch (err) {
      notifyError(err, 'Could not confirm')
    } finally {
      setConfirming(false)
    }
  }

  const failed = state.kind === 'error'
  const check = !dirty && state.kind === 'idle' && r.status === 'Check value'
  const typeLine = [tr(r.roomTypeName), tr(r.roomClassName)].filter(Boolean).join(' · ')

  return (
    <Tr
      data-row={index}
      className={cx('[&>td]:h-11 [&>td]:py-1', failed && 'bg-error-bg/40', check && 'bg-warning-bg/50')}
      onFocus={() => {
        setInRow(true)
        clearTimeout(timer.current)
        timer.current = null
      }}
      onBlur={(ev) => {
        if (ev.currentTarget.contains(ev.relatedTarget)) return
        setInRow(false)
        if (ready && state.kind !== 'saving') timer.current = setTimeout(() => saveRef.current(), SAVE_DELAY)
      }}
    >
      <Td>
        <div className="flex max-w-40 min-w-0 items-baseline gap-2">
          <button type="button" onClick={() => onOpen(r.room)} className="shrink-0 font-semibold text-fg-link hover:underline">
            {r.room}
          </button>
          {typeLine && <Truncate className="text-sm text-fg-tertiary">{typeLine}</Truncate>}
        </div>
      </Td>
      <Td align="center">{r.residents}</Td>
      <Td>
        <MeterInput
          field="e"
          meter={r.electricity}
          value={e}
          onChange={setE}
          low={eLow}
          failed={failed}
          closed={closed}
          onKeyDown={onKeyDown}
          label={t('Electricity reading of {room}', { room: r.room })}
        />
      </Td>
      <Td>
        <MeterInput
          field="w"
          meter={r.water}
          value={w}
          onChange={setW}
          low={wLow}
          failed={failed}
          closed={closed}
          onKeyDown={onKeyDown}
          label={t('Water reading of {room}', { room: r.room })}
        />
      </Td>
      <Td>
        {state.kind === 'saving' ? (
          <span className="flex items-center gap-2 text-sm text-fg-secondary">
            <Spinner size={14} />
            {t('Saving…')}
          </span>
        ) : failed ? (
          <span className="flex max-w-52 min-w-0 items-center gap-1.5">
            <Truncate className="text-sm font-medium text-error-fg" tip={state.message}>
              {state.message}
            </Truncate>
            <Button size="sm" variant="text" icon={RotateCcw} iconSize={14} onClick={save} disabled={!ready}>
              Retry
            </Button>
          </span>
        ) : dirty && (eLow || wLow) ? (
          <span className="text-sm font-medium text-error-fg">{t('Not saved')}</span>
        ) : incomplete && !inRow ? (
          <span className="text-sm font-medium text-warning-fg">{t('Enter both readings')}</span>
        ) : dirty ? (
          <span className="text-sm text-fg-tertiary">{t('Saves when you leave the row')}</span>
        ) : check ? (
          <span className="flex items-center gap-1.5">
            <Tooltip label={t('This month’s electricity use is more than 3 times last month’s. Re-read the meter: edit the reading if it was wrong, or confirm the room if it is right.')}>
              <span tabIndex={0} className="flex items-center gap-1 text-sm font-medium text-warning-fg">
                <TriangleAlert size={14} aria-hidden="true" />
                {t('Check value')}
              </span>
            </Tooltip>
            <Button size="sm" onClick={confirm} disabled={closed || confirming}>
              Confirm
            </Button>
          </span>
        ) : (
          <Tag tone={statusTone[r.status] ?? 'neutral'}>
            {t(r.status)}
            {r.status === 'Entered' && <Check size={12} strokeWidth={3} aria-hidden="true" />}
          </Tag>
        )}
      </Td>
      <Td align="center" className="w-12 !px-1">
        <IconButton icon={PanelRightOpen} size="sm" iconSize={16} aria-label={t('Open details of {room}', { room: r.room })} tipAlign="end" onClick={() => onOpen(r.room)} />
      </Td>
    </Tr>
  )
}

/* ---------------------------------------------------------------- split preview drawer */

function Line({ label, children, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{tr(label)}</dt>
      <dd className={strong ? 'font-medium text-fg tabular' : 'text-fg tabular'}>{children}</dd>
    </div>
  )
}

function RoomDrawer({ periodId, periodLabel, room, closed, onClose, onChanged }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['meters', 'room', periodId, room], ({ signal }) => api.meters.room(periodId, room, { signal }), { keepPrevious: false })
  const r = query.data
  const needsInput = r?.status === 'Missing'
  const [editing, setEditing] = useState(false)
  const [e, setE] = useState('')
  const [w, setW] = useState('')
  useEffect(() => {
    if (!r) return
    // A Check value reading opens on its preview, so it can be confirmed as it is or edited.
    setEditing(r.status === 'Missing')
    setE(r.electricity?.current == null ? '' : String(r.electricity.current))
    setW(r.water?.current == null ? '' : String(r.water.current))
  }, [r])

  const save = useMutation(() => api.meters.save(periodId, room, { electricity: parseReading(e), water: parseReading(w) }), {
    invalidates: ['meters'],
    onSuccess: () => {
      onChanged(room)
      notify({ title: t('Reading saved for {room}', { room }), message: 'The split preview is updated.' })
    },
    onError: (err) => notifyError(err, 'Could not save the reading'),
  })
  const confirm = useMutation(() => api.meters.confirm(periodId, room), {
    invalidates: ['meters'],
    onSuccess: () => {
      onChanged(room)
      notify({ title: t('{room} confirmed', { room }), message: 'Shares are locked for this period.' })
    },
    onError: (err) => notifyError(err, 'Could not confirm'),
  })

  // Decimals are kept ("12,5" is 12.5, not 125: WEB-OPS-01); text that is not a number blocks the save.
  const eNum = parseReading(e)
  const wNum = parseReading(w)
  const invalid = eNum == null || wNum == null || Number.isNaN(eNum) || Number.isNaN(wNum)
    || (r && (eNum < r.electricity.previous || wNum < r.water.previous))

  const footer = !r ? null : editing ? (
    <>
      {!needsInput && <Button onClick={() => setEditing(false)}>Cancel</Button>}
      <Button variant="primary" disabled={invalid || closed || save.pending} onClick={() => save.run()}>
        Save reading
      </Button>
    </>
  ) : (
    <>
      <Button onClick={() => setEditing(true)} disabled={closed}>
        Edit reading
      </Button>
      <Button variant="primary" onClick={() => confirm.run()} disabled={closed || r.status === 'Confirmed' || confirm.pending}>
        {r.status === 'Confirmed' ? t('Confirmed') : t('Confirm room')}
      </Button>
    </>
  )

  return (
    <Drawer
      open
      onClose={onClose}
      width={380}
      title={`${room}${periodLabel ? ` · ${tr(periodLabel)}` : ''}`}
      description={t('Shared meter, split equally among residents of each segment')}
      footer={footer}
    >
      <QueryState query={query} compact>
        {(d) => (
          <>
            {(d.priceKwh || d.priceM3) && (
              <p className="text-sm text-fg-tertiary">
                {t('Price {kwh} ₫/kWh · {m3} ₫/m³ (Admin › Utility).', { kwh: formatNumber(d.priceKwh), m3: formatNumber(d.priceM3) })} {tr(d.roundingNote)}
              </p>
            )}
            {d.status === 'Check value' && (
              <Alert type="error" title="Use is far above last month">
                This month’s electricity use is more than 3 times last month’s. Re-read the meter: edit the reading if it was wrong, or confirm the room if it is right.
              </Alert>
            )}
            {editing ? (
              <div className="flex gap-3">
                <Field
                  label="Electricity (kWh)"
                  helper={
                    d.electricity.previousDate
                      ? t('Previous reading: {value} kWh (recorded {date})', {
                          value: formatNumber(d.electricity.previous),
                          date: formatDate(d.electricity.previousDate),
                        })
                      : t('Previous {n}', { n: formatNumber(d.electricity.previous) })
                  }
                  className="flex-1"
                  error={Number.isNaN(eNum) ? t('Enter a number, e.g. 1360,5') : e && eNum < d.electricity.previous ? 'Lower than previous' : undefined}
                >
                  {(id) => <Input id={id} value={e} onChange={(ev) => setE(ev.target.value)} inputMode="decimal" disabled={closed} />}
                </Field>
                <Field
                  label="Water (m³)"
                  helper={
                    d.water.previousDate
                      ? t('Previous reading: {value} m³ (recorded {date})', {
                          value: formatNumber(d.water.previous),
                          date: formatDate(d.water.previousDate),
                        })
                      : t('Previous {n}', { n: formatNumber(d.water.previous) })
                  }
                  className="flex-1"
                  error={Number.isNaN(wNum) ? t('Enter a number, e.g. 1360,5') : w && wNum < d.water.previous ? 'Lower than previous' : undefined}
                >
                  {(id) => <Input id={id} value={w} onChange={(ev) => setW(ev.target.value)} inputMode="decimal" disabled={closed} />}
                </Field>
              </div>
            ) : (
              <>
                {(d.segments ?? []).map((s, i) => (
                  <div key={`${s.from}-${s.to}`} className="flex flex-col gap-3">
                    {i > 0 && <Divider />}
                    <p className="text-base font-medium text-fg">
                      {d.segments.length > 1 ? `${t('Segment {n}', { n: i + 1 })} · ` : ''}
                      {formatDateRange(s.from, s.to)} · {t('{n} residents', { n: s.residents })}
                    </p>
                    <dl className="flex flex-col gap-3">
                      <Line label={t('Electricity {n} kWh', { n: formatNumber(s.kwh) })}>
                        {formatNumber(s.electricityCost)} ÷ {s.residents} = {formatNumber(Math.round(s.electricityCost / s.residents))}
                      </Line>
                      <Line label={t('Water {n} m³', { n: formatNumber(s.m3) })}>
                        {formatNumber(s.waterCost)} ÷ {s.residents} = {formatNumber(Math.round(s.waterCost / s.residents))}
                      </Line>
                    </dl>
                  </div>
                ))}
                <Divider />
                <dl className="flex flex-col gap-3">
                  {(d.shares ?? []).map((s) => (
                    <Line key={s.label} label={s.label} strong>
                      {formatNumber(s.amount)}
                    </Line>
                  ))}
                </dl>
              </>
            )}
          </>
        )}
      </QueryState>
    </Drawer>
  )
}

/* ---------------------------------------------------------------- screen */

export default function MeterReadings() {
  const { block: scopeBlock, blocks } = useSession()
  const { notify, notifyError } = useToast()
  const fileInput = useRef(null)
  const tableArea = useRef(null)
  const [block, setBlock] = useState(scopeBlock ?? blocks[0] ?? '')
  useEffect(() => {
    if (scopeBlock) setBlock(scopeBlock)
    else if (!block && blocks.length) setBlock(blocks[0])
  }, [scopeBlock, blocks, block])
  const periods = useQuery(['meters', 'periods', block], ({ signal }) => api.meters.periods({ block }, { signal }), { enabled: Boolean(block) })
  const [periodId, setPeriodId] = useState(null)
  const activePeriod = periodId ?? periods.data?.items?.[0]?.id
  // Default the status filter to All ("") on initial load and when switching block or period.
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [openRoom, setOpenRoom] = useState(null)
  const [closing, setClosing] = useState(false)
  const [guideHidden, setGuideHidden] = useState(guideDismissed)

  // The rows ('meter-rows') reload only when the filters change or after an upload or a close; a reading saved in a
  // row patches that row and refreshes the summary ('meters'), so the rows being typed in never jump.
  const filters = { block, status, page, pageSize }
  const rows = useQuery(['meter-rows', activePeriod, filters], ({ signal }) => api.meters.list(activePeriod, filters, { signal }), { enabled: Boolean(activePeriod) })
  const totals = useQuery(['meters', 'summary', activePeriod, block], ({ signal }) => api.meters.list(activePeriod, { block, page: 1, pageSize: 1 }, { signal }), {
    enabled: Boolean(activePeriod),
  })
  const [patched, setPatched] = useState({})
  useEffect(() => setPatched({}), [rows.data])
  const items = (rows.data?.items ?? []).map((r) => (patched[r.room] ? { ...r, ...patched[r.room] } : r))
  const period = totals.data?.period ?? rows.data?.period
  const s = totals.data?.summary ?? rows.data?.summary
  const closed = Boolean(period?.closed)

  const refreshRoom = useCallback(
    async (room) => {
      try {
        const d = await api.meters.room(activePeriod, room)
        setPatched((p) => ({ ...p, [room]: { electricity: d.electricity, water: d.water, status: d.status } }))
      } catch {
        // The row keeps what it shows; the next reload brings the reading.
      }
      invalidate('meters')
    },
    [activePeriod],
  )

  const moveTo = useCallback((i) => {
    const input = tableArea.current?.querySelector(`[data-row="${i}"] input[data-field="e"]`)
    input?.focus()
  }, [])

  // A wheel over the reading being typed scrolls the table instead of changing the number.
  useEffect(() => {
    const el = tableArea.current
    if (!el) return undefined
    const onWheel = (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'number' && document.activeElement === e.target) e.target.blur()
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const importCsv = useMutation(
    (file) => {
      const data = new FormData()
      data.set('file', file)
      return api.meters.import(activePeriod, data)
    },
    {
      invalidates: ['meters', 'meter-rows'],
      onSuccess: (res) =>
        notify({
          type: 'info',
          title: 'Readings uploaded',
          message: res?.skipped
            ? t('{n} readings saved. {s} rooms left blank wait for their reading.', { n: formatNumber(res?.imported ?? 0), s: formatNumber(res.skipped) })
            : t('{n} readings saved.', { n: formatNumber(res?.imported ?? 0) }),
        }),
      onError: (e) => notifyError(e, 'Upload failed'),
    },
  )
  const template = useMutation(() => api.meters.template(activePeriod, period?.label?.replace('/', '-')), {
    onError: (e) => notifyError(e, 'Download failed'),
  })
  const close = useMutation(() => api.meters.close(activePeriod), {
    invalidates: ['meters', 'meter-rows', 'payments'],
    onSuccess: (res) => {
      setClosing(false)
      notify({ title: 'Utility invoices issued', message: t('{n} rooms billed.', { n: formatNumber(res?.invoicesIssued ?? s?.entered) }) })
    },
    onError: (e) => notifyError(e, 'Could not close the period'),
  })

  const filterBy = (next) => {
    setStatus(next)
    setPage(1)
  }
  const toggleGuide = (hidden) => {
    rememberGuide(hidden)
    setGuideHidden(hidden)
  }
  // Below 1440 px the outline buttons show their icon only; the tooltip names them.
  const narrowLabel = 'max-[1439px]:sr-only'

  return (
    <div className="flex min-h-[420px] flex-1 flex-col gap-3">
      <PageHeader
        compact
        title="Meter readings"
        tip="Monthly readings per room. Every check-in, check-out, room change and swap also cuts a reading."
        actions={
          <>
            {!scopeBlock && blocks.length > 1 && (
              <Select
                wrapperClassName="w-32"
                aria-label={t('Block')}
                value={block}
                onChange={(e) => {
                  setBlock(e.target.value)
                  setPeriodId(null)
                  setStatus('')
                  setPage(1)
                }}
                options={blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))}
              />
            )}
            <Select
              wrapperClassName="w-40"
              aria-label={t('Period')}
              value={activePeriod ?? ''}
              onChange={(e) => {
                setPeriodId(e.target.value)
                setStatus('')
                setPage(1)
              }}
              options={(periods.data?.items ?? []).map((p) => ({ value: p.id, label: t('Period: {label}', { label: tr(p.label) }) }))}
              disabled={!periods.data?.items?.length}
            />
            <Select
              wrapperClassName="w-48"
              aria-label={t('Status')}
              value={status}
              onChange={(e) => filterBy(e.target.value)}
              options={[{ value: '', label: 'Status: All' }, ...Object.keys(statusTone).map((v) => ({ value: v, label: t('Status: {s}', { s: t(v) }) }))]}
            />
            <Button icon={Download} iconSize={16} tip="Download template" className="max-[1439px]:px-2" onClick={() => template.run()} disabled={!activePeriod || template.pending}>
              <span className={narrowLabel}>{t('Download template')}</span>
            </Button>
            {guideHidden && (
              <IconButton icon={CircleHelp} variant="outline" iconSize={16} aria-label={t('Show the guide')} onClick={() => toggleGuide(false)} />
            )}
            <Button icon={Upload} iconSize={16} tip="Upload filled file" className="max-[1439px]:px-2" onClick={() => fileInput.current?.click()} disabled={closed || !activePeriod || importCsv.pending}>
              <span className={narrowLabel}>{t('Upload filled file')}</span>
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importCsv.run(file)
                e.target.value = ''
              }}
            />
            <Button tip="Close the reading period and bill utility to the residents. Readings can no longer change afterwards." variant="primary" onClick={() => setClosing(true)} disabled={closed || !activePeriod}>
              {closed ? t('Period closed') : t('Close period and bill')}
            </Button>
          </>
        }
      />

      {!closed && activePeriod && !guideHidden && <GuideBanner onDismiss={() => toggleGuide(true)} />}

      {closed && (
        <Alert type="success" title={t('{period} is closed', { period: tr(period.label) })} className="shrink-0 py-2">
          {t('Utility invoices were issued for {n} rooms. {missing} rooms are billed when their readings are entered.', { n: formatNumber(s?.entered), missing: formatNumber(s?.missing) })}
        </Alert>
      )}

      <SummaryStrip block={block} s={s} status={status} onMissing={() => filterBy(status === 'Missing' ? '' : 'Missing')} />

      <div ref={tableArea} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <Table fill bare>
          <THead>
            <tr>
              <Th className="w-40">Room</Th>
              <Th className="w-20" align="center">
                Residents
              </Th>
              <Th>Electricity (kWh)</Th>
              <Th>Water (m³)</Th>
              <Th className="w-52">Status</Th>
              <Th className="w-12 !px-1">
                <span className="sr-only">{t('Details')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus
              query={activePeriod ? rows : periods}
              colSpan={6}
              rows={activePeriod ? items : periods.data?.items}
              emptyIcon={Gauge}
              emptyTitle={activePeriod ? 'No rooms match these filters' : 'No billing period yet'}
            />
            {items.map((r, i) => (
              <MeterRow key={`${activePeriod}-${r.room}`} r={r} index={i} periodId={activePeriod} closed={closed} onSaved={refreshRoom} onOpen={setOpenRoom} onMove={moveTo} />
            ))}
          </TBody>
        </Table>
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line px-4 py-2">
          <p className="min-w-0 truncate text-sm text-fg-tertiary max-xl:hidden">
            {closed ? '' : t('Tab: water · Enter: next row · Shift+Enter: previous row · Esc: undo the row. A row saves when you leave it.')}
          </p>
          <Pagination
            className="ml-auto"
            sizes={[20, 50, 100]}
            noun={['room', 'rooms']}
            total={rows.data?.total ?? 0}
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

      {openRoom && activePeriod && (
        <RoomDrawer
          key={`${activePeriod}-${openRoom}`}
          periodId={activePeriod}
          periodLabel={period?.label}
          room={openRoom}
          closed={closed}
          onClose={() => setOpenRoom(null)}
          onChanged={refreshRoom}
        />
      )}

      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title={t('Close {period} and bill', { period: period?.label ? tr(period.label) : t('this period') })}
        footer={
          <>
            <Button onClick={() => setClosing(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => close.run()} disabled={close.pending}>
              Close and issue invoices
            </Button>
          </>
        }
      >
        <p className="text-base text-fg-secondary">
          {t('Utility invoices are issued now for the {n} rooms with readings. Students get an in-app notification and an email.', { n: formatNumber(s?.entered) })}
          {period?.dueAt ? ` ${t('Payment is due by {date}.', { date: formatDate(period.dueAt) })}` : ''}
        </p>
        {s?.missing > 0 && (
          <Alert type="warning" title={t('{n} rooms have no reading', { n: formatNumber(s.missing) })}>
            Their invoices are held and issued as soon as the readings are entered.
          </Alert>
        )}
      </Modal>
    </div>
  )
}
