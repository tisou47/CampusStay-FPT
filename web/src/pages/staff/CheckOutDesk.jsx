import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, Gauge, LogOut, Receipt, Save, Upload, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox, Radio } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { DeskModeSwitch } from './CheckInDesk'
import { t, tr } from '@/i18n'

// SCR-REQ-12 Check-out Desk (Figma 95:3876)
// GET /check-out?termId&block&reason&q&page&pageSize → { date, pendingCount, reasons, checkOutBy, overdueCount,
//   items: [{ allocationId, studentCode, name, room, bed, roomTypeName, roomClassName, reason, status, checkedOutAt,
//   overdue }], total }
// GET /check-out/:allocationId → { …row, reading: { electricity, water }, settlement: { held, periodLabel, share, unpaid, damage, refund },
//   refundStatus, furniture: [{ itemId, assetCode, type, typeVi, amount, note }] }
// POST /check-out/:allocationId { electricity, water, conditionGood, keyReturned, damages: [{ itemId, amount, note }], draft }
//   detail.furniture[]: { itemId, assetCode, type, typeVi, unitPrice, amount, note }; detail.conditions[]: { code, name, nameVi, percent }
//   (the condition levels of Admin › Furniture types: picking one prices the damage at price × (100 % − its value))
//   → { refund, refundStatus } — the damage charge is the sum of the items' damages (spec §6.16)

const tones = { 'Pending check-out': 'warning', 'Settlement due': 'error', 'Checked out': 'success' }
const toNumber = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

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
          .map((r) => ({ room: r.room, electricity: r.electricity === '' ? null : Number(r.electricity.replace(',', '.')), water: r.water === '' ? null : Number(r.water.replace(',', '.')) })),
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
          <Button variant="primary" icon={Save} disabled={!changed.length || save.pending} onClick={() => save.run()}>
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
              <Th className="w-36">Electricity (kWh)</Th>
              <Th className="w-36">Water (m³)</Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={4} emptyIcon={LogOut} emptyTitle="No room has leavers waiting" />
            {(query.data?.items ?? []).map((r) => (
              <Tr key={r.room}>
                <Td className="font-medium">{r.room}</Td>
                <Td>{formatNumber(r.students)}</Td>
                <Td>
                  <Input aria-label={t('Electricity of {room}', { room: r.room })} value={values[r.room]?.electricity ?? ''} onChange={(e) => set(r.room, { electricity: e.target.value })} inputMode="decimal" className="text-right tabular" />
                </Td>
                <Td>
                  <Input aria-label={t('Water of {room}', { room: r.room })} value={values[r.room]?.water ?? ''} onChange={(e) => set(r.room, { water: e.target.value })} inputMode="decimal" className="text-right tabular" />
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
  const [electricity, setElectricity] = useState(formatNumber(d.reading?.electricity))
  const [water, setWater] = useState(formatNumber(d.reading?.water))
  // Key returned is false by default; staff must collect key and check
  const [key, setKey] = useState(done ? Boolean(d.keyReturned) : false)
  // Damage per furniture item of the Room: { [itemId]: { level, amount, note } }; a damaged item becomes Broken.
  // The condition level found prices the damage (price × the value lost); the amount can still be changed.
  const levels = d.conditions ?? []
  const levelNames = new Set(levels.flatMap((l) => [l.name, l.nameVi]))
  const initialDamages = () =>
    Object.fromEntries(
      (d.furniture ?? [])
        .filter((f) => f.amount > 0 || f.note)
        .map((f) => [f.itemId, { level: levels.find((l) => l.name === f.note || l.nameVi === f.note)?.code ?? '', amount: formatNumber(f.amount), note: f.note ?? '' }]),
    )
  const [damages, setDamages] = useState(initialDamages)
  // Mutually exclusive condition: 'good' | 'damaged' | '' (empty by default when pending)
  const [condition, setCondition] = useState(() => {
    if (done) return (d.settlement?.damage ?? 0) > 0 || (d.furniture ?? []).some((f) => f.amount > 0) ? 'damaged' : 'good'
    return (d.furniture ?? []).some((f) => f.amount > 0) ? 'damaged' : ''
  })
  const [showSummary, setShowSummary] = useState(false)
  const setDamage = (itemId, patch) => setDamages((all) => ({ ...all, [itemId]: { level: '', amount: '', note: '', ...all[itemId], ...patch } }))
  const setLevel = (f, code) => {
    const level = levels.find((l) => l.code === code)
    const lost = level ? 100 - level.percent : 0
    if (!level || lost === 0) return setDamage(f.itemId, { level: code, amount: '', note: '' })
    const v = damages[f.itemId]
    setDamage(f.itemId, {
      level: code,
      amount: f.unitPrice != null ? formatNumber(Math.round((f.unitPrice * lost) / 100)) : v?.amount ?? '',
      // The level's name is the note unless one was typed.
      note: !v?.note || levelNames.has(v.note) ? typeName(level) : v.note,
    })
  }
  useEffect(() => {
    setElectricity(d.reading?.electricity != null ? formatNumber(d.reading.electricity) : '')
    setWater(d.reading?.water != null ? formatNumber(d.reading.water) : '')
  }, [d])

  const s = d.settlement ?? { held: 0, share: 0, unpaid: 0, damage: 0 }
  const lines = condition === 'damaged' ? Object.entries(damages).filter(([, v]) => toNumber(v.amount) > 0 || v.note.trim()) : []
  const damageAmount = done ? s.damage ?? 0 : lines.reduce((sum, [, v]) => sum + toNumber(v.amount), 0)
  const refund = done ? s.refund : (s.held ?? 0) - (s.share ?? 0) - (s.unpaid ?? 0) - damageAmount

  const submit = useMutation(
    (draft) =>
      api.desk.checkOut(d.allocationId, {
        electricity: toNumber(electricity),
        water: toNumber(water),
        conditionGood: condition === 'good',
        keyReturned: key,
        damages: lines.map(([itemId, v]) => ({ itemId, amount: toNumber(v.amount), note: v.note.trim() || undefined })),
        draft,
      }),
    {
      invalidates: ['check-out', 'dashboard', 'refunds', 'turnover'],
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
      className={cx('flex h-full min-h-0 shrink-0 flex-col overflow-hidden', embedded ? 'w-full rounded-none border-0' : 'w-110 xl:w-120')}
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
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-fg-secondary">
          <span className="rounded-md bg-brand-subtle px-2 py-0.5 font-semibold text-fg-brand">
            {t('{room} · Bed {bed}', { room: d.room, bed: d.bed })}
          </span>
          <span>·</span>
          <span>
            {tr(d.roomTypeName)} {tr(d.roomClassName)}
          </span>
          <span>·</span>
          <span className="font-medium text-fg">{tr(d.reason)}</span>
        </div>
      </div>

      {/* 2. SCROLLABLE INSPECTION BODY: Meter Readings & Compact Damage Audit */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-3.5">
        {/* Step 1: Final Meter Reading */}
        <section className="flex flex-col gap-2 rounded-xl bg-subtle/50 p-3.5">
          <div className="flex items-center gap-2">
            <Zap size={15} aria-hidden="true" className="text-fg-brand" />
            <p className="text-sm font-semibold text-fg">{t('1. Final meter reading')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Electricity (kWh)">
              {(id) => (
                <Input
                  id={id}
                  value={electricity}
                  onChange={(e) => setElectricity(e.target.value)}
                  disabled={done}
                  inputMode="numeric"
                  className="font-semibold tabular"
                />
              )}
            </Field>
            <Field label="Water (m³)">
              {(id) => (
                <Input
                  id={id}
                  value={water}
                  onChange={(e) => setWater(e.target.value)}
                  disabled={done}
                  inputMode="numeric"
                  className="font-semibold tabular"
                />
              )}
            </Field>
          </div>
        </section>

        {/* Step 2: Room Condition & Compact Damage Table */}
        <section className="flex flex-col gap-2 rounded-xl bg-subtle/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={15} aria-hidden="true" className="text-fg-brand" />
              <p className="text-sm font-semibold text-fg">{t('2. Room condition')}</p>
            </div>
            {lines.length > 0 && (
              <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-fg tabular">
                − {formatVnd(damageAmount)}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Checkbox
              label="Key returned"
              checked={key}
              disabled={done}
              onChange={(e) => setKey(e.target.checked)}
            />
            <div className="flex flex-col gap-1.5 border-t border-line/60 pt-2">
              <span className="text-xs font-semibold text-fg-secondary">{t('Room condition')}</span>
              <Radio
                name="room-condition"
                label="Bed, mattress and locker in good condition"
                checked={condition === 'good'}
                disabled={done}
                onChange={() => setCondition('good')}
              />
              <Radio
                name="room-condition"
                label="Damage found (adds a charge)"
                checked={condition === 'damaged'}
                disabled={done}
                onChange={() => setCondition('damaged')}
              />
            </div>
          </div>

          {condition === 'damaged' && (d.furniture ?? []).length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-t border-line pt-2.5">
              <p className="text-xs text-fg-secondary">
                {t('Pick the condition each item is found in: the damage is its price × the value lost. It is deducted from the utility deposit (anything above is invoiced), and a damaged item becomes Broken.')}
              </p>

              {/* Compact Mini-Table for Damage Audit: condition level found → damage priced from the item's value */}
              <div className="overflow-hidden rounded-lg bg-surface">
                <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] items-center gap-1.5 border-b border-line bg-subtle/80 px-2.5 py-1.5 text-[11px] font-semibold text-fg-tertiary uppercase">
                  <span>{t('Furniture')}</span>
                  <span>{t('Condition found')}</span>
                  <span className="text-right">{t('Damage')} (₫)</span>
                </div>
                <div className="flex max-h-72 flex-col divide-y divide-line/60 overflow-y-auto">
                  {d.furniture.map((f) => {
                    const v = damages[f.itemId] ?? { level: '', amount: '', note: '' }
                    const hasCharge = toNumber(v.amount) > 0 || Boolean(v.note?.trim())
                    const level = levels.find((l) => l.code === v.level)
                    return (
                      <div key={f.itemId} className={cx('flex flex-col gap-1 px-2.5 py-1.5 transition-colors', hasCharge ? 'bg-brand-subtle/40' : 'hover:bg-subtle/40')}>
                        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem_6.5rem] items-center gap-1.5">
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-xs font-medium text-fg">{typeName(f)}</span>
                            <span className="truncate font-mono text-[11px] text-fg-tertiary">
                              {f.assetCode}
                              {f.unitPrice != null && ` · ${formatVnd(f.unitPrice)}`}
                            </span>
                          </div>
                          <select
                            aria-label={t('Condition of {item}', { item: f.assetCode })}
                            value={v.level || (hasCharge ? '' : levels[0]?.code ?? '')}
                            disabled={done}
                            onChange={(e) => setLevel(f, e.target.value)}
                            className={cx(
                              'h-7 w-full cursor-pointer rounded-md border bg-surface px-1.5 text-xs focus:border-primary focus:outline-none disabled:cursor-default disabled:bg-subtle',
                              level && level.percent < 100 ? 'border-warning/50 text-warning-fg' : 'border-line text-fg',
                            )}
                          >
                            {hasCharge && !level && <option value="">{t('Other damage')}</option>}
                            {levels.map((l) => (
                              <option key={l.code} value={l.code}>
                                {typeName(l)} · {l.percent}%
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            aria-label={t('Damage for {item}', { item: f.assetCode })}
                            value={v.amount}
                            disabled={done}
                            onChange={(e) => setDamage(f.itemId, { amount: e.target.value })}
                            inputMode="numeric"
                            placeholder="0"
                            className="h-7 w-full rounded-md border border-line bg-surface px-2 text-right font-mono text-xs font-semibold text-fg tabular focus:border-primary focus:outline-none disabled:bg-subtle"
                          />
                        </div>
                        {hasCharge && (
                          <input
                            type="text"
                            aria-label={t('Damage note for {item}', { item: f.assetCode })}
                            value={v.note}
                            disabled={done}
                            onChange={(e) => setDamage(f.itemId, { note: e.target.value })}
                            placeholder={t('What is damaged?')}
                            maxLength={300}
                            className="h-7 w-full rounded-md border border-line bg-surface px-2 text-xs text-fg focus:border-primary focus:outline-none disabled:bg-subtle"
                          />
                        )}
                        {level && level.percent < 100 && f.unitPrice == null && !done && (
                          <span className="text-[11px] text-warning-fg">{t('This type has no price (Admin › Furniture types): type the damage.')}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 3. STICKY SETTLEMENT FOOTER: Realtime Calculation & Primary Actions */}
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-surface px-5 py-3.5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Receipt size={14} aria-hidden="true" className="text-fg-brand" />
            <p className="text-xs font-semibold tracking-wide text-fg-tertiary uppercase">
              {t('3. Utility deposit settlement')}
            </p>
          </div>
          <span className="text-[11px] text-fg-tertiary">
            {refund >= 0 ? t('Refund goes to the manager for approval') : t('The balance is invoiced to the student')}
          </span>
        </div>

        <dl className="flex flex-col gap-1">
          <Row label="Utility deposit held">{formatVnd(s.held)}</Row>
          <Row label={`${t('Final utility share')}${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>− {formatVnd(s.share)}</Row>
          <Row label="Unpaid utility invoices">− {formatVnd(s.unpaid)}</Row>
          {damageAmount > 0 && (
            <Row label="Damage charge" tone="text-warning-fg">
              − {formatVnd(damageAmount)}
            </Row>
          )}
        </dl>

        {/* Realtime Net Settlement Highlight Box */}
        <div
          className={cx(
            'flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5',
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
          <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-xs font-medium text-success-fg">
            <span>{t('Checked out {date}', { date: formatDateTime(d.checkedOutAt) })}</span>
            <span>
              {d.refundStatus === 'Approved' ? t('A manager approved the refund.') : t('The refund is waiting for a manager’s approval.')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 pt-0.5">
            {!key && (
              <p className="text-right text-xs font-medium text-error-fg">
                {t('Collect the room key before you confirm.')}
              </p>
            )}
            {key && !condition && (
              <p className="text-right text-xs font-medium text-warning-fg">
                {t('Please select the room condition before you confirm.')}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                tip="Keep what you entered and finish the check-out later."
                size="sm"
                onClick={() => submit.run(true)}
                disabled={submit.pending}
              >
                Save draft
              </Button>
              <Button
                tip="Ends the student’s stay and frees the bed. A meter reading is taken."
                variant="primary"
                disabled={!key || !condition || submit.pending}
                onClick={() => setShowSummary(true)}
              >
                Confirm check-out
              </Button>
            </div>
          </div>
        )}
      </div>

      {showSummary && (
        <Modal
          open={showSummary}
          onClose={() => setShowSummary(false)}
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
                  <Row label="Damage charge" tone="text-warning-fg" strong>
                    − {formatVnd(damageAmount)}
                  </Row>
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

  const filters = { ...scope, q: search, reason, page, pageSize }
  const list = useQuery(['check-out', filters], ({ signal }) => api.desk.checkOutList(filters, { signal }))
  const items = list.data?.items ?? []
  // Rows are keyed by Allocation id: the student code never goes into a URL (contract change B-01).
  const allocationId = items.find((r) => r.allocationId === selectedId)?.allocationId ?? items[0]?.allocationId
  const detail = useQuery(['check-out', 'detail', allocationId], ({ signal }) => api.desk.checkOutDetail(allocationId, { signal }), { enabled: Boolean(allocationId), keepPrevious: false })

  return (
    <>
      <PageHeader
        title="Check-out desk"
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

      <div className="flex shrink-0 items-center gap-3">
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
      </div>

      {list.data?.overdueCount > 0 && (
        <Alert type="error" title={t('{n} leavers are past the check-out date', { n: formatNumber(list.data.overdueCount) })} className="shrink-0">
          They still hold their bed. Managers see them on their dashboard.
        </Alert>
      )}

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-48">Student</Th>
                <Th>Room / bed</Th>
                <Th>Reason</Th>
                <Th className="w-38">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={list} colSpan={4} emptyIcon={LogOut} emptyTitle="No allocations match these filters" />
              {items.map((r) => (
                <Tr key={r.allocationId} selected={r.allocationId === allocationId} onClick={() => setSelectedId(r.allocationId)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.name} secondary={r.studentCode} />
                  </Td>
                  <Td>
                    {t('{room} · Bed {bed}', { room: r.room, bed: r.bed })}
                  </Td>
                  <Td>{tr(r.reason)}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
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
          <QueryState query={detail} className="w-110 shrink-0 rounded-lg border border-line bg-surface xl:w-120">
            {(d) => <CheckOutPanel key={`${d.allocationId}-${d.status}`} d={d} />}
          </QueryState>
        ) : (
          <Card className="flex w-110 shrink-0 flex-col xl:w-120">
            <EmptyBlock icon={LogOut} title="Select a student" />
          </Card>
        )}
      </div>
    </>
  )
}
