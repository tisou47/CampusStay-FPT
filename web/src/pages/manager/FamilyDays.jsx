import { useState } from 'react'
import { useNavigate } from 'react-router'
import { HeartHandshake, Plus } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatDateTimeRange, formatNumber } from '@/lib/format'
import { t } from '@/i18n'
import { FamilyDayFormModal } from './familyDayForm'
import { familyDayStatusLabel } from '@/lib/familyDayStatus'

/** Where registration stands: when it opens, until when it is open, or that it is over. */
function registrationLabel(d) {
  if (d.status === 'Cancelled') return <span className="text-fg-tertiary">—</span>
  if (d.status === 'Draft' || d.status === 'Published') return t('Opens {time}', { time: formatDateTime(d.registrationOpensAt) })
  if (d.status === 'Registration open') return t('Open until {time}', { time: formatDateTime(d.registrationClosesAt) })
  return <span className="text-fg-secondary">{t('Closed')}</span>
}

// SCR-VIS-01 Family Days — Manager › Students (ADR-29, contract A-69) and Staff › Family Day desk list. A Manager
// creates a Draft for a Block, publishes it (the Block's residents are told), cancels it while no guest came in and
// closes it after its time slots. Staff see the Family Days of their Blocks and open the visitor desk.
// GET /family-days?block&status&page&pageSize → { items: [{ id, block, title, area, status, registrationOpensAt,
//   registrationClosesAt, startsAt, endsAt, maxGuests, capacity, booked, inside }], total, statuses }
// POST /family-days { block, title, description, area, registrationOpensAt, registrationClosesAt, maxGuests, slots }

export default function FamilyDays({ role = 'manager' }) {
  const { block } = useScopeQuery()
  const { user } = useSession()
  const manager = (user?.role ?? role) === 'manager'
  const navigate = useNavigate()
  const { notify } = useToast()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [creating, setCreating] = useState(false)

  const filters = { block, status, page, pageSize }
  const query = useQuery(['family-days', filters], ({ signal }) => api.familyDays.list(filters, { signal }))
  const items = query.data?.items ?? []
  const base = manager ? '/manager/family-days' : '/staff/family-days'

  const create = useMutation((body) => api.familyDays.create(body), {
    invalidates: ['family-days'],
    onSuccess: (day) => {
      notify({ title: 'Draft saved', message: 'Check it, then publish it to tell the residents.' })
      setCreating(false)
      navigate(`${base}/${day.id}`)
    },
    onError: () => {},
  })

  return (
    <>
      <PageHeader
        title="Family Days"
        actions={
          manager && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New Family Day
            </Button>
          )
        }
      />

      <div className="flex shrink-0 items-center gap-3">
        <Select
          wrapperClassName="w-60"
          aria-label={t('Status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          options={[{ value: '', label: 'Status: All' }, ...(query.data?.statuses ?? []).map((s) => ({ value: s, label: t('Status: {s}', { s: familyDayStatusLabel(s) }) }))]}
        />
      </div>

      <Table fill>
        <THead>
          <tr>
            <Th>Family Day</Th>
            <Th className="w-64">Time</Th>
            <Th className="w-56">Registration</Th>
            <Th className="w-36" align="right">
              Guests
            </Th>
            <Th className="w-40">Status</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} emptyIcon={HeartHandshake} emptyTitle="No Family Days yet" />
          {items.map((d) => (
            <Tr key={d.id} className="[&>td]:h-12" onClick={() => navigate(`${base}/${d.id}`)}>
              <Td>
                <TwoLine primary={d.title} secondary={t('Block {block} · {area}', { block: d.block, area: d.area })} />
              </Td>
              <Td className="whitespace-nowrap">{formatDateTimeRange(d.startsAt, d.endsAt)}</Td>
              <Td className="whitespace-nowrap">{registrationLabel(d)}</Td>
              <Td align="right">
                <TwoLine
                  primary={t('{booked} / {capacity}', { booked: formatNumber(d.booked), capacity: formatNumber(d.capacity) })}
                  secondary={d.status === 'In progress' ? t('{n} inside now', { n: formatNumber(d.inside) }) : undefined}
                />
              </Td>
              <Td>
                <StatusTag status={d.status}>{familyDayStatusLabel(d.status)}</StatusTag>
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

      {creating && (
        <FamilyDayFormModal open day={null} onClose={() => setCreating(false)} onSave={(body) => create.run(body)} saving={create.pending} error={create.error} />
      )}
    </>
  )
}
