import { useState } from 'react'
import { useParams } from 'react-router'
import { ExternalLink, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatNumber, formatVnd } from '@/lib/format'
import { typeName } from '@/lib/furniture'
import { StudentPage } from './shared'
import { timeLeft } from './board'
import { TermSchedule } from './schedule'
import { t, tr } from '@/i18n'

// SCR-HOME-05 Registration period details (spec §6.5): the schedule, prices, house rules and questions of a published
// Term, opened from the board. Students see no Rooms (R-09): each price line says how many Beds of their gender it
// offers and the furniture its Room Class has (R-14).
// GET /registration-periods/:termId → { id, name, status, stayStart, stayEnd, timeline: [{ key, label, at, date,
//   until, done }], prices: [{ roomTypeId, roomType, beds, roomClassId, roomClass, price, deposit, places,
//   furniture: [{ name, nameVi, quantity }] }], depositPercent, utilityDeposit, houseRules, faq, documents }

const TABS = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'prices', label: 'Prices' },
  { key: 'rules', label: 'House rules' },
  { key: 'faq', label: 'FAQ' },
]

const tone = { Open: 'success', 'Opens soon': 'info', Closed: 'neutral' }

/** Price lines by Room Type, in the order the API sends them. */
function groupByType(prices) {
  const groups = new Map()
  for (const p of prices) groups.set(p.roomType, [...(groups.get(p.roomType) ?? []), p])
  return [...groups]
}

export default function RegistrationPeriod() {
  const { termId } = useParams()
  const [tab, setTab] = useState('timeline')
  const query = useQuery(['registration-period', termId], ({ signal }) => api.registrationPeriods.details(termId, { signal }))
  const d = query.data
  if (d === undefined) return query.error ? <ErrorState error={query.error} onRetry={query.reload} title="Could not load this registration period" /> : <LoadingState />
  const closes = d.timeline.find((m) => m.key === 'registrationClosesAt')

  return (
    <StudentPage
      breadcrumb={[{ label: 'Home', to: '/student' }, { label: d.name }]}
      title={d.name}
      badge={<Tag tone={tone[d.status] ?? 'neutral'}>{d.status}</Tag>}
      description={t('Stay {start} – {end}', { start: formatDate(d.stayStart), end: formatDate(d.stayEnd) })}
      actions={
        d.status === 'Open' && (
          <Button variant="primary" size="lg" to="/student/apply/term">
            Apply now
          </Button>
        )
      }
    >
      <Tabs items={TABS} value={tab} onChange={setTab} className="shrink-0 overflow-x-auto" />
      <Card padding="lg" className="flex min-h-0 flex-col gap-4 lg:flex-1 lg:overflow-y-auto">
        {tab === 'timeline' && (
          <>
            {d.status === 'Open' && closes && timeLeft(closes.at) && <p className="text-base font-medium text-fg-brand">{t('Registration closes in {left}.', { left: timeLeft(closes.at) })}</p>}
            <TermSchedule timeline={d.timeline} />
          </>
        )}
        {tab === 'prices' && (
          <>
            <p className="text-base text-fg-secondary">
              {t('The price is per Bed for the whole Term. The Deposit is {n}% of it; the Utility Deposit ({amount}) is added to the Balance and held until you check out.', {
                n: d.depositPercent,
                amount: formatVnd(d.utilityDeposit),
              })}
            </p>
            {groupByType(d.prices).map(([type, lines]) => (
              <section key={type} className="flex flex-col gap-2">
                <h2 className="text-h3 font-semibold text-fg">{tr(type)}</h2>
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                  {lines.map((p) => (
                    <li key={`${p.roomTypeId}:${p.roomClassId}`} className="flex flex-col gap-2 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-base font-semibold text-fg">{tr(p.roomClass)}</span>
                        <span className="text-base font-semibold text-fg tabular">{formatVnd(p.price)}</span>
                      </div>
                      <p className="text-sm text-fg-secondary">
                        {t('Deposit {amount}', { amount: formatVnd(p.deposit) })} ·{' '}
                        <span className={p.places > 0 ? 'text-fg' : 'text-fg-tertiary'}>{p.places > 0 ? t(p.places === 1 ? '{n} place' : '{n} places', { n: formatNumber(p.places) }) : t('No places for you')}</span>
                      </p>
                      {p.furniture?.length > 0 && (
                        <ul aria-label={t('Furniture')} className="flex flex-wrap gap-1.5">
                          {p.furniture.map((f) => (
                            <li key={f.name} className="rounded-full border border-line bg-subtle px-2.5 py-0.5 text-sm text-fg">
                              {f.quantity > 1 ? `${f.quantity} × ${typeName(f)}` : typeName(f)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-sm text-fg-tertiary">{t('Places are the Beds this Term offers to students of your gender. These prices stay the same for the whole Term.')}</p>
          </>
        )}
        {tab === 'rules' && (
          <>
            {d.houseRules ? <p className="text-base whitespace-pre-wrap text-fg">{d.houseRules}</p> : <p className="text-base text-fg-tertiary">{t('The house rules of this Term are not published yet.')}</p>}
            {d.documents?.length > 0 && (
              <ul className="flex flex-col gap-2">
                {d.documents.map((doc) => (
                  <li key={doc.url}>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-base font-medium text-fg-link hover:underline">
                      <FileText size={16} aria-hidden="true" />
                      {doc.title}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === 'faq' &&
          (d.faq?.length ? (
            <dl className="flex flex-col gap-4">
              {d.faq.map((f, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <dt className="text-base font-medium text-fg">{f.question}</dt>
                  <dd className="text-base whitespace-pre-wrap text-fg-secondary">{f.answer}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-base text-fg-tertiary">{t('No questions yet. Ask the dormitory office.')}</p>
          ))}
      </Card>
    </StudentPage>
  )
}
