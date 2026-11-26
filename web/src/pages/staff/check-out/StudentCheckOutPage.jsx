import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { t } from '@/i18n'
import { CheckOutMetersSection } from './CheckOutMetersSection'
import { CheckOutSettlementSection } from './CheckOutSettlementSection'
import { FurnitureConditions } from './FurnitureConditions'
import { DisputeCard, StudentDeclaration, StudentMeters } from './StudentDeclaration'
import {
  CheckOutHeaderCard,
  HandoverReportModal,
  SettlementSummaryModal,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function StudentCheckOutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
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
    readingsInvalid,
    submit,
  } = ws

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div>
        <Button size="sm" icon={ArrowLeft} onClick={() => navigate('/staff/check-out')}>
          {t('Check-out list')}
        </Button>
      </div>

      <div ref={overviewRef} className="flex flex-col gap-4">
        <CheckOutHeaderCard d={d} held={s.held} onOpenHandover={() => setShowHandover(true)} />
        <HandoverReportModal open={showHandover} onClose={() => setShowHandover(false)} d={d} />
        <DisputeCard allocationId={d.allocationId} data={furnitureQuery.data} />
      </div>

      {/* Left: what Staff record (meters, then the Room). Right: the settlement, always in view, with the buttons. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <CheckOutMetersSection
            ref={metersRef}
            d={d}
            done={done}
            electricity={electricity}
            setElectricity={setElectricity}
            water={water}
            setWater={setWater}
          >
            <StudentMeters
              data={furnitureQuery.data}
              disabled={done}
              onUse={(e, w) => {
                setElectricity(String(e))
                setWater(String(w))
              }}
            />
          </CheckOutMetersSection>

          <section ref={furnitureRef} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-6">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <ClipboardCheck size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
              <div>
                <h2 className="text-h3 font-semibold text-fg">{t('2. Room & furniture')}</h2>
                <p className="text-xs text-fg-secondary">{t('Check the room condition and record any damaged or missing furniture items.')}</p>
              </div>
            </div>

            <StudentDeclaration data={furnitureQuery.data} />

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
        </div>

        <div className="lg:sticky lg:top-4">
          <CheckOutSettlementSection
            ref={settlementRef}
            s={s}
            done={done}
            condition={condition}
            damageAmount={damageAmount}
            refund={refund}
            damageLines={damageLines}
            hasSharedSplit={hasSharedSplit}
            submitPending={submit.pending || readingsInvalid}
            estimating={ws.estimating}
            usage={ws.usage}
            residents={furnitureQuery.data?.residents}
            onJumpFurniture={() => scrollTo(furnitureRef)}
            onSaveDraft={() => submit.run(true)}
            onOpenSummary={() => setShowSummary(true)}
          />
        </div>
      </div>

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
