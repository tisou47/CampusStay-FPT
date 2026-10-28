import { useEffect, useRef, useState } from 'react'
import { Download, Gauge, LogOut, Save, Upload } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card, Divider } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { DeskModeSwitch } from './CheckInDesk'
import { t, tr } from '@/i18n'

// SCR-REQ-12 Check-out Desk (Figma 95:3876)
// GET /check-out?termId&block&q&reason&page&pageSize → { date, pendingCount, reasons, checkOutBy, overdueCount,
//   items: [{ allocationId, studentCode, name, room, bed, roomTypeName, roomClassName, reason, status, checkedOutAt,
//   overdue }], total }
// GET /check-out/:allocationId → { …row, reading: { electricity, water }, settlement: { held, periodLabel, share, unpaid, damage, refund },
//   refundStatus, furniture: [{ itemId, assetCode, type, typeVi, amount, note }] }
// POST /check-out/:allocationId { electricity, water, conditionGood, keyReturned, damages: [{ itemId, amount, note }], draft }
//   → { refund, refundStatus } — the damage charge is the sum of the items' damages (spec §6.16)

const tones = { 'Pending check-out': 'warning', 'Settlement due': 'error', 'Checked out': 'success' }
const toNumber = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

function Row({ label, children, strong, tone }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{t(label)}</dt>
      <dd className={cx('tabular', strong ? 'font-medium' : '', tone ?? 'text-fg')}>{children}</dd>
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
      title: t('Readings saved for {n} Rooms', { n: formatNumber(res.rooms) }),
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
      title="Final meter readings by Room"
      description="Fill in each Room once: the reading goes to the check-out of every leaver in that Room. Rooms left empty are filled in later."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Save} disabled={!changed.length || save.pending} onClick={() => save.run()}>
            {t('Save {n} Rooms', { n: formatNumber(changed.length) })}
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
            <TableStatus query={query} colSpan={4} emptyIcon={LogOut} emptyTitle="No Room has leavers waiting" />
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

function CheckOutPanel({ d }) {
  const { notify, notifyError } = useToast()
  const done = d.status === 'Checked out'
  const [electricity, setElectricity] = useState(formatNumber(d.reading?.electricity))
  const [water, setWater] = useState(formatNumber(d.reading?.water))
  const [good, setGood] = useState(true)
  const [key, setKey] = useState(true)
  // Damage per furniture item of the Room: { [itemId]: { amount, note } }; a damaged item becomes Broken.
  const [damages, setDamages] = useState(() =>
    Object.fromEntries((d.furniture ?? []).filter((f) => f.amount > 0 || f.note).map((f) => [f.itemId, { amount: formatNumber(f.amount), note: f.note ?? '' }])),
  )
  const [damaged, setDamaged] = useState(Object.keys(damages).length > 0)
  const setDamage = (itemId, patch) => setDamages((all) => ({ ...all, [itemId]: { amount: '', note: '', ...all[itemId], ...patch } }))
  useEffect(() => {
    setElectricity(d.reading?.electricity != null ? formatNumber(d.reading.electricity) : '')
    setWater(d.reading?.water != null ? formatNumber(d.reading.water) : '')
  }, [d])

  const s = d.settlement ?? { held: 0, share: 0, unpaid: 0, damage: 0 }
  const lines = damaged ? Object.entries(damages).filter(([, v]) => toNumber(v.amount) > 0 || v.note.trim()) : []
  const damageAmount = done ? s.damage ?? 0 : lines.reduce((sum, [, v]) => sum + toNumber(v.amount), 0)
  const refund = done ? s.refund : (s.held ?? 0) - (s.share ?? 0) - (s.unpaid ?? 0) - damageAmount

  const submit = useMutation(
    (draft) =>
      api.desk.checkOut(d.allocationId, {
        electricity: toNumber(electricity),
        water: toNumber(water),
        conditionGood: good,
        keyReturned: key,
        damages: lines.map(([itemId, v]) => ({ itemId, amount: toNumber(v.amount), note: v.note.trim() || undefined })),
        draft,
      }),
    {
      invalidates: ['check-out', 'dashboard', 'refunds'],
      onSuccess: (res, draft) => {
        if (draft) {
          notify({ type: 'info', title: 'Draft saved', message: t('Readings and condition for {name} are saved.', { name: d.name }) })
          return
        }
        const r = res?.refund ?? refund
        notify({ title: t('{name} checked out', { name: d.name }), message: r >= 0 ? t('Refund of {amount} VND sent to a Manager for approval.', { amount: formatNumber(r) }) : t('{amount} VND was invoiced to the student.', { amount: formatNumber(-r) }) })
      },
      onError: (e) => notifyError(e, 'Could not save the check-out'),
    },
  )

  return (
    <Card className="flex min-h-0 w-105 shrink-0 flex-col gap-3 overflow-y-auto" aria-label={t('Check-out {name}', { name: d.name })}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">
          {d.name} · {d.studentCode}
        </h2>
        <p className="text-sm text-fg-secondary">
          {t('{room} · Bed {bed}', { room: d.room, bed: d.bed })} · {tr(d.roomTypeName)} {tr(d.roomClassName)} · {tr(d.reason)}
        </p>
      </div>

      <p className="text-base font-medium text-fg">{t('1. Final meter reading')}</p>
      <div className="flex gap-3">
        <Field label="Electricity (kWh)" className="flex-1">
          {(id) => <Input id={id} value={electricity} onChange={(e) => setElectricity(e.target.value)} disabled={done} inputMode="numeric" />}
        </Field>
        <Field label="Water (m³)" className="flex-1">
          {(id) => <Input id={id} value={water} onChange={(e) => setWater(e.target.value)} disabled={done} inputMode="numeric" />}
        </Field>
      </div>

      <p className="text-base font-medium text-fg">{t('2. Room condition')}</p>
      <Checkbox label="Bed, mattress and locker in good condition" checked={good} disabled={done} onChange={(e) => setGood(e.target.checked)} />
      <Checkbox label="Key returned" checked={key} disabled={done} onChange={(e) => setKey(e.target.checked)} />
      <Checkbox label="Damage found (adds a charge)" checked={damaged || (done && (s.damage ?? 0) > 0)} disabled={done} onChange={(e) => setDamaged(e.target.checked)} />
      {(damaged || done) && (d.furniture ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-fg-secondary">{t('Damage per item (VND): deducted from the Utility Deposit; anything above it is invoiced. A damaged item becomes Broken.')}</p>
          {d.furniture.map((f) => {
            const v = damages[f.itemId] ?? { amount: '', note: '' }
            return (
              <div key={f.itemId} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-sm text-fg">
                  {typeName(f)} · {f.assetCode}
                </span>
                <Input aria-label={t('Damage for {item}', { item: f.assetCode })} value={v.amount} disabled={done} onChange={(e) => setDamage(f.itemId, { amount: e.target.value })} inputMode="numeric" placeholder="0" className="w-28" />
                <Input aria-label={t('Damage note for {item}', { item: f.assetCode })} value={v.note} disabled={done} onChange={(e) => setDamage(f.itemId, { note: e.target.value })} placeholder={t('What is damaged?')} maxLength={300} />
              </div>
            )
          })}
        </div>
      )}
      <Divider />

      <p className="text-base font-medium text-fg">{t('3. Utility Deposit settlement')}</p>
      <dl className="flex flex-col gap-3">
        <Row label="Utility Deposit held">{formatNumber(s.held)}</Row>
        <Row label={`${t('Final utility share')}${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>− {formatNumber(s.share)}</Row>
        <Row label="Unpaid utility Invoices">− {formatNumber(s.unpaid)}</Row>
        {damageAmount > 0 && <Row label="Damage charge">− {formatNumber(damageAmount)}</Row>}
        <Row label={refund >= 0 ? 'Refund to Student' : 'Student still owes'} strong tone={refund >= 0 ? 'text-fg-brand' : 'text-error-fg'}>
          {formatNumber(Math.abs(refund))}
        </Row>
      </dl>

      {done ? (
        <Alert type="success" title={t('Checked out {date}', { date: formatDateTime(d.checkedOutAt) })}>
          {d.refundStatus === 'Approved' ? t('A Manager approved the refund.') : t('The refund is waiting for a Manager’s approval.')} {t('The Bed is free again.')}
        </Alert>
      ) : (
        <>
          <Alert title={refund >= 0 ? 'Refund goes to the Manager for approval' : 'The balance is invoiced to the student'}>
            The share is estimated from the last reading; the final amounts are calculated when you confirm. The Bed becomes available once check-out is confirmed.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button onClick={() => submit.run(true)} disabled={submit.pending}>
              Save draft
            </Button>
            <Button variant="primary" disabled={!key || submit.pending} onClick={() => submit.run(false)}>
              Confirm check-out
            </Button>
          </div>
          {!key && <p className="text-right text-sm text-error-fg">{t('Collect the Room key before you confirm.')}</p>}
        </>
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
                t('{n} Allocations in Pending check-out.', { n: formatNumber(list.data.pendingCount) }),
                list.data.checkOutBy && t('Check out by {date}', { date: formatDate(list.data.checkOutBy) }),
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Allocations in Pending check-out.'
        }
        actions={
          <>
            <Button icon={Gauge} onClick={() => setReadingsOpen(true)}>
              Readings by Room
            </Button>
            <DeskModeSwitch mode="out" />
          </>
        }
      />
      <RoomReadingsModal open={readingsOpen} onClose={() => setReadingsOpen(false)} scope={scope} />

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-80" aria-label={t('Search')} placeholder="Search Student code or Room" value={q} onChange={(e) => setQ(e.target.value)} />
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
          They still hold their Bed. Managers see them on their dashboard.
        </Alert>
      )}

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th className="w-48">Student</Th>
                <Th>Room / Bed</Th>
                <Th>Reason</Th>
                <Th className="w-38">Status</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={list} colSpan={4} emptyIcon={LogOut} emptyTitle="No Allocations match these filters" />
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
          <QueryState query={detail} className="w-105 shrink-0 rounded-lg border border-line bg-surface">
            {(d) => <CheckOutPanel key={`${d.allocationId}-${d.status}`} d={d} />}
          </QueryState>
        ) : (
          <Card className="flex w-105 shrink-0 flex-col">
            <EmptyBlock icon={LogOut} title="Select a student" />
          </Card>
        )}
      </div>
    </>
  )
}
