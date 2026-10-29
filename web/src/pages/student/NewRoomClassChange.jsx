import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Layers } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, StaticField, Textarea } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-REQ-08 Room Class change of my Room for the next Term (Change Spec v2 phase 6, spec §6.11, D-04).
// GET /room-class-changes/options → { termId, termName, room, roomType, current: { id, name, termPrice },
//   classes: [{ id, name, termPrice }], residents (continuing residents who must agree), open: { id, status, toClass,
//   requestedBy, consents: [{ name, status }] } | null, canAsk, unavailable }
// POST /room-class-changes { roomClassId, reason } → { id, status }
// Every other continuing resident of the Room must agree; then Staff check the furniture and decide. Approved, the
// Room has the new class from the next Term and every next-Term fee of the Room uses its price.

function Form({ opts }) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [target, setTarget] = useState(opts.classes[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const submit = useMutation(() => api.roomClassChanges.create({ roomClassId: target, reason: reason.trim() || undefined }), {
    invalidates: ['requests', 'room-class-options'],
    onSuccess: (r) => {
      notify({
        title: 'Room Class change asked',
        message: r.status === 'Awaiting consent' ? t('{id}: your roommates are asked to agree.', { id: r.id }) : t('{id}: Staff decide it.', { id: r.id }),
      })
      navigate('/student/requests?tab=room-changes')
    },
    onError: () => {},
  })
  const chosen = opts.classes.find((c) => c.id === target)
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <Card padding="lg" className="flex min-w-0 flex-1 flex-col gap-4">
        {submit.error && <Alert type="error" title="Could not send the request">{submit.error.details?.fields?.roomClassId ?? submit.error.message}</Alert>}
        {!opts.canAsk && <Alert type="warning" title="You cannot ask now">{tr(opts.unavailable)}</Alert>}
        <Field label="Your Room next Term">
          <StaticField size="lg" className="text-fg-disabled">
            {opts.room} · {tr(opts.roomType)} · {tr(opts.current?.name)}
          </StaticField>
        </Field>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-3 text-base font-medium text-fg">{t('Which Room Class do you want for {term}?', { term: opts.termName })}</legend>
          {opts.classes.map((c) => (
            <Radio
              key={c.id}
              name="roomClass"
              label={`${tr(c.name)} · ${c.termPrice == null ? t('not offered') : t('{price} per Bed', { price: formatVnd(c.termPrice) })}`}
              disabled={c.termPrice == null}
              checked={target === c.id}
              onChange={() => setTarget(c.id)}
            />
          ))}
        </fieldset>
        <Field label="Why (shown to your roommates and Staff)">
          {(id) => <Textarea id={id} size="lg" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <div className="flex justify-end gap-3">
          <Button size="lg" to="/student/room">
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={!opts.canAsk || !target || submit.pending} onClick={() => submit.run()}>
            {submit.pending ? t('Sending…') : t('Ask for the change')}
          </Button>
        </div>
      </Card>
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-90 lg:gap-4">
        <Card padding="lg" className="flex shrink-0 flex-col gap-2.5">
          <h2 className="text-card-title text-fg">{t('Next-Term fee')}</h2>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">{tr(opts.current?.name)}</span>
            <span className="text-fg">{formatVnd(opts.current?.termPrice)}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="text-fg-secondary">{tr(chosen?.name) || '—'}</span>
            <span className="font-medium text-fg-brand">{formatVnd(chosen?.termPrice)}</span>
          </div>
        </Card>
        <Note>
          {t('{n} continuing residents of the Room must agree. Staff then check the furniture: an upgrade needs the missing items in the Block store; they move at the turnover.', { n: opts.residents })}
        </Note>
      </div>
    </div>
  )
}

function OpenChange({ open }) {
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-card-title text-fg">{t('Change to {cls} · {id}', { cls: tr(open.toClass), id: open.id })}</h2>
        <StatusTag status={open.status} />
      </div>
      <p className="text-base text-fg-secondary">{t('Asked by {name}', { name: open.requestedBy })}</p>
      <ul className="flex flex-col gap-1">
        {open.consents.map((c) => (
          <li key={c.name} className="flex items-center justify-between text-base">
            <span>{c.name}</span>
            <StatusTag status={c.status} />
          </li>
        ))}
      </ul>
      <Button to="/student/requests?tab=room-changes">Answer in Requests</Button>
    </Card>
  )
}

export default function NewRoomClassChange() {
  const query = useQuery(['room-class-options'], ({ signal }) => api.roomClassChanges.options(undefined, { signal }))
  const opts = query.data
  return (
    <StudentPage breadcrumb={[{ label: 'My Room', to: '/student/room' }, { label: 'Room Class change' }]} title="Change the Room Class next Term">
      {opts === undefined && query.loading ? (
        <LoadingState />
      ) : opts === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !opts.room ? (
        <Card padding="none" className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock icon={Layers} title="Room Class changes open with the requests window">
            {tr(opts.unavailable)}
          </EmptyBlock>
        </Card>
      ) : opts.open ? (
        <OpenChange open={opts.open} />
      ) : (
        <Form opts={opts} />
      )}
    </StudentPage>
  )
}
