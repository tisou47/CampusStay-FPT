import { useEffect, useState } from 'react'
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
import { conditionName, conditionOptions, conditionTone, typeName } from '@/lib/furniture'
import { formatVnd } from '@/lib/format'
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
}) {
  const { notify, notifyError } = useToast()
  const data = query.data
  const rates = { ...DEFAULT_RATES, ...(data?.conditionRates ?? {}) }
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
  const computedLines = items.map((i) => {
    const a = answers[i.itemId] ?? { condition: i.atCheckOut ?? i.atCheckIn ?? 'Good', note: '' }
    const effCondition = condition === 'good' ? (i.atCheckIn ?? 'Good') : a.condition
    const calc = computeFurnitureCharge(i, effCondition, rates)
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

  useEffect(() => {
    onLiveTotalChange?.(liveTotal)
  }, [liveTotal, onLiveTotalChange])

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

      {/* Item-by-item inspection table when Damage found is selected (or if items are already recorded or student declared) */}
      {(condition === 'damaged' || data.saved || flaggedLines.length > 0 || studentReportedItems.length > 0) && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-2.5">
          <p className="text-xs text-fg-secondary">
            {t('Verify each item with the student on site: choose Good, Worn, Damaged or Missing, or click Record damaged / missing directly.')}
          </p>

          <ul className="flex flex-col gap-2.5">
            {computedLines.map(({ item: i, answer: a, deltaPct, nowPct, amount, effectiveReview }) => {
              const hasIssue = a.condition !== 'Good'
              return (
                <li
                  key={i.itemId}
                  className={cx(
                    'flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-3.5 transition-colors',
                    amount > 0 ? 'border-brand/40 bg-brand-subtle/30' : hasIssue ? 'bg-subtle/40' : '',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-fg">
                          {typeName(i)} · {i.personal ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}
                        </span>
                        <span className="rounded bg-subtle px-2 py-0.5 font-mono text-xs text-fg-secondary tabular">
                          {t('Base price: {price}', { price: formatVnd(i.unitPrice ?? 0) })}
                        </span>
                        {i.studentReportedCondition && (
                          <Tag tone={conditionTone[i.studentReportedCondition] ?? 'warning'}>
                            <AlertTriangle size={11} aria-hidden="true" />
                            {t('Student declared: {c}', { c: conditionName(i.studentReportedCondition) })}
                          </Tag>
                        )}
                      </div>
                      <span className="font-mono text-xs text-fg-tertiary">
                        {i.assetCode} · {t('At check-in: {c}', { c: conditionName(i.atCheckIn ?? 'Good') })}
                        {i.preExisting ? ` · ${t('there before')}` : ''}
                      </span>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
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
                      {!done && a.condition === 'Good' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (condition !== 'damaged') onConditionChange?.('damaged')
                            setAnswers((s) => ({ ...s, [i.itemId]: { ...a, condition: 'Damaged' } }))
                          }}
                        >
                          {t('Record damaged / missing')}
                        </Button>
                      )}
                      <Select
                        size="sm"
                        wrapperClassName="w-32"
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
                        options={conditionOptions()}
                      />
                    </div>
                  </div>

                  {/* On-site inspection note input */}
                  {(hasIssue || Boolean(a.note) || Boolean(i.studentReportedNote)) && (
                    <div className="flex flex-col gap-1 pt-0.5">
                      <span className="text-[11px] font-medium text-fg-secondary">{t('Note')}</span>
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
    </section>
  )
}
