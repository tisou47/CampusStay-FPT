import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox, Radio } from '@/components/ui/Choice'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Select, StaticField, Textarea } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-REQ-02 New Room-Change Request (Figma 59:1743) — next Term only (Change Spec v2 phase 6, spec §6.10, D-14).
// GET /room-changes/options → { currentRoom: { room, bed, roomTypeId, roomTypeName, roomClassId, roomClassName } (your Bed
//   for the next Term), roomTypes: [{ id, name }], roomClasses: [{ id, name, surchargeRate }],
//   prices: [{ roomTypeId, roomClassId, termPrice }] (the next Term's), window: { termId, termName, closesAt,
//   decisionsDueAt } | null, reasons: [string], hasOpenRequest, canAsk, unavailable }
// POST /room-changes { termId, kind, roomTypeId, roomClassId, reason, details } → { id }
// The change takes effect in the next Term: you keep living in your Room this Term and pay the next Term's price of
// the new Bed with the next-Term fee. Nothing is charged or refunded now.

const changeTypes = [
  ['same', 'Same Room Type and Room Class, different Room'],
  ['class', 'Different Room Class'],
  ['type', 'Different Room Type'],
]

function Form({ opts }) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const cur = opts.currentRoom
  const [kind, setKind] = useState('class')
  const [newType, setNewType] = useState(opts.roomTypes.find((type) => type.id !== cur.roomTypeId)?.id ?? cur.roomTypeId)
  const [newClass, setNewClass] = useState(opts.roomClasses.find((c) => c.id !== cur.roomClassId)?.id ?? cur.roomClassId)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [understood, setUnderstood] = useState(false)

  const targetType = kind === 'type' ? newType : cur.roomTypeId
  const targetClass = kind === 'class' ? newClass : cur.roomClassId
  const price = (type, c) => opts.prices.find((p) => p.roomTypeId === type && p.roomClassId === c)?.termPrice ?? null
  const current = price(cur.roomTypeId, cur.roomClassId)
  const next = price(targetType, targetClass)
  const name = (list, id) => tr(list.find((x) => x.id === id)?.name) || '—'

  const submit = useMutation(
    () => api.roomChanges.create({ termId: opts.window?.termId, kind, roomTypeId: targetType, roomClassId: targetClass, reason, details: details.trim() || undefined }),
    {
      invalidates: ['requests', 'home', 'allocation'],
      onSuccess: (r) => {
        notify({ title: 'Room-change request submitted', message: t('{id} · it is approved only if a Bed is free.', { id: r?.id ?? t('Your request') }) })
        navigate('/student/requests?tab=room-changes')
      },
      onError: () => {},
    },
  )

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <Card padding="lg" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          {submit.error && (
            <Alert type="error" title="Could not submit the request">
              {submit.error.message}
            </Alert>
          )}
          {!opts.canAsk && (
            <Alert type="warning" title="You cannot ask now">
              {tr(opts.unavailable)}
            </Alert>
          )}
          <Field label="Your Bed next Term">
            <StaticField size="lg" className="text-fg-disabled">
              {t('{room} · Bed {bed}', { room: cur.room, bed: cur.bed })} · {tr(cur.roomTypeName)} · {tr(cur.roomClassName)}
            </StaticField>
          </Field>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-3 text-base font-medium text-fg">{t('What do you want next Term?')}</legend>
            {changeTypes.map(([value, label]) => (
              <Radio key={value} name="changeType" label={label} checked={kind === value} onChange={() => setKind(value)} />
            ))}
          </fieldset>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
            <Field label={kind === 'type' ? 'New Room Type' : 'Room Type'} className="flex-1">
              {(id) => (
                <Select
                  id={id}
                  size="lg"
                  disabled={kind !== 'type'}
                  value={kind === 'type' ? newType : cur.roomTypeId}
                  onChange={(e) => setNewType(e.target.value)}
                  options={opts.roomTypes.map((type) => ({ value: type.id, label: type.name, disabled: kind === 'type' && type.id === cur.roomTypeId }))}
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
                  options={opts.roomClasses.map((c) => ({ value: c.id, label: tr(c.name), disabled: kind === 'class' && c.id === cur.roomClassId }))}
                />
              )}
            </Field>
          </div>

          <Field label="Reason" required>
            {(id) => <Select id={id} size="lg" value={reason} onChange={(e) => setReason(e.target.value)} options={[{ value: '', label: 'Choose…', disabled: true }, ...(opts.reasons ?? [])]} />}
          </Field>
          <Field label="Details (optional)">{(id) => <Textarea id={id} size="lg" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>

          <Checkbox label="I understand the change takes effect next Term: I keep my Room until then and pay the next Term's price of the new Bed." checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        </div>

        <div className="flex shrink-0 justify-end gap-3">
          <Button size="lg" to="/student/requests?tab=room-changes">
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={() => submit.run()} disabled={!understood || !reason || !opts.canAsk || submit.pending}>
            {submit.pending ? t('Submitting…') : t('Submit request')}
          </Button>
        </div>
      </Card>

      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-90 lg:gap-4 lg:overflow-y-auto">
        <Card padding="lg" className="flex shrink-0 flex-col gap-2.5">
          <h2 className="text-card-title text-fg">{t('Next-Term fee')}</h2>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">{t('Your Bed now · {cls}', { cls: tr(cur.roomClassName) })}</span>
            <span className="text-fg">{formatVnd(current)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">{t('New · {cls}', { cls: kind === 'type' ? `${name(opts.roomTypes, targetType)} ${name(opts.roomClasses, targetClass)}` : name(opts.roomClasses, targetClass) })}</span>
            <span className="font-medium text-fg-brand">{formatVnd(next)}</span>
          </div>
          <p className="text-sm text-fg-tertiary">{t('The price per Bed in {term}. Nothing is charged or refunded now: the next-Term fee is issued for the Bed you hold next Term.', { term: opts.window?.termName ?? t('the next Term') })}</p>
        </Card>
        <Alert type="info" title="How room changes work" className="shrink-0">
          {t('One open request at a time, until {date}. Staff decide by {due} and pick a free Bed; you move at the start of the next Term.', {
            date: formatDateTime(opts.window?.closesAt),
            due: formatDateTime(opts.window?.decisionsDueAt),
          })}
        </Alert>
      </div>
    </div>
  )
}

export default function NewRoomChangeRequest() {
  const query = useQuery(['room-change-options'], ({ signal }) => api.roomChanges.options(undefined, { signal }))
  // Keep the form mounted while options refresh.
  const [opts, setOpts] = useState(null)
  useEffect(() => {
    if (query.data) setOpts(query.data)
  }, [query.data])

  return (
    <StudentPage breadcrumb={[{ label: 'Requests', to: '/student/requests' }, { label: 'Room change' }]} title="Request a room change for next Term">
      {!opts && query.loading ? (
        <LoadingState />
      ) : !opts ? (
        <ErrorState error={query.error} onRetry={query.reload} title={query.error?.status === 409 ? 'Room changes are not available' : undefined} />
      ) : !opts.currentRoom ? (
        <Alert type="info" title="Room changes open with the requests window">
          {tr(opts.unavailable)}
        </Alert>
      ) : (
        <Form opts={opts} />
      )}
    </StudentPage>
  )
}
