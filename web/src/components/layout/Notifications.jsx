import { Bell } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { Popover } from '@/components/ui/Popover'
import { QueryState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatRelative } from '@/lib/format'

// Notification Center (web): latest notifications for the signed-in user.
// Item: { id, title, body, createdAt, link, read }.
export function useNotifications() {
  const query = useQuery(['notifications'], ({ signal }) => api.notifications.list({ limit: 10 }, { signal }))
  const markAll = useMutation(() => api.notifications.markAllRead(), { invalidates: ['notifications'], onError: () => {} })
  const markOne = useMutation((id) => api.notifications.markRead(id), { invalidates: ['notifications'], onError: () => {} })
  const items = query.data?.items ?? []
  const unread = query.data?.unread ?? items.filter((n) => !n.read).length
  return { query, items, unread, markAll, markOne }
}

export function NotificationsButton() {
  const { query, unread, markAll, markOne } = useNotifications()

  return (
    <Popover
      width={360}
      trigger={({ toggle, props }) => (
        <button type="button" onClick={toggle} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative size-8 shrink-0 rounded-md text-fg-secondary hover:bg-subtle" {...props}>
          <Bell size={20} aria-hidden="true" className="absolute top-1.5 left-1.5" />
          {unread > 0 && <span aria-hidden="true" className="absolute top-1 left-5 size-2 rounded-full border-[1.5px] border-white bg-error" />}
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex max-h-[min(480px,calc(100dvh-96px))] flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <p className="text-h3 font-semibold text-fg">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={() => markAll.run()} className="text-sm font-medium text-fg-link hover:underline">
                Mark all read
              </button>
            ) : (
              <span className="text-sm text-fg-tertiary">No unread</span>
            )}
          </div>
          <div className="flex min-h-0 flex-col overflow-y-auto">
            <QueryState query={query} compact empty={<p className="px-4 py-8 text-center text-base text-fg-secondary">You have no notifications.</p>}>
              {(data) => (
                <ul className="flex flex-col py-1">
                  {data.items.map((n) => (
                    <li key={n.id}>
                      <Link
                        to={n.link ?? '#'}
                        onClick={() => {
                          if (!n.read) markOne.run(n.id)
                          close()
                        }}
                        className="flex gap-3 px-4 py-2.5 hover:bg-subtle"
                      >
                        <span aria-hidden="true" className={cx('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-base font-medium text-fg">{n.title}</span>
                          {n.body && <span className="text-sm text-fg-secondary">{n.body}</span>}
                          <span className="text-sm text-fg-tertiary">{formatRelative(n.createdAt)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </div>
        </div>
      )}
    </Popover>
  )
}
