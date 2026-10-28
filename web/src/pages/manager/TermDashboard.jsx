import { useNavigate, useParams } from 'react-router'
import { BadgeCheck, CalendarRange, CreditCard, FileText, LogIn } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile, MeterRows } from '@/components/ui/Charts'
import { Card, ProgressBar } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { termTone } from '@/pages/admin/Terms'
import { t, tr } from '@/i18n'

// SCR-RPT-11 Term dashboard (spec §11.3): the milestones of a published Term with their progress, Applications by
// status, places filled per Room Type × Room Class × gender with the Term's prices, Deposits and Balances. Every
// Manager reaches it from the "Term published" notification.
// GET /dashboards/term?termId → { term, terms, requestCode, stayStart, stayEnd, milestones: [{ key, label, at, date,
//   done }], applications: [{ status, count }], applicationsTotal, places: [{ roomType, roomClass, gender, beds,
//   allocated, price }], money: { depositsIssued, depositsPaid, balancesIssued, balancesPaid, paidAmount,
//   unpaidAmount }, checkedIn, residents (door code released),
//   transition: { requestsOpen, continuing, feesIssued, feesPaid, released } | null (until the requests window opens) }

const GENDER = { M: 'Male', F: 'Female' }

export default function TermDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const query = useQuery(['term-dashboard', id], ({ signal }) => api.dashboards.term({ termId: id }, { signal }))
  const d = query.data
  if (d === undefined) return query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />
  const beds = d.places.reduce((n, p) => n + p.beds, 0)
  const allocated = d.places.reduce((n, p) => n + p.allocated, 0)
  const next = d.milestones.find((m) => !m.done)

  return (
    <>
      <PageHeader
        title={t('{name} dashboard', { name: d.term.name })}
        badge={<Tag tone={termTone[d.term.status] ?? 'neutral'}>{d.term.status}</Tag>}
        description={`${formatDate(d.stayStart)} – ${formatDate(d.stayEnd)}${d.requestCode ? ` · ${t('opened from {code}', { code: d.requestCode })}` : ''}`}
        actions={
          <Select
            aria-label={t('Term')}
            value={d.term.id}
            wrapperClassName="w-56"
            options={d.terms.map((x) => ({ value: x.id, label: x.name }))}
            onChange={(e) => navigate(`/manager/terms/${e.target.value}`)}
          />
        }
      />
      <div className="grid shrink-0 grid-cols-4 gap-4">
        <KpiTile icon={FileText} label="Applications" value={formatNumber(d.applicationsTotal)} note={next ? t('Next: {label} {date}', { label: t(next.label), date: next.at ? formatDateTime(next.at) : formatDate(next.date) }) : t('Every milestone has passed')} />
        <KpiTile icon={BadgeCheck} label="Beds given" value={`${formatNumber(allocated)} / ${formatNumber(beds)}`} note={t('{n}% of the places', { n: beds ? Math.round((allocated / beds) * 100) : 0 })} />
        <KpiTile icon={CreditCard} label="Deposits paid" value={`${formatNumber(d.money.depositsPaid)} / ${formatNumber(d.money.depositsIssued)}`} note={t('Balances paid {paid} / {issued}', { paid: d.money.balancesPaid, issued: d.money.balancesIssued })} />
        <KpiTile icon={LogIn} label="Residents" value={formatNumber(d.residents)} note={t('Door code released · {n} checked in at the desk', { n: formatNumber(d.checkedIn) })} />
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <Card className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
            <CalendarRange size={18} aria-hidden="true" />
            {t('Milestones')}
          </h2>
          <ol className="flex flex-col gap-2.5">
            {d.milestones.map((m) => (
              <li key={m.key} className="flex items-center gap-3">
                <span aria-hidden="true" className={cx('inline-block size-2.5 shrink-0 rounded-full', m.done ? 'bg-success' : m === next ? 'bg-primary' : 'border-[1.5px] border-line-strong bg-white')} />
                <span className={cx('flex-1 text-base', m === next ? 'font-medium text-fg' : m.done ? 'text-fg' : 'text-fg-secondary')}>{t(m.label)}</span>
                <span className="text-base whitespace-nowrap text-fg-secondary tabular">{m.at ? formatDateTime(m.at) : formatDate(m.date)}</span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Applications by status')}</h2>
            {d.applications.length ? (
              <MeterRows rows={d.applications.map((a) => ({ label: tr(a.status), value: a.count }))} max={Math.max(...d.applications.map((a) => a.count))} labelWidth="w-40" />
            ) : (
              <p className="text-sm text-fg-tertiary">{t('No Applications yet.')}</p>
            )}
          </Card>
          <Card className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Places and prices')}</h2>
            <Table>
              <THead>
                <tr>
                  <Th>Room Type</Th>
                  <Th>Room Class</Th>
                  <Th>Gender</Th>
                  <Th align="right">Price per Bed</Th>
                  <Th align="right">Beds</Th>
                  <Th className="w-56">Allocated</Th>
                </tr>
              </THead>
              <TBody>
                {d.places.map((p) => (
                  <Tr key={`${p.roomTypeId}:${p.roomClassId}:${p.gender}`}>
                    <Td>{tr(p.roomType)}</Td>
                    <Td>{tr(p.roomClass)}</Td>
                    <Td>{t(GENDER[p.gender] ?? p.gender)}</Td>
                    <Td align="right">{p.price != null ? formatVnd(p.price) : '—'}</Td>
                    <Td align="right">{formatNumber(p.beds)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={p.allocated} max={Math.max(1, p.beds)} className="flex-1" />
                        <span className="w-10 text-right text-sm text-fg-secondary tabular">{p.allocated}</span>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
          {d.transition && (
            <Card className="flex shrink-0 flex-col gap-3">
              <h2 className="text-h3 font-semibold text-fg">{t('Requests window')}</h2>
              <div className="grid grid-cols-4 gap-4">
                <KpiTile size="sm" label="Requests open" value={formatNumber(d.transition.requestsOpen)} note={t('Decided by the decision deadline (M4)')} />
                <KpiTile size="sm" label="Continuing residents" value={formatNumber(d.transition.continuing)} />
                <KpiTile size="sm" label="Next-Term fees paid" value={`${formatNumber(d.transition.feesPaid)} / ${formatNumber(d.transition.feesIssued)}`} />
                <KpiTile size="sm" label="Beds released" value={formatNumber(d.transition.released)} note={t('Not extended, not paid or end of stay')} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
