import { useNavigate } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Card, Divider } from '@/components/ui/Display'
import { QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { t, tr } from '@/i18n'

// Shared pieces of SCR-REQ-03 Room Swap – Specific Student and SCR-REQ-04 Swap Board.

export function SwapModePicker({ value }) {
  const navigate = useNavigate()
  const modes = [
    { key: 'specific', title: 'Swap with a specific Student', body: 'Enter their Student code; they approve', to: '/student/requests/swap/new' },
    { key: 'board', title: 'Post on the swap board', body: 'The system finds a matching request', to: '/student/requests/swap/board' },
  ]
  return (
    <div role="radiogroup" aria-label={t('Swap type')} className="flex shrink-0 items-stretch gap-3">
      {modes.map((m) => {
        const active = m.key === value
        return (
          <label
            key={m.key}
            className={cx(
              'flex min-w-0 flex-1 cursor-pointer flex-col gap-1 rounded-md border p-4 transition-colors',
              active ? 'border-line-brand bg-brand-subtle' : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <span className="flex items-start gap-2 text-base text-fg">
              <span className="flex h-5.5 w-4 shrink-0 items-center">
                <input
                  type="radio"
                  name="swapMode"
                  checked={active}
                  onChange={() => navigate(m.to)}
                  className="size-4 appearance-none rounded-full border border-line-strong bg-surface checked:border-[5px] checked:border-primary"
                />
              </span>
              {t(m.title)}
            </span>
            <span className="text-sm text-fg-secondary">{t(m.body)}</span>
          </label>
        )
      })}
    </div>
  )
}

/** The student's current Allocation, from GET /students/me/allocation. */
export function useMyAllocation() {
  const { term } = useSession()
  return useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
}

/** The Bed the student holds for the next Term (swaps are of next-Term Beds, spec §6.10). */
export function YourRoomNow() {
  const query = useMyAllocation()
  return (
    <Card padding="lg" className="flex w-full shrink-0 flex-col lg:w-90 gap-3 self-start">
      <h2 className="text-card-title text-fg">{t('Your Bed next Term')}</h2>
      <QueryState
        query={query}
        compact
        isEmpty={(d) => !d?.nextTerm?.room}
        empty={<p className="text-base text-fg-secondary">{t('Swaps open with the requests window, when your Bed is kept for the next Term.')}</p>}
      >
        {({ nextTerm: n }) =>
          [
            ['Term', n.term?.name ?? '—'],
            ['Room and Bed', t('{room} · Bed {bed}', { room: n.room, bed: n.bed })],
            ['Type / Class', `${tr(n.roomTypeName) || '—'} · ${tr(n.roomClassName) || '—'}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 text-base">
              <span className="text-fg-secondary">{t(label)}</span>
              <span className="text-fg">{value}</span>
            </div>
          ))
        }
      </QueryState>
      <Divider />
      <p className="text-sm text-fg-tertiary">{t('A swap takes effect at the start of the next Term. Same-Block swaps are approved by Staff; cross-Block swaps by a Manager.')}</p>
    </Card>
  )
}
