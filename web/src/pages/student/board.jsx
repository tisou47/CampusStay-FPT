import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, Check, ChevronDown, ChevronRight, Megaphone, Pin } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { Card } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatRelative } from '@/lib/format'
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

/** The registration period as one strip across the page: its name and state, the milestones in a row, the way in. */
export function PeriodStrip() {
  const period = useQuery(['registration-period'], ({ signal }) => api.registrationPeriods.current(undefined, { signal }))
  const card = period.data?.card
  const details = useQuery(['registration-period', card?.termId], ({ signal }) => api.registrationPeriods.details(card.termId, { signal }), { enabled: Boolean(card) })
  if (!card) return null
  const left = timeLeft(card.countdownTo)
  const now = Date.now()
  const all = scheduleRows(details.data?.timeline ?? [])
  const core = all.filter((r) => r.key !== 'termStarts').slice(0, 4)
  const rows = core.length ? core : all.slice(0, 4)
  const currentIdx = rows.findIndex((r) => (r.end ?? r.start) > now)
  return (
    <Card padding="none" className="flex shrink-0 flex-col gap-3 px-5 py-3.5 shadow-xs lg:flex-row lg:items-center lg:gap-5">
      <div className="flex min-w-0 shrink-0 flex-col gap-1 lg:w-52">
        <span className="text-xs font-medium tracking-wide text-fg-tertiary uppercase">{t('Registration period')}</span>
        <span className="flex flex-wrap items-center gap-2">
          <Link to={`/student/registration-periods/${card.termId}`} className="text-h3 font-semibold text-fg hover:text-fg-link hover:underline">
            {card.name}
          </Link>
          <Tag tone={periodTone[card.status] ?? 'neutral'}>{card.status}</Tag>
        </span>
        <span className="text-xs text-fg-secondary">{t('Stay {start} – {end}', { start: formatDate(card.stayStart), end: formatDate(card.stayEnd) })}</span>
        {left && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium text-fg-brand">
            <CalendarClock size={13} aria-hidden="true" />
            {card.status === 'Open' ? t('Closes in {left}', { left }) : t('Opens in {left}', { left })}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <ol aria-label={t('Timeline')} className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          {rows.map((r, i) => {
            const state = i === currentIdx ? 'current' : (r.end ?? r.start) <= now ? 'done' : 'upcoming'
            const meta = STEP_META[r.key] ?? { shortLabel: r.label, fullTitle: r.label }
            return (
              <li key={r.key} aria-current={state === 'current' ? 'step' : undefined} title={t(meta.description ?? '')} className={cx('flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5', state === 'current' && 'bg-brand-subtle')}>
                <span
                  className={cx(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                    state === 'done' && 'border-primary bg-primary text-white',
                    state === 'current' && 'border-primary bg-surface text-fg-brand',
                    state === 'upcoming' && 'border-line-strong bg-surface text-fg-tertiary',
                  )}
                >
                  {state === 'done' ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cx('text-sm font-semibold', state === 'current' ? 'text-fg-brand' : state === 'done' ? 'text-fg' : 'text-fg-secondary')}>{t(meta.shortLabel)}</span>
                  <span className="text-xs text-fg-tertiary">{r.text}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

const NL = '\n'

/** The table of what changed (prices, dates): fixed columns, values right-aligned so the amounts line up. */
function Changes({ changes }) {
  return (
    <table className="w-full table-fixed text-xs">
      <colgroup>
        <col />
        <col className="w-[27%]" />
        <col className="w-[27%]" />
      </colgroup>
      <thead>
        <tr className="text-fg-tertiary">
          <th className="py-1.5 pr-2 text-left font-medium">{t('What changed')}</th>
          <th className="py-1.5 pr-2 text-right font-medium">{t('Before')}</th>
          <th className="py-1.5 text-right font-medium">{t('Now')}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => (
          <tr key={i} className="border-t border-line">
            <td className="py-1.5 pr-2 text-fg">{tr(c.field)}</td>
            <td className="py-1.5 pr-2 text-right whitespace-nowrap text-fg-tertiary tabular">{showValue(c.type, c.before)}</td>
            <td className="py-1.5 text-right font-semibold whitespace-nowrap text-fg tabular">{showValue(c.type, c.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The first lines of a notice, for its preview (the table of changes is announced, not shown). */
const previewOf = (item) => (item.changes?.length ? t('{n} changes · open to see the table', { n: item.changes.length }) : (item.body ?? '').replace(/\s+/g, ' ').trim())

/** One notice of the board: category, title, time and its text (two lines until opened); opening slides the rest in. */
function AnnouncementItem({ item, onRead }) {
  const [open, setOpen] = useState(false)
  const toggle = () => {
    setOpen((o) => !o)
    if (!item.read) onRead(item.id)
  }
  const hasMore = item.changes?.length > 0 || (item.link && item.link !== '/student')
  const text = item.changes?.length ? (open ? item.body.split(NL).filter((l) => !l.startsWith('•')).slice(1).join(NL) : previewOf(item)) : item.body
  return (
    <li className={cx('rounded-xl border transition-colors duration-200', item.pinned ? 'border-primary/30 bg-brand-subtle/30' : 'border-line', open ? 'border-line-strong shadow-xs' : 'hover:border-line-strong')}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span aria-hidden="true" className={cx('mt-2 size-2 shrink-0 rounded-full transition-colors', item.read ? 'bg-transparent' : 'bg-primary')} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {item.pinned && <Pin size={13} aria-label={t('Pinned')} className="text-fg-brand" />}
            <Tag tone={categoryTone[item.category] ?? 'neutral'} dot={false}>
              {item.category}
            </Tag>
            <span className="text-xs text-fg-tertiary">{formatRelative(item.shownFrom ?? item.createdAt)}</span>
          </span>
          <span className={cx('text-base text-fg', !item.read && 'font-semibold')}>{item.title}</span>
          {text && <span className={cx('text-sm whitespace-pre-line text-fg-secondary', !open && 'line-clamp-2')}>{text}</span>}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={cx('mt-1 shrink-0 text-fg-secondary transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {hasMore && (
        <div className={cx('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2 px-4 pb-4 pl-9">
              {item.changes?.length > 0 && <Changes changes={item.changes} />}
              {item.link && item.link !== '/student' && (
                <Link to={item.link} tabIndex={open ? 0 : -1} className="flex items-center gap-1 self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-fg-on-brand hover:bg-primary-hover">
                  {t('Open')}
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

/** The dormitory board: every notice with its text, filtered by category, the pinned and unread first. */
export function BoardPanel({ className }) {
  const board = useQuery(['board'], ({ signal }) => api.me.board(undefined, { signal }))
  const read = useMutation((id) => api.notifications.markRead(id), { invalidates: ['board', 'notifications'], onError: () => {} })
  const [category, setCategory] = useState('')
  const all = board.data?.items ?? []
  const categories = [...new Set(all.map((i) => i.category))]
  const items = all
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !category || item.category === category)
    .sort((x, y) => Number(y.item.pinned) - Number(x.item.pinned) || Number(x.item.read) - Number(y.item.read) || x.i - y.i)
    .map(({ item }) => item)

  return (
    <Card padding="none" aria-label={t('Dormitory board')} className={cx('flex min-w-0 flex-col overflow-hidden shadow-xs lg:min-h-0', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 lg:px-6">
        <h2 className="flex items-center gap-2 text-h2 font-semibold text-fg">
          <Megaphone size={22} aria-hidden="true" className="text-fg-brand" />
          {t('Dormitory board')}
          {board.data?.unread > 0 && <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-fg-on-brand">{t('{n} unread', { n: board.data.unread })}</span>}
        </h2>
        {categories.length > 1 && (
          <div role="tablist" aria-label={t('Category')} className="flex flex-wrap gap-1.5">
            {['', ...categories].map((c) => (
              <button
                key={c || 'all'}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cx(
                  'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                  category === c ? 'border-primary bg-primary-subtle text-fg-brand' : 'border-line text-fg-secondary hover:border-line-strong hover:text-fg',
                )}
              >
                {c ? t(c) : t('All')}
                <span className="ml-1 text-xs text-fg-tertiary tabular">{c ? all.filter((i) => i.category === c).length : all.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {board.loading && !board.data ? (
        <p className="px-6 py-5 text-sm text-fg-tertiary">{t('Loading…')}</p>
      ) : items.length === 0 ? (
        <p className="px-6 py-5 text-sm text-fg-tertiary">{t('No announcements right now.')}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4 lg:px-6">
          {items.map((item) => (
            <AnnouncementItem key={item.id} item={item} onRead={(id) => read.run(id)} />
          ))}
        </ul>
      )}
    </Card>
  )
}
