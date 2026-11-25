import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Save, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { formatDate, formatNumber } from '@/lib/format'
import { t } from '@/i18n'
import { DisputeCard, StudentDeclaration, StudentMeters } from './StudentDeclaration'
import {
  CheckOutHeaderCard,
  CheckOutTopBar,
  HandoverReportModal,
  toNumber,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function MeterReadingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [showHandover, setShowHandover] = useState(false)
  const ws = useCheckOutWorkspace(id)

  if (ws.detailQuery.loading && !ws.d) return <LoadingState className="min-h-80" />
  if (ws.detailQuery.error && !ws.d) return <ErrorState error={ws.detailQuery.error} onRetry={ws.detailQuery.reload} />
  if (!ws.d) return null

  const { d, s, done, electricity, setElectricity, water, setWater, submit, furnitureQuery } = ws

  return (
    <div className="flex flex-col gap-5">
      <CheckOutTopBar allocationId={d.allocationId} active="meters" />
      <CheckOutHeaderCard d={d} held={s.held} onOpenHandover={() => setShowHandover(true)} />
      <HandoverReportModal open={showHandover} onClose={() => setShowHandover(false)} d={d} />

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-6">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <Zap size={18} aria-hidden="true" className="text-fg-brand" />
          <div>
            <h2 className="text-h3 font-semibold text-fg">{t('1. Final meter reading')}</h2>
            <p className="text-xs text-fg-secondary">
              {t('Enter the final electricity and water readings for {room}.', { room: d.room })}
            </p>
          </div>
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
                inputMode="decimal"
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
                inputMode="decimal"
                className="text-right text-base tabular"
                disabled={done}
              />
            )}
          </Field>
        </div>

        <StudentMeters
          data={furnitureQuery?.data}
          disabled={done}
          onUse={(e, w) => {
            setElectricity(String(e))
            setWater(String(w))
          }}
        />

        {d.previousReading && (electricity || water) && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-subtle/50 px-4 py-3 text-sm text-fg-secondary">
            <span className="font-medium text-fg">{t('Estimated usage since last reading:')}</span>
            {electricity && (
              <span className="tabular">
                {t('Electricity')}:{' '}
                <strong className="text-fg">
                  {formatNumber(Math.max(0, toNumber(electricity) - (d.previousReading.electricity ?? 0)))} kWh
                </strong>
              </span>
            )}
            {water && (
              <span className="tabular">
                {t('Water')}:{' '}
                <strong className="text-fg">
                  {formatNumber(Math.max(0, toNumber(water) - (d.previousReading.water ?? 0)))} m³
                </strong>
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button icon={ArrowLeft} onClick={() => navigate(`/staff/check-out/${d.allocationId}`)}>
            {t('Back to overview')}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {!done && (
              <Button icon={Save} disabled={submit.pending} onClick={() => submit.run(true)}>
                {t('Save draft')}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => navigate(`/staff/check-out/${d.allocationId}/furniture`)}
            >
              <span className="inline-flex items-center gap-1.5">
                {t('Next: Room & furniture')}
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
