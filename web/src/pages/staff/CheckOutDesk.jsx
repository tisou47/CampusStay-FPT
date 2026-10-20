import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Card, Divider } from '@/components/ui/Display'
import { Field, Input, SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'
import { DeskModeSwitch } from './CheckInDesk'

// SCR-REQ-12 Check-out Desk (Figma 95:3876)
// GET /check-out?termId&block&q&reason&page&pageSize → { date, pendingCount, reasons,
//   items: [{ studentCode, name, room, bed, roomTypeName, roomClassName, reason, status, checkedOutAt }], total }
// GET /check-out/:studentCode → { …row, reading: { electricity, water }, settlement: { held, periodLabel, share, unpaid, damage, refund }, refundStatus }
// POST /check-out/:studentCode { electricity, water, conditionGood, keyReturned, damageCharge, draft } → { refund, refundStatus }

const tones = { 'Pending check-out': 'warning', 'Settlement due': 'error', 'Checked out': 'success' }
const toNumber = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

function Row({ label, children, strong, tone }) {
  return (
    <div className="flex items-start justify-between gap-4 text-base">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className={cx('tabular', strong ? 'font-medium' : '', tone ?? 'text-fg')}>{children}</dd>
    </div>
  )
}

function CheckOutPanel({ d }) {
  const { notify, notifyError } = useToast()
  const done = d.status === 'Checked out'
  const [electricity, setElectricity] = useState(formatNumber(d.reading?.electricity))
  const [water, setWater] = useState(formatNumber(d.reading?.water))
  const [good, setGood] = useState(true)
  const [key, setKey] = useState(true)
  const [damaged, setDamaged] = useState(false)
  const [damage, setDamage] = useState('')
  useEffect(() => {
    setElectricity(d.reading?.electricity != null ? formatNumber(d.reading.electricity) : '')
    setWater(d.reading?.water != null ? formatNumber(d.reading.water) : '')
  }, [d])

  const s = d.settlement ?? { held: 0, share: 0, unpaid: 0, damage: 0 }
  const damageAmount = done ? s.damage ?? 0 : damaged ? toNumber(damage) : 0
  const refund = done ? s.refund : (s.held ?? 0) - (s.share ?? 0) - (s.unpaid ?? 0) - damageAmount

  const submit = useMutation(
    (draft) =>
      api.desk.checkOut(d.studentCode, { electricity: toNumber(electricity), water: toNumber(water), conditionGood: good, keyReturned: key, damageCharge: damageAmount, draft }),
    {
      invalidates: ['check-out', 'dashboard', 'refunds'],
      onSuccess: (res, draft) => {
        if (draft) {
          notify({ type: 'info', title: 'Draft saved', message: `Readings and condition for ${d.name} are saved.` })
          return
        }
        const r = res?.refund ?? refund
        notify({ title: `${d.name} checked out`, message: r >= 0 ? `Refund of ${formatNumber(r)} VND sent to the Block Manager for approval.` : `${formatNumber(-r)} VND was invoiced to the student.` })
      },
      onError: (e) => notifyError(e, 'Could not save the check-out'),
    },
  )

  return (
    <Card className="flex min-h-0 w-105 shrink-0 flex-col gap-3 overflow-y-auto" aria-label={`Check-out ${d.name}`}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">
          {d.name} · {d.studentCode}
        </h2>
        <p className="text-sm text-fg-secondary">
          {d.room} · Bed {d.bed} · {d.roomTypeName} {d.roomClassName} · {d.reason}
        </p>
      </div>

      <p className="text-base font-medium text-fg">1. Final meter reading</p>
      <div className="flex gap-3">
        <Field label="Electricity (kWh)" className="flex-1">
          {(id) => <Input id={id} value={electricity} onChange={(e) => setElectricity(e.target.value)} disabled={done} inputMode="numeric" />}
        </Field>
        <Field label="Water (m³)" className="flex-1">
          {(id) => <Input id={id} value={water} onChange={(e) => setWater(e.target.value)} disabled={done} inputMode="numeric" />}
        </Field>
      </div>

      <p className="text-base font-medium text-fg">2. Room condition</p>
      <Checkbox label="Bed, mattress and locker in good condition" checked={good} disabled={done} onChange={(e) => setGood(e.target.checked)} />
      <Checkbox label="Key returned" checked={key} disabled={done} onChange={(e) => setKey(e.target.checked)} />
      <Checkbox label="Damage found (adds a charge)" checked={damaged || (done && (s.damage ?? 0) > 0)} disabled={done} onChange={(e) => setDamaged(e.target.checked)} />
      {damaged && !done && (
        <Field label="Damage charge (VND)" helper="Deducted from the Utility Deposit; anything above it is invoiced.">
          {(id) => <Input id={id} value={damage} onChange={(e) => setDamage(e.target.value)} inputMode="numeric" />}
        </Field>
      )}
      <Divider />

      <p className="text-base font-medium text-fg">3. Utility Deposit settlement</p>
      <dl className="flex flex-col gap-3">
        <Row label="Utility Deposit held">{formatNumber(s.held)}</Row>
        <Row label={`Final utility share${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>− {formatNumber(s.share)}</Row>
        <Row label="Unpaid utility Invoices">− {formatNumber(s.unpaid)}</Row>
        {damageAmount > 0 && <Row label="Damage charge">− {formatNumber(damageAmount)}</Row>}
        <Row label={refund >= 0 ? 'Refund to Student' : 'Student still owes'} strong tone={refund >= 0 ? 'text-fg-brand' : 'text-error-fg'}>
          {formatNumber(Math.abs(refund))}
        </Row>
      </dl>

      {done ? (
        <Alert type="success" title={`Checked out ${formatDateTime(d.checkedOutAt)}`}>
          {d.refundStatus === 'Approved' ? 'The Manager approved the refund.' : 'The refund is waiting for the Manager’s approval.'} The Bed is free again.
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
          {!key && <p className="text-right text-sm text-error-fg">Collect the Room key before you confirm.</p>}
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
  const [selectedCode, setSelectedCode] = useState(null)

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
  const code = items.find((r) => r.studentCode === selectedCode)?.studentCode ?? items[0]?.studentCode
  const detail = useQuery(['check-out', 'detail', code], ({ signal }) => api.desk.checkOutDetail(code, { signal }), { enabled: Boolean(code), keepPrevious: false })

  return (
    <>
      <PageHeader
        title="Check-out desk"
        description={list.data ? `${list.data.date ? `${formatDate(list.data.date)} · ` : ''}${formatNumber(list.data.pendingCount)} Allocations in Pending check-out.` : 'Allocations in Pending check-out.'}
        actions={<DeskModeSwitch mode="out" />}
      />

      <div className="flex shrink-0 items-center gap-3">
        <SearchInput wrapperClassName="w-80" aria-label="Search" placeholder="Search Student code or Room" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          wrapperClassName="w-60"
          aria-label="Reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Reason: All' }, ...(list.data?.reasons ?? []).map((r) => ({ value: r, label: `Reason: ${r}` }))]}
        />
      </div>

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
                <Tr key={r.studentCode} selected={r.studentCode === code} onClick={() => setSelectedCode(r.studentCode)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.name} secondary={r.studentCode} />
                  </Td>
                  <Td>
                    {r.room} · Bed {r.bed}
                  </Td>
                  <Td>{r.reason}</Td>
                  <Td>
                    <StatusTag status={r.status} tone={tones[r.status]} />
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

        {code ? (
          <QueryState query={detail} className="w-105 shrink-0 rounded-lg border border-line bg-surface">
            {(d) => <CheckOutPanel key={`${d.studentCode}-${d.status}`} d={d} />}
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
