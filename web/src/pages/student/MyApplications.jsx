import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Note } from '@/components/ui/Display'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, stop } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatVnd } from '@/lib/format'
import { ActivitySwitch, StatusList, StatusRow, StudentPage } from './shared'

// SCR-APP-02 My Applications (Figma 19:868)
// GET /students/me/applications?page&pageSize → { items: [{ id, termName, roomTypeName, roomClassName, deposit, submittedAt, status }], total, activeTermName }
export default function MyApplications() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery(['applications', 'mine', page, pageSize], ({ signal }) => api.me.applications({ page, pageSize }, { signal }))
  const items = query.data?.items ?? []
  const activeTerm = query.data?.activeTermName

  return (
    <StudentPage
      title="My applications"
      mobileTitle="Activity"
      phoneTop={<ActivitySwitch current="applications" />}
      description="One Application per Term. Open an Application to see its progress."
      actions={
        <Button variant="primary" size="lg" icon={Plus} to={activeTerm ? undefined : '/student/apply/term'} disabled={Boolean(activeTerm) || !query.data}>
          New application
        </Button>
      }
    >
      {activeTerm && <Note className="shrink-0 items-center">New application is disabled while you have an active Application for {activeTerm}.</Note>}

      {/* Phone: MOB-APP-01 Activity › Applications — one row per Application instead of the table. */}
      <QueryState
        query={query}
        compact
        className="lg:hidden"
        empty={
          <EmptyBlock icon={FileText} title="No applications yet" className="lg:hidden">
            Start an application when registration is open.
          </EmptyBlock>
        }
      >
        {(data) => (
          <StatusList className="lg:hidden">
            {data.items.map((r) => (
              <StatusRow
                key={r.id}
                icon={FileText}
                value={r.id}
                note={[r.termName, r.roomTypeName, r.roomClassName].filter(Boolean).join(' · ')}
                below={<StatusTag status={r.status} />}
                to={`/student/applications/${r.id}`}
              />
            ))}
          </StatusList>
        )}
      </QueryState>

      <Table size="lg" fill className="max-lg:hidden">
        <THead>
          <tr>
            <Th className="w-42">Application</Th>
            <Th className="w-35">Term</Th>
            <Th className="w-28">Room Type</Th>
            <Th className="w-32">Room Class</Th>
            <Th className="w-38" align="right">
              Deposit
            </Th>
            <Th className="w-44">Submitted</Th>
            <Th>Status</Th>
            <Th className="w-20">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={8} emptyIcon={FileText} emptyTitle="No applications yet" emptyText="Start an application when registration is open." />
          {items.map((r) => (
            <Tr key={r.id} onClick={() => navigate(`/student/applications/${r.id}`)}>
              <Td className="font-medium text-fg-brand">{r.id}</Td>
              <Td>{r.termName}</Td>
              <Td>{r.roomTypeName ?? '—'}</Td>
              <Td>{r.roomClassName ?? '—'}</Td>
              <Td align="right" className={r.deposit == null ? 'text-fg-tertiary' : undefined}>
                {r.deposit == null ? '—' : formatVnd(r.deposit)}
              </Td>
              <Td className={r.submittedAt ? undefined : 'text-fg-tertiary'}>{r.submittedAt ? formatDateTime(r.submittedAt) : '—'}</Td>
              <Td>
                <StatusTag status={r.status} />
              </Td>
              <Td onClick={stop}>
                <Button variant="text" to={`/student/applications/${r.id}`}>
                  View
                </Button>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <div className="flex shrink-0 justify-end">
        <Pagination
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>
    </StudentPage>
  )
}
