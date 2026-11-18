import { ClipboardList } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

/** My room: what the check-in inventory or the furniture charges ask of the student now (nothing when all is done). */
export function HandoverBanner() {
  const inventory = useQuery(['handover', 'mine'], ({ signal }) => api.handover.mine(undefined, { signal }))
  const charges = useQuery(['check-out-furniture', 'mine'], ({ signal }) => api.checkOutFurniture.mine(undefined, { signal }))
  const h = inventory.data
  const c = charges.data
  const open = (label) => (
    <Button size="sm" variant="primary" icon={ClipboardList} to="/student/room/inventory">
      {label}
    </Button>
  )
  if (h?.status === 'Ready') {
    return (
      <Alert type="info" title="You can receive your Room" action={open('Start check-in inventory')} className="shrink-0">
        {t('At the Room, start the check-in inventory to get the door code.')}
      </Alert>
    )
  }
  if (h?.status === 'Draft') {
    return (
      <Alert type="warning" title="File your check-in inventory" action={open('Continue')} className="shrink-0">
        {t('Due {date}. After that the Room’s recorded condition is used.', { date: formatDateTime(h.dueAt) })}
      </Alert>
    )
  }
  if (h?.status === 'Verifying') {
    return (
      <Alert type="warning" title={h.toAgree ? 'Agree with the checked inventory' : 'Staff will check your Room'} action={open('Open')} className="shrink-0">
        {h.toAgree ? t('Staff recorded what they found in the Room.') : h.visitAt ? t('Be in the Room at {date}.', { date: formatDateTime(h.visitAt) }) : t('Staff will tell you when they come.')}
      </Alert>
    )
  }
  const claims = c?.claims?.filter((x) => x.status === 'Pending').length ?? 0
  if (claims || (c?.studentPresent && !c?.agreedAt && c?.saved)) {
    return (
      <Alert type="warning" title="Furniture charges to answer" action={open('Open')} className="shrink-0">
        {claims ? t('Staff ask you to confirm damage to a shared item.') : t('Read the charges of your check-out and agree.')}
      </Alert>
    )
  }
  return null
}
