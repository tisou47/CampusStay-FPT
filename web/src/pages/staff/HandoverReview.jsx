import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { typeName } from '@/lib/furniture'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t } from '@/i18n'

// Staff › Check-in › Inventories: the students' check-in inventories of the Blocks.
// GET /handovers?block&status&comparison → { items: [{ id, studentName, studentCode, room, bed, block, status, comparison,
//   openedAt, dueAt, submittedAt, visitAt, lateReport }], total, counts }
// GET /handovers/:id → { row, differences, electricity: { baseline, baselineAt, student, verified }, water, meterPhotos,
//   items: [{ itemId, assetCode, type, typeVi, bed, personal, baseline, baselineSource, condition, note, verified,
//   verifiedNote, differs, preExisting, photos }], studentComment, confirmReason, source, finalizedAt, utilityFrom,
//   lateNote, cancelledReason, sentToStudent }
// POST …/confirm { reason } · POST …/visit { visitAt } · PUT …/verification { items, electricity, water, send }
// POST …/cancel { reason } · POST …/late { items }

const tabs = [
  { key: 'To review', label: 'To review' },
  { key: 'Verifying', label: 'Room visits' },
  { key: 'Draft', label: 'In progress' },
  { key: 'Late report', label: 'Late reports' },
  { key: 'Final', label: 'Final' },
]
const comparisonTone = { Matched: 'success', 'Minor difference': 'warning', 'Major difference': 'error' }
const conditionTone = { Good: 'success', Worn: 'info', Damaged: 'error', Missing: 'warning' }
const conditions = ['Good', 'Worn', 'Damaged', 'Missing']

function Condition({ value }) {
  return value ? <Tag tone={conditionTone[value] ?? 'neutral'}>{value}</Tag> : <span className="text-fg-tertiary">—</span>
}

function Photos({ photos }) {
  if (!photos?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block size-12 overflow-hidden rounded-md border border-line">
          <img src={p.url} alt={t('Photo')} className="size-full object-cover" />
        </a>
      ))}
    </div>
  )
}

function Meter({ label, unit, meter }) {
  const diff = meter?.student != null && meter?.baseline != null ? Number(meter.student) - Number(meter.baseline) : null
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="font-medium text-fg">{t(label)}</span>
      <span className="text-fg-secondary">
        {t('Record {value} {unit}', { value: meter?.baseline ?? '—', unit })} · {t('Student {value} {unit}', { value: meter?.student ?? '—', unit })}
        {diff != null ? ` (${diff >= 0 ? '+' : ''}${formatNumber(diff)} ${unit})` : ''}
        {meter?.verified != null ? ` · ${t('Staff {value} {unit}', { value: meter.verified, unit })}` : ''}
      </span>
    </div>
  )
}

function Verification({ detail, onClose }) {
  const { notify, notifyError } = useToast()
  const [items, setItems] = useState(Object.fromEntries(detail.items.map((i) => [i.itemId, { condition: i.verified ?? i.condition ?? 'Good', note: i.verifiedNote ?? '' }])))
  const [electricity, setElectricity] = useState(detail.electricity?.verified ?? detail.electricity?.student ?? '')
  const [water, setWater] = useState(detail.water?.verified ?? detail.water?.student ?? '')
  const save = useMutation(
    (send) =>
      api.handover.verification(detail.row.id, {
        items: Object.entries(items).map(([itemId, v]) => ({ itemId, condition: v.condition, note: v.note || undefined })),
        electricity: electricity === '' ? undefined : Number(electricity),
        water: water === '' ? undefined : Number(water),
        send,
      }),
    {
      invalidates: ['handovers'],
      onSuccess: (_, send) => {
        notify({ title: send ? 'Sent to the student' : 'Saved', message: send ? 'The student agrees on the app; the inventory is then final.' : undefined })
        if (send) onClose()
      },
      onError: (e) => notifyError(e, 'Could not save what you found'),
    },
  )
  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title={t('Check Room {room} with the student', { room: detail.row.room })}
      description="Start from the student's answers and change what you find different. The student agrees on the app, with a comment if they see it differently: there is no dispute."
      footer={
        <>
          <Button onClick={() => save.run(false)} disabled={save.pending}>
            Save
          </Button>
          <Button variant="primary" onClick={() => save.run(true)} disabled={save.pending}>
            Send to the student
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto">
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th className="w-28">Student</Th>
              <Th className="w-36">Found</Th>
              <Th className="w-56">Note</Th>
            </tr>
          </THead>
          <TBody>
            {detail.items.map((i) => (
              <Tr key={i.itemId}>
                <Td>
                  <TwoLine primary={`${typeName(i)} · ${i.assetCode ?? ''}`} secondary={i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')} />
                </Td>
                <Td>
                  <Condition value={i.condition} />
                </Td>
                <Td>
                  <Select
                    size="sm"
                    aria-label={t('Condition of {item}', { item: i.assetCode })}
                    value={items[i.itemId].condition}
                    onChange={(e) => setItems((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], condition: e.target.value } }))}
                    options={conditions}
                  />
                </Td>
                <Td>
                  <Input
                    size="sm"
                    aria-label={t('Note for {item}', { item: i.assetCode })}
                    value={items[i.itemId].note}
                    onChange={(e) => setItems((s) => ({ ...s, [i.itemId]: { ...s[i.itemId], note: e.target.value } }))}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <div className="flex gap-3">
          <Field label="Electricity (kWh)" className="w-44">
            <Input type="number" min="0" step="0.1" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
          </Field>
          <Field label="Water (m³)" className="w-44">
            <Input type="number" min="0" step="0.1" value={water} onChange={(e) => setWater(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function Detail({ id }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['handovers', 'detail', id], ({ signal }) => api.handover.detail(id, { signal }))
  const [dialog, setDialog] = useState(null)
  const [reason, setReason] = useState('')
  const [visitAt, setVisitAt] = useState('')
  const [lateItems, setLateItems] = useState({})
  const done = (title, message) => () => {
    notify({ title, message })
    setDialog(null)
    setReason('')
  }
  const confirm = useMutation(() => api.handover.confirm(id, { reason: reason || undefined }), {
    invalidates: ['handovers'],
    onSuccess: done('Inventory confirmed', 'It is final: Utility counts from the student’s reading.'),
    onError: (e) => notifyError(e, 'Could not confirm the inventory'),
  })
  const visit = useMutation(() => api.handover.visit(id, { visitAt: visitAt ? new Date(visitAt).toISOString() : undefined }), {
    invalidates: ['handovers'],
    onSuccess: done('Room visit asked', 'The student is told when you come.'),
    onError: (e) => notifyError(e, 'Could not ask for a visit'),
  })
  const cancel = useMutation(() => api.handover.cancel(id, { reason }), {
    invalidates: ['handovers'],
    onSuccess: done('Inventory cancelled', 'The student can start a new one.'),
    onError: (e) => notifyError(e, 'Could not cancel the inventory'),
  })
  const late = useMutation(() => api.handover.acceptLate(id, { items: Object.entries(lateItems).filter(([, c]) => c).map(([itemId, condition]) => ({ itemId, condition })) }), {
    invalidates: ['handovers'],
    onSuccess: done('Late report reviewed', 'The accepted items are recorded as there before the student.'),
    onError: (e) => notifyError(e, 'Could not review the late report'),
  })

  return (
    <QueryState query={query}>
      {(d) => {
        const status = d.row.status
        return (
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-h3 font-semibold text-fg">
                  {d.row.studentName} · {d.row.studentCode}
                </h2>
                <p className="text-sm text-fg-secondary">
                  {[d.row.id, `${d.row.room} · ${t('Bed {bed}', { bed: d.row.bed })}`, d.row.block].join(' · ')}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Tag tone="neutral">{status}</Tag>
                {d.row.comparison && <Tag tone={comparisonTone[d.row.comparison] ?? 'neutral'}>{d.row.comparison}</Tag>}
              </div>
            </div>

            {d.differences?.length > 0 && (
              <Alert type={d.row.comparison === 'Major difference' ? 'error' : 'warning'} title="Differences from the Room's record">
                <ul className="list-disc pl-5">
                  {d.differences.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {d.lateNote && (
              <Alert type="info" title="Late report from the student">
                {d.lateNote}
              </Alert>
            )}
            {d.studentComment && (
              <Alert type="info" title="Student's comment">
                {d.studentComment}
              </Alert>
            )}

            <div className="flex flex-wrap gap-6">
              <Meter label="Electricity" unit="kWh" meter={d.electricity} />
              <Meter label="Water" unit="m³" meter={d.water} />
              <Photos photos={d.meterPhotos} />
            </div>

            <Table>
              <THead>
                <tr>
                  <Th>Item</Th>
                  <Th className="w-32">Room's record</Th>
                  <Th className="w-28">Student</Th>
                  <Th className="w-28">Staff</Th>
                  <Th>Note and photos</Th>
                </tr>
              </THead>
              <TBody>
                {d.items.map((i) => (
                  <Tr key={i.itemId} className={i.differs ? 'bg-warning-bg' : undefined}>
                    <Td>
                      <TwoLine primary={`${typeName(i)} · ${i.assetCode ?? ''}`} secondary={i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')} />
                    </Td>
                    <Td>
                      <TwoLine primary={<Condition value={i.baseline} />} secondary={i.baselineSource ? t(i.baselineSource) : t('No record')} />
                    </Td>
                    <Td>
                      <Condition value={i.condition} />
                    </Td>
                    <Td>
                      <Condition value={i.verified} />
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        {(i.verifiedNote || i.note) && <span className="text-sm text-fg">{i.verifiedNote || i.note}</span>}
                        {i.preExisting && <span className="text-sm text-fg-secondary">{t('There before the student: never charged to them')}</span>}
                        <Photos photos={i.photos} />
                        {d.lateNote && status === 'Final' && (
                          <Select
                            size="sm"
                            aria-label={t('Accept {item} from the late report', { item: i.assetCode })}
                            value={lateItems[i.itemId] ?? ''}
                            onChange={(e) => setLateItems((s) => ({ ...s, [i.itemId]: e.target.value }))}
                            options={[{ value: '', label: 'Keep as recorded' }, { value: 'Damaged', label: 'Accept as Damaged' }, { value: 'Missing', label: 'Accept as Missing' }]}
                          />
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>

            {status === 'Final' && (
              <p className="text-sm text-fg-secondary">
                {t('Final ({source}) on {at}; Utility counts from {from}.', { source: t(d.source), at: formatDateTime(d.finalizedAt), from: formatDateTime(d.utilityFrom) })}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {(status === 'Draft' || status === 'Submitted' || status === 'Verifying') && (
                <Button variant="danger-text" onClick={() => setDialog('cancel')}>
                  Cancel inventory
                </Button>
              )}
              {status === 'Submitted' && (
                <>
                  <Button variant="danger" onClick={() => setDialog('visit')}>
                    Check in the Room
                  </Button>
                  <Button variant="primary" onClick={() => (d.row.comparison === 'Major difference' ? setDialog('confirm') : confirm.run())} disabled={confirm.pending}>
                    Confirm inventory
                  </Button>
                </>
              )}
              {status === 'Verifying' && (
                <Button variant="primary" onClick={() => setDialog('verify')}>
                  {d.sentToStudent ? 'Change what I found' : 'Record what I found'}
                </Button>
              )}
              {d.lateNote && status === 'Final' && d.row.lateReport && (
                <Button variant="primary" onClick={() => late.run()} disabled={late.pending}>
                  Save late report review
                </Button>
              )}
            </div>

            {dialog === 'verify' && <Verification detail={d} onClose={() => setDialog(null)} />}
            <Modal
              open={dialog === 'confirm' || dialog === 'cancel'}
              onClose={() => setDialog(null)}
              title={dialog === 'cancel' ? 'Cancel this inventory' : 'Confirm with a major difference'}
              description={dialog === 'cancel' ? 'Filed for the wrong Room or by mistake. The student can start a new one.' : 'Write why the student’s answers are right without a visit.'}
              footer={
                <>
                  <Button onClick={() => setDialog(null)}>Back</Button>
                  <Button variant={dialog === 'cancel' ? 'danger' : 'primary'} disabled={!reason.trim() || confirm.pending || cancel.pending} onClick={() => (dialog === 'cancel' ? cancel.run() : confirm.run())}>
                    {dialog === 'cancel' ? 'Cancel inventory' : 'Confirm inventory'}
                  </Button>
                </>
              }
            >
              <Field label="Reason" required>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </Modal>
            <Modal
              open={dialog === 'visit'}
              onClose={() => setDialog(null)}
              title="Check the Room with the student"
              description="The student is told to be in the Room. In the Room, record what you find and send it for their agreement."
              footer={
                <>
                  <Button onClick={() => setDialog(null)}>Back</Button>
                  <Button variant="primary" onClick={() => visit.run()} disabled={visit.pending}>
                    Ask for a visit
                  </Button>
                </>
              }
            >
              <Field label="When you come (optional)">
                <Input type="datetime-local" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} />
              </Field>
            </Modal>
          </Card>
        )
      }}
    </QueryState>
  )
}

export default function HandoverReview() {
  const scope = useScopeQuery()
  const [tab, setTab] = useState('To review')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const list = useQuery(['handovers', 'list', scope, tab, page], ({ signal }) => api.handover.list({ ...scope, status: tab === 'To review' ? 'Submitted' : tab, page, pageSize: 20 }, { signal }))
  const items = list.data?.items ?? []
  const current = items.find((r) => r.id === selected)?.id ?? items[0]?.id
  return (
    <>
      <PageHeader
        title="Check-in inventories"
        description="Students file the inventory of their Bed and the Room when they receive it. Matching inventories are final at once; the others wait for you here."
      />
      <Tabs items={tabs.map((x) => ({ ...x, count: x.key === 'To review' ? list.data?.counts?.Submitted : x.key === 'Verifying' ? list.data?.counts?.Verifying : undefined }))} value={tab} onChange={(k) => { setTab(k); setPage(1); setSelected(null) }} />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-118 shrink-0 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th>Student</Th>
                <Th className="w-28">Room</Th>
                <Th className="w-36">Comparison</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={list} colSpan={3} emptyTitle="Nothing to review" />
              {items.map((r) => (
                <Tr key={r.id} selected={r.id === current} onClick={() => setSelected(r.id)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.studentName} secondary={`${r.studentCode} · ${formatDateTime(r.submittedAt ?? r.openedAt)}`} />
                  </Td>
                  <Td>
                    <TwoLine primary={r.room} secondary={t('Bed {bed}', { bed: r.bed })} />
                  </Td>
                  <Td>{r.comparison ? <Tag tone={comparisonTone[r.comparison] ?? 'neutral'}>{r.comparison}</Tag> : <Tag tone="neutral">{r.status}</Tag>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
            <Pagination total={list.data?.total ?? 0} page={page} onChange={setPage} showSizeChanger={false} />
          </div>
        </div>
        {current ? (
          <Detail key={current} id={current} />
        ) : (
          <Card className="flex min-w-0 flex-1 flex-col">
            <EmptyBlock icon={ClipboardList} title="Select an inventory" />
          </Card>
        )}
      </div>
    </>
  )
}
