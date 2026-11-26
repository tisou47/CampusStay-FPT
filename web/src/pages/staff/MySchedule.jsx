import { useState } from 'react'
import { CalendarDays, ClipboardList } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert } from '@/components/ui/Display'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { campusClock, formatNumber } from '@/lib/format'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// Staff › My schedule
// GET /week-schedule/me → { thisWeek: { start, end, sent, shifts }, nextWeek: { start, end, sent, shifts|null }, inShift, shiftToday }
// GET /block-staff/me → { handles, blocks, open, resolved7d, … }
// The shifts a Manager planned for this week and, once sent, next week, and the kinds of work they gave the person.
// Outside them, a change asks the person to confirm and is marked for the Managers (A-78, A-79).

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const NAMED = { '07:00-15:00': 'Morning', '15:00-23:00': 'Afternoon', '23:00-07:00': 'Night' }
const hhmm = (c) => `${String(c.h).padStart(2, '0')}:${String(c.min).padStart(2, '0')}`
const pad = (n) => String(n).padStart(2, '0')
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const dayMonth = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** The shift going on now (an overnight shift of yesterday counts until it ends), or null. */
function currentShift(shifts, c) {
  const today = c.dow + 1
  const yesterday = today === 1 ? 7 : today - 1
  const now = hhmm(c)
  return (
    shifts.find((s) => (s.start < s.end ? s.weekday === today && s.start <= now && now < s.end : (s.weekday === today && s.start <= now) || (s.weekday === yesterday && now < s.end))) ?? null
  )
}

/** The next shift to start, this week then next week (when sent), with how many days away it is (0 = today). */
function nextShift(thisWeek, nextWeek, c) {
  const now = hhmm(c)
  for (let k = 0; k <= 13 - c.dow; k++) {
    const inNext = c.dow + k >= 7
    const list = inNext ? nextWeek : thisWeek
    if (!list) return null
    const weekday = ((c.dow + k) % 7) + 1
    const s = list.filter((x) => x.weekday === weekday && (k > 0 || x.start > now)).sort((a, b) => a.start.localeCompare(b.start))[0]
    if (s) return { ...s, inDays: k }
  }
  return null
}

function whenText(inDays) {
  if (inDays === 0) return t('Today')
  if (inDays === 1) return t('Tomorrow')
  return t('In {n} days', { n: inDays })
}

/**
 * The week as a FAP-style timetable ("FPT desk" redesign): shift slots down the side, days across, today's column
 * washed in orange. The three standard shifts always have a row; any other span gets its own row.
 */
function Timetable({ shifts, start, todayWeekday, current }) {
  const spans = [...new Set([...Object.keys(NAMED), ...shifts.map((s) => `${s.start}-${s.end}`)])].sort((a, b) => a.localeCompare(b))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-base">
        <thead>
          <tr>
            <th scope="col" className="w-32 border border-line bg-subtle px-3 py-2 text-left text-sm font-medium text-fg-secondary">
              {t('Shift')}
            </th>
            {DAYS.map((name, i) => {
              const today = i + 1 === todayWeekday
              return (
                <th key={name} scope="col" className={cx('border border-line px-2 py-2 text-left font-semibold', today ? 'bg-primary-subtle text-fg-brand' : 'bg-subtle text-fg')}>
                  {t(name)} <span className="font-normal text-fg-secondary tabular">{start ? dayMonth(addDays(start, i)) : ''}</span>
                  {today && <span className="sr-only"> ({t('Today')})</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {spans.map((span) => {
            const [from, to] = span.split('-')
            return (
              <tr key={span}>
                <th scope="row" className="border border-line bg-subtle/60 px-3 py-2 text-left align-top font-normal">
                  <span className="block font-semibold text-fg">{NAMED[span] ? t(NAMED[span]) : t('Shift')}</span>
                  <span className="text-sm text-fg-secondary tabular">
                    {from}–{to}
                  </span>
                </th>
                {DAYS.map((name, i) => {
                  const weekday = i + 1
                  const s = shifts.find((x) => x.weekday === weekday && `${x.start}-${x.end}` === span)
                  const live = s && current && current.weekday === s.weekday && current.start === s.start
                  const overnight = s && s.end < s.start
                  return (
                    <td key={name} className={cx('h-16 border border-line p-1.5 align-top', weekday === todayWeekday && 'bg-primary-subtle/40')}>
                      {s && (
                        <div className={cx('flex h-full flex-col rounded-md px-2 py-1', live ? 'bg-success-bg text-success-fg ring-1 ring-success' : 'bg-orange-100 text-orange-900')}>
                          <span className="text-sm font-semibold">{live ? t('Now') : t('On shift')}</span>
                          {overnight && <span className="text-xs">{t('until {day} morning', { day: t(DAYS[s.weekday % 7]) })}</span>}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function MySchedule() {
  const me = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }))
  const weeks = useQuery(['week-schedule', 'me'], ({ signal }) => api.weekSchedule.mine(undefined, { signal }))
  const [tab, setTab] = useState('this')
  const d = me.data
  const w = weeks.data
  const c = campusClock(new Date())
  const thisShifts = w?.thisWeek.shifts ?? []
  const current = w ? currentShift(thisShifts, c) : null
  const next = w ? nextShift(thisShifts, w.nextWeek.sent ? w.nextWeek.shifts : null, c) : null
  const shown = tab === 'this' ? w?.thisWeek : w?.nextWeek
  const shifts = shown?.shifts ?? []

  return (
    <>
      <PageHeader
        title="My schedule"
        actions={
          <Button icon={ClipboardList} to="/staff">
            My work today
          </Button>
        }
      />
      {w && thisShifts.length === 0 && (
        <Alert type="warning" title="No shift this week">
          You have no shift this week, so every change you make counts as outside your shift. Ask your Manager if this is not right.
        </Alert>
      )}
      <div className="flex shrink-0 gap-4">
        <KpiTile
          size="md"
          label="Now"
          value={w ? t(w.inShift ? 'In shift' : 'Outside shift') : '—'}
          valueTone={w && !w.inShift ? 'warning' : undefined}
          note={current ? `${current.start}–${current.end}` : w ? t('Changes ask you to confirm') : null}
          noteTone={w && !w.inShift ? 'warning' : 'secondary'}
        />
        <KpiTile size="md" label="Next shift" value={next ? `${t(DAYS[next.weekday - 1])} ${next.start}–${next.end}` : '—'} note={next ? whenText(next.inDays) : w && !w.nextWeek.sent ? t('Next week is not sent yet') : t('No shift set')} />
        <KpiTile size="md" label="Open work" value={formatNumber(d?.open)} note={d ? t('Resolved in 7 days: {n}', { n: d.resolved7d }) : null} />
      </div>

      <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <CalendarDays size={18} aria-hidden="true" className="text-fg-brand" />
            {shown ? `${dayMonth(shown.start)} – ${dayMonth(shown.end)}` : t('This week')}
          </h2>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'this', label: 'This week' },
              { value: 'next', label: w?.nextWeek.sent ? 'Next week' : 'Next week (not sent yet)' },
            ]}
          />
        </div>
        {tab === 'next' && w && !w.nextWeek.sent ? (
          <p className="py-8 text-center text-base text-fg-secondary">{t('Your Manager has not sent next week’s schedule yet. You get a notification when they do.')}</p>
        ) : (
          <Timetable shifts={shifts} start={shown?.start} todayWeekday={tab === 'this' ? c.dow + 1 : null} current={tab === 'this' ? current : null} />
        )}
      </section>

      <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold text-fg">{t('Work assigned to you')}</h2>
        {d && d.handles.length === 0 ? (
          <p className="text-base text-fg-secondary">{t('No work assigned yet: every kind of work asks you to confirm. Ask your Manager.')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(d?.handles ?? []).map((h) => (
              <Tag key={h} tone="brand">
                {tr(h)}
              </Tag>
            ))}
          </div>
        )}
        {d?.blocks?.length > 0 && <p className="text-sm text-fg-secondary">{t('Blocks {codes}', { codes: d.blocks.join(', ') })}</p>}
        <p className="text-sm text-fg-secondary">{t('Work of other kinds asks you to confirm and is marked for your Manager. Your Manager sets your shifts and your work.')}</p>
      </section>
    </>
  )
}
