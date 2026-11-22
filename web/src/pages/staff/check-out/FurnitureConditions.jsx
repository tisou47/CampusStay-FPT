import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Package, Save } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { Input, Select } from '@/components/ui/Field'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionLossRates, conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { formatDateTime, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'

// Check-out › furniture by condition (V78): the student's Bed items and the Room's shared items.
// GET /check-outs/:allocationId/furniture → { items: [{ itemId, assetCode, type, typeVi, bed, personal, atCheckIn,
//   atCheckOut, preExisting, unitPrice, percent, amount, source, note, review, reviewNote }], total, studentPresent,
//   agreedAt, saved, claims, conditionRates, electricity, water, settlement, residents }
// A shared item's damage Staff record is split evenly among the Room's residents (items[].sharedWith, fullAmount): the
// leaver pays their share with the rounding remainder, each roommate gets an Invoice for theirs at check-out.
// PUT …/furniture { items: [{ itemId, condition, note, managerReview }], studentPresent, electricity, water }
// POST …/damage-claims

const reviewTone = { Pending: 'warning', Kept: 'error', Dropped: 'success' }
const DEFAULT_RATES = { Good: 0, Worn: 25, Damaged: 50, Missing: 100 }

export function computeFurnitureCharge(item, chosenCondition, rates = DEFAULT_RATES) {
  if (!item.personal && item.source === 'Acknowledged' && chosenCondition === item.atCheckOut) {
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
  onLiveSummaryChange,
}) {
  const { notify, notifyError } = useToast()
  const data = query.data
  const levels = data?.conditionLevels
  const rates = conditionLossRates(levels, { ...DEFAULT_RATES, ...(data?.conditionRates ?? {}) })
  const [answers, setAnswers] = useState({})

  useEffect(() => {
    if (!data) return
    setAnswers(
      Object.fromEntries(
        data.items.map((i) => [
          i.itemId,
          {
            condition: data.saved
              ? (i.atCheckOut ?? i.atCheckIn ?? 'Good')
              : (i.studentReportedCondition ?? i.atCheckOut ?? i.atCheckIn ?? 'Good'),
            note: data.saved ? (i.note ?? '') : (i.note ?? i.studentReportedNote ?? ''),
          },
        ]),
      ),
    )
  }, [data])

  // When Staff choose "Bed, mattress and locker in good condition", reset items to their baseline (or Good)
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
            },
          ]),
        ),
      )
    }
  }

  // Compute live lines and live total
  const items = data?.items ?? []
  const studentReportedItems = items.filter((i) => i.studentReportedCondition)
  const residents = Math.max(1, data?.residents ?? 1)
  const computedLines = items.map((i) => {
    const a = answers[i.itemId] ?? { condition: i.atCheckOut ?? i.atCheckIn ?? 'Good', note: '' }
    const effCondition = condition === 'good' ? (i.atCheckIn ?? 'Good') : a.condition
    const whole = computeFurnitureCharge(i, effCondition, rates)
    // A shared item (not acknowledged by the student) is split among the residents: the leaver's share here.
    const split = !i.personal && i.source !== 'Acknowledged' && i.source !== 'Override' && whole.amount > 0 ? residents : 1
    const calc = { ...whole, fullAmount: whole.amount, split, amount: whole.amount - (split - 1) * Math.floor(whole.amount / split) }
    const effectiveReview = i.review === 'Dropped' || i.review === 'Kept' ? i.review : null
    const countedInTotal = effectiveReview !== 'Dropped'
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
      ? 0
      : computedLines.filter((l) => l.countedInTotal).reduce((s, l) => s + l.amount, 0)

  const chargedLines =
    condition === 'good'
      ? []
      : computedLines.filter((l) => l.countedInTotal && l.amount > 0)

  const hasUnsavedAnswers =
    Boolean(data) &&
    (!data.saved
      ? condition === 'damaged' || computedLines.some((l) => l.answer.condition !== (l.item.atCheckIn ?? 'Good') || Boolean(l.answer.note?.trim()))
      : computedLines.some((l) => {
          const savedCond = l.item.atCheckOut ?? l.item.atCheckIn ?? 'Good'
          const savedNote = l.item.note ?? ''
          return l.answer.condition !== savedCond || (l.answer.note ?? '') !== savedNote
        }))

  const totalCbRef = useRef(onLiveTotalChange)
  const summaryCbRef = useRef(onLiveSummaryChange)
  totalCbRef.current = onLiveTotalChange
  summaryCbRef.current = onLiveSummaryChange

  useEffect(() => {
    totalCbRef.current?.(liveTotal)
  }, [liveTotal])

  useEffect(() => {
    if (!data || !summaryCbRef.current) return
    summaryCbRef.current({
      lines: chargedLines,
      dirty: hasUnsavedAnswers,
      payload: {
        items: computedLines.map((l) => ({
          itemId: l.item.itemId,
          condition: l.answer.condition,
          note: l.answer.note?.trim() || undefined,
        })),
        studentPresent: Boolean(data.studentPresent),
        electricity: electricity !== '' && electricity != null ? Number(String(electricity).replace(/[^\d.]/g, '')) : undefined,
        water: water !== '' && water != null ? Number(String(water).replace(/[^\d.]/g, '')) : undefined,
      },
    })
  }, [data, liveTotal, hasUnsavedAnswers, condition, answers, electricity, water])

  const flaggedLines = computedLines.filter(
    (l) => l.answer.condition !== 'Good' || l.amount > 0,
  )

  const save = useMutation(
    () =>
      api.checkOutFurniture.record(allocationId, {
        items: computedLines.map((l) => ({
          itemId: l.item.itemId,
          condition: l.answer.condition,
          note: l.answer.note?.trim() || undefined,
        })),
        studentPresent: false,
        electricity: electricity !== '' && electricity != null ? Number(String(electricity).replace(/[^\d.]/g, '')) : undefined,
        water: water !== '' && water != null ? Number(String(water).replace(/[^\d.]/g, '')) : undefined,
      }),
    {
      invalidates: ['check-out', 'check-out-furniture'],
      onSuccess: () =>
        notify({
          title: 'Furniture recorded',
          message: 'The charges go into the settlement.',
        }),
      onError: (e) => notifyError(e, 'Could not record the furniture'),
    },
  )

  if (!data) return null

  return (
    <div className="flex flex-col gap-4">
      {/* Top Condition Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-subtle/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-fg">{t('Room condition')}:</span>
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
        {liveTotal > 0 ? (
          <span className="rounded-md bg-warning-bg px-3 py-1 text-sm font-semibold text-warning-fg tabular">
            − {formatVnd(liveTotal)}
          </span>
        ) : condition === 'good' ? (
          <span className="rounded-md bg-success-bg px-3 py-1 text-sm font-semibold text-success-fg tabular">
            {formatVnd(0)}
          </span>
        ) : null}
      </div>

      {/* Condition rate reference & baseline */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-secondary">
        <div className="flex flex-wrap items-center gap-2">
          <Package size={15} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-fg-brand" />
          <span className="font-medium text-fg">{t('Condition rate schedule:')}</span>
          {['Good', 'Worn', 'Damaged', 'Missing'].map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded bg-subtle px-2 py-0.5 text-fg">
              <span className="text-fg-secondary">{conditionName(c, levels)}:</span>
              <strong className="font-semibold tabular">{rates[c] ?? DEFAULT_RATES[c]}%</strong>
            </span>
          ))}
        </div>
        <span className="text-fg-tertiary">
          {data.checkInReport
            ? t('Compared with the Final report {id} ({how}, {date}): kept from check-in until check-out.', {
                id: data.checkInReport.id,
                how: tr(data.checkInReport.source),
                date: formatDateTime(data.checkInReport.finalizedAt),
              })
            : t('No final check-in inventory for this stay: every item is compared as Good.')}
        </span>
      </div>

      {/* Student stay-time declarations banner */}
      {studentReportedItems.length > 0 && (
        <Alert type="warning" title={t('Student declared {n} damaged/missing items during stay', { n: studentReportedItems.length })}>
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {studentReportedItems.map((i) => (
              <li key={i.itemId} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-fg">{typeName(i)} ({i.assetCode}):</span>
                <Tag tone={conditionTone[i.studentReportedCondition] ?? 'warning'}>
                  {conditionName(i.studentReportedCondition)}
                </Tag>
                {i.studentReportedNote && <span className="text-fg-secondary">— {i.studentReportedNote}</span>}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Item-by-item inspection list (flat divided rows, no nested cards) */}
      {(condition === 'damaged' || data.saved || flaggedLines.length > 0 || studentReportedItems.length > 0) && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-fg-secondary">
            {t('Select the actual condition on site for each item. Shared items with damage are split evenly among {n} residents in the room.', { n: residents })}
          </p>

          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {computedLines.map(({ item: i, answer: a, deltaPct, nowPct, amount, fullAmount, split, effectiveReview }) => {
              const hasIssue = a.condition !== 'Good'
              return (
                <li
                  key={i.itemId}
                  className={cx(
                    'flex flex-col gap-2.5 px-4 py-3.5 transition-colors',
                    amount > 0 ? 'bg-brand-subtle/20' : hasIssue ? 'bg-subtle/30' : 'hover:bg-subtle/30',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-2.5">
                        <span className="text-base font-semibold text-fg">{typeName(i)}</span>
                        <span className="text-xs font-medium text-fg-brand">
                          {i.personal ? t('Bed {bed}', { bed: i.bed }) : t('Shared ({n} residents)', { n: residents })}
                        </span>
                        <span className="font-mono text-xs text-fg-tertiary">{i.assetCode}</span>
                        {i.studentReportedCondition && (
                          <Tag tone={conditionTone[i.studentReportedCondition] ?? 'warning'}>
                            <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" />
                            {t('Student declared: {c}', { c: conditionName(i.studentReportedCondition) })}
                          </Tag>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-secondary">
                        <span className="tabular">
                          {t('Base price')}: <strong className="font-semibold text-fg">{formatVnd(i.unitPrice ?? 0)}</strong>
                        </span>
                        <span>
                          {t('At check-in')}: <strong className="font-medium text-fg">{conditionName(i.atCheckIn ?? 'Good')}</strong>
                          {i.preExisting ? ` (${t('Pre-existing')})` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-4">
                      {(hasIssue || amount > 0) && (
                        <div className="flex flex-col items-end text-right">
                          <span className="text-base font-semibold text-fg tabular">
                            {formatVnd(amount)}
                          </span>
                          <span className="text-xs text-fg-secondary tabular">
                            {i.preExisting
                              ? t('Pre-existing (0%)')
                              : deltaPct !== nowPct
                                ? `${formatVnd(i.unitPrice ?? 0)} × ${deltaPct}% (${nowPct}% − ${nowPct - deltaPct}%)`
                                : `${formatVnd(i.unitPrice ?? 0)} × ${deltaPct}%`}
                            {split > 1 ? ` ÷ ${split} ${t('residents')}` : ''}
                          </span>
                        </div>
                      )}
                      {effectiveReview && <Tag tone={reviewTone[effectiveReview] ?? 'neutral'}>{t(effectiveReview)}</Tag>}
                      <Select
                        size="sm"
                        wrapperClassName="w-44 shrink-0"
                        disabled={done || condition === 'good'}
                        aria-label={t('Condition of {item}', { item: i.assetCode })}
                        value={a.condition}
                        onChange={(e) => {
                          const nextCond = e.target.value
                          if (nextCond !== 'Good' && condition !== 'damaged') {
                            onConditionChange?.('damaged')
                          }
                          setAnswers((s) => ({ ...s, [i.itemId]: { ...a, condition: nextCond } }))
                        }}
                        options={conditionOptions(levels)}
                      />
                    </div>
                  </div>

                  {/* On-site inspection note input */}
                  {(hasIssue || Boolean(a.note) || Boolean(i.studentReportedNote)) && (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium text-fg-secondary">{t('Note')}:</span>
                      <Input
                        size="sm"
                        disabled={done}
                        aria-label={t('Note for {item}', { item: i.assetCode })}
                        value={a.note}
                        onChange={(e) => setAnswers((s) => ({ ...s, [i.itemId]: { ...a, note: e.target.value } }))}
                        placeholder={t('On-site inspection note (optional)...')}
                        maxLength={300}
                      />
                    </div>
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
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-base font-semibold text-fg">
            {t('Summary of damaged / worn / missing items')}
          </span>
          <span className="rounded-md border border-line bg-subtle/60 px-3 py-1 text-sm font-semibold text-fg tabular">
            {t('Total furniture charge: {amount}', { amount: formatVnd(liveTotal) })}
          </span>
        </div>

        {flaggedLines.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success-fg">
            <CheckCircle2 size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
            {t('All furniture items are in good condition. No furniture compensation charge.')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(0,1.5fr)_8rem_7.5rem_5rem_7.5rem] items-center gap-3 bg-subtle/80 px-4 py-2.5 text-xs font-medium text-fg-secondary">
                <span>{t('Furniture')}</span>
                <span>{t('Condition')}</span>
                <span className="text-right">{t('Real price')}</span>
                <span className="text-right">{t('Percent')}</span>
                <span className="text-right">{t('Charge')}</span>
              </div>
              <div className="divide-y divide-line/60">
                {flaggedLines.map(({ item: i, answer: a, deltaPct, amount, fullAmount, split, effectiveReview }) => (
                  <div key={i.itemId} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
                    <div className="grid grid-cols-[minmax(0,1.5fr)_8rem_7.5rem_5rem_7.5rem] items-center gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-semibold text-fg">{typeName(i)}</span>
                        <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg-tertiary">{i.assetCode}</span>
                      </div>
                      <span>
                        <Tag tone={conditionTone[a.condition] ?? 'warning'}>{conditionName(a.condition)}</Tag>
                      </span>
                      <span className="text-right text-sm text-fg-secondary tabular">{formatVnd(i.unitPrice ?? 0)}</span>
                      <span className="text-right text-sm text-fg-secondary tabular">{deltaPct}%</span>
                      <span className="text-right text-base font-semibold text-fg tabular">
                        {effectiveReview === 'Pending' ? t('Pending') : formatVnd(amount)}
                      </span>
                    </div>
                    {split > 1 && (
                      <span className="text-xs font-medium text-fg-brand tabular">
                        {t('Shared item: {full} ÷ {n} residents; roommates get an invoice for their share', { full: formatVnd(fullAmount), n: split })}
                      </span>
                    )}
                    {a.note?.trim() && (
                      <span className="text-xs text-fg-secondary">
                        {t('Note')}: {a.note.trim()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!done && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-2">
            <Button
              size="sm"
              variant="primary"
              icon={Save}
              onClick={() => {
                if (!condition) onConditionChange?.(flaggedLines.length > 0 ? 'damaged' : 'good')
                save.run()
              }}
              disabled={save.pending}
            >
              {t('Record furniture')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
