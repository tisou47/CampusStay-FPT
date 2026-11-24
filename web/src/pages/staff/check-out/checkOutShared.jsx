import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Download, FileText, LogOut, Receipt, Save, Upload, Zap } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName, conditionTone, typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

export const CHECKOUT_TONES = {
  Pending: 'warning',
  Draft: 'info',
  'Checked out': 'success',
  'Pending check-out': 'warning',
  'Settlement due': 'error',
}

export const toNumber = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

// In-memory draft cache keyed by allocationId so navigating between
// /staff/check-out/:id, /meters, /furniture, and /settlement preserves unsaved inputs.
const draftCache = new Map()

export function getCachedDraft(allocationId) {
  return draftCache.get(String(allocationId)) ?? null
}

export function patchCachedDraft(allocationId, patch) {
  const key = String(allocationId)
  const next = { ...(draftCache.get(key) ?? {}), ...patch }
  draftCache.set(key, next)
  return next
}

export function clearCachedDraft(allocationId) {
  draftCache.delete(String(allocationId))
}

export function SettlementRow({ label, children, strong, tone }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm sm:text-base">
      <dt className="min-w-0 text-fg-secondary">{t(label)}</dt>
      <dd className={cx('shrink-0 whitespace-nowrap tabular', strong ? 'font-semibold' : 'font-medium', tone ?? 'text-fg')}>
        {children}
      </dd>
    </div>
  )
}

export function useCheckOutWorkspace(allocationId) {
  const { notify, notifyError } = useToast()
  const detailQuery = useQuery(
    ['check-out', 'detail', allocationId],
    ({ signal }) => api.desk.checkOutDetail(allocationId, { signal }),
    { enabled: Boolean(allocationId), keepPrevious: false },
  )
  const furnitureQuery = useQuery(
    ['check-out-furniture', allocationId],
    ({ signal }) => api.checkOutFurniture.view(allocationId, { signal }),
    { enabled: Boolean(allocationId) },
  )

  const d = detailQuery.data
  const fData = furnitureQuery.data
  const done = d?.status === 'Checked out'
  const cached = allocationId ? getCachedDraft(allocationId) : null

  const [electricity, setElectricityState] = useState('')
  const [water, setWaterState] = useState('')
  const [condition, setConditionState] = useState('')
  const [liveFurnitureTotal, setLiveFurnitureTotalState] = useState(0)
  const [furnitureSummary, setFurnitureSummaryState] = useState(null)

  // Hydrate from cache first, then server detail when loaded.
  useEffect(() => {
    if (!d) return
    const c = getCachedDraft(d.allocationId)
    setElectricityState(c?.electricity ?? (d.reading?.electricity != null ? formatNumber(d.reading.electricity) : ''))
    setWaterState(c?.water ?? (d.reading?.water != null ? formatNumber(d.reading.water) : ''))
    if (c?.condition !== undefined) {
      setConditionState(c.condition)
    } else if (d.status === 'Checked out') {
      setConditionState((d.settlement?.damage ?? 0) > 0 || (d.furniture ?? []).some((f) => f.amount > 0) ? 'damaged' : 'good')
    } else {
      setConditionState((d.furniture ?? []).some((f) => f.amount > 0) ? 'damaged' : '')
    }
    if (c?.liveFurnitureTotal !== undefined) setLiveFurnitureTotalState(c.liveFurnitureTotal)
    if (c?.furnitureSummary !== undefined) setFurnitureSummaryState(c.furnitureSummary)
  }, [d?.allocationId, d?.status, d?.reading?.electricity, d?.reading?.water])

  useEffect(() => {
    if (!fData || !d) return
    const c = getCachedDraft(d.allocationId)
    if (fData.saved && !condition && c?.condition === undefined) {
      const hasIssue = (fData.items ?? []).some((i) => i.atCheckOut && i.atCheckOut !== 'Good') || fData.total > 0
      setConditionState(hasIssue ? 'damaged' : 'good')
    }
  }, [fData, d, condition])

  const setElectricity = useCallback(
    (val) => {
      setElectricityState(val)
      if (allocationId) patchCachedDraft(allocationId, { electricity: val })
    },
    [allocationId],
  )

  const setWater = useCallback(
    (val) => {
      setWaterState(val)
      if (allocationId) patchCachedDraft(allocationId, { water: val })
    },
    [allocationId],
  )

  const setCondition = useCallback(
    (val) => {
      setConditionState(val)
      if (allocationId) patchCachedDraft(allocationId, { condition: val })
    },
    [allocationId],
  )

  const setLiveFurnitureTotal = useCallback(
    (val) => {
      setLiveFurnitureTotalState(val)
      if (allocationId) patchCachedDraft(allocationId, { liveFurnitureTotal: val })
    },
    [allocationId],
  )

  const setFurnitureSummary = useCallback(
    (val) => {
      setFurnitureSummaryState(val)
      if (allocationId) patchCachedDraft(allocationId, { furnitureSummary: val })
    },
    [allocationId],
  )

  const s = d?.settlement ?? { held: 0, share: 0, unpaid: 0, damage: 0 }
  const byCondition = Boolean(fData?.saved)
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

  const submit = useMutation(
    async (draft) => {
      if (!d) return null
      if (!done && condition && furnitureSummary?.dirty) {
        await api.checkOutFurniture.record(d.allocationId, furnitureSummary.payload)
      }
      return api.desk.checkOut(d.allocationId, {
        electricity: toNumber(electricity),
        water: toNumber(water),
        conditionGood: condition === 'good',
        draft,
      })
    },
    {
      invalidates: ['check-out', 'check-out-furniture', 'dashboard', 'refunds', 'turnover'],
      onSuccess: (res, draft) => {
        if (d) clearCachedDraft(d.allocationId)
        if (draft) {
          notify({
            type: 'info',
            title: 'Draft saved',
            message: t('Readings and condition for {name} are saved.', { name: d?.name }),
          })
          return
        }
        const r = res?.refund ?? refund
        notify({
          title: t('{name} checked out', { name: d?.name }),
          message:
            r >= 0
              ? t('Refund of {amount} sent to a manager for approval.', { amount: formatVnd(r) })
              : t('{amount} was invoiced to the student.', { amount: formatVnd(-r) }),
        })
      },
      onError: (e) => notifyError(e, 'Could not save the check-out'),
    },
  )

  return {
    detailQuery,
    furnitureQuery,
    d,
    fData,
    done,
    s,
    electricity,
    setElectricity,
    water,
    setWater,
    condition,
    setCondition,
    liveFurnitureTotal,
    setLiveFurnitureTotal,
    furnitureSummary,
    setFurnitureSummary,
    damageAmount,
    refund,
    damageLines,
    hasSharedSplit,
    submit,
  }
}

export function CheckOutHeaderCard({ d, onOpenHandover }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={d.name} size={44} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-h2 font-semibold text-fg">{d.name}</h1>
            <span className="rounded-md bg-subtle px-2.5 py-0.5 font-mono text-sm font-semibold text-fg">
              {d.studentCode}
            </span>
            <StatusTag status={d.status} tone={CHECKOUT_TONES[d.status]} />
            {d.overdue && <Tag tone="error">Overdue</Tag>}
          </div>
          {d.handoverReport && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-fg-secondary">
              <span className="font-medium text-fg">Report Final ({d.handoverReport.id})</span>
              {d.handoverReport.finalizedAt && (
                <span className="tabular">{t('Finalized {date}', { date: formatDateTime(d.handoverReport.finalizedAt) })}</span>
              )}
              {d.handoverReport.staffName && <span>{d.handoverReport.staffName}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {d.handoverReport ? (
          <Button size="sm" icon={FileText} onClick={onOpenHandover}>
            {t('View contract / check-in report (Report Final)')}
          </Button>
        ) : (
          <span className="rounded-md bg-subtle px-3 py-1.5 text-xs text-fg-tertiary">{t('No Report Final')}</span>
        )}
      </div>
    </section>
  )
}

export function CheckOutTopBar({ allocationId, active = 'overview', listQuery = '' }) {
  const base = `/staff/check-out/${allocationId}`
  const tabs = [
    { key: 'overview', label: 'Overview', to: base, icon: LogOut },
    { key: 'meters', label: '1. Final meter reading', to: `${base}/meters`, icon: Zap },
    { key: 'furniture', label: '2. Room & furniture', to: `${base}/furniture`, icon: ClipboardCheck },
    { key: 'settlement', label: '3. Settlement & confirm', to: `${base}/settlement`, icon: Receipt },
  ]
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" icon={ArrowLeft} to={`/staff/check-out${listQuery}`}>
          {t('Check-out list')}
        </Button>
      </div>
      <nav aria-label={t('Check-out steps')} className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1">
        {tabs.map((item) => {
          const Icon = item.icon
          const isCurrent = active === item.key
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={isCurrent ? 'page' : undefined}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                isCurrent ? 'bg-primary font-semibold text-fg-on-brand' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
              )}
            >
              <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>{t(item.label)}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function HandoverReportModal({ open, onClose, d }) {
  if (!open || !d?.handoverReport) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title={t('Check-in report (Report Final) · {name}', { name: d.name })}
      description={`${d.studentCode} · ${t('{room} · Bed {bed}', { room: d.room, bed: d.bed })} · ${d.handoverReport.id}`}
      footer={<Button onClick={onClose}>{t('Close')}</Button>}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-subtle/50 p-4 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-fg-tertiary">{t('Report code')}</dt>
            <dd className="mt-0.5 font-mono font-semibold text-fg">{d.handoverReport.id}</dd>
          </div>
          <div>
            <dt className="text-fg-tertiary">{t('Finalized at')}</dt>
            <dd className="mt-0.5 font-medium text-fg">
              {d.handoverReport.finalizedAt ? formatDateTime(d.handoverReport.finalizedAt) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-fg-tertiary">{t('Opening electricity')}</dt>
            <dd className="mt-0.5 font-semibold text-fg tabular">
              {d.handoverReport.electricity != null ? `${formatNumber(d.handoverReport.electricity)} kWh` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-fg-tertiary">{t('Opening water')}</dt>
            <dd className="mt-0.5 font-semibold text-fg tabular">
              {d.handoverReport.water != null ? `${formatNumber(d.handoverReport.water)} m³` : '—'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-fg-secondary">
            {t('Furniture condition at check-in ({n} items)', { n: d.handoverReport.items?.length ?? 0 })}
          </p>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            <Table>
              <THead>
                <tr>
                  <Th>Furniture</Th>
                  <Th className="w-32">Asset code</Th>
                  <Th className="w-36">Condition at check-in</Th>
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
                      <Tag tone={conditionTone[it.condition] ?? 'neutral'}>{conditionName(it.condition)}</Tag>
                    </Td>
                    <Td className="text-xs text-fg-secondary">
                      {it.note || (it.preExisting ? t('Recorded as pre-existing') : '—')}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function SettlementSummaryModal({ open, onClose, d, s, damageAmount, damageLines, hasSharedSplit, refund, submit }) {
  if (!open || !d) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title={t('Settlement summary · {name}', { name: d.name })}
      description={t('Please read this settlement breakdown aloud to the student before finalizing:')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={submit.pending}>
            {t('Go back')}
          </Button>
          <Button variant="primary" loading={submit.pending} onClick={() => submit.run(false)}>
            {t('Confirm and complete')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-subtle/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <span className="font-semibold text-fg">
              {d.name} <span className="font-mono text-xs font-normal text-fg-tertiary">({d.studentCode})</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs font-medium text-fg-secondary">
              {t('{room} · Bed {bed}', { room: d.room, bed: d.bed })}
            </span>
          </div>
          <dl className="flex flex-col gap-2 divide-y divide-line/60">
            <SettlementRow label="Utility deposit held" strong>
              {formatVnd(s.held)}
            </SettlementRow>
            <SettlementRow label={`${t('Final utility share')}${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>
              − {formatVnd(s.share)}
            </SettlementRow>
            <SettlementRow label="Unpaid utility invoices">− {formatVnd(s.unpaid)}</SettlementRow>
            {damageAmount > 0 && (
              <div className="flex flex-col gap-2 pt-2">
                <SettlementRow label="Damage charge" tone="text-warning-fg" strong>
                  − {formatVnd(damageAmount)}
                </SettlementRow>
                {damageLines.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-l-2 border-warning/40 pl-3 text-xs text-fg-secondary">
                    {damageLines.map((l) => (
                      <div key={l.key} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-medium text-fg">{l.name}</span>{' '}
                          <span className="font-mono text-fg-tertiary">({l.assetCode})</span> · {conditionName(l.condition)}
                          {l.percent > 0 ? ` ${l.percent}%` : ''}
                          {l.split > 1 && (
                            <div className="text-fg-tertiary tabular">
                              {t('Shared · {full} ÷ {n} residents', { full: formatVnd(l.fullAmount), n: l.split })}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 whitespace-nowrap font-semibold text-fg tabular">− {formatVnd(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {hasSharedSplit && (
                  <p className="rounded-lg bg-warning-bg/60 px-3 py-2 text-xs text-warning-fg">
                    {t('Shared furniture charges are split evenly among active residents; remaining roommates will receive an invoice and notification for their share.')}
                  </p>
                )}
              </div>
            )}
          </dl>
        </div>

        <div
          className={cx(
            'flex items-center justify-between gap-4 rounded-xl p-4',
            refund >= 0 ? 'border border-success/30 bg-success-bg' : 'border border-error/30 bg-error-bg',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {refund >= 0 ? (
              <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-success-fg" />
            ) : (
              <AlertTriangle size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-error-fg" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{t(refund >= 0 ? 'Refund to student' : 'Student still owes')}</p>
              <p className="text-xs text-fg-tertiary">
                {t(refund >= 0 ? 'Refund goes to the manager for approval' : 'The balance will be invoiced to the student')}
              </p>
            </div>
          </div>
          <span className={cx('shrink-0 whitespace-nowrap text-2xl font-semibold tabular', refund >= 0 ? 'text-success-fg' : 'text-error-fg')}>
            {formatVnd(Math.abs(refund))}
          </span>
        </div>
      </div>
    </Modal>
  )
}

export function RoomReadingsModal({ open, onClose, scope }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['check-out', 'readings', scope], ({ signal }) => api.desk.roomReadings(scope, { signal }), { enabled: open })
  const [values, setValues] = useState({})
  const [problems, setProblems] = useState([])
  const file = useRef(null)
  useEffect(() => {
    if (!query.data) return
    setValues(
      Object.fromEntries(
        query.data.items.map((r) => [
          r.room,
          {
            electricity: r.electricity != null ? String(r.electricity) : '',
            water: r.water != null ? String(r.water) : '',
          },
        ]),
      ),
    )
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
      message: res.problems?.length
        ? t('{n} lines were not saved: see the list.', { n: formatNumber(res.problems.length) })
        : t('{n} leavers will see them at check-out.', { n: formatNumber(res.students) }),
    })
  }
  const save = useMutation(
    () =>
      api.desk.saveRoomReadings(scope, {
        readings: changed
          .map((r) => ({ room: r.room, electricity: values[r.room].electricity.trim(), water: values[r.room].water.trim() }))
          .filter((r) => r.electricity !== '' || r.water !== '')
          .map((r) => ({
            room: r.room,
            electricity: r.electricity === '' ? null : Number(r.electricity.replace(',', '.')),
            water: r.water === '' ? null : Number(r.water.replace(',', '.')),
          })),
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
                    <Input
                      aria-label={t('Electricity of {room}', { room: r.room })}
                      value={values[r.room]?.electricity ?? ''}
                      onChange={(e) => set(r.room, { electricity: e.target.value })}
                      inputMode="decimal"
                      className="text-right tabular"
                    />
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
                    <Input
                      aria-label={t('Water of {room}', { room: r.room })}
                      value={values[r.room]?.water ?? ''}
                      onChange={(e) => set(r.room, { water: e.target.value })}
                      inputMode="decimal"
                      className="text-right tabular"
                    />
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
