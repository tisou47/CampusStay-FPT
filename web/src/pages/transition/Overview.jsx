import { BedDouble, ClipboardList, CreditCard, FileCheck, UserCheck, UserMinus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Card } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// Term transition › Overview. GET /renewals/overview?termId → { term, previousTerm, opened, filing, feesIssued,
//   milestones: [{ key, label, at, state (Done, Upcoming) }], counts: { continuing, awaitingExtension, feesIssued,
//   feesPaid, ending: { label: n } }, requests: { roomChanges, swaps, roomClassChanges, extensions },
//   reconciliation: { runs, openItems }, newStudentBeds: { total, heldByContinuing, free, reservedPercent, reserved } }

const kinds = [
  ['roomChanges', 'Room changes'],
  ['swaps', 'Swaps'],
  ['roomClassChanges', 'Room Class changes'],
  ['extensions', 'Extensions'],
]

export default function Overview({ termId }) {
  const base = useRoleBase()
  const manager = base === '/manager'
  const query = useQuery(['renewal-overview', termId], ({ signal }) => api.renewals.overview({ termId }, { signal }))
  return (
    <QueryState query={query}>
      {(o) => {
        const open = Object.values(o.requests ?? {}).reduce((a, b) => a + b, 0)
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {!o.opened && (
              <Alert type="info" title="The requests window has not opened yet">
                {t('At M2 every resident of {previous} gets a Bed kept for {term}: continuing, or awaiting extension in the last Term of their stay.', { previous: o.previousTerm.name, term: o.term.name })}
              </Alert>
            )}
            <div className="flex shrink-0 flex-wrap gap-4">
              <KpiTile size="md" icon={UserCheck} label="Continuing" value={formatNumber(o.counts.continuing)} note="Bed kept for the next Term" />
              <KpiTile size="md" icon={UserMinus} label="Awaiting extension" value={formatNumber(o.counts.awaitingExtension)} note="Last Term of the stay" valueTone={o.counts.awaitingExtension ? 'warning' : undefined} />
              <KpiTile size="md" icon={ClipboardList} label="Open requests" value={formatNumber(open)} note={o.filing ? 'Students can still file' : 'Filing closed'} valueTone={open ? 'warning' : undefined} />
              <KpiTile size="md" icon={CreditCard} label="Next-Term fees" value={`${formatNumber(o.counts.feesPaid)} / ${formatNumber(o.counts.feesIssued)}`} note="Paid / issued" />
              {manager && (
                <KpiTile size="md" icon={FileCheck} label="Reconciliation" value={formatNumber(o.reconciliation.openItems)} note={o.reconciliation.runs ? t('Open items · {n} files', { n: o.reconciliation.runs }) : 'No enrolled list yet'} valueTone={!o.reconciliation.runs || o.reconciliation.openItems ? 'warning' : undefined} />
              )}
              <KpiTile size="md" icon={BedDouble} label="Beds for new students" value={formatNumber(o.newStudentBeds.free)} note={t('of {total} · {pct}% kept for new students', { total: formatNumber(o.newStudentBeds.total), pct: o.newStudentBeds.reservedPercent })} />
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <Card padding="lg" className="flex flex-1 flex-col gap-3">
                <h2 className="text-h3 font-semibold text-fg">{t('Milestones')}</h2>
                <ul className="flex flex-col gap-2">
                  {o.milestones.map((m) => (
                    <li key={m.key} className="flex items-center justify-between gap-3 text-base">
                      <span className="text-fg">{tr(m.label)}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-fg-secondary tabular">{formatDateTime(m.at)}</span>
                        <StatusTag status={m.state} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card padding="lg" className="flex flex-1 flex-col gap-3">
                <h2 className="text-h3 font-semibold text-fg">{t('Open next-Term requests')}</h2>
                <ul className="flex flex-col gap-2">
                  {kinds.map(([key, label]) => (
                    <li key={key} className="flex justify-between text-base">
                      <span className="text-fg-secondary">{t(label)}</span>
                      <span className="font-medium text-fg">{formatNumber(o.requests?.[key] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
                <Button to={`${base}/next-term/requests?termId=${termId}`}>Decide open requests</Button>
                {Object.keys(o.counts.ending ?? {}).length > 0 && (
                  <>
                    <h3 className="pt-2 text-base font-semibold text-fg">{t('Not continuing')}</h3>
                    <ul className="flex flex-col gap-1.5">
                      {Object.entries(o.counts.ending).map(([label, n]) => (
                        <li key={label} className="flex justify-between text-base">
                          <span className="text-fg-secondary">{tr(label)}</span>
                          <span className="text-fg">{formatNumber(n)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </div>
          </div>
        )
      }}
    </QueryState>
  )
}
