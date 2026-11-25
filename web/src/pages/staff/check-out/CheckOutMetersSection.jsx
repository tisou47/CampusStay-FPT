import { forwardRef } from 'react'
import { Zap } from 'lucide-react'
import { Field, Input } from '@/components/ui/Field'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatNumber } from '@/lib/format'
import { t } from '@/i18n'
import { toNumber } from './checkOutShared'

export const CheckOutMetersSection = forwardRef(function CheckOutMetersSection(
  { d, done, electricity, setElectricity, water, setWater, children },
  ref,
) {
  const hasMeters = electricity !== '' && water !== ''

  return (
    <section ref={ref} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-6">
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
      {children}
    </section>
  )
})
