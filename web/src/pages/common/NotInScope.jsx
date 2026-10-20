import { Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Card, EmptyState } from '@/components/ui/Display'

/** Sidebar entries planned for a later release. */
export default function NotInScope({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <Card padding="none" className="flex min-h-0 flex-1 flex-col justify-center">
        <EmptyState icon={Users} title="Coming in a later release">
          {title} is planned but not available in this version of CampusStay.
        </EmptyState>
      </Card>
    </>
  )
}
