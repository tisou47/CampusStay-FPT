import { useState } from 'react'
import { useParams } from 'react-router'
import {
  Banknote,
  Bed,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  FileText,
  HelpCircle,
  Info,
  Package,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { api } from '@/api/endpoints'
import { useSession } from '@/app/session'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
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

const tone = { Open: 'success', 'Opens soon': 'info', Closed: 'neutral' }

/** Price lines grouped by Room Type, in the order the API sends them. */
function groupByType(prices = []) {
  const groups = new Map()
  for (const p of prices) groups.set(p.roomType, [...(groups.get(p.roomType) ?? []), p])
  return [...groups]
}

/**
 * Interactive 3-level Prices Explorer:
 * Level 1: Click a Room Type (2 giường, 4 giường, 6 giường) to expand its Room Tiers.
 * Level 2: Browse Room Tiers (Cơ bản, Tiêu chuẩn, Cao cấp) with summary price & available places.
 * Level 3: Click a Room Tier ("Xem chi tiết") to inspect its full fee breakdown and included furniture.
 */
function PricesExplorer({ d }) {
  const groups = groupByType(d.prices)
  const [openType, setOpenType] = useState(() => groups[0]?.[0] ?? null)
  const [selectedTierKey, setSelectedTierKey] = useState(() => {
    const firstLine = groups[0]?.[1]?.[0]
    return firstLine ? `${firstLine.roomTypeId}:${firstLine.roomClassId}` : null
  })

  const toggleType = (type, lines) => {
    if (openType === type) {
      setOpenType(null)
    } else {
      setOpenType(type)
      if (lines?.[0]) {
        setSelectedTierKey(`${lines[0].roomTypeId}:${lines[0].roomClassId}`)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-subtle/50 px-4 py-2.5 text-sm text-fg-secondary">
        <span className="flex items-center gap-2 font-medium text-fg">
          <Info size={16} aria-hidden="true" className="shrink-0 text-fg-brand" />
          {t('Select a room type to view room tiers, then click a tier to inspect its furniture and fee breakdown.')}
        </span>
        <span className="text-xs text-fg-tertiary">
          {t('Deposit ({n}%)', { n: d.depositPercent })} · {t('Utility deposit (refundable)')}: {formatVnd(d.utilityDeposit)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {groups.map(([type, lines]) => {
          const isTypeOpen = openType === type
          const totalPlaces = lines.reduce((sum, l) => sum + (l.places ?? 0), 0)
          const minPrice = Math.min(...lines.map((l) => l.price ?? 0))

          return (
            <div key={type} className="overflow-hidden rounded-xl border border-line bg-subtle/30">
              {/* Level 1: Room Type Accordion Header */}
              <button
                type="button"
                onClick={() => toggleType(type, lines)}
                aria-expanded={isTypeOpen}
                className={cx(
                  'flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors',
                  isTypeOpen ? 'bg-brand-subtle/60' : 'hover:bg-subtle/80',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cx(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                      isTypeOpen ? 'bg-primary text-white' : 'bg-surface text-fg-brand',
                    )}
                  >
                    <Bed size={20} aria-hidden="true" />
                  </span>
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-fg">{tr(type)}</span>
                      <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
                        {t('{n} tiers', { n: lines.length })}
                      </span>
                    </div>
                    <span className="text-xs text-fg-secondary">
                      {totalPlaces > 0
                        ? t(totalPlaces === 1 ? '{n} place' : '{n} places', { n: formatNumber(totalPlaces) })
                        : t('No places for you')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-sm font-semibold text-fg tabular">
                      {t('From {price}', { price: formatVnd(minPrice) })}
                    </span>
                    <span className="block text-xs text-fg-tertiary">{t('Term price per bed')}</span>
                  </div>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={cx('shrink-0 text-fg-secondary transition-transform', isTypeOpen && 'rotate-180 text-fg-brand')}
                  />
                </div>
              </button>

              {/* Level 2: Room Tiers List inside the expanded Room Type */}
              {isTypeOpen && (
                <div className="flex flex-col divide-y divide-line border-t border-line bg-surface">
                  {lines.map((p) => {
                    const tierKey = `${p.roomTypeId}:${p.roomClassId}`
                    const isDetailOpen = selectedTierKey === tierKey
                    const balanceAmount = Math.max(0, (p.price ?? 0) - (p.deposit ?? 0))

                    return (
                      <div key={tierKey} className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => setSelectedTierKey(isDetailOpen ? null : tierKey)}
                          aria-expanded={isDetailOpen}
                          className={cx(
                            'flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                            isDetailOpen ? 'bg-subtle/60' : 'hover:bg-subtle/40',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={cx(
                                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                                isDetailOpen ? 'bg-brand-subtle text-fg-brand' : 'bg-subtle text-fg-secondary',
                              )}
                            >
                              <Sparkles size={16} aria-hidden="true" />
                            </span>
                            <div className="flex flex-col">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-fg">{tr(p.roomClass)}</span>
                                <span
                                  className={cx(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                    p.places > 0 ? 'border border-success/30 bg-success-bg text-success-fg' : 'bg-subtle text-fg-tertiary',
                                  )}
                                >
                                  <Users size={11} aria-hidden="true" />
                                  {p.places > 0
                                    ? t(p.places === 1 ? '{n} place' : '{n} places', { n: formatNumber(p.places) })
                                    : t('No places for you')}
                                </span>
                              </div>
                              <span className="text-xs text-fg-tertiary">
                                {t('Deposit {amount}', { amount: formatVnd(p.deposit) })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-base font-semibold text-fg tabular">{formatVnd(p.price)}</span>
                            <span
                              className={cx(
                                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                                isDetailOpen ? 'bg-primary text-white' : 'bg-subtle text-fg-link',
                              )}
                            >
                              {isDetailOpen ? t('Hide details') : t('View details')}
                              <ChevronDown
                                size={14}
                                aria-hidden="true"
                                className={cx('transition-transform', isDetailOpen && 'rotate-180')}
                              />
                            </span>
                          </div>
                        </button>

                        {/* Level 3: Expanded Tier Details (Fee Breakdown + Furniture & Amenities) */}
                        {isDetailOpen && (
                          <div className="grid grid-cols-1 gap-3 border-t border-line/60 bg-subtle/40 px-4 py-3.5 lg:grid-cols-12">
                            {/* Left: Detailed Fee Breakdown */}
                            <div className="flex flex-col gap-2 rounded-xl bg-surface p-3.5 lg:col-span-6">
                              <span className="flex items-center gap-1.5 text-sm font-semibold text-fg-tertiary">
                                <Banknote size={14} aria-hidden="true" className="text-fg-brand" />
                                {t('Fee breakdown')}
                              </span>
                              <dl className="flex flex-col divide-y divide-line/60 text-sm">
                                <div className="flex items-center justify-between py-1.5">
                                  <dt className="text-fg-secondary">{t('Full term bed price')}</dt>
                                  <dd className="font-semibold text-fg tabular">{formatVnd(p.price)}</dd>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <dt className="text-fg-secondary">{t('Deposit ({n}%)', { n: d.depositPercent })}</dt>
                                  <dd className="font-medium text-fg-brand tabular">{formatVnd(p.deposit)}</dd>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <dt className="text-fg-secondary">{t('Remaining balance')}</dt>
                                  <dd className="font-medium text-fg tabular">{formatVnd(balanceAmount)}</dd>
                                </div>
                                <div className="flex items-center justify-between pt-1.5">
                                  <dt className="text-fg-secondary">{t('Utility deposit (refundable)')}</dt>
                                  <dd className="font-medium text-fg tabular">{formatVnd(d.utilityDeposit)}</dd>
                                </div>
                              </dl>
                            </div>

                            {/* Right: Included Furniture & Amenities */}
                            <div className="flex flex-col justify-between gap-2.5 rounded-xl bg-surface p-3.5 lg:col-span-6">
                              <div className="flex flex-col gap-2">
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-fg-tertiary">
                                  <Package size={14} aria-hidden="true" className="text-fg-brand" />
                                  {t('Included furniture & amenities')}
                                </span>
                                {p.furniture?.length > 0 ? (
                                  <ul aria-label={t('Furniture')} className="flex flex-wrap gap-2 pt-0.5">
                                    {p.furniture.map((f) => (
                                      <li
                                        key={f.name}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-subtle/60 px-3 py-1.5 text-xs font-medium text-fg"
                                      >
                                        <Package size={13} aria-hidden="true" className="text-fg-brand" />
                                        {f.quantity > 1 ? `${f.quantity} × ${typeName(f)}` : typeName(f)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-fg-secondary">
                                    {t('Standard dormitory bed, desk, wardrobe and shared room fixtures.')}
                                  </p>
                                )}
                              </div>
                              <p className="text-xs text-fg-tertiary">
                                {t('Standard dormitory bed, desk, wardrobe and shared room fixtures.')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-fg-tertiary">
        {t('Places are the beds this term offers to students of your gender. These prices stay the same for the whole term.')}
      </p>
    </div>
  )
}

/** Structured House Rules & Documents Tab */
function RulesAndDocumentsTab({ d }) {
  const ruleLines = (d.houseRules ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
      <div className="flex flex-col gap-3 lg:col-span-8">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} aria-hidden="true" className="text-fg-brand" />
          <h2 className="text-h3 font-semibold text-fg">{t('Dormitory house rules')}</h2>
        </div>

        {ruleLines.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {ruleLines.map((line, idx) => {
              const cleaned = line.replace(/^[•\-*\d.)\s]+/, '').trim() || line
              return (
                <li key={idx} className="flex items-start gap-3 rounded-xl bg-subtle/50 px-3.5 py-2.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-fg-brand">
                    {idx + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-fg">{cleaned}</p>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-base text-fg-tertiary">{t('The house rules of this term are not published yet.')}</p>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:col-span-4">
        <div className="flex flex-col gap-2.5 rounded-xl bg-brand-subtle/40 p-4">
          <h3 className="text-sm font-semibold text-fg">{t('Key financial rules')}</h3>
          <dl className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-fg-secondary">{t('Deposit due on submit')}</dt>
              <dd className="font-semibold text-fg-brand">{d.depositPercent}%</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-fg-secondary">{t('Utility deposit before check-in')}</dt>
              <dd className="font-semibold text-fg tabular">{formatVnd(d.utilityDeposit)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-2.5 rounded-xl bg-subtle/50 p-4">
          <h3 className="text-sm font-semibold text-fg">{t('Documents & attachments')}</h3>
          {d.documents?.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {d.documents.map((doc) => (
                <li key={doc.url}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-fg-link transition-colors hover:bg-brand-subtle/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText size={15} aria-hidden="true" className="shrink-0 text-fg-brand" />
                      <span className="truncate">{doc.title}</span>
                    </span>
                    <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-tertiary">{t('No documents attached for this term.')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Interactive Accordion FAQ Tab */
function FaqAccordionTab({ faq = [] }) {
  const [openIdx, setOpenIdx] = useState(0)

  if (!faq.length) {
    return <p className="text-base text-fg-tertiary">{t('No questions yet. Ask the dormitory office.')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h3 font-semibold text-fg">{t('Frequently asked questions')}</h2>
        <p className="text-xs text-fg-secondary">
          {t('Click a question to view the detailed answer from the dormitory office.')}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {faq.map((f, i) => {
          const isOpen = openIdx === i
          return (
            <li key={i} className="overflow-hidden rounded-xl bg-subtle/50 transition-colors">
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2.5 text-sm font-semibold text-fg">
                  <HelpCircle size={16} aria-hidden="true" className="shrink-0 text-fg-brand" />
                  <span>{f.question}</span>
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={cx('shrink-0 text-fg-secondary transition-transform', isOpen && 'rotate-180 text-fg-brand')}
                />
              </button>
              {isOpen && (
                <div className="border-t border-line/60 px-4 py-3 pl-10 text-sm leading-relaxed whitespace-pre-wrap text-fg-secondary">
                  {f.answer}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function RegistrationPeriod() {
  const { termId } = useParams()
  const { setTermId } = useSession()
  const [tab, setTab] = useState('timeline')
  const query = useQuery(['registration-period', termId], ({ signal }) => api.registrationPeriods.details(termId, { signal }))
  const d = query.data
  if (d === undefined) {
    return query.error ? (
      <ErrorState error={query.error} onRetry={query.reload} title="Could not load this registration period" />
    ) : (
      <LoadingState />
    )
  }

  const closes = d.timeline.find((m) => m.key === 'registrationClosesAt')
  const closesLeft = d.status === 'Open' && closes ? timeLeft(closes.at) : null
  const roomTypesCount = groupByType(d.prices).length

  const navTabs = [
    { key: 'timeline', label: 'Timeline', icon: CalendarClock },
    { key: 'prices', label: 'Prices', icon: Bed, count: roomTypesCount },
    { key: 'rules', label: 'House rules', icon: ShieldCheck },
    { key: 'faq', label: 'FAQ', icon: HelpCircle, count: d.faq?.length || null },
  ]

  return (
    <StudentPage
      breadcrumb={[{ label: 'Home', to: '/student' }, { label: d.name }]}
      title={d.name}
      badge={<Tag tone={tone[d.status] ?? 'neutral'}>{d.status}</Tag>}
      description={t('Stay {start} – {end}', { start: formatDate(d.stayStart), end: formatDate(d.stayEnd) })}
      className="lg:gap-3"
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          {closesLeft && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-brand-subtle px-3 py-1.5 text-xs font-medium text-fg-brand">
              <CalendarClock size={14} aria-hidden="true" />
              {t('Registration closes in {left}.', { left: closesLeft })}
            </span>
          )}
          {d.status === 'Open' && (
            // The wizard applies for the session Term: make it this period's Term first (WEB-STU-08).
            <Button variant="primary" to="/student/apply/term" onClick={() => setTermId(termId)}>
              Apply now
            </Button>
          )}
        </div>
      }
    >
      {/* Clean Segmented Control Bar (no ugly overflow scrollbar) */}
      <div
        role="tablist"
        aria-label={d.name}
        className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-xs sm:w-fit"
      >
        {navTabs.map((item) => {
          const Icon = item.icon
          const active = tab === item.key
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                active ? 'bg-primary text-white shadow-xs' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
              )}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(item.label)}</span>
              {item.count != null && item.count > 0 && (
                <span
                  className={cx(
                    'rounded-full px-1.5 py-0.2 text-xs font-semibold',
                    active ? 'bg-white/20 text-white' : 'bg-subtle text-fg-tertiary',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Card padding="md" className="flex min-h-0 flex-col gap-3 rounded-xl shadow-xs lg:flex-1 lg:overflow-y-auto lg:p-5">
        {tab === 'timeline' && <TermSchedule timeline={d.timeline} />}
        {tab === 'prices' && <PricesExplorer d={d} />}
        {tab === 'rules' && <RulesAndDocumentsTab d={d} />}
        {tab === 'faq' && <FaqAccordionTab faq={d.faq} />}
      </Card>
    </StudentPage>
  )
}
