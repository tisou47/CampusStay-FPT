import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Tag } from '@/components/ui/Tag'
import { typeName } from '@/lib/furniture'
import { formatDateTime, formatVnd } from '@/lib/format'
import { t } from '@/i18n'

// Check-out › furniture by condition (V78): the student's Bed items and the Room's shared items.
// GET /check-outs/:allocationId/furniture → { items: [{ itemId, assetCode, type, typeVi, bed, personal, atCheckIn,
//   atCheckOut, preExisting, unitPrice, percent, amount, source, note, review, reviewNote }], total, studentPresent,
//   agreedAt, saved, claims }
// PUT …/furniture { items: [{ itemId, condition, note, managerReview }], studentPresent } · POST …/damage-claims

const conditions = ['Good', 'Worn', 'Damaged', 'Missing']
const reviewTone = { Pending: 'warning', Kept: 'error', Dropped: 'success' }

/** @param query the furniture query (owned by the panel, which also uses its total) */
export function FurnitureConditions({ allocationId, query, done }) {
  const { notify, notifyError } = useToast()
  const data = query.data
  const [answers, setAnswers] = useState({})
  const [present, setPresent] = useState(true)
  const [claim, setClaim] = useState(null)
  useEffect(() => {
    if (!data) return
    setAnswers(Object.fromEntries(data.items.map((i) => [i.itemId, { condition: i.atCheckOut ?? i.atCheckIn ?? 'Good', note: i.note ?? '', review: i.review === 'Pending' }])))
    if (data.saved) setPresent(Boolean(data.studentPresent))
  }, [data])
  const save = useMutation(
    () =>
      api.checkOutFurniture.record(allocationId, {
        items: Object.entries(answers).map(([itemId, a]) => ({ itemId, condition: a.condition, note: a.note || undefined, managerReview: a.review || undefined })),
        studentPresent: present,
      }),
    {
      invalidates: ['check-out', 'check-out-furniture'],
      onSuccess: () => notify({ title: 'Furniture recorded', message: present ? 'The student reads the charges on the app and agrees.' : 'The charges go into the settlement.' }),
      onError: (e) => notifyError(e, 'Could not record the furniture'),
    },
  )
  const sendClaim = useMutation(() => api.checkOutFurniture.claim(allocationId, { itemId: claim.itemId, condition: claim.condition, note: claim.note || undefined }), {
    invalidates: ['check-out-furniture'],
    onSuccess: () => {
      notify({ title: 'Damage sent to the student', message: 'It is charged only if the student confirms it.' })
      setClaim(null)
    },
    onError: (e) => notifyError(e, 'Could not send the damage'),
  })
  if (!data) return null
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-subtle/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={15} aria-hidden="true" className="text-fg-brand" />
          <p className="text-sm font-semibold text-fg">{t('Furniture by condition')}</p>
        </div>
        {data.saved && <span className="text-xs font-semibold text-warning-fg tabular">− {formatVnd(data.total)}</span>}
      </div>
      <p className="text-xs text-fg-secondary">
        {t('Compared with the student’s check-in inventory: only what got worse is charged (price list × percent). Shared items are charged only for damage the student confirmed.')}
      </p>
      <ul className="flex flex-col divide-y divide-line/60 rounded-lg bg-surface">
        {data.items.map((i) => {
          const a = answers[i.itemId] ?? { condition: 'Good', note: '', review: false }
          return (
            <li key={i.itemId} className="flex flex-col gap-1.5 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-fg">
                    {typeName(i)} · {i.personal ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}
                  </span>
                  <span className="truncate font-mono text-[11px] text-fg-tertiary">
                    {i.assetCode} · {t('At check-in: {c}', { c: t(i.atCheckIn ?? 'Good') })}
                    {i.preExisting ? ` · ${t('there before')}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {i.amount > 0 && <span className="text-xs font-semibold text-fg tabular">{formatVnd(i.amount)}</span>}
                  {i.review && <Tag tone={reviewTone[i.review] ?? 'neutral'}>{i.review}</Tag>}
                  <Select
                    size="sm"
                    wrapperClassName="w-28"
                    disabled={done || !i.personal}
                    aria-label={t('Condition of {item}', { item: i.assetCode })}
                    value={a.condition}
                    onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...a, condition: e.target.value } }))}
                    options={conditions}
                  />
                </div>
              </div>
              {!done && i.personal && i.amount > 0 && (
                <Checkbox label="The student does not accept: a Manager decides" checked={a.review} onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...a, review: e.target.checked } }))} />
              )}
              {!done && !i.personal && (
                <Button size="sm" variant="text" className="self-start" onClick={() => setClaim({ itemId: i.itemId, item: `${typeName(i)} ${i.assetCode}`, condition: 'Damaged', note: '' })}>
                  The student caused damage
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {data.claims?.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-fg-secondary">
          {data.claims.map((c) => (
            <li key={c.id}>
              {t('{item}: {condition}, {status} ({amount})', { item: `${c.type} ${c.assetCode}`, condition: t(c.condition), status: t(c.status), amount: formatVnd(c.amount) })}
            </li>
          ))}
        </ul>
      )}
      {!done && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label="The student is at the desk (agrees on the app)" checked={present} onChange={(e) => setPresent(e.target.checked)} />
          <Button size="sm" onClick={() => save.run()} disabled={save.pending}>
            Record furniture
          </Button>
        </div>
      )}
      {data.saved && data.studentPresent && (
        <p className={data.agreedAt ? 'text-xs font-medium text-success-fg' : 'text-xs font-medium text-warning-fg'}>
          {data.agreedAt ? t('The student agreed on {date}.', { date: formatDateTime(data.agreedAt) }) : t('Waiting for the student to agree on the app.')}
        </p>
      )}
      <Modal
        open={Boolean(claim)}
        onClose={() => setClaim(null)}
        title={t('Damage to {item}', { item: claim?.item ?? '' })}
        description="The student confirms it on the app within the set time; then it is charged at check-out. Declined or not answered: nobody is charged."
        footer={
          <>
            <Button onClick={() => setClaim(null)}>Back</Button>
            <Button variant="primary" onClick={() => sendClaim.run()} disabled={sendClaim.pending}>
              Send to the student
            </Button>
          </>
        }
      >
        {claim && (
          <div className="flex flex-col gap-3">
            <Field label="Condition of the item">
              <Select value={claim.condition} onChange={(e) => setClaim({ ...claim, condition: e.target.value })} options={['Damaged', 'Missing']} />
            </Field>
            <Field label="What happened">
              <Textarea rows={2} value={claim.note} onChange={(e) => setClaim({ ...claim, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </section>
  )
}
