import { CalendarDays, ClipboardList } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { campusClock, formatNumber } from '@/lib/format'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// Staff › My schedule
// GET /block-staff/me → { id, onDuty, handles, blocks, open, resolved7d, inShift, shiftToday, shifts: [{ weekday, start, end }] }
// The weekly shifts and the kinds of work a Manager gave the signed-in Staff member. Outside them, a change asks the
// person to confirm and is marked for the Managers (A-74).

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const NAMED = { '07:00-15:00': 'Morning', '15:00-23:00': 'Afternoon', '23:00-07:00': 'Night' }
const hhmm = (c) => `${String(c.h).padStart(2, '0')}:${String(c.min).padStart(2, '0')}`

/** The shift going on now (an overnight shift of yesterday counts until it ends), or null. */
function currentShift(shifts, c) {
  const today = c.dow + 1
  const yesterday = today === 1 ? 7 : today - 1
  const now = hhmm(c)
  return (
    shifts.find((s) => (s.start < s.end ? s.weekday === today && s.start <= now && now < s.end : (s.weekday === today && s.start <= now) || (s.weekday === yesterday && now < s.end))) ?? null
  )
}

/** The next shift to start, with how many days away it is (0 = today). */
function nextShift(shifts, c) {
  const now = hhmm(c)
  for (let k = 0; k <= 7; k++) {
    const weekday = ((c.dow + k) % 7) + 1
    const s = shifts
      .filter((x) => x.weekday === weekday && (k > 0 || x.start > now))
      .sort((a, b) => a.start.localeCompare(b.start))[0]
    if (s) return { ...s, inDays: k }
  }
  return null
}

function whenText(inDays) {
  if (inDays === 0) return t('Today')
  if (inDays === 1) return t('Tomorrow')
  return t('In {n} days', { n: inDays })
}

export default function MySchedule() {
  const me = useQuery(['me-duty'], ({ signal }) => api.blockStaff.me(undefined, { signal }))
  const d = me.data
  const shifts = d?.shifts ?? []
  const c = campusClock(new Date())
  const current = d ? currentShift(shifts, c) : null
  const next = d ? nextShift(shifts, c) : null
  const today = c.dow + 1

  return (
    <>
      <PageHeader
        title="My schedule"
        description="Your weekly shifts and the work your Manager gave you. Outside your shifts or this work, a change asks you to confirm and is marked for your Manager."
        actions={
          <Button icon={ClipboardList} to="/staff">
            My work today
          </Button>
        }
      />
      {d && shifts.length === 0 && (
        <Alert type="warning" title="No shift yet">
          Your Manager has not set your shifts, so every change you make counts as outside your shift. Ask your Manager to set them.
        </Alert>
      )}
      <div className="flex shrink-0 gap-4">
        <KpiTile
          size="md"
          label="Now"
          value={d ? t(d.inShift ? 'In shift' : 'Outside shift') : '—'}
          valueTone={d && !d.inShift ? 'warning' : undefined}
          note={current ? `${current.start}–${current.end}` : d ? t('Changes ask you to confirm') : null}
          noteTone={d && !d.inShift ? 'warning' : 'secondary'}
        />
        <KpiTile size="md" label="Next shift" value={next ? `${t(DAYS[next.weekday - 1])} ${next.start}–${next.end}` : '—'} note={next ? whenText(next.inDays) : t('No shift set')} />
        <KpiTile size="md" label="Open work" value={formatNumber(d?.open)} note={d ? t('Resolved in 7 days: {n}', { n: d.resolved7d }) : null} />
      </div>

      <section className="flex shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <CalendarDays size={18} aria-hidden="true" className="text-fg-brand" />
          {t('This week')}
        </h2>
        <div className="grid grid-cols-7 gap-2 max-lg:grid-cols-4 max-sm:grid-cols-2">
          {DAYS.map((name, i) => {
            const weekday = i + 1
            const mine = shifts.filter((s) => s.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start))
            const isToday = weekday === today
            return (
              <div key={name} className={cx('flex min-h-32 flex-col gap-2 rounded-lg border p-2.5', isToday ? 'border-primary bg-primary-subtle/40' : 'border-line')}>
                <div className="flex items-center justify-between">
                  <span className={cx('font-semibold', isToday ? 'text-fg-brand' : 'text-fg')}>{t(name)}</span>
                  {isToday && <Tag tone="brand">Today</Tag>}
                </div>
                {mine.length === 0 && <span className="text-sm text-fg-tertiary">{t('Day off')}</span>}
                {mine.map((s) => {
                  const overnight = s.end < s.start
                  const live = current && current.weekday === s.weekday && current.start === s.start
                  const named = NAMED[`${s.start}-${s.end}`]
                  return (
                    <div key={s.start} className={cx('flex flex-col rounded-md px-2 py-1.5', live ? 'bg-success-bg ring-1 ring-success' : 'bg-subtle')}>
                      <span className="text-base font-medium text-fg tabular">
                        {s.start}–{s.end}
                      </span>
                      <span className="text-xs text-fg-secondary">
                        {[named && t(named), overnight && t('until {day} morning', { day: t(DAYS[s.weekday % 7]) }), live && t('Now')].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
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
