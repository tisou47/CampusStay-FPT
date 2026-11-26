import { forwardRef } from 'react'
import { AlertTriangle, CheckCircle2, Receipt, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { conditionName } from '@/lib/furniture'
import { formatNumber, formatVnd } from '@/lib/format'
import { t } from '@/i18n'
import { SettlementRow } from './checkOutShared'

export const CheckOutSettlementSection = forwardRef(function CheckOutSettlementSection(
  {
    s,
    done,
    condition,
    damageAmount,
    refund,
    damageLines,
    hasSharedSplit,
    submitPending,
    onJumpFurniture,
    onSaveDraft,
    onOpenSummary,
    estimating = false,
    usage = null,
    residents = null,
  },
  ref,
) {
  // A deduction: "− 18.038.000 ₫", or "0 ₫" when there is none.
  const minus = (amount) => (amount > 0 ? `− ${formatVnd(amount)}` : formatVnd(0))
  const period = s.periodLabel ? s.periodLabel.replace(/^since /, `${t('since')} `) : null
  return (
    <section ref={ref} className="flex scroll-mt-16 flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} strokeWidth={1.5} aria-hidden="true" className="text-fg-brand" />
          <div>
            <h2 className="text-h3 font-semibold text-fg">{t('Settlement')}</h2>
            <p className="text-xs text-fg-secondary">{t('Updates as you type the meters and record the furniture.')}</p>
          </div>
        </div>
        {done && <Tag tone="success">{t('Completed')}</Tag>}
      </div>

      <dl className="flex flex-col gap-1 divide-y divide-line/60 rounded-xl border border-line bg-subtle/40 px-4 py-3">
        <SettlementRow label="Utility deposit held" strong>
          {formatVnd(s.held)}
        </SettlementRow>
        <div className="flex flex-col py-1">
          <SettlementRow label="Final utility share">{estimating ? t('Calculating…') : minus(s.share)}</SettlementRow>
          {(period || usage) && (
            <span className="text-xs text-fg-tertiary tabular">
              {[
                period,
                usage ? t('{kwh} kWh · {m3} m³ for the Room', { kwh: formatNumber(usage.kwh), m3: formatNumber(usage.m3) }) : null,
                residents ? t('split ÷ {n} residents', { n: residents }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {!usage && !done && <span className="text-xs text-warning-fg">{t('Enter both meter readings to calculate it.')}</span>}
        </div>
        {/* Earlier Utility Invoices still unpaid are taken from the deposit too; shown only when there are some. */}
        {(s.unpaid ?? 0) > 0 && <SettlementRow label="Unpaid utility invoices">{minus(s.unpaid)}</SettlementRow>}
        <div className="flex flex-col gap-2 py-1">
            <SettlementRow label="Damage charge" tone={damageAmount > 0 ? 'text-warning-fg' : undefined} strong={damageAmount > 0}>
              {minus(damageAmount)}
            </SettlementRow>
            {damageLines.length > 0 && (
              <div className="flex flex-col gap-2 border-l-2 border-warning/40 pl-3 text-sm text-fg-secondary">
                {damageLines.map((l) => (
                  <div key={l.key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="font-medium text-fg">{l.name}</strong>{' '}
                      <span className="font-mono text-xs text-fg-tertiary">({l.assetCode})</span> · {conditionName(l.condition)}
                      {l.percent > 0 ? ` ${l.percent}%` : ''}
                      {l.split > 1 && (
                        <div className="text-xs text-fg-tertiary tabular">
                          {t('Shared · {full} ÷ {n} residents', { full: formatVnd(l.fullAmount), n: l.split })}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-fg tabular">− {formatVnd(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {hasSharedSplit && (
              <p className="rounded-lg bg-warning-bg/60 px-3 py-2 text-xs text-warning-fg">
                {t('Shared furniture charges are split evenly among active residents; remaining roommates will receive an invoice and notification for their share.')}
              </p>
            )}
          </div>
      </dl>

      <div
        className={cx(
          'flex items-center justify-between gap-3 rounded-xl p-4',
          refund >= 0 ? 'border border-success/30 bg-success-bg' : 'border border-error/30 bg-error-bg',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {refund >= 0 ? (
            <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-success-fg" />
          ) : (
            <AlertTriangle size={24} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-error-fg" />
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold text-fg">{t(refund >= 0 ? 'Refund to student' : 'Student still owes')}</p>
            <p className="text-xs text-fg-tertiary">
              {t(refund >= 0 ? 'Refund goes to the manager for approval' : 'The balance will be invoiced to the student')}
            </p>
          </div>
        </div>
        <span className={cx('shrink-0 whitespace-nowrap text-2xl font-semibold tabular', refund >= 0 ? 'text-success-fg' : 'text-error-fg')}>
          {formatVnd(Math.abs(refund))}
        </span>
      </div>

      {!done && !condition && (
        <Alert type="warning" title={t('Please select the room condition before confirming check-out.')}>
          <div className="mt-2">
            <Button size="sm" onClick={onJumpFurniture}>
              {t('Go to Room & furniture')}
            </Button>
          </div>
        </Alert>
      )}

      {!done && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-line pt-4">
          <Button icon={Save} disabled={submitPending} onClick={onSaveDraft}>
            {t('Save draft')}
          </Button>
          <Button variant="primary" block disabled={submitPending || !condition} onClick={onOpenSummary}>
            {t('Confirm check-out')}
          </Button>
        </div>
      )}
    </section>
  )
})
