import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, CheckCircle2, Receipt, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { conditionName } from '@/lib/furniture'
import { formatVnd } from '@/lib/format'
import { t } from '@/i18n'
import {
  CheckOutHeaderCard,
  CheckOutTopBar,
  HandoverReportModal,
  SettlementRow,
  SettlementSummaryModal,
  useCheckOutWorkspace,
} from './checkOutShared'

export default function SettlementPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [showHandover, setShowHandover] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const ws = useCheckOutWorkspace(id)

  if (ws.detailQuery.loading && !ws.d) return <LoadingState className="min-h-80" />
  if (ws.detailQuery.error && !ws.d) return <ErrorState error={ws.detailQuery.error} onRetry={ws.detailQuery.reload} />
  if (!ws.d) return null

  const {
    d,
    s,
    done,
    condition,
    damageAmount,
    refund,
    damageLines,
    hasSharedSplit,
    submit,
  } = ws

  return (
    <div className="flex flex-col gap-5">
      <CheckOutTopBar allocationId={d.allocationId} active="settlement" />
      <CheckOutHeaderCard d={d} held={s.held} onOpenHandover={() => setShowHandover(true)} />
      <HandoverReportModal open={showHandover} onClose={() => setShowHandover(false)} d={d} />

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-6">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <Receipt size={18} aria-hidden="true" className="text-fg-brand" />
          <div>
            <h2 className="text-h3 font-semibold text-fg">{t('3. Settlement & confirm')}</h2>
            <p className="text-xs text-fg-secondary">
              {t('Review the utility deposit, unpaid invoices, and any furniture damage charges before confirming check-out.')}
            </p>
          </div>
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
              <CheckCircle2 size={26} aria-hidden="true" className="shrink-0 text-success-fg" />
            ) : (
              <AlertTriangle size={26} aria-hidden="true" className="shrink-0 text-error-fg" />
            )}
            <div>
              <p className="text-base font-semibold text-fg">{t(refund >= 0 ? 'Refund to student' : 'Student still owes')}</p>
              <p className="text-xs text-fg-tertiary">
                {t(refund >= 0 ? 'Refund goes to the manager for approval' : 'The balance will be invoiced to the student')}
              </p>
            </div>
          </div>
          <span className={cx('text-2xl font-bold tabular', refund >= 0 ? 'text-success-fg' : 'text-error-fg')}>
            {formatVnd(Math.abs(refund))}
          </span>
        </div>

        {!done && !condition && (
          <Alert type="warning" title={t('Please select the room condition before confirming check-out.')}>
            <div className="mt-2">
              <Button size="sm" onClick={() => navigate(`/staff/check-out/${d.allocationId}/furniture`)}>
                {t('Go to Room & furniture')}
              </Button>
            </div>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button icon={ArrowLeft} onClick={() => navigate(`/staff/check-out/${d.allocationId}/furniture`)}>
            {t('Back to room & furniture')}
          </Button>
          {!done && (
            <div className="flex flex-wrap items-center gap-2">
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
        </div>
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
