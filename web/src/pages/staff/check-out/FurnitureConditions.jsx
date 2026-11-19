import { useEffect, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Package, Send } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox, Radio } from '@/components/ui/Choice'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { formatDateTime, formatVnd } from '@/lib/format'
import { t } from '@/i18n'

// Check-out › furniture by condition (V78): the student's Bed items and the Room's shared items.
// GET /check-outs/:allocationId/furniture → { items: [{ itemId, assetCode, type, typeVi, bed, personal, atCheckIn,
//   atCheckOut, preExisting, unitPrice, percent, amount, source, note, review, reviewNote }], total, studentPresent,
//   agreedAt, saved, claims, conditionRates, electricity, water, settlement }
// PUT …/furniture { items: [{ itemId, condition, note, managerReview }], studentPresent, electricity, water }
// POST …/damage-claims

const reviewTone = { Pending: 'warning', Kept: 'error', Dropped: 'success' }
const DEFAULT_RATES = { Good: 0, Worn: 25, Damaged: 50, Missing: 100 }

export function computeFurnitureCharge(item, chosenCondition, rates = DEFAULT_RATES) {
  if (!item.personal) {
    return {
      startPct: 0,
      nowPct: item.percent ?? 0,
      deltaPct: item.percent ?? 0,
      amount: item.amount ?? 0,
      isWorse: (item.amount ?? 0) > 0,
    }
  }
  const startCond = item.atCheckIn ?? 'Good'
  const nowCond = chosenCondition ?? startCond
  const startPct = rates[startCond] ?? DEFAULT_RATES[startCond] ?? 0
  const nowPct = rates[nowCond] ?? DEFAULT_RATES[nowCond] ?? 0
  const deltaPct = item.preExisting ? 0 : Math.max(0, nowPct - startPct)
  const unitPrice = item.unitPrice ?? 0
  const amount = Math.floor((unitPrice * deltaPct) / 100)
  return {
    startPct,
    nowPct,
    deltaPct,
    amount,
    isWorse: nowCond !== 'Good' && nowCond !== startCond,
  }
}

/**
 * @param query the furniture query (owned by the panel, which also uses its total)
 * @param condition 'good' | 'damaged' | ''
 * @param onConditionChange switches between all-good and recording damaged/worn/missing items
 */
export function FurnitureConditions({
  allocationId,
  query,
  done,
  condition,
  onConditionChange,
  electricity,
  water,
  onLiveTotalChange,
}) {
  const { notify, notifyError } = useToast()
  const data = query.data
  const rates = { ...DEFAULT_RATES, ...(data?.conditionRates ?? {}) }
  const [answers, setAnswers] = useState({})
  const [present, setPresent] = useState(true)
  const [claim, setClaim] = useState(null)

  useEffect(() => {
    if (!data) return
    setAnswers(
      Object.fromEntries(
        data.items.map((i) => [
          i.itemId,
          {
            condition: i.atCheckOut ?? i.atCheckIn ?? 'Good',
            note: i.note ?? '',
            review: i.review === 'Pending',
          },
        ]),
      ),
    )
    if (data.saved) setPresent(Boolean(data.studentPresent))
  }, [data])

  // When Staff choose "Bed, mattress and locker in good condition", reset personal items to their baseline (or Good)
  const selectAllGood = () => {
    onConditionChange?.('good')
    if (data?.items) {
      setAnswers(
        Object.fromEntries(
          data.items.map((i) => [
            i.itemId,
            {
              condition: i.atCheckIn ?? 'Good',
              note: '',
              review: false,
            },
          ]),
        ),
      )
    }
  }

  // Compute live lines and live total
  const items = data?.items ?? []
  const computedLines = items.map((i) => {
    const a = answers[i.itemId] ?? { condition: i.atCheckOut ?? i.atCheckIn ?? 'Good', note: '', review: false }
    const effCondition = condition === 'good' && i.personal ? (i.atCheckIn ?? 'Good') : a.condition
    const calc = computeFurnitureCharge(i, effCondition, rates)
    const effectiveReview = a.review ? 'Pending' : i.review === 'Dropped' || i.review === 'Kept' ? i.review : null
    const countedInTotal = effectiveReview !== 'Pending' && effectiveReview !== 'Dropped'
    return {
      item: i,
      answer: { ...a, condition: effCondition },
      ...calc,
      effectiveReview,
      countedInTotal,
    }
  })

  const liveTotal =
    condition === 'good'
      ? computedLines.filter((l) => !l.item.personal && l.countedInTotal).reduce((s, l) => s + l.amount, 0)
      : computedLines.filter((l) => l.countedInTotal).reduce((s, l) => s + l.amount, 0)

  useEffect(() => {
    onLiveTotalChange?.(liveTotal)
  }, [liveTotal, onLiveTotalChange])

  const flaggedLines = computedLines.filter(
    (l) =>
      (l.item.personal && l.answer.condition !== 'Good') ||
      (!l.item.personal && l.amount > 0),
  )

  const save = useMutation(
    () =>
      api.checkOutFurniture.record(allocationId, {
        items: computedLines.map((l) => ({
          itemId: l.item.itemId,
          condition: l.answer.condition,
          note: l.answer.note?.trim() || undefined,
          managerReview: l.answer.review || undefined,
        })),
        studentPresent: present,
        electricity: electricity !== '' && electricity != null ? Number(String(electricity).replace(/[^\d.]/g, '')) : undefined,
        water: water !== '' && water != null ? Number(String(water).replace(/[^\d.]/g, '')) : undefined,
      }),
    {
      invalidates: ['check-out', 'check-out-furniture'],
      onSuccess: () =>
        notify({
          title: 'Furniture recorded',
          message: present
            ? 'The student reads the charges on the app and agrees.'
            : 'The charges go into the settlement.',
        }),
      onError: (e) => notifyError(e, 'Could not record the furniture'),
    },
  )

  const sendClaim = useMutation(
    () =>
      api.checkOutFurniture.claim(allocationId, {
        itemId: claim.itemId,
        condition: claim.condition,
        note: claim.note || undefined,
      }),
    {
      invalidates: ['check-out-furniture'],
      onSuccess: () => {
        notify({ title: 'Damage sent to the student', message: 'It is charged only if the student confirms it.' })
        setClaim(null)
      },
      onError: (e) => notifyError(e, 'Could not send the damage'),
    },
  )

  if (!data) return null

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-subtle/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={15} aria-hidden="true" className="text-fg-brand" />
          <p className="text-sm font-semibold text-fg">{t('2. Room condition')}</p>
        </div>
        {liveTotal > 0 ? (
          <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-fg tabular">
            − {formatVnd(liveTotal)}
          </span>
        ) : condition === 'good' ? (
          <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success-fg tabular">
            {formatVnd(0)}
          </span>
        ) : null}
      </div>

      {/* Top Condition Mode Switcher */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-fg-secondary">{t('Room condition')}</span>
        <Radio
          name="room-condition"
          label="Bed, mattress and locker in good condition"
          checked={condition === 'good'}
          disabled={done}
          onChange={selectAllGood}
        />
        <Radio
          name="room-condition"
          label="Damage found (adds a charge)"
          checked={condition === 'damaged'}
          disabled={done}
          onChange={() => onConditionChange?.('damaged')}
        />
      </div>

      {/* Condition rate reference badges */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line/70 bg-surface px-3 py-2 text-xs text-fg-secondary">
        <Package size={14} aria-hidden="true" className="shrink-0 text-fg-brand" />
        <span className="font-medium text-fg">{t('Condition rate schedule:')}</span>
        {['Good', 'Worn', 'Damaged', 'Missing'].map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium text-fg">
            <span>{conditionName(c)}:</span>
            <strong className="tabular">{rates[c] ?? DEFAULT_RATES[c]}%</strong>
          </span>
        ))}
      </div>

      {/* Item-by-item inspection table when Damage found is selected (or if items are already recorded) */}
      {(condition === 'damaged' || data.saved || flaggedLines.length > 0) && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-2.5">
          <p className="text-xs text-fg-secondary">
            {t('Compared with the student’s check-in inventory: only what got worse is charged (real price × the share lost, Admin › Furniture types). Shared items are charged only for damage the student confirmed.')}
          </p>

          <ul className="flex flex-col divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface">
            {computedLines.map(({ item: i, answer: a, deltaPct, nowPct, amount, effectiveReview }) => {
              const hasIssue = a.condition !== 'Good'
              return (
                <li
                  key={i.itemId}
                  className={cx(
                    'flex flex-col gap-2 px-3 py-2.5 transition-colors',
                    amount > 0 ? 'bg-brand-subtle/30' : hasIssue ? 'bg-subtle/40' : '',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-fg">
                          {typeName(i)} · {i.personal ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}
                        </span>
                        <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary tabular">
                          {t('Base price: {price}', { price: formatVnd(i.unitPrice ?? 0) })}
                        </span>
                      </div>
                      <span className="truncate font-mono text-[11px] text-fg-tertiary">
                        {i.assetCode} · {t('At check-in: {c}', { c: conditionName(i.atCheckIn ?? 'Good') })}
                        {i.preExisting ? ` · ${t('there before')}` : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Automatic Price x % = Amount pill when non-Good or charged */}
                      {(hasIssue || amount > 0) && (
                        <div className="flex flex-col items-end text-right">
                          <span className="text-xs font-bold text-fg tabular">
                            {formatVnd(amount)}
                          </span>
                          <span className="text-[11px] text-fg-tertiary tabular">
                            {i.preExisting
                              ? t('Pre-existing (0%)')
                              : deltaPct !== nowPct
                                ? `${formatVnd(i.unitPrice ?? 0)} × ${deltaPct}% (${nowPct}% − ${nowPct - deltaPct}%)`
                                : `${formatVnd(i.unitPrice ?? 0)} × ${deltaPct}%`}
                          </span>
                        </div>
                      )}
                      {effectiveReview && <Tag tone={reviewTone[effectiveReview] ?? 'neutral'}>{t(effectiveReview)}</Tag>}
                      <Select
                        size="sm"
                        wrapperClassName="w-32"
                        disabled={done || !i.personal || condition === 'good'}
                        aria-label={t('Condition of {item}', { item: i.assetCode })}
                        value={a.condition}
                        onChange={(e) => {
                          const nextCond = e.target.value
                          if (nextCond !== 'Good' && condition !== 'damaged') {
                            onConditionChange?.('damaged')
                          }
                          setAnswers((s) => ({ ...s, [i.itemId]: { ...a, condition: nextCond } }))
                        }}
                        options={conditionOptions()}
                      />
                    </div>
                  </div>

                  {/* Note input & Manager review option when item is Worn / Damaged / Missing */}
                  {i.personal && hasIssue && (
                    <div className="flex flex-col gap-1.5 pt-0.5">
                      <Input
                        size="sm"
                        disabled={done}
                        aria-label={t('Damage note for {item}', { item: i.assetCode })}
                        value={a.note}
                        onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...a, note: e.target.value } }))}
                        placeholder={t('What is damaged?')}
                        maxLength={300}
                      />
                      {!done && amount > 0 && (
                        <Checkbox
                          label="The student does not accept: a Manager decides"
                          checked={a.review}
                          onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...a, review: e.target.checked } }))}
                        />
                      )}
                    </div>
                  )}

                  {!done && !i.personal && (
                    <Button
                      size="sm"
                      variant="text"
                      className="self-start"
                      onClick={() =>
                        setClaim({
                          itemId: i.itemId,
                          item: `${typeName(i)} ${i.assetCode}`,
                          unitPrice: i.unitPrice ?? 0,
                          condition: 'Damaged',
                          note: '',
                        })
                      }
                    >
                      The student caused damage
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Shared damage claims list */}
      {data.claims?.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-line/60 bg-surface px-3 py-2 text-xs text-fg-secondary">
          {data.claims.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>
                {t('{item}: {condition}, {status} ({amount})', {
                  item: `${c.type} ${c.assetCode}`,
                  condition: conditionName(c.condition),
                  status: t(c.status),
                  amount: formatVnd(c.amount),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* End-of-section Summary of Damaged / Worn / Missing Items before sending to Student */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-fg-secondary uppercase">
            {t('Summary of damaged / worn / missing items')}
          </span>
          <span className="text-xs font-bold text-fg tabular">
            {t('Total furniture charge: {amount}', { amount: formatVnd(liveTotal) })}
          </span>
        </div>

        {flaggedLines.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-success-fg">
            <CheckCircle2 size={14} aria-hidden="true" className="shrink-0" />
            {t('All furniture items are in good condition. No furniture compensation charge.')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line/70">
            <div className="grid grid-cols-[minmax(0,1.3fr)_5.5rem_5.5rem_4rem_6rem] items-center gap-1.5 bg-subtle/80 px-2.5 py-1.5 text-[11px] font-semibold text-fg-tertiary uppercase">
              <span>{t('Furniture')}</span>
              <span>{t('Condition')}</span>
              <span className="text-right">{t('Real price')}</span>
              <span className="text-right">{t('Percent')}</span>
              <span className="text-right">{t('Charge')}</span>
            </div>
            <div className="divide-y divide-line/60">
              {flaggedLines.map(({ item: i, answer: a, deltaPct, amount, effectiveReview }) => (
                <div key={i.itemId} className="flex flex-col gap-0.5 px-2.5 py-1.5 text-xs">
                  <div className="grid grid-cols-[minmax(0,1.3fr)_5.5rem_5.5rem_4rem_6rem] items-center gap-1.5">
                    <span className="truncate font-medium text-fg">
                      {typeName(i)} <span className="font-mono text-[11px] text-fg-tertiary">({i.assetCode})</span>
                    </span>
                    <span>
                      <Tag tone={conditionTone[a.condition] ?? 'warning'}>{conditionName(a.condition)}</Tag>
                    </span>
                    <span className="text-right font-mono text-fg-secondary tabular">{formatVnd(i.unitPrice ?? 0)}</span>
                    <span className="text-right font-mono text-fg-secondary tabular">{deltaPct}%</span>
                    <span className="text-right font-mono font-semibold text-fg tabular">
                      {effectiveReview === 'Pending' ? t('Pending') : formatVnd(amount)}
                    </span>
                  </div>
                  {a.note?.trim() && (
                    <span className="text-[11px] text-fg-tertiary">
                      {t('Note')}: {a.note.trim()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!done && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
            <Checkbox
              label="The student is at the desk (agrees on the app)"
              checked={present}
              onChange={(e) => setPresent(e.target.checked)}
            />
            <Button
              size="sm"
              variant="primary"
              icon={Send}
              onClick={() => {
                if (!condition) onConditionChange?.(flaggedLines.length > 0 ? 'damaged' : 'good')
                save.run()
              }}
              disabled={save.pending}
            >
              {present ? t('Record & send to student') : t('Record furniture')}
            </Button>
          </div>
        )}

        {data.saved && data.studentPresent && (
          <p className={data.agreedAt ? 'text-xs font-medium text-success-fg' : 'text-xs font-medium text-warning-fg'}>
            {data.agreedAt
              ? t('The student agreed on {date}.', { date: formatDateTime(data.agreedAt) })
              : t('Waiting for the student to agree on the app.')}
          </p>
        )}
      </div>

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
              <Select
                value={claim.condition}
                onChange={(e) => setClaim({ ...claim, condition: e.target.value })}
                options={conditionOptions().filter((o) => o.value === 'Damaged' || o.value === 'Missing')}
              />
            </Field>
            {claim.unitPrice > 0 && (
              <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-fg-secondary tabular">
                {t('Base price: {price}', { price: formatVnd(claim.unitPrice) })} ·{' '}
                {rates[claim.condition] ?? DEFAULT_RATES[claim.condition]}% ={' '}
                <strong className="text-fg">
                  {formatVnd(Math.floor((claim.unitPrice * (rates[claim.condition] ?? DEFAULT_RATES[claim.condition])) / 100))}
                </strong>
              </p>
            )}
            <Field label="What happened">
              <Textarea rows={2} value={claim.note} onChange={(e) => setClaim({ ...claim, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </section>
  )
}
