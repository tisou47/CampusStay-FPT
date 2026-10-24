import { useNavigate } from 'react-router'
import { Bell } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatDateTime } from '@/lib/format'
import { StudentPage } from './shared'
import { t } from '@/i18n'

// Notifications (phone: MOB-NTF-01 Notifications, Figma 58:474). The App Bar's bell opens this page;
// on a wide screen the bell keeps its popover. Unread items sit on bg/brand-subtle with a brand dot.
// GET /notifications?limit → { items: [{ id, title, body, createdAt, link, read }], unread }
export default function Notifications() {
  const navigate = useNavigate()
  const query = useQuery(['notifications', 'page'], ({ signal }) => api.notifications.list({ limit: 50 }, { signal }))
  const markAll = useMutation(() => api.notifications.markAllRead(), { invalidates: ['notifications'], onError: () => {} })
  const markOne = useMutation((id) => api.notifications.markRead(id), { invalidates: ['notifications'], onError: () => {} })
  const unread = query.data?.unread ?? (query.data?.items ?? []).filter((n) => !n.read).length

  const open = (n) => {
    if (!n.read) markOne.run(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <StudentPage
      breadcrumb={[{ label: 'Home', to: '/student' }, { label: 'Notifications' }]}
      title="Notifications"
      width="max-w-180"
      actions={
        unread > 0 && (
          <Button size="lg" onClick={() => markAll.run()} disabled={markAll.pending}>
            {t('Mark all read')}
          </Button>
        )
      }
    >
      <QueryState query={query} empty={<p className="px-4 py-8 text-center text-base text-fg-secondary">{t('You have no notifications.')}</p>} isEmpty={(d) => !d?.items?.length}>
        {(data) => (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface lg:min-h-0 lg:overflow-y-auto lg:rounded-lg">
            {data.items.map((n) => (
              <li key={n.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cx('flex w-full items-start gap-3 px-4 py-3 text-left', n.read ? 'hover:bg-subtle' : 'bg-brand-subtle')}
                >
                  <Bell size={20} aria-hidden="true" className={cx('mt-0.5 shrink-0', n.read ? 'text-fg-secondary' : 'text-fg-brand')} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-medium text-fg">{n.title}</span>
                    {n.body && <span className="text-sm text-fg-secondary">{n.body}</span>}
                    <span className="text-sm text-fg-tertiary">{formatDateTime(n.createdAt)}</span>
                  </span>
                  {!n.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                      <span className="sr-only">{t('Unread')}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </StudentPage>
  )
}
