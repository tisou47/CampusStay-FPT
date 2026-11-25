import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, ClipboardCheck, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { t } from '@/i18n'
import { FurnitureConditions } from './FurnitureConditions'
import { DisputeCard, StudentDeclaration, StudentMeters } from './StudentDeclaration'
import {
  CheckOutHeaderCard,
  CheckOutTopBar,
  HandoverReportModal,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function FurnitureCheckPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [showHandover, setShowHandover] = useState(false)
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
    water,
    condition,
    setCondition,
    setLiveFurnitureTotal,
    setFurnitureSummary,
    submit,
  } = ws

  return (
    <div className="flex flex-col gap-5">
      <CheckOutTopBar allocationId={d.allocationId} active="furniture" />
      <CheckOutHeaderCard d={d} held={s.held} onOpenHandover={() => setShowHandover(true)} />
      <HandoverReportModal open={showHandover} onClose={() => setShowHandover(false)} d={d} />

      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <ClipboardCheck size={18} aria-hidden="true" className="text-fg-brand" />
          <div>
            <h2 className="text-h3 font-semibold text-fg">{t('2. Room & furniture')}</h2>
            <p className="text-xs text-fg-secondary">
              {t('Check the room condition and record any damaged or missing furniture items.')}
            </p>
          </div>
        </div>

        <DisputeCard allocationId={d.allocationId} data={furnitureQuery.data} />
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button icon={ArrowLeft} onClick={() => navigate(`/staff/check-out/${d.allocationId}/meters`)}>
            {t('Back to meters')}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {!done && (
              <Button icon={Save} disabled={submit.pending} onClick={() => submit.run(true)}>
                {t('Save draft')}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => navigate(`/staff/check-out/${d.allocationId}/settlement`)}
            >
              <span className="inline-flex items-center gap-1.5">
                {t('Next: Settlement')}
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
