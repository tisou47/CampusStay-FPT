import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight, CheckCircle2, ClipboardCheck, Receipt, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DetailFacts } from '@/components/ui/DetailFacts'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { t, tr } from '@/i18n'
import {
  CheckOutHeaderCard,
  CheckOutTopBar,
  HandoverReportModal,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function StudentCheckOutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [showHandover, setShowHandover] = useState(false)
  const ws = useCheckOutWorkspace(id)

  if (ws.detailQuery.loading && !ws.d) return <LoadingState className="min-h-80" />
  if (ws.detailQuery.error && !ws.d) return <ErrorState error={ws.detailQuery.error} onRetry={ws.detailQuery.reload} />
  if (!ws.d) return null

  const { d, s, electricity, water, condition, damageAmount, refund, done } = ws
  const hasMeters = electricity !== '' && water !== ''
  const hasCondition = Boolean(condition)

  return (
    <div className="flex flex-col gap-5">
      <CheckOutTopBar allocationId={d.allocationId} active="overview" />
      <CheckOutHeaderCard d={d} held={s.held} onOpenHandover={() => setShowHandover(true)} />
      <HandoverReportModal open={showHandover} onClose={() => setShowHandover(false)} d={d} />

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-h3 font-semibold text-fg">{t('Check-out information')}</h2>
        <DetailFacts
          facts={[
            { label: 'Room', value: t('{room} · Bed {bed}', { room: d.room, bed: d.bed }) },
            { label: 'Room type', value: [tr(d.roomTypeName), tr(d.roomClassName)].filter(Boolean).join(' · ') },
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col justify-between gap-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
                <Zap size={16} aria-hidden="true" className="text-fg-brand" />
                {t('1. Final meter reading')}
              </span>
              <Tag tone={hasMeters ? 'success' : 'warning'}>{hasMeters ? t('Entered') : t('Pending')}</Tag>
            </div>
            <p className="text-sm text-fg-secondary">
              {hasMeters
                ? `${electricity} kWh · ${water} m³`
                : t('Record the final electricity and water meter readings for the room.')}
            </p>
            {d.previousReading && (
              <p className="text-xs text-fg-tertiary tabular">
                {t('Previous reading')}: {formatNumber(d.previousReading.electricity)} kWh · {formatNumber(d.previousReading.water)} m³
              </p>
            )}
          </div>
          <Button
            variant={hasMeters ? 'secondary' : 'primary'}
            onClick={() => navigate(`/staff/check-out/${d.allocationId}/meters`)}
          >
            <span className="inline-flex items-center gap-1.5">
              {done ? t('View meter readings') : t('Enter / edit meters')}
              <ArrowRight size={14} aria-hidden="true" />
            </span>
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
                <ClipboardCheck size={16} aria-hidden="true" className="text-fg-brand" />
                {t('2. Room & furniture')}
              </span>
              <Tag tone={hasCondition ? (condition === 'good' ? 'success' : 'warning') : 'neutral'}>
                {!hasCondition
                  ? t('Not checked')
                  : condition === 'good'
                    ? t('Good condition')
                    : `− ${formatVnd(damageAmount)}`}
              </Tag>
            </div>
            <p className="text-sm text-fg-secondary">
              {t('Inspect the room and each furniture item against the check-in handover report.')}
            </p>
            {ws.fData?.items?.length != null && (
              <p className="text-xs text-fg-tertiary">{t('{n} items to inspect', { n: ws.fData.items.length })}</p>
            )}
          </div>
          <Button
            variant={hasMeters && !hasCondition ? 'primary' : 'secondary'}
            onClick={() => navigate(`/staff/check-out/${d.allocationId}/furniture`)}
          >
            <span className="inline-flex items-center gap-1.5">
              {done ? t('View furniture check') : t('Inspect room & furniture')}
              <ArrowRight size={14} aria-hidden="true" />
            </span>
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
                <Receipt size={16} aria-hidden="true" className="text-fg-brand" />
                {t('3. Settlement & confirm')}
              </span>
              <Tag tone={done ? 'success' : refund >= 0 ? 'info' : 'error'}>
                {done ? t('Completed') : refund >= 0 ? t('Refund {amount}', { amount: formatVnd(refund) }) : t('Owes {amount}', { amount: formatVnd(-refund) })}
              </Tag>
            </div>
            <p className={cx('text-lg font-semibold tabular', refund >= 0 ? 'text-success-fg' : 'text-error-fg')}>
              {refund >= 0 ? t('Refund {amount}', { amount: formatVnd(refund) }) : t('Owes {amount}', { amount: formatVnd(-refund) })}
            </p>
            <p className="text-xs text-fg-secondary tabular">
              {t('Utility deposit held')}: {formatVnd(s.held)} · {t('Damage charge')}: {formatVnd(damageAmount)}
            </p>
          </div>
          <Button
            variant={done ? 'secondary' : 'primary'}
            icon={done ? CheckCircle2 : Receipt}
            onClick={() => navigate(`/staff/check-out/${d.allocationId}/settlement`)}
          >
            <span className="inline-flex items-center gap-1.5">
              {done ? t('View final settlement') : t('Review settlement & confirm')}
              <ArrowRight size={14} aria-hidden="true" />
            </span>
          </Button>
        </div>
      </section>
    </div>
  )
}
