import { useEffect, useRef, useState } from 'react'
import { Gauge, Upload } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card, Divider } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-UTL-10 Meter Readings (Figma 95:3302)
// GET /meter-periods?block → { items: [{ id, label, closed }] }
// GET /meter-periods/:id/readings?block&status&page&pageSize → { period: { id, label, closed, dueAt },
//   summary: { roomsDue, entered, missing, segments }, items: [{ room, roomTypeName, roomClassName, residents,
//   electricity: { previous, current, cut: { date, value } | null }, water: { … }, status }], total }
// GET /meter-periods/:id/readings/:room → { …item, priceKwh, priceM3, roundingNote,
//   segments: [{ from, to, residents, kwh, m3, electricityCost, waterCost }], shares: [{ label, amount }] }
// PUT …/readings/:room { electricity, water } · POST …/readings/:room/confirm · POST /meter-periods/:id/import (CSV) · POST /meter-periods/:id/close

const statusTone = { Entered: 'success', Confirmed: 'info', Missing: 'warning', 'Check value': 'error' }
const toNumber = (v) => Number(String(v ?? '').replace(/[^\d]/g, ''))

function Line({ label, children, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{tr(label)}</dt>
      <dd className={strong ? 'font-medium text-fg tabular' : 'text-fg tabular'}>{children}</dd>
    </div>
  )
}

function reading(m) {
  if (!m) return ['—', '']
  const primary = `${formatNumber(m.previous)} → ${m.current == null ? '—' : formatNumber(m.current)}`
  const secondary = m.current == null ? t('Enter current reading') : m.current < m.previous ? t('Lower than previous') : m.cut ? t('Segment cut {date} at {value}', { date: formatDate(m.cut.date), value: formatNumber(m.cut.value) }) : t('No segment')
  return [primary, secondary]
}

function SplitPreview({ periodId, periodLabel, room, closed }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['meters', 'room', periodId, room], ({ signal }) => api.meters.room(periodId, room, { signal }), { keepPrevious: false })
  const r = query.data
  const needsInput = r && (r.status === 'Missing' || r.status === 'Check value')
  const [editing, setEditing] = useState(false)
  const [e, setE] = useState('')
  const [w, setW] = useState('')
  useEffect(() => {
    if (!r) return
    setEditing(r.status === 'Missing' || r.status === 'Check value')
    setE(r.electricity?.current == null ? '' : String(r.electricity.current))
    setW(r.water?.current == null ? '' : String(r.water.current))
  }, [r])

  const save = useMutation(() => api.meters.save(periodId, room, { electricity: toNumber(e), water: toNumber(w) }), {
    invalidates: ['meters'],
    onSuccess: () => notify({ title: t('Reading saved for {room}', { room }), message: 'The split preview is updated.' }),
    onError: (err) => notifyError(err, 'Could not save the reading'),
  })
  const confirm = useMutation(() => api.meters.confirm(periodId, room), {
    invalidates: ['meters'],
    onSuccess: () => notify({ title: t('{room} confirmed', { room }), message: 'Shares are locked for this period.' }),
    onError: (err) => notifyError(err, 'Could not confirm'),
  })

  const eNum = toNumber(e)
  const wNum = toNumber(w)
  const invalid = !e || !w || (r && (eNum < r.electricity.previous || wNum < r.water.previous))

  return (
    <Card className="flex min-h-0 w-95 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">
          {room}
          {periodLabel ? ` · ${periodLabel}` : ''}
        </h2>
        <p className="text-sm text-fg-secondary">{t('Shared meter, split equally among residents of each segment')}</p>
      </div>
      <QueryState query={query} compact>
        {(d) => (
          <>
            {(d.priceKwh || d.priceM3) && (
              <p className="text-sm text-fg-tertiary">
                {t('Price {kwh} VND/kWh · {m3} VND/m³ (Admin › Utility).', { kwh: formatNumber(d.priceKwh), m3: formatNumber(d.priceM3) })} {tr(d.roundingNote)}
              </p>
            )}
            {editing ? (
              <>
                <div className="flex gap-3">
                  <Field label="Electricity (kWh)" helper={t('Previous {n}', { n: formatNumber(d.electricity.previous) })} className="flex-1" error={e && eNum < d.electricity.previous ? 'Lower than previous' : undefined}>
                    {(id) => <Input id={id} value={e} onChange={(ev) => setE(ev.target.value)} inputMode="numeric" disabled={closed} />}
                  </Field>
                  <Field label="Water (m³)" helper={t('Previous {n}', { n: formatNumber(d.water.previous) })} className="flex-1" error={w && wNum < d.water.previous ? 'Lower than previous' : undefined}>
                    {(id) => <Input id={id} value={w} onChange={(ev) => setW(ev.target.value)} inputMode="numeric" disabled={closed} />}
                  </Field>
                </div>
                {d.status === 'Check value' && (
                  <Alert type="error" title="Reading is lower than last month">
                    Re-read the meter. If it was replaced, ask Admin to reset the baseline.
                  </Alert>
                )}
                <div className="flex justify-end gap-2">
                  {!needsInput && <Button onClick={() => setEditing(false)}>Cancel</Button>}
                  <Button variant="primary" disabled={invalid || closed || save.pending} onClick={() => save.run()}>
                    Save reading
                  </Button>
                </div>
              </>
            ) : (
              <>
                {(d.segments ?? []).map((s, i) => (
                  <div key={`${s.from}-${s.to}`} className="flex flex-col gap-3">
                    {i > 0 && <Divider />}
                    <p className="text-base font-medium text-fg">
                      {d.segments.length > 1 ? `${t('Segment {n}', { n: i + 1 })} · ` : ''}
                      {formatDate(s.from)} – {formatDate(s.to)} · {t('{n} residents', { n: s.residents })}
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
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setEditing(true)} disabled={closed}>
                    Edit reading
                  </Button>
                  <Button variant="primary" onClick={() => confirm.run()} disabled={closed || d.status === 'Confirmed' || confirm.pending}>
                    {d.status === 'Confirmed' ? t('Confirmed') : t('Confirm room')}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </QueryState>
    </Card>
  )
}

export default function MeterReadings() {
  const { block: scopeBlock, blocks } = useSession()
  const { notify, notifyError } = useToast()
  const fileInput = useRef(null)
  const [block, setBlock] = useState(scopeBlock ?? blocks[0] ?? '')
  useEffect(() => {
    if (scopeBlock) setBlock(scopeBlock)
    else if (!block && blocks.length) setBlock(blocks[0])
  }, [scopeBlock, blocks, block])
  const periods = useQuery(['meters', 'periods', block], ({ signal }) => api.meters.periods({ block }, { signal }), { enabled: Boolean(block) })
  const [periodId, setPeriodId] = useState(null)
  const activePeriod = periodId ?? periods.data?.items?.[0]?.id
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [closing, setClosing] = useState(false)

  const filters = { block, status, page, pageSize }
  const query = useQuery(['meters', 'list', activePeriod, filters], ({ signal }) => api.meters.list(activePeriod, filters, { signal }), { enabled: Boolean(activePeriod) })
  const items = query.data?.items ?? []
  const period = query.data?.period
  const s = query.data?.summary
  const closed = Boolean(period?.closed)
  const selected = items.find((r) => r.room === selectedRoom) ?? items[0]

  const importCsv = useMutation(
    (file) => {
      const data = new FormData()
      data.set('file', file)
      return api.meters.import(activePeriod, data)
    },
    {
      invalidates: ['meters'],
      onSuccess: (res) => notify({ type: 'info', title: 'CSV imported', message: t('{n} readings added.', { n: formatNumber(res?.imported ?? 0) }) }),
      onError: (e) => notifyError(e, 'Import failed'),
    },
  )
  const close = useMutation(() => api.meters.close(activePeriod), {
    invalidates: ['meters', 'payments'],
    onSuccess: (res) => {
      setClosing(false)
      notify({ title: 'Utility Invoices issued', message: t('{n} Rooms billed.', { n: formatNumber(res?.invoicesIssued ?? s?.entered) }) })
    },
    onError: (e) => notifyError(e, 'Could not close the period'),
  })

  return (
    <>
      <PageHeader
        title="Meter readings"
        description="Monthly readings per Room. Every check-in, check-out, room change and swap also cuts a reading."
        actions={
          <>
            <Button icon={Upload} onClick={() => fileInput.current?.click()} disabled={closed || !activePeriod || importCsv.pending}>
              Import CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importCsv.run(file)
                e.target.value = ''
              }}
            />
            <Button variant="primary" onClick={() => setClosing(true)} disabled={closed || !activePeriod}>
              {closed ? t('Period closed') : t('Close period and bill')}
            </Button>
          </>
        }
      />

      <div className="flex shrink-0 items-center gap-3">
        {!scopeBlock && blocks.length > 1 && (
          <Select
            wrapperClassName="w-40"
            aria-label={t('Block')}
            value={block}
            onChange={(e) => {
              setBlock(e.target.value)
              setPeriodId(null)
              setPage(1)
            }}
            options={blocks.map((b) => ({ value: b, label: t('Block {code}', { code: b }) }))}
          />
        )}
        <Select
          wrapperClassName="w-48"
          aria-label={t('Period')}
          value={activePeriod ?? ''}
          onChange={(e) => {
            setPeriodId(e.target.value)
            setPage(1)
          }}
          options={(periods.data?.items ?? []).map((p) => ({ value: p.id, label: t('Period: {label}', { label: tr(p.label) }) }))}
          disabled={!periods.data?.items?.length}
        />
        <Select
          wrapperClassName="w-48"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Status: All' }, ...Object.keys(statusTone).map((v) => ({ value: v, label: t('Status: {s}', { s: t(v) }) }))]}
        />
      </div>

      {closed && (
        <Alert type="success" title={t('{period} is closed', { period: tr(period.label) })} className="shrink-0">
          {t('Utility Invoices were issued for {n} Rooms. {missing} Rooms are billed when their readings are entered.', { n: formatNumber(s?.entered), missing: formatNumber(s?.missing) })}
        </Alert>
      )}

      <div className="flex shrink-0 gap-4">
        <KpiTile label="Rooms due this period" value={formatNumber(s?.roomsDue)} note={block ? t('Block {code}', { code: block }) : null} noteTone="tertiary" />
        <KpiTile label="Readings entered" value={formatNumber(s?.entered)} note={s?.roomsDue ? t('{p} complete', { p: formatPercent(s.entered / s.roomsDue, 0) }) : null} noteTone="tertiary" />
        <KpiTile label="Missing" value={formatNumber(s?.missing)} note="Bills held until entered" noteTone="tertiary" />
        <KpiTile label="Segments this month" value={formatNumber(s?.segments)} note="Check-in, check-out, room change" noteTone="tertiary" />
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-32">Room</Th>
                <Th className="w-22">Residents</Th>
                <Th>Electricity (kWh)</Th>
                <Th>Water (m³)</Th>
                <Th className="w-30">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={activePeriod ? query : periods} colSpan={5} rows={activePeriod ? items : periods.data?.items} emptyIcon={Gauge} emptyTitle={activePeriod ? 'No Rooms match these filters' : 'No billing period yet'} />
              {items.map((r) => {
                const [ep, es] = reading(r.electricity)
                const [wp, ws] = reading(r.water)
                return (
                  <Tr key={r.room} selected={r.room === selected?.room} onClick={() => setSelectedRoom(r.room)} className="[&>td]:h-14.5">
                    <Td>
                      <TwoLine primary={r.room} secondary={`${tr(r.roomTypeName)} ${tr(r.roomClassName)}`} />
                    </Td>
                    <Td>{r.residents}</Td>
                    <Td>
                      <TwoLine primary={ep} secondary={es} />
                    </Td>
                    <Td>
                      <TwoLine primary={wp} secondary={ws} />
                    </Td>
                    <Td>
                      <Tag tone={statusTone[r.status] ?? 'neutral'}>{r.status}</Tag>
                    </Td>
                  </Tr>
                )
              })}
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
          <SplitPreview key={`${activePeriod}-${selected.room}`} periodId={activePeriod} periodLabel={period?.label} room={selected.room} closed={closed} />
        ) : (
          <Card className="flex w-95 shrink-0 flex-col">
            <EmptyBlock icon={Gauge} title="Select a Room" />
          </Card>
        )}
      </div>

      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title={t('Close {period} and bill', { period: period?.label ? tr(period.label) : t('this period') })}
        footer={
          <>
            <Button onClick={() => setClosing(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => close.run()} disabled={close.pending}>
              Close and issue Invoices
            </Button>
          </>
        }
      >
        <p className="text-base text-fg-secondary">
          {t('Utility Invoices are issued now for the {n} Rooms with readings. Students get an in-app notification and an email.', { n: formatNumber(s?.entered) })}
          {period?.dueAt ? ` ${t('Payment is due by {date}.', { date: formatDate(period.dueAt) })}` : ''}
        </p>
        {s?.missing > 0 && (
          <Alert type="warning" title={t('{n} Rooms have no reading', { n: formatNumber(s.missing) })}>
            Their Invoices are held and issued as soon as the readings are entered.
          </Alert>
        )}
      </Modal>
    </>
  )
}
