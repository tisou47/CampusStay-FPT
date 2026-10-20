import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox, Radio } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Select, StaticField, Textarea } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatVnd } from '@/lib/format'
import { StudentPage } from './shared'

// SCR-REQ-02 New Room-Change Request (Figma 59:1743)
// GET /room-changes/options?termId → { currentRoom: { room, bed, roomTypeId, roomTypeName, roomClassId, roomClassName },
//   roomTypes: [{ id, name }], roomClasses: [{ id, name, surchargeRate }], prices: [{ roomTypeId, roomClassId, termPrice }],
//   remainingDays, termDays, reasons: [string], hasOpenRequest }
// POST /room-changes { termId, kind, roomTypeId, roomClassId, reason, details } → { id }
// The price difference shown here is an estimate; the Invoice or refund is issued by the server after approval.

const changeTypes = [
  ['same', 'Same Room Type and Room Class, different Room'],
  ['class', 'Different Room Class'],
  ['type', 'Different Room Type'],
]

function Form({ opts }) {
  const navigate = useNavigate()
  const { term } = useSession()
  const { notify } = useToast()
  const cur = opts.currentRoom
  const [kind, setKind] = useState('class')
  const [newType, setNewType] = useState(opts.roomTypes.find((t) => t.id !== cur.roomTypeId)?.id ?? cur.roomTypeId)
  const [newClass, setNewClass] = useState(opts.roomClasses.find((c) => c.id !== cur.roomClassId)?.id ?? cur.roomClassId)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [understood, setUnderstood] = useState(false)

  const targetType = kind === 'type' ? newType : cur.roomTypeId
  const targetClass = kind === 'class' ? newClass : cur.roomClassId
  const price = (t, c) => opts.prices.find((p) => p.roomTypeId === t && p.roomClassId === c)?.termPrice ?? null
  const current = price(cur.roomTypeId, cur.roomClassId)
  const next = price(targetType, targetClass)
  const diff = current != null && next != null && opts.termDays ? Math.round(((next - current) * opts.remainingDays) / opts.termDays / 100) * 100 : null
  const name = (list, id) => list.find((x) => x.id === id)?.name ?? '—'

  const submit = useMutation(
    () => api.roomChanges.create({ termId: term?.id, kind, roomTypeId: targetType, roomClassId: targetClass, reason, details: details.trim() || undefined }),
    {
      invalidates: ['requests', 'home'],
      onSuccess: (r) => {
        notify({ title: 'Room-change request submitted', message: `${r?.id ?? 'Your request'} · Staff approve it only if a Bed is free.` })
        navigate('/student/requests?tab=room-changes')
      },
      onError: () => {},
    },
  )

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-6">
      <Card padding="lg" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          {submit.error && (
            <Alert type="error" title="Could not submit the request">
              {submit.error.message}
            </Alert>
          )}
          {opts.hasOpenRequest && (
            <Alert type="warning" title="You already have an open request">
              Wait for the decision on it, or cancel it from Requests, before you send another one.
            </Alert>
          )}
          <Field label="Current Room">
            <StaticField size="lg" className="text-fg-disabled">
              {cur.room} · Bed {cur.bed} · {cur.roomTypeName} · {cur.roomClassName}
            </StaticField>
          </Field>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-3 text-base font-medium text-fg">What do you want to change to?</legend>
            {changeTypes.map(([value, label]) => (
              <Radio key={value} name="changeType" label={label} checked={kind === value} onChange={() => setKind(value)} />
            ))}
          </fieldset>

          <div className="flex items-start gap-4">
            <Field label={kind === 'type' ? 'New Room Type' : 'Room Type'} className="flex-1">
              {(id) => (
                <Select
                  id={id}
                  size="lg"
                  disabled={kind !== 'type'}
                  value={kind === 'type' ? newType : cur.roomTypeId}
                  onChange={(e) => setNewType(e.target.value)}
                  options={opts.roomTypes.map((t) => ({ value: t.id, label: t.name, disabled: kind === 'type' && t.id === cur.roomTypeId }))}
                />
              )}
            </Field>
            <Field label={kind === 'class' ? 'New Room Class' : 'Room Class'} className="flex-1">
              {(id) => (
                <Select
                  id={id}
                  size="lg"
                  disabled={kind !== 'class'}
                  value={kind === 'class' ? newClass : cur.roomClassId}
                  onChange={(e) => setNewClass(e.target.value)}
                  options={opts.roomClasses.map((c) => ({ value: c.id, label: `${c.name} (+${Math.round((c.surchargeRate ?? 0) * 100)}%)`, disabled: kind === 'class' && c.id === cur.roomClassId }))}
                />
              )}
            </Field>
          </div>

          <Field label="Reason" required>
            {(id) => <Select id={id} size="lg" value={reason} onChange={(e) => setReason(e.target.value)} options={[{ value: '', label: 'Choose…', disabled: true }, ...(opts.reasons ?? [])]} />}
          </Field>
          <Field label="Details (optional)">{(id) => <Textarea id={id} size="lg" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>

          <Checkbox label="I understand my current Bed stays mine until the change is approved and I move." checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        </div>

        <div className="flex shrink-0 justify-end gap-3">
          <Button size="lg" to="/student/requests?tab=room-changes">
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={() => submit.run()} disabled={!understood || !reason || opts.hasOpenRequest || submit.pending}>
            {submit.pending ? 'Submitting…' : 'Submit request'}
          </Button>
        </div>
      </Card>

      <div className="flex w-90 shrink-0 flex-col gap-4 overflow-y-auto">
        <Card padding="lg" className="flex shrink-0 flex-col gap-2.5">
          <h2 className="text-h3 font-semibold text-fg">Price difference</h2>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">Current · {cur.roomClassName}</span>
            <span className="text-fg">{formatVnd(current)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">New · {kind === 'type' ? `${name(opts.roomTypes, targetType)} ${name(opts.roomClasses, targetClass)}` : name(opts.roomClasses, targetClass)}</span>
            <span className="text-fg">{formatVnd(next)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">Remaining Term</span>
            <span className="text-fg">
              {opts.remainingDays ?? '—'} of {opts.termDays ?? '—'} days
            </span>
          </div>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">{diff != null && diff < 0 ? 'Estimated refund' : 'Estimated to pay'}</span>
            <span className="font-medium text-fg-brand">{diff == null ? '—' : formatVnd(Math.abs(diff))}</span>
          </div>
          <p className="text-sm text-fg-tertiary">(New price − current price) × remaining days / Term days, rounded to 100 VND. Invoiced only after approval.</p>
        </Card>
        <Alert type="info" title="How room changes work" className="shrink-0">
          One open request at a time. Staff approve only if a Bed is free; a cheaper Room refunds the difference under the refund rules.
        </Alert>
      </div>
    </div>
  )
}

export default function NewRoomChangeRequest() {
  const { term } = useSession()
  const query = useQuery(['room-change-options', term?.id], ({ signal }) => api.roomChanges.options({ termId: term?.id }, { signal }))
  // Keep the form mounted while options refresh.
  const [opts, setOpts] = useState(null)
  useEffect(() => {
    if (query.data) setOpts(query.data)
  }, [query.data])

  return (
    <StudentPage breadcrumb={[{ label: 'Requests', to: '/student/requests' }, { label: 'Room change' }]} title="Request a room change">
      {!opts && query.loading ? (
        <LoadingState />
      ) : !opts ? (
        <ErrorState error={query.error} onRetry={query.reload} title={query.error?.status === 409 ? 'Room changes are not available' : undefined} />
      ) : !opts.currentRoom ? (
        <Alert type="info" title="You have no Room this Term">
          Room changes are available after check-in.
        </Alert>
      ) : (
        <Form opts={opts} />
      )}
    </StudentPage>
  )
}
