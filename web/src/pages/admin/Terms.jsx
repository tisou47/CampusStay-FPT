import { useNavigate } from 'react-router'
import { Calendar, ClipboardList, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/Display'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDate, formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

// SCR-CFG-01 Registration periods › Terms (spec §6.4): every Term with its stay, registration window and status.
// A Draft opens the wizard at the step it reached; a published Term opens on its review, where money and policy
// fields stay editable within the rules of spec §5.2.
// GET /admin/terms → { items: [{ id, name, status, stayStart, stayEnd, registrationOpensAt, registrationClosesAt, …,
//   wizardStep, requestCode }] }

export const termTone = { 'Registration open': 'success', Draft: 'neutral', Published: 'info', 'In stay': 'info', Closed: 'neutral' }

export default function Terms() {
  const navigate = useNavigate()
  const query = useQuery(['admin-terms'], ({ signal }) => api.admin.terms.list(undefined, { signal }))
  const items = query.data?.items ?? []

  return (
    <>
      <PageHeader
        title="Terms"
        description="Build a Term step by step and publish it. Students see a Term, its prices and its rules once it is published."
        actions={
          <>
            <Button icon={ClipboardList} to="/admin/term-requests">
              Requests from Managers
            </Button>
            <Button variant="primary" icon={Plus} to="/admin/terms/new">
              New Term
            </Button>
          </>
        }
      />
      <Table fill>
        <THead>
          <tr>
            <Th>Term</Th>
            <Th>Stay</Th>
            <Th>Registration</Th>
            <Th className="w-48">Status</Th>
            <Th className="w-48">Wizard</Th>
            <Th className="w-32">Request</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={Calendar} emptyTitle="No Terms yet" emptyText="Start with New Term, or build one from a Manager's request." />
          {items.map((term) => {
            const draft = term.status === 'Draft'
            const steps = Math.min(term.wizardStep ?? 7, 6)
            return (
              <Tr key={term.id} onClick={() => navigate(`/admin/terms/${term.id}`)} className="cursor-pointer">
                <Td className="font-medium whitespace-nowrap">{term.name}</Td>
                <Td className="whitespace-nowrap">
                  {formatDate(term.stayStart)} – {formatDate(term.stayEnd)}
                </Td>
                <Td className="whitespace-nowrap">
                  {term.registrationOpensAt ? `${formatDateTime(term.registrationOpensAt)} – ${formatDateTime(term.registrationClosesAt)}` : '—'}
                </Td>
                <Td>
                  <Tag tone={termTone[term.status] ?? 'neutral'}>{term.status}</Tag>
                </Td>
                <Td>
                  {draft ? (
                    <div className="flex items-center gap-2">
                      <ProgressBar value={steps} max={6} className="w-20" />
                      <span className="text-sm text-fg-secondary">{t('{n} of {total} steps', { n: steps, total: 6 })}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-fg-tertiary">{t('Published')}</span>
                  )}
                </Td>
                <Td>{term.requestCode ?? '—'}</Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </>
  )
}
