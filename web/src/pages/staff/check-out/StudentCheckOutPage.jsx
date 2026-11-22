import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ClipboardCheck, LogOut, Receipt, Save, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DetailFacts } from '@/components/ui/DetailFacts'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import { CheckOutMetersSection } from './CheckOutMetersSection'
import { CheckOutSettlementSection } from './CheckOutSettlementSection'
import { FurnitureConditions } from './FurnitureConditions'
import {
  CheckOutHeaderCard,
  HandoverReportModal,
  SettlementSummaryModal,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function StudentCheckOutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
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
        <Button size="sm" icon={ArrowLeft} onClick={() => navigate('/staff/check-out')}>
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
      <CheckOutMetersSection
        ref={metersRef}
        d={d}
        done={done}
        electricity={electricity}
        setElectricity={setElectricity}
        water={water}
        setWater={setWater}
      />

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
          onLiveTotalChange={setLiveFurnitureTotal}
          onLiveSummaryChange={setFurnitureSummary}
        />
      </section>

      {/* Section 3: Settlement & Confirm */}
      <CheckOutSettlementSection
        ref={settlementRef}
        s={s}
        done={done}
        condition={condition}
        damageAmount={damageAmount}
        refund={refund}
        damageLines={damageLines}
        hasSharedSplit={hasSharedSplit}
        submitPending={submit.pending}
        onJumpFurniture={() => jumpTo('furniture', furnitureRef)}
        onSaveDraft={() => submit.run(true)}
        onOpenSummary={() => setShowSummary(true)}
      />

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
