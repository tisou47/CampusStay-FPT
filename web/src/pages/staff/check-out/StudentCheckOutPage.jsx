import { useRef, useState } from 'react'
import { useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, LogOut, Receipt, Save, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DetailFacts } from '@/components/ui/DetailFacts'
import { Alert } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import { FurnitureConditions } from './FurnitureConditions'
import {
  CheckOutHeaderCard,
  HandoverReportModal,
  SettlementRow,
  SettlementSummaryModal,
  toNumber,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function StudentCheckOutPage() {
  const { id } = useParams()
  const [activeSeg, setActiveSeg] = useState('overview')
  const [showHandover, setShowHandover] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  const overviewRef = useRef(null)
  const metersRef = useRef(null)
  const furnitureRef = useRef(null)
  const settlementRef = useRef(null)

  const ws = useCheckOutWorkspace(id)

  if (ws.detailQuery.loading && !ws.d) return <LoadingState className="min-h-80" />
  if (ws.detailQuery.error && !ws.d) return <ErrorState error={ws.detailQuery.error} onRetry={ws.detailQuery.reload} />
  if (!ws.d) return null

  const {
    d,
    s,
    done,
    furnitureQuery,
    electricity,
    setElectricity,
    water,
    setWater,
    condition,
    setCondition,
    setLiveFurnitureTotal,
    setFurnitureSummary,
    damageAmount,
    refund,
    damageLines,
    hasSharedSplit,
    submit,
  } = ws

  const hasMeters = electricity !== '' && water !== ''
  const hasCondition = Boolean(condition)

  const jumpTo = (key, ref) => {
    setActiveSeg(key)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const segments = [
    { key: 'overview', label: 'Overview', icon: LogOut, ref: overviewRef },
    { key: 'meters', label: '1. Final meter reading', icon: Zap, ref: metersRef },
    { key: 'furniture', label: '2. Room & furniture', icon: ClipboardCheck, ref: furnitureRef },
    { key: 'settlement', label: '3. Settlement & confirm', icon: Receipt, ref: settlementRef },
  ]

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Sticky Header Segment Bar */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/95 px-3 py-2 backdrop-blur-xs">
        <Button size="sm" icon={ArrowLeft} to="/staff/check-out">
          {t('Check-out list')}
        </Button>

        <nav aria-label={t('Check-out steps')} className="flex flex-wrap items-center gap-1 rounded-lg bg-subtle p-1">
          {segments.map((seg) => {
            const Icon = seg.icon
            const isActive = activeSeg === seg.key
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => jumpTo(seg.key, seg.ref)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  isActive ? 'bg-primary font-semibold text-fg-on-brand' : 'text-fg-secondary hover:bg-surface hover:text-fg',
                )}
              >
                <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                <span>{t(seg.label)}</span>
              </button>
            )
          })}
        </nav>

        {!done && (
          <div className="flex items-center gap-2">
            <Button size="sm" icon={Save} disabled={submit.pending} onClick={() => submit.run(true)}>
              {t('Save draft')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={submit.pending || !condition}
              onClick={() => setShowSummary(true)}
            >
              {t('Confirm check-out')}
            </Button>
          </div>
        )}
      </div>

      {/* Section 0: Student Overview */}
      <div ref={overviewRef} className="flex scroll-mt-16 flex-col gap-4">
        <CheckOutHeaderCard d={d} held={s.held} onOpenHandover={() => setShowHandover(true)} />
        <HandoverReportModal open={showHandover} onClose={() => setShowHandover(false)} d={d} />

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 text-h3 font-semibold text-fg">{t('Check-out information')}</h2>
          <DetailFacts
            facts={[
              { label: 'Room', value: t('{room} · Bed {bed}', { room: d.room, bed: d.bed }) },
              { label: 'Room type', value: [tr(d.roomTypeName), tr(d.roomClassName)].filter(Boolean).join(' ') },
              { label: 'Reason', value: tr(d.reason) },
              { label: 'Deposit held', value: d.settlement?.held != null ? formatVnd(d.settlement.held) : null },
              {
                label: 'Opening meters',
                value:
                  d.handoverReport?.electricity != null && d.handoverReport?.water != null
                    ? `${formatNumber(d.handoverReport.electricity)} kWh · ${formatNumber(d.handoverReport.water)} m³`
                    : null,
              },
              {
                label: 'Furniture at check-in',
                value: d.handoverReport?.items ? t('{n} items', { n: d.handoverReport.items.length }) : null,
              },
              { label: 'Checked out', value: d.checkedOutAt ? formatDateTime(d.checkedOutAt) : null },
            ]}
          />
        </section>
      </div>

      {/* Section 1: Final Meter Reading */}
      <section ref={metersRef} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Zap size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
            <div>
              <h2 className="text-h3 font-semibold text-fg">{t('1. Final meter reading')}</h2>
              <p className="text-xs text-fg-secondary">
                {t('Enter the final electricity and water readings for {room}.', { room: d.room })}
              </p>
            </div>
          </div>
          <Tag tone={hasMeters ? 'success' : 'warning'}>{hasMeters ? t('Entered') : t('Pending')}</Tag>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label="Electricity (kWh)"
            helper={
              d.previousReading
                ? t('Previous reading: {value} kWh (recorded {date})', {
                    value: formatNumber(d.previousReading.electricity),
                    date: formatDate(d.previousReading.date),
                  })
                : undefined
            }
          >
            {(fieldId) => (
              <Input
                id={fieldId}
                value={electricity}
                onChange={(e) => setElectricity(e.target.value)}
                inputMode="numeric"
                className="text-right text-base tabular"
                disabled={done}
              />
            )}
          </Field>

          <Field
            label="Water (m³)"
            helper={
              d.previousReading
                ? t('Previous reading: {value} m³ (recorded {date})', {
                    value: formatNumber(d.previousReading.water),
                    date: formatDate(d.previousReading.date),
                  })
                : undefined
            }
          >
            {(fieldId) => (
              <Input
                id={fieldId}
                value={water}
                onChange={(e) => setWater(e.target.value)}
                inputMode="numeric"
                className="text-right text-base tabular"
                disabled={done}
              />
            )}
          </Field>
        </div>

        {d.previousReading && (electricity || water) && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-subtle/50 px-4 py-3 text-sm text-fg-secondary">
            <span className="font-medium text-fg">{t('Estimated usage since last reading:')}</span>
            {electricity && (
              <span className="tabular">
                {t('Electricity')}:{' '}
                <strong className="font-semibold text-fg">
                  {formatNumber(Math.max(0, toNumber(electricity) - (d.previousReading.electricity ?? 0)))} kWh
                </strong>
              </span>
            )}
            {water && (
              <span className="tabular">
                {t('Water')}:{' '}
                <strong className="font-semibold text-fg">
                  {formatNumber(Math.max(0, toNumber(water) - (d.previousReading.water ?? 0)))} m³
                </strong>
              </span>
            )}
          </div>
        )}
      </section>

      {/* Section 2: Room & Furniture Inspection */}
      <section ref={furnitureRef} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
            <div>
              <h2 className="text-h3 font-semibold text-fg">{t('2. Room & furniture')}</h2>
              <p className="text-xs text-fg-secondary">
                {t('Check the room condition and record any damaged or missing furniture items.')}
              </p>
            </div>
          </div>
          <Tag tone={hasCondition ? (condition === 'good' ? 'success' : 'warning') : 'neutral'}>
            {!hasCondition
              ? t('Not checked')
              : condition === 'good'
                ? t('Good condition')
                : `− ${formatVnd(damageAmount)}`}
          </Tag>
        </div>

        <FurnitureConditions
          allocationId={d.allocationId}
          query={furnitureQuery}
          done={done}
          condition={condition}
          onConditionChange={(val) => {
            setCondition(val)
            if (val === 'good') {
              setLiveFurnitureTotal(0)
              setFurnitureSummary(null)
            }
          }}
          electricity={electricity}
          water={water}
          onLiveTotalChange={(total) => setLiveFurnitureTotal(total)}
          onLiveSummaryChange={(summary) => setFurnitureSummary(summary)}
        />
      </section>

      {/* Section 3: Settlement & Confirm */}
      <section ref={settlementRef} className="flex scroll-mt-16 flex-col gap-5 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Receipt size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
            <div>
              <h2 className="text-h3 font-semibold text-fg">{t('3. Settlement & confirm')}</h2>
              <p className="text-xs text-fg-secondary">
                {t('Review the utility deposit, unpaid invoices, and any furniture damage charges before confirming check-out.')}
              </p>
            </div>
          </div>
          <Tag tone={done ? 'success' : refund >= 0 ? 'info' : 'error'}>
            {done
              ? t('Completed')
              : refund >= 0
                ? t('Refund {amount}', { amount: formatVnd(refund) })
                : t('Owes {amount}', { amount: formatVnd(-refund) })}
          </Tag>
        </div>

        <dl className="flex flex-col gap-3 rounded-xl border border-line bg-subtle/40 p-5">
          <SettlementRow label="Utility deposit held" strong>
            {formatVnd(s.held)}
          </SettlementRow>
          <SettlementRow label={`${t('Final utility share')}${s.periodLabel ? ` ${s.periodLabel}` : ''}`}>
            − {formatVnd(s.share)}
          </SettlementRow>
          <SettlementRow label="Unpaid utility invoices">− {formatVnd(s.unpaid)}</SettlementRow>
          {damageAmount > 0 && (
            <>
              <SettlementRow label="Damage charge" tone="text-warning-fg" strong>
                − {formatVnd(damageAmount)}
              </SettlementRow>
              {damageLines.length > 0 && (
                <div className="flex flex-col gap-1.5 border-l-2 border-warning/40 pl-3 text-xs text-fg-secondary">
                  {damageLines.map((l) => (
                    <div key={l.key} className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        {l.name} ({l.assetCode}) · {conditionName(l.condition)}
                        {l.percent > 0 ? ` ${l.percent}%` : ''}
                        {l.split > 1 ? ` · ${t('Shared · {full} ÷ {n} residents', { full: formatVnd(l.fullAmount), n: l.split })}` : ''}
                      </span>
                      <span className="shrink-0 font-medium text-fg tabular">− {formatVnd(l.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hasSharedSplit && (
                <p className="rounded-lg bg-warning-bg/60 px-3 py-2 text-xs text-warning-fg">
                  {t('Shared furniture charges are split evenly among active residents; remaining roommates will receive an invoice and notification for their share.')}
                </p>
              )}
            </>
          )}
        </dl>

        <div
          className={cx(
            'flex items-center justify-between gap-3 rounded-xl p-5',
            refund >= 0 ? 'border border-success/30 bg-success-bg' : 'border border-error/30 bg-error-bg',
          )}
        >
          <div className="flex items-center gap-3">
            {refund >= 0 ? (
              <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-success-fg" />
            ) : (
              <AlertTriangle size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-error-fg" />
            )}
            <div>
              <p className="text-base font-semibold text-fg">{t(refund >= 0 ? 'Refund to student' : 'Student still owes')}</p>
              <p className="text-xs text-fg-tertiary">
                {t(refund >= 0 ? 'Refund goes to the manager for approval' : 'The balance will be invoiced to the student')}
              </p>
            </div>
          </div>
          <span className={cx('text-2xl font-semibold tabular', refund >= 0 ? 'text-success-fg' : 'text-error-fg')}>
            {formatVnd(Math.abs(refund))}
          </span>
        </div>

        {!done && !condition && (
          <Alert type="warning" title={t('Please select the room condition before confirming check-out.')}>
            <div className="mt-2">
              <Button size="sm" onClick={() => jumpTo('furniture', furnitureRef)}>
                {t('Go to Room & furniture')}
              </Button>
            </div>
          </Alert>
        )}

        {!done && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <Button icon={Save} disabled={submit.pending} onClick={() => submit.run(true)}>
              {t('Save draft')}
            </Button>
            <Button
              variant="primary"
              disabled={submit.pending || !condition}
              onClick={() => setShowSummary(true)}
            >
              {t('Confirm check-out')}
            </Button>
          </div>
        )}
      </section>

      <SettlementSummaryModal
        open={showSummary}
        onClose={() => setShowSummary(false)}
        d={d}
        s={s}
        damageAmount={damageAmount}
        damageLines={damageLines}
        hasSharedSplit={hasSharedSplit}
        refund={refund}
        submit={{
          ...submit,
          run: async (draft) => {
            await submit.run(draft)
            setShowSummary(false)
          },
        }}
      />
    </div>
  )
}
