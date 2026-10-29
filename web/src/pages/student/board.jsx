import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, ChevronDown, ChevronRight, Megaphone, Pin } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { Card } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber, formatRelative, formatVnd } from '@/lib/format'
import { categoryTone } from '@/pages/common/Announcements'
import { showValue } from '@/pages/registration/shared'
import { t, tr } from '@/i18n'

// The dormitory board at the top of Student Home (spec §6.5, §11.4): the current registration period card, then the
// pinned and recent announcements. A change announcement lists its old → new values.
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

function PeriodCard({ card }) {
  const left = timeLeft(card.countdownTo)
  return (
    <Card padding="lg" className="flex min-w-0 flex-col gap-3 lg:w-96 lg:shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-fg-tertiary">{t('Registration period')}</span>
          <h2 className="text-card-title text-fg">{card.name}</h2>
        </div>
        <Tag tone={periodTone[card.status] ?? 'neutral'}>{card.status}</Tag>
      </div>
      {left && (
        <p className="flex items-center gap-2 text-base font-medium text-fg-brand">
          <CalendarClock size={18} aria-hidden="true" />
          {card.status === 'Open' ? t('Closes in {left}', { left }) : t('Opens in {left}', { left })}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
        <div className="flex flex-col">
          <dt className="text-sm text-fg-tertiary">{t('Registration')}</dt>
          <dd className="text-fg">{`${formatDate(card.opensAt)} – ${formatDate(card.closesAt)}`}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-sm text-fg-tertiary">{t('Stay')}</dt>
          <dd className="text-fg">{`${formatDate(card.stayStart)} – ${formatDate(card.stayEnd)}`}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-sm text-fg-tertiary">{t('Places')}</dt>
          <dd className="text-fg">{t('{n} Beds', { n: formatNumber(card.places) })}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-sm text-fg-tertiary">{t('From')}</dt>
          <dd className="text-fg">{card.fromPrice != null ? t('{price} per Bed', { price: formatVnd(card.fromPrice) }) : '—'}</dd>
        </div>
      </dl>
      <Link to={`/student/registration-periods/${card.termId}`} className="flex items-center gap-1 self-start text-base font-medium text-fg-link hover:underline">
        {t('Registration period details')}
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
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
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 py-2.5 text-left">
        <span aria-hidden="true" className={cx('mt-2 size-2 shrink-0 rounded-full', item.read ? 'bg-transparent' : 'bg-primary')} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            {item.pinned && <Pin size={14} aria-label={t('Pinned')} className="text-fg-brand" />}
            <Tag tone={categoryTone[item.category] ?? 'neutral'} dot={false}>
              {item.category}
            </Tag>
            <span className={cx('text-base text-fg', !item.read && 'font-medium')}>{item.title}</span>
          </span>
          <span className="text-sm text-fg-tertiary">{formatRelative(item.shownFrom ?? item.createdAt)}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className={cx('mt-1 shrink-0 text-fg-secondary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-5">
          {item.changes?.length ? (
            <table className="w-full text-sm">
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
                    <td className="py-1 pr-3 text-fg">{tr(c.field)}</td>
                    <td className="py-1 pr-3 text-fg-secondary">{showValue(c.type, c.before)}</td>
                    <td className="py-1 font-medium text-fg">{showValue(c.type, c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-base whitespace-pre-wrap text-fg-secondary">{item.body}</p>
          )}
          {item.changes?.length > 0 && item.body.includes('\n') && (
            <p className="text-sm whitespace-pre-wrap text-fg-tertiary">{item.body.split('\n').filter((l) => !l.startsWith('•')).slice(1).join('\n')}</p>
          )}
          {item.link && item.link !== '/student' && (
            <Link to={item.link} className="flex items-center gap-1 self-start text-sm font-medium text-fg-link hover:underline">
              {t('Open')}
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

/** Card + announcements; nothing when the dormitory has no period and no news. */
export function DormitoryBoard() {
  const period = useQuery(['registration-period'], ({ signal }) => api.registrationPeriods.current(undefined, { signal }))
  const board = useQuery(['board'], ({ signal }) => api.me.board(undefined, { signal }))
  const read = useMutation((id) => api.notifications.markRead(id), { invalidates: ['board', 'notifications'], onError: () => {} })
  const [all, setAll] = useState(false)
  const card = period.data?.card
  const items = board.data?.items ?? []
  if (!card && items.length === 0) return null
  const shown = all ? items : items.slice(0, 3)
  return (
    <section aria-label={t('Dormitory board')} className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-6">
      {card && <PeriodCard card={card} />}
      <Card padding="lg" className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-card-title text-fg">
            <Megaphone size={18} aria-hidden="true" />
            {t('Dormitory board')}
          </h2>
          {board.data?.unread > 0 && <span className="text-sm text-fg-secondary">{t('{n} unread', { n: board.data.unread })}</span>}
        </div>
        {items.length === 0 ? (
          <p className="text-base text-fg-tertiary">{t('No announcements right now.')}</p>
        ) : (
          <ul className="flex flex-col lg:max-h-64 lg:overflow-y-auto">
            {shown.map((item) => (
              <AnnouncementItem key={item.id} item={item} onRead={(id) => read.run(id)} />
            ))}
          </ul>
        )}
        {items.length > 3 && (
          <button type="button" onClick={() => setAll((a) => !a)} className="self-start text-sm font-medium text-fg-link hover:underline">
            {all ? t('Show fewer') : t('Show all {n}', { n: items.length })}
          </button>
        )}
      </Card>
    </section>
  )
}
