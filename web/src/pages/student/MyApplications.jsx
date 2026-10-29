import { useId, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { QueryState } from '@/components/ui/States'
import { DataTable } from '@/components/student/DataTable'
import { EmptyState } from '@/components/student/EmptyState'
import { ReasonLine } from '@/components/student/ReasonLine'
import { StatusBadge } from '@/components/student/StatusBadge'
import { formatDate, formatVnd } from '@/lib/format'
import { ActivitySwitch, StudentPage } from './shared'
import { t, tr } from '@/i18n'

// SCR-APP-02 My Applications (Figma 19:868)
// GET /students/me/applications?page&pageSize → { items: [{ id, termName, roomTypeName, roomClassName, deposit, submittedAt, status }], total, activeTermName }

// Static column set: the Application code opens its page (the route the row opened before).
const COLUMNS = [
  {
    key: 'id',
    header: 'Application',
    render: (r) => (
      <Link to={`/student/applications/${r.id}`} className="font-medium text-link hover:underline">
        {r.id}
      </Link>
    ),
  },
  { key: 'termName', header: 'Term' },
  { key: 'roomTypeName', header: 'Room type', render: (r) => tr(r.roomTypeName) || '—' },
  { key: 'roomClassName', header: 'Room tier', render: (r) => tr(r.roomClassName) || '—' },
  { key: 'deposit', header: 'Deposit', money: true, render: (r) => (r.deposit == null ? '—' : formatVnd(r.deposit)) },
  { key: 'submittedAt', header: 'Submitted on', render: (r) => (r.submittedAt ? <span className="nowrap">{formatDate(r.submittedAt)}</span> : '—') },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'actions',
    header: 'Actions',
    actions: true,
    render: (r) => (
      <Button variant="text" to={`/student/applications/${r.id}`}>
        View
      </Button>
    ),
  },
]

export default function MyApplications() {
  const reasonId = useId()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery(['applications', 'mine', page, pageSize], ({ signal }) => api.me.applications({ page, pageSize }, { signal }))
  const activeTerm = query.data?.activeTermName
  const locked = Boolean(activeTerm) || !query.data

  return (
    <StudentPage
      flow
      title="My applications"
      mobileTitle="Activity"
      phoneTop={<ActivitySwitch current="applications" />}
      description="One Application per Term. Open an Application to see its progress."
      actions={
        <Button variant="primary" size="lg" icon={Plus} to={locked ? undefined : '/student/apply/term'} disabled={locked} aria-describedby={activeTerm ? reasonId : undefined}>
          New application
        </Button>
      }
    >
      {activeTerm && <ReasonLine id={reasonId}>{t('New application is disabled while you have an active Application for {term}.', { term: activeTerm })}</ReasonLine>}

      <QueryState query={query} empty={<EmptyState icon={FileText} title="No applications yet" description="Start an application when registration is open." />}>
        {(data) => (
          <DataTable
            caption="My applications"
            columns={COLUMNS}
            rows={data.items}
            total={data.total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            noun={['application', 'applications']}
          />
        )}
      </QueryState>
    </StudentPage>
  )
}
