import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { CalendarClock, ClipboardList, Eye, ImageOff, Lock } from 'lucide-react'
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
import { DateTimePicker } from '@/components/ui/date-time'
import { cx } from '@/lib/cx'
import { conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { campusToday, formatDate, formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// Staff › Check-in › Inventories: the students' check-in inventories of the Blocks.
// GET /handovers?block&status&comparison → { items: [{ id, studentName, studentCode, room, bed, block, status, comparison,
//   openedAt, dueAt, submittedAt, visitAt, lateReport }], total, counts }
// GET /handovers/:id → { row, differences, electricity: { baseline, baselineAt, student, verified }, water, meterPhotos,
//   items: [{ itemId, assetCode, type, typeVi, bed, personal, baseline, baselineSource, condition, note, verified,
//   verifiedNote, differs, preExisting, photos }], studentComment, confirmReason, source, finalizedAt, utilityFrom,
//   lateNote, cancelledReason, sentToStudent, visitWindow: { fromHour, toHour, lastDay, suggestions } | null }
// POST …/confirm { reason } (409 MAJOR_NEEDS_VISIT for a major difference) · POST …/visit { visitAt } (required, inside
// visitWindow) · PUT …/verification { items, electricity, water, send } · POST …/cancel { reason } · POST …/late { items }

const tabs = [
  { key: 'To review', label: 'To review' },
  { key: 'Verifying', label: 'Room visits' },
  { key: 'Draft', label: 'In progress' },
  { key: 'Late report', label: 'Late reports' },
  { key: 'Final', label: 'Final' },
]
const comparisonTone = { Matched: 'success', 'Minor difference': 'warning', 'Major difference': 'error' }
const pad = (n) => String(n).padStart(2, '0')

function Condition({ value }) {
  return value ? <Tag tone={conditionTone[value] ?? 'neutral'}>{conditionName(value)}</Tag> : <span className="text-fg-tertiary">—</span>
}

function Photos({ photos, empty = true }) {
  if (!photos?.length) {
    return empty ? (
      <span className="inline-flex items-center gap-1 text-sm text-fg-tertiary">
        <ImageOff size={14} aria-hidden="true" />
        {t('No photo')}
      </span>
    ) : null
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block size-14 overflow-hidden rounded-md border border-line">
          <img src={p.url} alt={t('Photo')} className="size-full object-cover" />
        </a>
      ))}
    </div>
  )
}

/** The differences in the language in use: items from their own rows, meters from the API's lines. */
function differenceLines(d) {
  const items = d.items.filter((i) => i.differs).map((i) => `${typeName(i)}: ${conditionName(i.baseline) || t('No record')} → ${conditionName(i.condition)}`)
  const meters = (d.differences ?? []).filter((x) => /^(Electricity|Water) /.test(x)).map((x) => tr(x))
  return [...items, ...meters]
}

/** One of the three reports: the Room's record, the student's answers, what Staff found in the Room. */
function Report({ title, subtitle, tone, meters, rows, emptyText, active, onSelect }) {
  const dim = !rows
  return (
    <section
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.()
        }
      }}
      className={cx(
        'flex h-full min-w-0 cursor-pointer flex-col gap-3 rounded-lg border p-4 text-left transition-all focus:outline-none',
        active
          ? 'border-primary bg-surface ring-2 ring-primary/20'
          : dim
            ? 'border-dashed border-line bg-subtle/40 hover:border-line-strong'
            : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <div className="flex min-h-15 flex-col justify-between gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cx('size-2.5 shrink-0 rounded-full', { neutral: 'bg-fg-tertiary', brand: 'bg-primary', success: 'bg-success' }[tone])} aria-hidden="true" />
            <h3 className="text-base font-semibold text-fg">{t(title)}</h3>
          </div>
          {active ? (
            <Tag tone="brand">{t('Viewing details')}</Tag>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fg-tertiary">
              <Eye size={13} aria-hidden="true" />
              {t('View details')}
            </span>
          )}
        </div>
        <p className="text-sm text-fg-secondary">{subtitle}</p>
      </div>
      {dim ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-md bg-subtle/40 px-3 py-8 text-center">
          <Lock size={18} aria-hidden="true" className="text-fg-tertiary" />
          <p className="text-sm text-fg-secondary">{emptyText}</p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {meters.map((m) => (
              <div key={m.label} className="flex min-h-18 flex-col justify-between rounded-md bg-subtle/60 px-3 py-2">
                <div>
                  <dt className="text-xs text-fg-secondary">{t(m.label)}</dt>
                  <dd className="text-base font-semibold text-fg tabular">{m.value == null ? '—' : `${formatNumber(m.value)} ${m.unit}`}</dd>
                </div>
                <dd className="text-xs text-fg-secondary">{m.extra || '\u00A0'}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col divide-y divide-line/70">
            {rows.map((r) => (
              <li key={r.key} className={cx('flex min-h-10 items-center justify-between gap-3 py-2', r.highlight && '-mx-2 rounded-md bg-warning-bg px-2')}>
                <span className="min-w-0 truncate text-sm text-fg" title={r.label}>
                  {r.label}
                </span>
                <div className="shrink-0">
                  <Condition value={r.value} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
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
      width={880}
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
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-auto">
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th className="w-28">Room's record</Th>
              <Th className="w-28">Student</Th>
              <Th className="w-40">Found</Th>
              <Th className="w-56">Note</Th>
            </tr>
          </THead>
          <TBody>
            {detail.items.map((i) => (
              <Tr key={i.itemId} className={i.differs ? 'bg-warning-bg' : undefined}>
                <Td>
                  <TwoLine primary={`${typeName(i)} · ${i.assetCode ?? ''}`} secondary={i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')} />
                </Td>
                <Td>
                  <Condition value={i.baseline} />
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
                    options={conditionOptions()}
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
        <div className="flex flex-wrap gap-3">
          <Field
            label="Electricity (kWh)"
            className="w-64"
            helper={
              detail.electricity?.baselineAt
                ? t('Previous reading: {value} kWh (recorded {date}) · Student: {student}', {
                    value: detail.electricity?.baseline ?? '—',
                    date: formatDate(detail.electricity.baselineAt),
                    student: detail.electricity?.student ?? '—',
                  })
                : t('Record {value} · Student {student}', {
                    value: detail.electricity?.baseline ?? '—',
                    student: detail.electricity?.student ?? '—',
                  })
            }
          >
            <Input type="number" min="0" step="0.1" value={electricity} onChange={(e) => setElectricity(e.target.value)} />
          </Field>
          <Field
            label="Water (m³)"
            className="w-64"
            helper={
              detail.water?.baselineAt
                ? t('Previous reading: {value} m³ (recorded {date}) · Student: {student}', {
                    value: detail.water?.baseline ?? '—',
                    date: formatDate(detail.water.baselineAt),
                    student: detail.water?.student ?? '—',
                  })
                : t('Record {value} · Student {student}', {
                    value: detail.water?.baseline ?? '—',
                    student: detail.water?.student ?? '—',
                  })
            }
          >
            <Input type="number" min="0" step="0.1" value={water} onChange={(e) => setWater(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/** Set a Room visit: the shared picker, limited to the office hours and days of the visit window, with suggestions. */
function VisitModal({ open, window: w, onClose, onSave, pending }) {
  const [visitAt, setVisitAt] = useState('')
  const todayDay = campusToday()
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="Check the Room with the student"
      description="The student is notified and asked to be in the Room at this time. In the Room, record what you find and send it for their agreement."
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant="primary" icon={CalendarClock} onClick={() => onSave(visitAt)} disabled={!visitAt || pending}>
            Set the visit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {w && (
          <p className="text-sm text-fg-secondary">
            {t('Visits are set from {from}:00 to {to}:00, until {day} (System parameters › Room handover).', { from: pad(w.fromHour), to: pad(w.toHour), day: formatDate(w.lastDay) })}
          </p>
        )}
        {w?.suggestions?.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{t('Suggested times')}</span>
            <div className="flex flex-wrap gap-2">
              {w.suggestions.map((s) => (
                <Button key={s} size="sm" variant={visitAt && new Date(visitAt).getTime() === new Date(s).getTime() ? 'primary' : 'default'} onClick={() => setVisitAt(s)}>
                  {`${formatDate(s)} · ${formatTime(s)}`}
                </Button>
              ))}
            </div>
          </div>
        )}
        <Field label="Or choose a time" required>
          {(id) => (
            <DateTimePicker
              id={id}
              valueFormat="iso"
              value={visitAt}
              onChange={setVisitAt}
              minDate={todayDay}
              maxDate={w?.lastDay}
              minTime={w ? `${pad(w.fromHour)}:00` : '08:00'}
              maxTime={w ? `${pad(Math.max(w.fromHour, w.toHour - 1))}:00` : '16:00'}
              stepMinutes={60}
              disablePastTimes
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

function Detail({ id }) {
  const { notify, notifyError } = useToast()
  const query = useQuery(['handovers', 'detail', id], ({ signal }) => api.handover.detail(id, { signal }))
  const [dialog, setDialog] = useState(null)
  const [reason, setReason] = useState('')
  const [lateItems, setLateItems] = useState({})
  const [activeReport, setActiveReport] = useState('report2')
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
  const visit = useMutation((visitAt) => api.handover.visit(id, { visitAt }), {
    invalidates: ['handovers'],
    onSuccess: done('Room visit set', 'The student is notified and asked to be in the Room.'),
    onError: (e) => notifyError(e, 'Could not set the visit'),
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
    <QueryState query={query} isEmpty={() => false}>
      {(d) => {
        const status = d.row.status
        const major = d.row.comparison === 'Major difference'
        const lines = differenceLines(d)
        const itemLabel = (i) => `${typeName(i)}${i.bed ? ` · ${t('Bed {bed}', { bed: i.bed })}` : ''}`
        // The Final report exists only once Staff recorded what they found in the Room.
        const visited = d.items.some((i) => i.verified) || d.electricity?.verified != null || d.water?.verified != null
        const diff = (m) => (m?.student != null && m?.baseline != null ? Number(m.student) - Number(m.baseline) : null)
        const signed = (n, unit) => (n == null ? null : `${n >= 0 ? '+' : ''}${formatNumber(n)} ${unit} ${t('vs. the record')}`)
        return (
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-h3 font-semibold text-fg">
                  {d.row.studentName} · {d.row.studentCode}
                </h2>
                <p className="text-sm text-fg-secondary">
                  {[d.row.id, `${d.row.room} · ${t('Bed {bed}', { bed: d.row.bed })}`, tr(d.row.block)].join(' · ')}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Tag tone="neutral">{status}</Tag>
                {d.row.comparison && <Tag tone={comparisonTone[d.row.comparison] ?? 'neutral'}>{d.row.comparison}</Tag>}
              </div>
            </div>

            {lines.length > 0 && (
              <Alert type={major ? 'error' : 'warning'} title="Differences from the Room's record">
                <ul className="list-disc pl-5">
                  {lines.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {status === 'Verifying' && d.row.visitAt && (
              <Alert type="info" title={t('Room visit at {date}', { date: formatDateTime(d.row.visitAt) })}>
                {d.sentToStudent ? t('Sent to the student: the inventory is final once they agree.') : t('In the Room, record what you find and send it to the student.')}
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

            <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-3">
              <Report
                title="Report 1 · Room's record"
                subtitle={d.electricity?.baselineAt ? t('Recorded by Staff before the student moved in ({date}).', { date: formatDateTime(d.electricity.baselineAt) }) : t('Recorded by Staff before the student moved in.')}
                tone="neutral"
                active={activeReport === 'report1'}
                onSelect={() => setActiveReport('report1')}
                meters={[
                  {
                    label: 'Electricity',
                    unit: 'kWh',
                    value: d.electricity?.baseline,
                    extra: d.electricity?.baselineAt ? formatDate(d.electricity.baselineAt) : null,
                  },
                  {
                    label: 'Water',
                    unit: 'm³',
                    value: d.water?.baseline,
                    extra: d.water?.baselineAt ? formatDate(d.water.baselineAt) : null,
                  },
                ]}
                rows={d.items.map((i) => ({ key: i.itemId, label: itemLabel(i), value: i.baseline }))}
              />
              <Report
                title="Report 2 · Student's answers"
                subtitle={d.row.submittedAt ? t('Filed by the student on {date}.', { date: formatDateTime(d.row.submittedAt) }) : t('Not submitted yet.')}
                tone="brand"
                active={activeReport === 'report2'}
                onSelect={() => setActiveReport('report2')}
                meters={[
                  { label: 'Electricity', unit: 'kWh', value: d.electricity?.student, extra: signed(diff(d.electricity), 'kWh') },
                  { label: 'Water', unit: 'm³', value: d.water?.student, extra: signed(diff(d.water), 'm³') },
                ]}
                rows={d.items.map((i) => ({ key: i.itemId, label: itemLabel(i), value: i.condition, highlight: i.differs }))}
              />
              <Report
                title="Final report · Checked in the Room"
                subtitle={visited ? t('Recorded by Staff in the Room with the student.') : t('Only when Staff check the Room with the student.')}
                tone="success"
                active={activeReport === 'final'}
                onSelect={() => setActiveReport('final')}
                meters={[
                  { label: 'Electricity', unit: 'kWh', value: d.electricity?.verified },
                  { label: 'Water', unit: 'm³', value: d.water?.verified },
                ]}
                rows={visited ? d.items.map((i) => ({ key: i.itemId, label: itemLabel(i), value: i.verified ?? i.condition })) : null}
                emptyText={
                  status === 'Final'
                    ? t('Confirmed without a Room visit: there is no Final report.')
                    : status === 'Verifying'
                      ? t('Nothing recorded in the Room yet.')
                      : t('No Room visit: Staff confirm at the desk, or check a major difference in the Room.')
                }
              />
            </div>

            <section className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-base font-semibold text-fg">
                    {activeReport === 'report1'
                      ? t("Photos and notes · Report 1 (Room's record)")
                      : activeReport === 'final'
                        ? t('Photos and notes · Final report (Checked in the Room)')
                        : t("Photos and notes · Report 2 (Student's answers)")}
                  </h3>
                  <p className="text-xs text-fg-secondary">
                    {t('Click any of the 3 report cards above to inspect its specific meter photos, item photos and notes.')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={activeReport === 'report1' ? 'primary' : 'default'} onClick={() => setActiveReport('report1')}>
                    {t('Report 1')}
                  </Button>
                  <Button size="sm" variant={activeReport === 'report2' ? 'primary' : 'default'} onClick={() => setActiveReport('report2')}>
                    {t('Report 2')}
                  </Button>
                  <Button size="sm" variant={activeReport === 'final' ? 'primary' : 'default'} onClick={() => setActiveReport('final')}>
                    {t('Final report')}
                  </Button>
                </div>
              </div>

              {activeReport === 'report1' && (
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-subtle/40 px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-fg">{t('Meters (Report 1 · Baseline)')}</span>
                      <span className="text-xs text-fg-secondary">
                        {t('Electricity: {e} kWh · Water: {w} m³', {
                          e: d.electricity?.baseline != null ? formatNumber(d.electricity.baseline) : '—',
                          w: d.water?.baseline != null ? formatNumber(d.water.baseline) : '—',
                        })}
                        {d.electricity?.baselineAt ? ` · ${formatDateTime(d.electricity.baselineAt)}` : ''}
                      </span>
                    </div>
                    <Photos photos={d.baselineMeterPhotos} />
                  </div>
                  <ul className="flex flex-col divide-y divide-line">
                    {d.items.map((i) => (
                      <li key={i.itemId} className="grid grid-cols-1 items-center gap-2 px-4 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_minmax(0,1fr)_auto]">
                        <TwoLine primary={typeName(i)} secondary={`${i.assetCode ?? ''} · ${i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}`} />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Condition value={i.baseline} />
                          {i.baselineSource && <span className="text-xs text-fg-tertiary">({tr(i.baselineSource)})</span>}
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 text-sm">
                          {i.baselineNote ? (
                            <span className="text-fg">{t('Staff: {note}', { note: i.baselineNote })}</span>
                          ) : (
                            <span className="text-fg-tertiary">{t('No note')}</span>
                          )}
                        </div>
                        <Photos photos={i.baselinePhotos} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeReport === 'report2' && (
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-subtle/40 px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-fg">{t('Meters (Report 2 · Student declared)')}</span>
                      <span className="text-xs text-fg-secondary">
                        {t('Electricity: {e} kWh · Water: {w} m³', {
                          e: d.electricity?.student != null ? formatNumber(d.electricity.student) : '—',
                          w: d.water?.student != null ? formatNumber(d.water.student) : '—',
                        })}
                        {d.row.submittedAt ? ` · ${formatDateTime(d.row.submittedAt)}` : ''}
                      </span>
                    </div>
                    <Photos photos={d.meterPhotos} />
                  </div>
                  <ul className="flex flex-col divide-y divide-line">
                    {d.items.map((i) => (
                      <li key={i.itemId} className={cx('grid grid-cols-1 items-center gap-2 px-4 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_minmax(0,1fr)_auto]', i.differs && 'bg-warning-bg/50')}>
                        <TwoLine primary={typeName(i)} secondary={`${i.assetCode ?? ''} · ${i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}`} />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Condition value={i.condition} />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 text-sm">
                          {i.note ? (
                            <span className="text-fg">{t('Student: {note}', { note: i.note })}</span>
                          ) : (
                            <span className="text-fg-tertiary">{t('No note')}</span>
                          )}
                          {i.preExisting && <span className="text-fg-secondary">{t('There before the student: never charged to them')}</span>}
                        </div>
                        <Photos photos={i.photos} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeReport === 'final' && (
                <div className="overflow-hidden rounded-lg border border-line">
                  {!visited && status !== 'Final' ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 bg-subtle/30 px-4 py-8 text-center">
                      <Lock size={18} aria-hidden="true" className="text-fg-tertiary" />
                      <p className="text-sm font-medium text-fg">
                        {status === 'Verifying'
                          ? t('Nothing recorded in the Room yet.')
                          : t('No Room visit: Staff confirm at the desk, or check a major difference in the Room.')}
                      </p>
                      <p className="text-xs text-fg-secondary">
                        {t('Once Staff check the Room with the student or confirm the inventory, the Final report details will appear here.')}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-subtle/40 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-fg">{t('Meters (Final report · Official baseline)')}</span>
                          <span className="text-xs text-fg-secondary">
                            {t('Electricity: {e} kWh · Water: {w} m³', {
                              e: (d.electricity?.verified ?? d.electricity?.student) != null ? formatNumber(d.electricity?.verified ?? d.electricity?.student) : '—',
                              w: (d.water?.verified ?? d.water?.student) != null ? formatNumber(d.water?.verified ?? d.water?.student) : '—',
                            })}
                            {d.finalizedAt ? ` · ${formatDateTime(d.finalizedAt)}` : ''}
                          </span>
                        </div>
                        <Photos photos={d.meterPhotos} />
                      </div>
                      <ul className="flex flex-col divide-y divide-line">
                        {d.items.map((i) => (
                          <li key={i.itemId} className={cx('grid grid-cols-1 items-center gap-2 px-4 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_minmax(0,1fr)_auto]', i.differs && 'bg-warning-bg/50')}>
                            <TwoLine primary={typeName(i)} secondary={`${i.assetCode ?? ''} · ${i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}`} />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Condition value={i.verified ?? i.condition ?? i.baseline} />
                            </div>
                            <div className="flex min-w-0 flex-col gap-1 text-sm">
                              {i.verifiedNote ? (
                                <span className="text-fg">{t('Staff: {note}', { note: i.verifiedNote })}</span>
                              ) : (
                                <span className="text-fg-tertiary">{t('No note')}</span>
                              )}
                              {i.note && <span className="text-fg-secondary">{t('Student: {note}', { note: i.note })}</span>}
                              {i.preExisting && <span className="text-fg-secondary">{t('There before the student: never charged to them')}</span>}
                              {d.lateNote && status === 'Final' && (
                                <Select
                                  size="sm"
                                  wrapperClassName="max-w-60"
                                  aria-label={t('Accept {item} from the late report', { item: i.assetCode })}
                                  value={lateItems[i.itemId] ?? ''}
                                  onChange={(e) => setLateItems((s) => ({ ...s, [i.itemId]: e.target.value }))}
                                  options={[{ value: '', label: 'Keep as recorded' }, { value: 'Damaged', label: 'Accept as Damaged' }, { value: 'Missing', label: 'Accept as Missing' }]}
                                />
                              )}
                            </div>
                            <Photos photos={i.photos} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </section>

            {status === 'Final' && (
              <p className="text-sm text-fg-secondary">
                {t('Final ({source}) on {at}; Utility counts from {from}.', { source: t(d.source), at: formatDateTime(d.finalizedAt), from: formatDateTime(d.utilityFrom) })}
              </p>
            )}

            {status === 'Submitted' && major && (
              <Alert type="error" title="A major difference is checked in the Room">
                {t('An item reported Missing, too many items that differ or a meter beyond the limit cannot be confirmed from the desk. Set a time to check the Room with the student.')}
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {(status === 'Draft' || status === 'Submitted' || status === 'Verifying') && (
                <Button variant="danger-text" onClick={() => setDialog('cancel')}>
                  Cancel inventory
                </Button>
              )}
              {status === 'Submitted' && (
                <>
                  <Button variant={major ? 'primary' : 'default'} icon={CalendarClock} onClick={() => setDialog('visit')}>
                    Check the Room with the student
                  </Button>
                  {!major && (
                    <Button variant="primary" onClick={() => confirm.run()} disabled={confirm.pending}>
                      Confirm inventory
                    </Button>
                  )}
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
            {dialog === 'visit' && <VisitModal open window={d.visitWindow} onClose={() => setDialog(null)} onSave={(v) => visit.run(v)} pending={visit.pending} />}
            <Modal
              open={dialog === 'cancel'}
              onClose={() => setDialog(null)}
              title="Cancel this inventory"
              description="Filed for the wrong Room or by mistake. The student can start a new one."
              footer={
                <>
                  <Button onClick={() => setDialog(null)}>Back</Button>
                  <Button variant="danger" disabled={!reason.trim() || cancel.pending} onClick={() => cancel.run()}>
                    Cancel inventory
                  </Button>
                </>
              }
            >
              <Field label="Reason" required>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
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
  const [params] = useSearchParams()
  const initialStatus = params.get('status')
  const initialTab =
    initialStatus === 'Draft' || initialStatus === 'Verifying' || initialStatus === 'Final' || initialStatus === 'Late report'
      ? initialStatus
      : 'To review'
  const [tab, setTab] = useState(initialTab)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(params.get('id') ?? null)
  const list = useQuery(['handovers', 'list', scope, tab, page], ({ signal }) => api.handover.list({ ...scope, status: tab === 'To review' ? 'Submitted' : tab, page, pageSize: 20 }, { signal }))
  const items = list.data?.items ?? []
  const current = items.find((r) => r.id === selected)?.id ?? selected ?? items[0]?.id
  return (
    <>
      <PageHeader
        title="Check-in inventories"
        description="Students file the inventory of their Bed and the Room when they receive it. Matching inventories are final at once; the others wait for you here."
      />
      <Tabs items={tabs.map((x) => ({ ...x, count: x.key === 'To review' ? list.data?.counts?.Submitted : x.key === 'Verifying' ? list.data?.counts?.Verifying : undefined }))} value={tab} onChange={(k) => { setTab(k); setPage(1); setSelected(null) }} />
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-h-0 w-96 shrink-0 flex-col gap-3">
          <Table fill>
            <THead>
              <tr>
                <Th>Student</Th>
                <Th className="w-32">Comparison</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={list} colSpan={2} emptyTitle="Nothing to review" />
              {items.map((r) => (
                <Tr key={r.id} selected={r.id === current} onClick={() => setSelected(r.id)} className="[&>td]:h-15.5">
                  <Td>
                    <TwoLine primary={r.studentName} secondary={`${r.studentCode} · ${r.room} · ${t('Bed {bed}', { bed: r.bed })}`} />
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
