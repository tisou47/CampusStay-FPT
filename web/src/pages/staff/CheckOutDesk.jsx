import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Download, FileText, Gauge, LogOut, Receipt, Save, Upload, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName, conditionTone, typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { parseReading } from '@/lib/numbers'
import { DetailFacts } from '@/components/ui/DetailFacts'
import { DeskModeSwitch } from './CheckInDesk'
import { FurnitureConditions } from './check-out/FurnitureConditions'
import { t, tr } from '@/i18n'

// SCR-REQ-12 Check-out Desk (Figma 95:3876)
// GET /check-out?termId&block&reason&q&page&pageSize → { date, pendingCount, reasons, checkOutBy, overdueCount,
//   items: [{ allocationId, studentCode, name, room, bed, roomTypeName, roomClassName, reason, status, checkedOutAt,
//   overdue }], total }
// GET /check-out/:allocationId → { …row, reading: { electricity, water }, settlement: { held, periodLabel, share, unpaid, damage, refund },
//   refundStatus, furniture: [{ itemId, assetCode, type, typeVi, amount, note }] }
// POST /check-out/:allocationId { electricity, water, conditionGood, keyReturned, damages: [{ itemId, amount, note }], draft }
//   → { refund, refundStatus } — the damage charge is the sum of the items' damages (spec §6.16)

const tones = { Pending: 'warning', Draft: 'info', 'Checked out': 'success', 'Pending check-out': 'warning', 'Settlement due': 'error' }

const statusSegments = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Overdue', label: 'Overdue' },
  { key: 'Checked out', label: 'Checked out' },
]

function Row({ label, children, strong, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="text-fg-secondary">{t(label)}</dt>
      <dd className={cx('tabular', strong ? 'font-semibold' : 'font-medium', tone ?? 'text-fg')}>{children}</dd>
    </div>
  )
}

// Final meter readings Room by Room: the desk fills them in before the leavers come (typed here or from the XLSX
// template); each Room's reading goes to its leavers' check-out drafts, so each check-out opens with it.
function RoomReadingsModal({ open, onClose, scope }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['check-out', 'readings', scope], ({ signal }) => api.desk.roomReadings(scope, { signal }), { enabled: open })
  const [values, setValues] = useState({})
  const [problems, setProblems] = useState([])
  const file = useRef(null)
  useEffect(() => {
    if (!query.data) return
    setValues(Object.fromEntries(query.data.items.map((r) => [r.room, { electricity: r.electricity != null ? String(r.electricity) : '', water: r.water != null ? String(r.water) : '' }])))
  }, [query.data])
  const set = (room, patch) => setValues((all) => ({ ...all, [room]: { ...all[room], ...patch } }))
  const badReading = Object.values(values).some((v) => Number.isNaN(parseReading(v?.electricity)) || Number.isNaN(parseReading(v?.water)))
  const changed = (query.data?.items ?? []).filter((r) => {
    const v = values[r.room] ?? {}
    return (v.electricity ?? '') !== (r.electricity != null ? String(r.electricity) : '') || (v.water ?? '') !== (r.water != null ? String(r.water) : '')
  })
  const done = (res) => {
    setProblems(res.problems ?? [])
    notify({
      type: res.problems?.length ? 'warning' : 'success',
      title: t('Readings saved for {n} rooms', { n: formatNumber(res.rooms) }),
      message: res.problems?.length ? t('{n} lines were not saved: see the list.', { n: formatNumber(res.problems.length) }) : t('{n} leavers will see them at check-out.', { n: formatNumber(res.students) }),
    })
  }
  const save = useMutation(
    () =>
      api.desk.saveRoomReadings(scope, {
        readings: changed
          .map((r) => ({ room: r.room, electricity: values[r.room].electricity.trim(), water: values[r.room].water.trim() }))
          .filter((r) => r.electricity !== '' || r.water !== '')
          .map((r) => ({ room: r.room, electricity: parseReading(r.electricity), water: parseReading(r.water) })),
      }),
    { invalidates: ['check-out'], onSuccess: done, onError: (e) => notifyError(e, 'Could not save the readings') },
  )
  const upload = useMutation(
    (picked) => {
      const form = new FormData()
      form.append('file', picked)
      return api.desk.uploadRoomReadings(scope, form)
    },
    { invalidates: ['check-out'], onSuccess: done, onError: (e) => notifyError(e, 'Could not read the file') },
  )
  const template = useMutation(() => api.desk.roomReadingsTemplate(scope), { onError: (e) => notifyError(e, 'Download failed') })
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title="Final meter readings by room"
      description="Fill in each room once: the reading goes to the check-out of every leaver in that room. Rooms left empty are filled in later."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Save} disabled={!changed.length || badReading || save.pending} onClick={() => save.run()} title={badReading ? t('Enter readings as numbers, e.g. 1234,5') : undefined}>
            {t('Save {n} rooms', { n: formatNumber(changed.length) })}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Download} disabled={template.pending} onClick={() => template.run()}>
          Download template
        </Button>
        <Button icon={Upload} disabled={upload.pending} onClick={() => file.current?.click()}>
          Upload filled template
        </Button>
        <input
          ref={file}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ''
            if (picked) upload.run(picked)
          }}
        />
      </div>
      {problems.length > 0 && (
        <Alert type="warning" title={t('{n} lines were not saved', { n: formatNumber(problems.length) })}>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {problems.map((p, i) => (
              <li key={i}>
                {p.line ? t('Line {n}', { n: p.line }) + ' · ' : ''}
                {p.room} · {tr(p.message)}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="max-h-[55vh] overflow-y-auto">
        <Table bare>
          <THead>
            <tr>
              <Th>Room</Th>
              <Th className="w-24">Leavers</Th>
              <Th className="w-56">Electricity (kWh)</Th>
              <Th className="w-56">Water (m³)</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={4} emptyIcon={LogOut} emptyTitle="No room has leavers waiting" />
            {(query.data?.items ?? []).map((r) => (
              <Tr key={r.room}>
                <Td className="font-medium">{r.room}</Td>
                <Td>{formatNumber(r.students)}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    <Input aria-label={t('Electricity of {room}', { room: r.room })} value={values[r.room]?.electricity ?? ''} onChange={(e) => set(r.room, { electricity: e.target.value })} inputMode="decimal" className="text-right tabular" />
                    {r.previousReading && (
                      <span className="text-xs text-fg-tertiary tabular">
                        {t('Previous reading: {value} kWh (recorded {date})', {
                          value: formatNumber(r.previousReading.electricity),
                          date: formatDate(r.previousReading.date),
                        })}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    <Input aria-label={t('Water of {room}', { room: r.room })} value={values[r.room]?.water ?? ''} onChange={(e) => set(r.room, { water: e.target.value })} inputMode="decimal" className="text-right tabular" />
                    {r.previousReading && (
                      <span className="text-xs text-fg-tertiary tabular">
                        {t('Previous reading: {value} m³ (recorded {date})', {
                          value: formatNumber(r.previousReading.water),
                          date: formatDate(r.previousReading.date),
                        })}
                      </span>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Modal>
  )
}

/** One student's check-out; {@code embedded}: inside another page's side sheet (Term transition › Turnover). */
export function CheckOutPanel({ d, embedded = false }) {
  const { notify, notifyError } = useToast()
  const done = d.status === 'Checked out'
  const [step, setStep] = useState(() => (done ? 3 : 1))
  // Raw text: a reading keeps its decimals ("1360,5"); formatNumber would add thousands dots (WEB-OPS-01).
  const [electricity, setElectricity] = useState(d.reading?.electricity != null ? String(d.reading.electricity) : '')
  const [water, setWater] = useState(d.reading?.water != null ? String(d.reading.water) : '')
  const eValue = parseReading(electricity)
  const wValue = parseReading(water)
  const readingsInvalid = Number.isNaN(eValue) || Number.isNaN(wValue)
  const [fresh, setFresh] = useState(null)
  // Mutually exclusive condition: 'good' | 'damaged' | '' (empty by default when pending)
  const [condition, setCondition] = useState(() => {
    if (done) return (d.settlement?.damage ?? 0) > 0 || (d.furniture ?? []).some((f) => f.amount > 0) ? 'damaged' : 'good'
    return (d.furniture ?? []).some((f) => f.amount > 0) ? 'damaged' : ''
  })
  const [liveFurnitureTotal, setLiveFurnitureTotal] = useState(0)
  const [furnitureSummary, setFurnitureSummary] = useState(null)
  const [showSummary, setShowSummary] = useState(false)
  const [showHandover, setShowHandover] = useState(false)
  // Furniture recorded by condition (V78): when saved, its total is the damage charge calculated from base price & condition %.
  const furnitureQuery = useQuery(['check-out-furniture', d.allocationId], ({ signal }) => api.checkOutFurniture.view(d.allocationId, { signal }))
  const fData = furnitureQuery.data
  const byCondition = Boolean(fData?.saved)
  useEffect(() => {
    setElectricity(d.reading?.electricity != null ? String(d.reading.electricity) : '')
    setWater(d.reading?.water != null ? String(d.reading.water) : '')
  }, [d.allocationId, d.reading?.electricity, d.reading?.water])
  useEffect(() => {
    if (!fData) return
    if (fData.saved && !condition) {
      const hasIssue = (fData.items ?? []).some((i) => i.atCheckOut && i.atCheckOut !== 'Good') || fData.total > 0
      setCondition(hasIssue ? 'damaged' : 'good')
    }
  }, [fData, condition])

  // The summary reads the settlement of the readings now on screen (saved as a draft just before), WEB-OPS-02.
  const s = (showSummary && fresh) || d.settlement || { held: 0, share: 0, unpaid: 0, damage: 0 }
  const damageAmount = done ? s.damage ?? 0 : condition === 'good' ? 0 : liveFurnitureTotal || (byCondition ? fData.total : 0)
  const refund = done ? s.refund : (s.held ?? 0) - (s.share ?? 0) - (s.unpaid ?? 0) - damageAmount
  const damageLines = done
    ? (fData?.items ?? [])
        .filter((i) => i.amount > 0 && i.review !== 'Dropped')
        .map((i) => ({
          key: i.itemId,
          name: typeName(i),
          assetCode: i.assetCode,
          condition: i.atCheckOut ?? 'Damaged',
          percent: i.percent ?? 0,
          personal: Boolean(i.personal),
          split: i.sharedWith ?? 1,
          fullAmount: i.fullAmount ?? i.amount,
          amount: i.amount,
        }))
    : condition === 'good'
      ? []
      : (furnitureSummary?.lines ?? []).map((l) => ({
          key: l.item.itemId,
          name: typeName(l.item),
          assetCode: l.item.assetCode,
          condition: l.answer.condition,
          percent: l.deltaPct,
          personal: Boolean(l.item.personal),
          split: l.split,
          fullAmount: l.fullAmount,
          amount: l.amount,
        }))
  const hasSharedSplit = damageLines.some((l) => l.split > 1)

  // Confirm first saves the readings on screen as a draft and reads the settlement back, so the summary read aloud
  // matches what the check-out will settle (WEB-OPS-02).
  const review = useMutation(
    async () => {
      if (condition && furnitureSummary?.dirty) {
        await api.checkOutFurniture.record(d.allocationId, furnitureSummary.payload)
      }
      await api.desk.checkOut(d.allocationId, { electricity: eValue, water: wValue, conditionGood: condition === 'good', draft: true })
      return api.desk.checkOutDetail(d.allocationId)
    },
    {
      // No invalidation here: a refetch would show the draft status and remount this panel, closing the summary.
      // The list refreshes when the check-out is completed (submit).
      onSuccess: (detail) => {
        setFresh(detail?.settlement ?? null)
        setShowSummary(true)
      },
      onError: (e) => notifyError(e, 'Could not save the check-out'),
    },
  )

  const submit = useMutation(
    async (draft) => {
      if (!done && condition && furnitureSummary?.dirty) {
        await api.checkOutFurniture.record(d.allocationId, furnitureSummary.payload)
      }
      return api.desk.checkOut(d.allocationId, {
        electricity: eValue,
        water: wValue,
        conditionGood: condition === 'good',
        draft,
      })
    },
    {
      invalidates: ['check-out', 'check-out-furniture', 'dashboard', 'refunds', 'turnover'],
      onSuccess: (res, draft) => {
        if (draft) {
          notify({ type: 'info', title: 'Draft saved', message: t('Readings and condition for {name} are saved.', { name: d.name }) })
          return
        }
        setShowSummary(false)
        const r = res?.refund ?? refund
        notify({ title: t('{name} checked out', { name: d.name }), message: r >= 0 ? t('Refund of {amount} sent to a manager for approval.', { amount: formatVnd(r) }) : t('{amount} was invoiced to the student.', { amount: formatVnd(-r) }) })
      },
      onError: (e) => notifyError(e, 'Could not save the check-out'),
    },
  )

  return (
    <Card
      padding="none"
      className={cx('flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden', embedded && 'w-full rounded-none border-0')}
      aria-label={t('Check-out {name}', { name: d.name })}
    >
      {/* 1. PINNED HEADER: Student Identity & Room Badge */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-line bg-surface px-5 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-h3 font-semibold text-fg">{d.name}</h2>
            <span className="font-mono text-xs text-fg-tertiary">{d.studentCode}</span>
          </div>
          <StatusTag status={d.status} tone={tones[d.status]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-fg-secondary">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-brand-subtle px-2 py-0.5 font-semibold text-fg-brand">
              {t('{room} · Bed {bed}', { room: d.room, bed: d.bed })}
            </span>
            <span>·</span>
            <span>
              {tr(d.roomTypeName)} {tr(d.roomClassName)}
            </span>
            <span>·</span>
            <span className="font-medium text-fg">{tr(d.reason)}</span>
            <span>·</span>
            <span className="rounded-md bg-subtle px-2 py-0.5 font-medium text-fg tabular">
              {t('Deposit held: {amount}', { amount: formatVnd(s.held) })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {d.handoverReport ? (
              <Button size="sm" icon={FileText} onClick={() => setShowHandover(true)}>
                {t('View the move-in report (Report Final)')}
              </Button>
            ) : (
              <span className="rounded-md bg-subtle px-2 py-1 text-[11px] text-fg-tertiary">
                {t('No Report Final')}
              </span>
            )}
          </div>
        </div>
        {d.handoverReport && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle/60 px-2.5 py-1.5 text-[11px] text-fg-secondary">
            <span className="font-semibold text-fg">Report Final ({d.handoverReport.id})</span>
            {d.handoverReport.finalizedAt && (
              <>
                <span>·</span>
                <span>{t('Finalized: {date}', { date: formatDateTime(d.handoverReport.finalizedAt) })}</span>
              </>
            )}
            {d.handoverReport.electricity != null && d.handoverReport.water != null && (
              <>
                <span>·</span>
                <span className="font-medium text-fg tabular">
                  {t('Electricity {kwh} kWh · Water {m3} m³', { kwh: formatNumber(d.handoverReport.electricity), m3: formatNumber(d.handoverReport.water) })}
                </span>
              </>
            )}
            {d.handoverReport.staffName && (
              <>
                <span>·</span>
                <span>{t('Approved by Staff: {name}', { name: d.handoverReport.staffName })}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Stepper bar: 1. Final meter reading · 2. Room & furniture · 3. Settlement & confirm */}
      <nav
        aria-label={t('Check-out steps')}
        className="grid shrink-0 grid-cols-3 divide-x divide-line border-b border-line bg-subtle/40"
      >
        {[
          {
            n: 1,
            icon: Zap,
            label: '1. Final meter reading',
            sub: electricity || water ? `${electricity || '—'} kWh · ${water || '—'} m³` : t('Enter readings'),
          },
          {
            n: 2,
            icon: ClipboardCheck,
            label: '2. Room & furniture',
            sub: !condition
              ? t('Not checked')
              : condition === 'good'
                ? `${t('Good condition')} · ${formatVnd(0)}`
                : `− ${formatVnd(damageAmount)}`,
          },
          {
            n: 3,
            icon: Receipt,
            label: '3. Settlement & confirm',
            sub: refund >= 0 ? t('Refund {amount}', { amount: formatVnd(refund) }) : t('Owes {amount}', { amount: formatVnd(-refund) }),
          },
        ].map((item) => {
          const active = step === item.n
          const Icon = item.icon
          return (
            <button
              key={item.n}
              type="button"
              onClick={() => setStep(item.n)}
              className={cx(
                'flex min-w-0 flex-col gap-0.5 border-b-2 px-3 py-2.5 text-left transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus',
                active
                  ? 'border-b-primary bg-surface'
                  : 'border-b-transparent text-fg-secondary hover:bg-surface/60 hover:text-fg',
              )}
            >
              <span className={cx('flex items-center gap-1.5 truncate text-xs font-semibold', active ? 'text-fg-brand' : 'text-fg')}>
                <Icon size={13} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{t(item.label)}</span>
              </span>
              <span className="truncate text-[11px] text-fg-secondary tabular">{item.sub}</span>
            </button>
          )
        })}
      </nav>

      {/* 2. SCROLLABLE BODY: Active Step Content */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {/* Step 1: Final Meter Reading */}
        {step === 1 && (
          <>
            <DetailFacts
              facts={[
                { label: 'Room', value: t('{room} · Bed {bed}', { room: d.room, bed: d.bed }) },
                { label: 'Room type', value: [tr(d.roomTypeName), tr(d.roomClassName)].filter(Boolean).join(' · ') },
                { label: 'Reason', value: tr(d.reason) },
                { label: 'Deposit held', value: d.settlement?.held != null ? formatVnd(d.settlement.held) : null },
                {
                  label: 'Opening meters',
                  value:
                    d.handoverReport?.electricity != null && d.handoverReport?.water != null
                      ? `${formatNumber(d.handoverReport.electricity)} kWh · ${formatNumber(d.handoverReport.water)} m³`
                      : null,
                },
                { label: 'Furniture at check-in', value: d.handoverReport?.items ? t('{n} items', { n: d.handoverReport.items.length }) : null },
                { label: 'Checked out', value: d.checkedOutAt ? formatDateTime(d.checkedOutAt) : null },
              ]}
            />

            <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2">
                <Zap size={15} aria-hidden="true" className="text-fg-brand" />
                <p className="text-sm font-semibold text-fg">{t('1. Final meter reading')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Electricity (kWh)"
                  error={Number.isNaN(eValue) ? t('Enter a number, e.g. 1360,5') : undefined}
                  helper={
                    d.previousReading
                      ? t('Previous reading: {value} kWh (recorded {date})', {
                          value: formatNumber(d.previousReading.electricity),
                          date: formatDate(d.previousReading.date),
                        })
                      : undefined
                  }
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={electricity}
                      onChange={(e) => setElectricity(e.target.value)}
                      disabled={done}
                      inputMode="decimal"
                      className="font-semibold tabular"
                    />
                  )}
                </Field>
                <Field
                  label="Water (m³)"
                  error={Number.isNaN(wValue) ? t('Enter a number, e.g. 1360,5') : undefined}
                  helper={
                    d.previousReading
                      ? t('Previous reading: {value} m³ (recorded {date})', {
                          value: formatNumber(d.previousReading.water),
                          date: formatDate(d.previousReading.date),
                        })
                      : undefined
                  }
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={water}
                      onChange={(e) => setWater(e.target.value)}
                      disabled={done}
                      inputMode="decimal"
                      className="font-semibold tabular"
                    />
                  )}
                </Field>
              </div>
              {d.previousReading && (electricity !== '' || water !== '') && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg bg-subtle/60 px-3 py-2 text-xs text-fg-secondary">
                  <span className="font-medium text-fg">{t('Estimated usage since last reading:')}</span>
                  <span className="tabular">
                    {t('Electricity')}:{' '}
                    <strong className="text-fg">
                      {electricity !== '' && !Number.isNaN(eValue) ? `${formatNumber(Math.max(0, eValue - Number(d.previousReading.electricity ?? 0)))} kWh` : '—'}
                    </strong>
                  </span>
                  <span className="tabular">
                    {t('Water')}:{' '}
                    <strong className="text-fg">
                      {water !== '' && !Number.isNaN(wValue) ? `${formatNumber(Math.max(0, wValue - Number(d.previousReading.water ?? 0)))} m³` : '—'}
                    </strong>
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                {!done && (
                  <Button size="sm" onClick={() => submit.run(true)} disabled={submit.pending || readingsInvalid}>
                    Save draft
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={() => setStep(2)}>
                  <span className="inline-flex items-center gap-1.5">
                    {t('Next: Room & furniture')}
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </Button>
              </div>
            </section>
          </>
        )}

        {/* Step 2: Room Condition & Automatic Furniture Calculation (kept mounted to preserve unsaved item state across steps) */}
        <div className={step === 2 ? 'flex flex-col gap-3' : 'hidden'}>
          <FurnitureConditions
            allocationId={d.allocationId}
            query={furnitureQuery}
            done={done}
            condition={condition}
            onConditionChange={setCondition}
            electricity={electricity}
            water={water}
            onLiveTotalChange={setLiveFurnitureTotal}
            onLiveSummaryChange={setFurnitureSummary}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <Button size="sm" icon={ArrowLeft} onClick={() => setStep(1)}>
              {t('Back')}
            </Button>
            <div className="flex items-center gap-2">
              {!done && (
                <Button size="sm" onClick={() => submit.run(true)} disabled={submit.pending || readingsInvalid}>
                  Save draft
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setStep(3)}>
                <span className="inline-flex items-center gap-1.5">
                  {t('Next: Settlement')}
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* Step 3: Utility deposit settlement and actions */}
        {step === 3 && (
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt size={15} aria-hidden="true" className="text-fg-brand" />
              <p className="text-sm font-semibold text-fg">
                {t('3. Utility deposit settlement')}
              </p>
            </div>
            <span className="text-xs text-fg-tertiary">
              {refund >= 0 ? t('Refund goes to the manager for approval') : t('The balance is invoiced to the student')}
            </span>
          </div>

          <dl className="flex flex-col gap-1.5">
            <Row label="Utility deposit held">{formatVnd(s.held)}</Row>
            <Row label={`${t('Final utility share')}${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>− {formatVnd(s.share)}</Row>
            <Row label="Unpaid utility invoices">− {formatVnd(s.unpaid)}</Row>
            {damageAmount > 0 && (
              <>
                <Row label="Damage charge" tone="text-warning-fg">
                  − {formatVnd(damageAmount)}
                </Row>
                {damageLines.length > 0 && (
                  <div className="flex flex-col gap-1 border-l-2 border-warning/40 pl-3 text-[11px] text-fg-secondary">
                    {damageLines.map((l) => (
                      <div key={l.key} className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          {l.name} ({l.assetCode}) · {conditionName(l.condition)}
                          {l.percent > 0 ? ` ${l.percent}%` : ''}
                          {l.split > 1
                            ? ` · ${t('Shared · {full} ÷ {n} residents', { full: formatVnd(l.fullAmount), n: l.split })}`
                            : ''}
                        </span>
                        <span className="shrink-0 font-medium text-fg tabular">− {formatVnd(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </dl>

          {/* Realtime Net Settlement Highlight Box */}
          <div
            className={cx(
              'flex items-center justify-between gap-3 rounded-xl px-4 py-3',
              refund >= 0 ? 'bg-brand-subtle' : 'bg-error-bg',
            )}
          >
            <div className="flex items-center gap-2">
              {refund >= 0 ? (
                <CheckCircle2 size={18} aria-hidden="true" className="shrink-0 text-fg-brand" />
              ) : (
                <AlertTriangle size={18} aria-hidden="true" className="shrink-0 text-error-fg" />
              )}
              <span className="text-sm font-semibold text-fg">
                {t(refund >= 0 ? 'Refund to student' : 'Student still owes')}
              </span>
            </div>
            <span
              className={cx(
                'text-xl font-bold whitespace-nowrap tabular',
                refund >= 0 ? 'text-fg-brand' : 'text-error-fg',
              )}
            >
              {formatVnd(Math.abs(refund))}
            </span>
          </div>

          {done ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-bg px-3.5 py-2.5 text-xs font-medium text-success-fg">
                <span>{t('Checked out {date}', { date: formatDateTime(d.checkedOutAt) })}</span>
                <span>
                  {refund < 0
                    ? t('{amount} was invoiced to the student.', { amount: formatVnd(-refund) })
                    : d.refundStatus === 'Approved'
                      ? t('A manager approved the refund.')
                      : t('The refund is waiting for a manager’s approval.')}
                </span>
              </div>
              <div className="flex items-center justify-start">
                <Button size="sm" icon={ArrowLeft} onClick={() => setStep(2)}>
                  {t('Back')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              {!condition && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-bg/60 px-3 py-2 text-xs text-warning-fg">
                  <span className="font-medium">{t('Please select the room condition before you confirm.')}</span>
                  <Button size="sm" onClick={() => setStep(2)}>
                    {t('Go to Step 2')}
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <Button size="sm" icon={ArrowLeft} onClick={() => setStep(2)}>
                  {t('Back')}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    tip="Keep what you entered and finish the check-out later."
                    size="sm"
                    onClick={() => submit.run(true)}
                    disabled={submit.pending || readingsInvalid}
                  >
                    Save draft
                  </Button>
                  <Button
                    tip="Ends the student’s stay and frees the bed. A meter reading is taken."
                    variant="primary"
                    disabled={!condition || readingsInvalid || submit.pending || review.pending}
                    loading={review.pending}
                    onClick={() => review.run()}
                  >
                    Confirm check-out
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
        )}
      </div>

      {showHandover && d.handoverReport && (
        <Modal
          open={showHandover}
          onClose={() => setShowHandover(false)}
          size="lg"
          title={t('Move-in report (Report Final) · {name}', { name: d.name })}
          description={`${d.studentCode} · ${t('{room} · Bed {bed}', { room: d.room, bed: d.bed })} · ${d.handoverReport.id}`}
          footer={<Button onClick={() => setShowHandover(false)}>Close</Button>}
        >
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-subtle/40 p-3.5 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-fg-tertiary">{t('Finalized by')}</dt>
                <dd className="font-medium text-fg">
                  {d.handoverReport.source === 'STUDENT'
                    ? t('The student’s report matched')
                    : d.handoverReport.source === 'AUTO'
                      ? t('Finalized by the system')
                      : t('Confirmed by Staff and the student')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-tertiary">{t('Handed over at')}</dt>
                <dd className="font-medium text-fg">
                  {d.handoverReport.finalizedAt ? formatDateTime(d.handoverReport.finalizedAt) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-tertiary">{t('Electricity at move-in')}</dt>
                <dd className="font-semibold text-fg tabular">
                  {d.handoverReport.electricity != null ? `${formatNumber(d.handoverReport.electricity)} kWh` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-tertiary">{t('Water at move-in')}</dt>
                <dd className="font-semibold text-fg tabular">
                  {d.handoverReport.water != null ? `${formatNumber(d.handoverReport.water)} m³` : '—'}
                </dd>
              </div>
              {d.handoverReport.staffName && (
                <div className="col-span-2">
                  <dt className="text-xs text-fg-tertiary">{t('Checked and approved by')}</dt>
                  <dd className="font-medium text-fg">{d.handoverReport.staffName}</dd>
                </div>
              )}
              {d.handoverReport.studentSubmittedAt && (
                <div className="col-span-2">
                  <dt className="text-xs text-fg-tertiary">{t('Student confirmed at')}</dt>
                  <dd className="font-medium text-fg">{formatDateTime(d.handoverReport.studentSubmittedAt)}</dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold tracking-wide text-fg-secondary uppercase">
                {t('Furniture condition at move-in ({n} items)', { n: d.handoverReport.items?.length ?? 0 })}
              </p>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
                <Table>
                  <THead>
                    <tr>
                      <Th>Furniture</Th>
                      <Th className="w-32">Asset code</Th>
                      <Th className="w-36">Condition at move-in</Th>
                      <Th>Note</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {(d.handoverReport.items ?? []).map((it) => (
                      <Tr key={it.itemId}>
                        <Td className="font-medium text-fg">
                          {typeName(it)} · {it.bed ? t('Bed {bed}', { bed: it.bed }) : t('Shared')}
                        </Td>
                        <Td className="font-mono text-xs text-fg-secondary">{it.assetCode}</Td>
                        <Td>
                          <Tag tone={conditionTone[it.condition] ?? 'neutral'}>
                            {conditionName(it.condition)}
                          </Tag>
                        </Td>
                        <Td className="text-xs text-fg-secondary">
                          {it.note || (it.preExisting ? t('Recorded as already there') : '—')}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showSummary && (
        <Modal
          open={showSummary}
          onClose={() => { setShowSummary(false); setFresh(null) }}
          title={t('Settlement summary · {name}', { name: d.name })}
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setShowSummary(false)} disabled={submit.pending}>
                {t('Go back')}
              </Button>
              <Button
                variant="primary"
                loading={submit.pending}
                onClick={() => submit.run(false)}
              >
                {t('Confirm and complete')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-secondary">
              {t('Please read this settlement breakdown aloud to the student before finalizing:')}
            </p>

            <div className="rounded-xl border border-line bg-subtle/50 p-4">
              <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5">
                <span className="font-semibold text-fg">{d.name} ({d.studentCode})</span>
                <span className="text-xs text-fg-secondary">{t('{room} · Bed {bed}', { room: d.room, bed: d.bed })}</span>
              </div>
              <dl className="flex flex-col gap-2">
                <Row label="Utility deposit held" strong>{formatVnd(s.held)}</Row>
                <Row label={`${t('Final utility share')}${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>− {formatVnd(s.share)}</Row>
                <Row label="Unpaid utility invoices">− {formatVnd(s.unpaid)}</Row>
                {damageAmount > 0 && (
                  <>
                    <Row label="Damage charge" tone="text-warning-fg" strong>
                      − {formatVnd(damageAmount)}
                    </Row>
                    {damageLines.length > 0 && (
                      <div className="flex flex-col gap-1 border-l-2 border-warning/40 pl-3 text-[11px] text-fg-secondary">
                        {damageLines.map((l) => (
                          <div key={l.key} className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              {l.name} ({l.assetCode}) · {conditionName(l.condition)}
                              {l.percent > 0 ? ` ${l.percent}%` : ''}
                              {l.split > 1
                                ? ` · ${t('Shared · {full} ÷ {n} residents', { full: formatVnd(l.fullAmount), n: l.split })}`
                                : ''}
                            </span>
                            <span className="shrink-0 font-medium text-fg tabular">− {formatVnd(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {hasSharedSplit && (
                      <p className="rounded-lg bg-warning-bg/60 px-2.5 py-1.5 text-[11px] text-warning-fg">
                        {t('Shared furniture charges are split evenly among active residents; remaining roommates will receive an invoice and notification for their share.')}
                      </p>
                    )}
                  </>
                )}
              </dl>
            </div>

            <div
              className={cx(
                'flex items-center justify-between gap-3 rounded-xl p-4',
                refund >= 0 ? 'border border-success/30 bg-success-bg' : 'border border-error/30 bg-error-bg',
              )}
            >
              <div className="flex items-center gap-2.5">
                {refund >= 0 ? (
                  <CheckCircle2 size={24} aria-hidden="true" className="shrink-0 text-success-fg" />
                ) : (
                  <AlertTriangle size={24} aria-hidden="true" className="shrink-0 text-error-fg" />
                )}
                <div>
                  <p className="text-sm font-semibold text-fg">
                    {t(refund >= 0 ? 'Refund to student' : 'Student still owes')}
                  </p>
                  <p className="text-xs text-fg-tertiary">
                    {t(refund >= 0 ? 'Refund goes to the manager for approval' : 'The balance will be invoiced to the student')}
                  </p>
                </div>
              </div>
              <span
                className={cx(
                  'text-2xl font-bold tabular',
                  refund >= 0 ? 'text-success-fg' : 'text-error-fg',
                )}
              >
                {formatVnd(Math.abs(refund))}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}

export default function CheckOutDesk() {
  const scope = useScopeQuery()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState(null)
  const [readingsOpen, setReadingsOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = { ...scope, q: search, reason, status: status === 'All' ? undefined : status, page, pageSize }
  const list = useQuery(['check-out', filters], ({ signal }) => api.desk.checkOutList(filters, { signal }))
  const items = list.data?.items ?? []
  const statusCounts = list.data?.statusCounts ?? {}
  // Rows are keyed by Allocation id: the student code never goes into a URL (contract change B-01).
  const allocationId = items.find((r) => r.allocationId === selectedId)?.allocationId ?? items[0]?.allocationId
  const detail = useQuery(['check-out', 'detail', allocationId], ({ signal }) => api.desk.checkOutDetail(allocationId, { signal }), { enabled: Boolean(allocationId), keepPrevious: false })

  return (
    <>
      <PageHeader
        title="Check-out"
        description={
          list.data
            ? [
                list.data.date && formatDate(list.data.date),
                t('{n} allocations in Pending check-out.', { n: formatNumber(list.data.pendingCount) }),
                list.data.checkOutBy && t('Check out by {date}', { date: formatDate(list.data.checkOutBy) }),
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Allocations in Pending check-out.'
        }
        actions={
          <>
            <Button icon={Gauge} onClick={() => setReadingsOpen(true)}>
              Readings by room
            </Button>
            <DeskModeSwitch mode="out" />
          </>
        }
      />
      <RoomReadingsModal open={readingsOpen} onClose={() => setReadingsOpen(false)} scope={scope} />

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <SearchInput wrapperClassName="w-80" aria-label={t('Search')} placeholder="Search student code or room" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          wrapperClassName="w-60"
          aria-label={t('Reason')}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Reason: All' }, ...(list.data?.reasons ?? []).map((r) => ({ value: r, label: t('Reason: {r}', { r: tr(r) }) }))]}
        />
        <div role="tablist" aria-label={t('Check-out status')} className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1">
          {statusSegments.map((seg) => {
            const active = status === seg.key
            const count = statusCounts[seg.key]
            return (
              <button
                key={seg.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setStatus(seg.key)
                  setPage(1)
                }}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-primary font-semibold text-fg-on-brand shadow-card' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
                )}
              >
                <span>{t(seg.label)}</span>
                {count != null && (
                  <span
                    className={cx(
                      'rounded-full px-1.5 py-0.5 text-xs font-semibold tabular',
                      active ? 'bg-surface/20 text-fg-on-brand' : 'bg-subtle text-fg-secondary',
                    )}
                  >
                    {formatNumber(count)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Overdue leavers: a short notice beside the filters, so it never pushes the work area down. */}
        {list.data?.overdueCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-error-bg px-3 py-1 text-sm font-medium text-error-fg"
            title={t('They still hold their bed. Managers see them on their dashboard.')}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {t('{n} leavers are past the check-out date', { n: formatNumber(list.data.overdueCount) })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-104 shrink-0 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th>Student</Th>
                <Th className="w-34">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={list} colSpan={2} emptyIcon={LogOut} emptyTitle="No allocations match these filters" />
              {items.map((r) => (
                <Tr key={r.allocationId} selected={r.allocationId === allocationId} onClick={() => setSelectedId(r.allocationId)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.name} secondary={[r.studentCode, t('{room} · Bed {bed}', { room: r.room, bed: r.bed }), tr(r.reason)].join(' · ')} />
                  </Td>
                  <Td>
                    <span className="flex flex-col items-start gap-1">
                      <StatusTag status={r.status} tone={tones[r.status]} />
                      {r.overdue && <Tag tone="error">Overdue</Tag>}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
            <Pagination
              total={list.data?.total ?? 0}
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

        {allocationId ? (
          <QueryState query={detail} className="min-w-0 flex-1 rounded-lg border border-line bg-surface">
            {(d) => <CheckOutPanel key={`${d.allocationId}-${d.status}`} d={d} />}
          </QueryState>
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={LogOut} title="Select a student" />
          </Card>
        )}
      </div>
    </>
  )
}
