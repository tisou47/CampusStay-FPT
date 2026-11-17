import { useState } from 'react'
import { Link } from 'react-router'
import { Calendar, CalendarClock, Check, ChevronDown, ChevronRight, Megaphone, Pin } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { Card } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatRelative, formatVnd } from '@/lib/format'
import { categoryTone } from '@/pages/common/Announcements'
import { showValue } from '@/pages/registration/shared'
import { scheduleRows } from './schedule'
import { t, tr } from '@/i18n'

// The dormitory board on Student Home (spec §6.5, §11.4): the current registration period with its unified
// horizontal stepper (left ~70%), then the pinned and recent announcements (right ~30%).
// GET /registration-periods/current → { card: { termId, name, status (Opens soon, Open, Closed), opensAt, closesAt,
//   countdownTo, stayStart, stayEnd, places, fromPrice } | null }
// GET /students/me/board → { items: [{ id, category, title, body, changes, link, pinned, shownFrom, createdAt, read }],
//   unread }

const periodTone = { Open: 'success', 'Opens soon': 'info', Closed: 'neutral' }

/** "3 days" / "5 hours" until the moment, days rounded up like Student Home's next step; null once it passed. */
export function timeLeft(iso) {
  if (!iso) return null
  const ms = new Date(iso) - new Date()
  if (ms <= 0) return null
  const hours = Math.ceil(ms / 3_600_000)
  if (hours < 24) return t(hours === 1 ? '{n} hour' : '{n} hours', { n: hours })
  const days = Math.ceil(ms / 86_400_000)
  return t(days === 1 ? '{n} day' : '{n} days', { n: days })
}

/** Concise step title, full title, and helpful description for each milestone key in the registration timeline. */
const STEP_META = {
  registration: {
    shortLabel: 'Registration',
    fullTitle: 'Dormitory registration',
    description: 'Choose your room type and room tier, then pay the deposit to submit your application.',
  },
  resultsPublishedAt: {
    shortLabel: 'Results',
    fullTitle: 'Assignment results published',
    description: 'The dormitory office reviews applications and publishes room and bed assignments.',
  },
  balanceDueAt: {
    shortLabel: 'Payment',
    fullTitle: 'Balance due',
    description: 'Pay the remaining room fee and utility deposit to confirm your assigned bed.',
  },
  checkIn: {
    shortLabel: 'Check-in',
    fullTitle: 'Check-in',
    description: 'Receive your door code and check in at your block reception desk.',
  },
  checkInStart: {
    shortLabel: 'Check-in',
    fullTitle: 'Check-in',
    description: 'Receive your door code and check in at your block reception desk.',
  },
  termStarts: {
    shortLabel: 'Term starts',
    fullTitle: 'Term starts',
    description: 'Official dormitory residence period for the semester.',
  },
}

/**
 * Unified Horizontal Stepper for the Registration Period:
 * - Connects the 4 key milestones with a horizontal progress line.
 * - Clearly distinguishes Completed (check icon), Current/Active (highlighted orange ring & dot), and Upcoming (muted).
 * - Displays the active or hovered step's full time range and description in a clean sub-banner without text truncation.
 */
function HorizontalRegistrationStepper({ timeline, now = Date.now() }) {
  const allRows = scheduleRows(timeline)
  const [hoveredIdx, setHoveredIdx] = useState(null)

  if (allRows.length === 0) {
    return <p className="text-base text-fg-tertiary">{t('The dates of this term are not published yet.')}</p>
  }

  // Focus on the 4 core registration-to-checkin milestones (Registration, Results, Payment, Check-in)
  const coreRows = allRows.filter((r) => r.key !== 'termStarts').slice(0, 4)
  const rows = coreRows.length > 0 ? coreRows : allRows.slice(0, 4)

  const currentIdx = rows.findIndex((r) => (r.end ?? r.start) > now)
  const activeIdx = currentIdx === -1 ? rows.length - 1 : currentIdx
  const inspectedIdx = hoveredIdx ?? activeIdx
  const inspectedRow = rows[inspectedIdx] ?? rows[0]
  const inspectedMeta = STEP_META[inspectedRow.key] ?? {
    shortLabel: inspectedRow.label,
    fullTitle: inspectedRow.label,
    description: '',
  }
  const inspectedState =
    inspectedIdx === currentIdx ? 'current' : (inspectedRow.end ?? inspectedRow.start) <= now ? 'done' : 'upcoming'

  return (
    <div className="my-auto flex flex-col gap-4" onMouseLeave={() => setHoveredIdx(null)}>
      {/* Horizontal Stepper Track */}
      <ol aria-label={t('Timeline')} className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-0">
        {rows.map((r, i) => {
          const state = i === currentIdx ? 'current' : (r.end ?? r.start) <= now ? 'done' : 'upcoming'
          const isInspected = i === inspectedIdx
          const meta = STEP_META[r.key] ?? { shortLabel: r.label, fullTitle: r.label }
          const prevDone = i > 0 && (i <= activeIdx || currentIdx === -1)
          const nextDone = i < rows.length - 1 && (i < activeIdx || currentIdx === -1)

          return (
            <li key={r.key} className="relative flex flex-col items-center">
              {/* Left & Right connecting progress lines on sm+ screens */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute top-5 right-1/2 left-0 hidden h-0.5 -translate-y-1/2 transition-colors sm:block',
                    prevDone ? 'bg-primary' : 'bg-line',
                  )}
                />
              )}
              {i < rows.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute top-5 right-0 left-1/2 hidden h-0.5 -translate-y-1/2 transition-colors sm:block',
                    nextDone ? 'bg-primary' : 'bg-line',
                  )}
                />
              )}

              <button
                type="button"
                onMouseEnter={() => setHoveredIdx(i)}
                onFocus={() => setHoveredIdx(i)}
                onClick={() => setHoveredIdx(i)}
                aria-current={state === 'current' ? 'step' : undefined}
                className="group relative z-10 flex w-full flex-col items-center gap-2 rounded-xl px-2 py-1 text-center focus:outline-none"
              >
                {/* Step Circle */}
                <span
                  className={cx(
                    'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    state === 'done' && 'border-primary bg-primary text-white',
                    state === 'current' && 'border-primary bg-brand-subtle text-fg-brand ring-4 ring-orange-500/15',
                    state === 'upcoming' && 'border-line-strong bg-surface text-fg-tertiary group-hover:border-orange-300 group-hover:text-fg',
                    isInspected && state !== 'current' && 'ring-3 ring-orange-500/15',
                  )}
                >
                  {state === 'done' ? (
                    <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                  ) : state === 'current' ? (
                    <span className="relative flex size-3 items-center justify-center">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                    </span>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </span>

                {/* Concise Step Label */}
                <div className="flex min-w-0 flex-col items-center gap-0.5">
                  <span className="text-[11px] font-medium tracking-wide text-fg-tertiary uppercase">
                    {t('Step {n}', { n: i + 1 })}
                  </span>
                  <span
                    className={cx(
                      'text-sm font-semibold transition-colors',
                      state === 'current'
                        ? 'text-fg-brand'
                        : isInspected
                          ? 'text-fg'
                          : state === 'done'
                            ? 'text-fg'
                            : 'text-fg-secondary',
                    )}
                  >
                    {t(meta.shortLabel)}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Unified Active / Hovered Step Info Sub-Banner (no truncation on time ranges) */}
      <div
        className={cx(
          'flex flex-col gap-1.5 rounded-xl px-4 py-3.5 transition-colors',
          inspectedState === 'current' ? 'bg-brand-subtle/60' : 'bg-subtle/70',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                inspectedState === 'current'
                  ? 'bg-primary text-white'
                  : inspectedState === 'done'
                    ? 'border border-success/30 bg-success-bg text-success-fg'
                    : 'bg-surface text-fg-secondary',
              )}
            >
              {inspectedState === 'current'
                ? t('In progress')
                : inspectedState === 'done'
                  ? t('Completed')
                  : t('Upcoming')}
            </span>
            <h3 className="text-base font-semibold text-fg">
              {t('Step {n}', { n: inspectedIdx + 1 })}: {t(inspectedMeta.fullTitle)}
            </h3>
          </div>

          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-brand">
            <Calendar size={15} aria-hidden="true" className="shrink-0" />
            <span>{inspectedRow.text}</span>
          </span>
        </div>

        {inspectedMeta.description && (
          <p className="text-sm text-fg-secondary">{t(inspectedMeta.description)}</p>
        )}
      </div>
    </div>
  )
}

/** The registration period and its unified horizontal stepper in the 70% left column. */
function PeriodCard({ card, className }) {
  const left = timeLeft(card.countdownTo)
  const details = useQuery(['registration-period', card.termId], ({ signal }) => api.registrationPeriods.details(card.termId, { signal }))
  return (
    <Card padding="lg" className={cx('flex min-w-0 flex-col justify-between gap-4 shadow-xs lg:h-full lg:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-fg-tertiary">{t('Registration period')} ·</span>
            <span className="text-sm text-fg-secondary">
              {t('Stay {start} – {end}', { start: formatDate(card.stayStart), end: formatDate(card.stayEnd) })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-h2 font-semibold text-fg">{card.name}</h2>
            <Tag tone={periodTone[card.status] ?? 'neutral'}>{card.status}</Tag>
          </div>
        </div>

        {left && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-brand-subtle px-3 py-1 text-sm font-medium text-fg-brand">
            <CalendarClock size={15} aria-hidden="true" />
            {card.status === 'Open' ? t('Closes in {left}', { left }) : t('Opens in {left}', { left })}
          </span>
        )}
      </div>

      <QueryState query={details} compact>
        {(d) => <HorizontalRegistrationStepper timeline={d.timeline} />}
      </QueryState>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-3.5">
        <p className="text-base font-semibold text-fg">
          {card.fromPrice != null ? t('From {price} per bed', { price: formatVnd(card.fromPrice) }) : null}
        </p>
        <Link
          to={`/student/registration-periods/${card.termId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-subtle/60 px-3 py-1.5 text-sm font-medium text-fg-link transition-colors hover:border-line-strong hover:bg-subtle"
        >
          {t('Registration period details')}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  )
}

function AnnouncementItem({ item, onRead }) {
  const [open, setOpen] = useState(false)
  const toggle = () => {
    setOpen((o) => !o)
    if (!item.read) onRead(item.id)
  }
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-2.5 py-2.5 text-left">
        <span aria-hidden="true" className={cx('mt-2 size-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-primary')} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            {item.pinned && <Pin size={13} aria-label={t('Pinned')} className="text-fg-brand" />}
            <Tag tone={categoryTone[item.category] ?? 'neutral'} dot={false}>
              {item.category}
            </Tag>
            <span className={cx('line-clamp-1 text-sm text-fg', !item.read && 'font-medium')}>{item.title}</span>
          </span>
          <span className="text-xs text-fg-tertiary">{formatRelative(item.shownFrom ?? item.createdAt)}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className={cx('mt-1 shrink-0 text-fg-secondary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-4">
          {item.changes?.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-fg-tertiary">
                  <th className="py-1 font-medium">{t('What changed')}</th>
                  <th className="py-1 font-medium">{t('Before')}</th>
                  <th className="py-1 font-medium">{t('Now')}</th>
                </tr>
              </thead>
              <tbody>
                {item.changes.map((c, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1 pr-2 text-fg">{tr(c.field)}</td>
                    <td className="py-1 pr-2 text-fg-secondary">{showValue(c.type, c.before)}</td>
                    <td className="py-1 font-medium text-fg">{showValue(c.type, c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm whitespace-pre-wrap text-fg-secondary">{item.body}</p>
          )}
          {item.changes?.length > 0 && item.body.includes('\n') && (
            <p className="text-xs whitespace-pre-wrap text-fg-tertiary">{item.body.split('\n').filter((l) => !l.startsWith('•')).slice(1).join('\n')}</p>
          )}
          {item.link && item.link !== '/student' && (
            <Link to={item.link} className="flex items-center gap-1 self-start text-xs font-medium text-fg-link hover:underline">
              {t('Open')}
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

/** 2-column main section (70% Unified Registration Stepper on left, 30% Dormitory Announcement Board on right). */
export function DormitoryBoard() {
  const period = useQuery(['registration-period'], ({ signal }) => api.registrationPeriods.current(undefined, { signal }))
  const board = useQuery(['board'], ({ signal }) => api.me.board(undefined, { signal }))
  const read = useMutation((id) => api.notifications.markRead(id), { invalidates: ['board', 'notifications'], onError: () => {} })
  const card = period.data?.card
  const items = board.data?.items ?? []
  if (!card && items.length === 0) return null
  // Limit to top 3 latest notices to prevent vertical page stretching
  const shown = items.slice(0, 3)

  return (
    <section
      aria-label={t('Dormitory board')}
      className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-10 lg:items-stretch lg:gap-5"
    >
      {card && <PeriodCard card={card} className={items.length > 0 ? 'lg:col-span-7' : 'lg:col-span-10'} />}
      <Card
        padding="lg"
        className={cx(
          'flex min-w-0 flex-col justify-between gap-3 shadow-xs lg:h-full lg:p-6',
          card ? 'lg:col-span-3' : 'lg:col-span-10',
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
              <Megaphone size={18} aria-hidden="true" className="text-fg-brand" />
              {t('Dormitory board')}
            </h2>
            {board.data?.unread > 0 && (
              <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium text-fg-brand">
                {t('{n} unread', { n: board.data.unread })}
              </span>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-fg-tertiary">{t('No announcements right now.')}</p>
          ) : (
            <ul className="flex flex-col">
              {shown.map((item) => (
                <AnnouncementItem key={item.id} item={item} onRead={(id) => read.run(id)} />
              ))}
            </ul>
          )}
        </div>
        {items.length > 3 && (
          <div className="border-t border-line pt-2.5">
            <Link to="/student/notifications" className="inline-flex items-center gap-1 text-xs font-medium text-fg-link hover:underline">
              {t('Show all {n}', { n: items.length })}
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}
      </Card>
    </section>
  )
}
