import { useNavigate, useParams } from 'react-router'
import { Repeat } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'

// SCR-REQ-05 Swap Invitation (Figma 104:2490) — seen by the partner Student.
// GET /swap-invitations/:id → { id, status, expiresAt, crossBlock, priceDifference,
//   give: { room, bed, roomTypeName, roomClassName, block, termPrice }, get: { … } }
// POST /swap-invitations/:id/respond { accept }

function RoomBox({ label, room }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-md bg-subtle p-4">
      <p className="text-sm font-medium text-fg-tertiary">{label}</p>
      <p className="text-h3 font-semibold text-fg">
        {room.room} · Bed {room.bed}
      </p>
      <p className="text-base text-fg-secondary">{[room.roomTypeName, room.roomClassName, room.block && `Block ${room.block}`].filter(Boolean).join(' · ')}</p>
      {room.termPrice != null && <p className="text-sm text-fg-tertiary">{formatVnd(room.termPrice)} per Term</p>}
    </div>
  )
}

function Invitation({ inv }) {
  const navigate = useNavigate()
  const { notify, notifyError } = useToast()
  const respond = useMutation((accept) => api.swaps.respond(inv.id, { accept }), {
    invalidates: ['requests', 'allocation', 'notifications'],
    onSuccess: (_, accept) => {
      notify(
        accept
          ? { title: 'Swap accepted', message: inv.crossBlock ? 'The Block Manager reviews the cross-Block swap.' : 'Staff review the swap and set the move date.' }
          : { type: 'info', title: 'Swap declined', message: 'The other Student only sees that the invitation was not accepted.' },
      )
      navigate('/student/requests?tab=swaps')
    },
    onError: (e) => notifyError(e, 'Could not send your answer'),
  })
  const open = inv.status === 'Pending'
  const diff = inv.priceDifference ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {open ? (
        <Alert type="warning" title={`Reply by ${formatDateTime(inv.expiresAt)}`} className="shrink-0">
          If you do not reply in time, the invitation expires.
        </Alert>
      ) : (
        <Alert type="info" title={`This invitation is ${String(inv.status).toLowerCase()}`} className="shrink-0" />
      )}
      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 font-semibold text-fg">A Student wants to swap Rooms with you</h2>
          <p className="text-base text-fg-secondary">Their name and code stay private until the swap is approved.</p>
        </div>
        <div className="flex items-stretch gap-4">
          <RoomBox label="You give" room={inv.give} />
          <RoomBox label="You get" room={inv.get} />
        </div>
        <div className="flex justify-between text-base">
          <span className="text-fg-secondary">Price difference for the rest of the Term</span>
          <span className={diff > 0 ? 'font-medium text-fg' : 'font-medium text-success-fg'}>
            {diff === 0 ? 'None' : diff > 0 ? `+ ${formatVnd(diff)} (invoiced)` : `− ${formatVnd(-diff)} (credited)`}
          </span>
        </div>
        <p className="text-sm text-fg-tertiary">After approval you move on the move date. Meter readings are taken for both Rooms.</p>
      </Card>
      {open && (
        <div className="flex shrink-0 justify-end gap-3">
          <Button size="lg" onClick={() => respond.run(false)} disabled={respond.pending}>
            Decline
          </Button>
          <Button variant="primary" size="lg" onClick={() => respond.run(true)} disabled={respond.pending}>
            Accept swap
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SwapInvitation() {
  const { id } = useParams()
  const query = useQuery(['swap-invitation', id], ({ signal }) => api.swaps.invitation(id, { signal }))
  return (
    <StudentPage breadcrumb={[{ label: 'Requests', to: '/student/requests' }, { label: 'Swap invitation' }]} title="Swap invitation" width="max-w-200">
      {query.data === undefined && query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={Repeat} title="Invitation not found" action={<Button to="/student/requests">Back to Requests</Button>} />
      ) : query.data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : (
        <Invitation inv={query.data} />
      )}
    </StudentPage>
  )
}
