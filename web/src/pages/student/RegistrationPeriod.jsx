import { useState } from 'react'
import { useParams } from 'react-router'
import { ExternalLink, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateTime, formatNumber, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { timeLeft } from './board'
import { t, tr } from '@/i18n'

// SCR-HOME-05 Registration period details (spec §6.5): the timeline, prices, Rooms, house rules and questions of a
// published Term, opened from the board.
// GET /registration-periods/:termId → { id, name, status, stayStart, stayEnd, timeline: [{ key, label, at, date,
//   until, done }], prices: [{ roomType, beds, roomClass, price, deposit }], depositPercent, utilityDeposit,
//   rooms: [{ roomType, roomClass, gender, rooms, beds }], houseRules, faq, documents }

const TABS = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'prices', label: 'Prices' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'rules', label: 'House rules' },
  { key: 'faq', label: 'FAQ' },
]

const GENDER = { M: 'Male', F: 'Female' }
const tone = { Open: 'success', 'Opens soon': 'info', Closed: 'neutral' }

export default function RegistrationPeriod() {
  const { termId } = useParams()
  const [tab, setTab] = useState('timeline')
  const query = useQuery(['registration-period', termId], ({ signal }) => api.registrationPeriods.details(termId, { signal }))
  const d = query.data
  if (d === undefined) return query.error ? <ErrorState error={query.error} onRetry={query.reload} title="Could not load this registration period" /> : <LoadingState />
  const firstUpcoming = d.timeline.findIndex((m) => !m.done)
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
            <ol className="flex flex-col gap-3">
              {d.timeline.map((m, i) => (
                <li key={m.key} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cx('size-2.5 shrink-0 rounded-full', m.done ? 'bg-success' : i === firstUpcoming ? 'bg-primary' : 'border-[1.5px] border-line-strong bg-white')}
                  />
                  <span className={cx('flex-1 text-base', i === firstUpcoming ? 'font-medium text-fg' : m.done ? 'text-fg' : 'text-fg-secondary')}>{t(m.label)}</span>
                  <span className="text-base whitespace-nowrap text-fg-secondary">
                    {m.at ? formatDateTime(m.at) : m.until ? `${formatDate(m.date)} – ${formatDate(m.until)}` : formatDate(m.date)}
                  </span>
                </li>
              ))}
            </ol>
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
            <Table>
              <THead>
                <tr>
                  <Th>Room Type</Th>
                  <Th>Room Class</Th>
                  <Th align="right">Price per Bed</Th>
                  <Th align="right">Deposit</Th>
                </tr>
              </THead>
              <TBody>
                {d.prices.map((p) => (
                  <Tr key={`${p.roomTypeId}:${p.roomClassId}`}>
                    <Td>{tr(p.roomType)}</Td>
                    <Td>{tr(p.roomClass)}</Td>
                    <Td align="right" className="font-medium">
                      {formatVnd(p.price)}
                    </Td>
                    <Td align="right">{formatVnd(p.deposit)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <p className="text-sm text-fg-tertiary">{t('These prices stay the same for the whole Term.')}</p>
          </>
        )}
        {tab === 'rooms' && (
          <Table>
            <THead>
              <tr>
                <Th>Room Type</Th>
                <Th>Room Class</Th>
                <Th>For</Th>
                <Th align="right">Rooms</Th>
                <Th align="right">Beds</Th>
              </tr>
            </THead>
            <TBody>
              {d.rooms.map((r) => (
                <Tr key={`${r.roomType}:${r.roomClass}:${r.gender}`}>
                  <Td>{tr(r.roomType)}</Td>
                  <Td>{tr(r.roomClass)}</Td>
                  <Td>{t(GENDER[r.gender] ?? r.gender)}</Td>
                  <Td align="right">{formatNumber(r.rooms)}</Td>
                  <Td align="right">{formatNumber(r.beds)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
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
