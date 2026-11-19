import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { History } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { KpiTile } from '@/components/ui/Charts'
import { Avatar } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// Manager › Staff › Staff activity
// GET /staff-activity?block&staffId&flagged&from&to&page&pageSize → { items: [{ id, staffId, staffName, at, action,
//   method, objectId, handle, inShift, roleMatch, acknowledged, flagged, status }], total,
//   summary: { total, outOfShift, roleMismatch }, staffOptions: [{ id, name }] }
// Every change a Staff member made, newest first; changes outside the shift or the person's work are marked.

export default function StaffActivity() {
  const { block } = useSession()
  const [params, setParams] = useSearchParams()
  const staffId = params.get('staff') ?? ''
  const [flagged, setFlagged] = useState(params.get('flagged') === '1' ? 'flagged' : 'all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const query = useQuery(['staff-activity', block, staffId, flagged, from, to, page, pageSize], ({ signal }) =>
    api.blockStaff.activity(
      { block: block ?? undefined, staffId: staffId || undefined, flagged: flagged === 'flagged' || undefined, from: from || undefined, to: to || undefined, page, pageSize },
      { signal },
    ),
  )
  const d = query.data
  const s = d?.summary
  const chooseStaff = (id) => {
    const next = new URLSearchParams(params)
    if (id) next.set('staff', id)
    else next.delete('staff')
    setParams(next, { replace: true })
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Staff activity"
      />
      <div className="flex shrink-0 gap-4">
        <KpiTile size="md" label="Changes" value={formatNumber(s?.total)} note={from || to ? 'In the days chosen' : 'All recorded'} />
        <KpiTile size="md" label="Outside the shift" value={formatNumber(s?.outOfShift)} valueTone={s?.outOfShift ? 'warning' : undefined} note="Confirmed by the person" />
        <KpiTile size="md" label="Not their assigned work" value={formatNumber(s?.roleMismatch)} valueTone={s?.roleMismatch ? 'warning' : undefined} note="Confirmed by the person" />
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <Field label="Staff member" className="w-64">
          {(id) => (
            <Select
              id={id}
              value={staffId}
              onChange={(e) => chooseStaff(e.target.value)}
              options={[{ value: '', label: t('Everyone') }, ...(d?.staffOptions ?? []).map((o) => ({ value: o.id, label: o.name }))]}
            />
          )}
        </Field>
        <Field label="From" className="w-44">
          {(id) => <Input id={id} type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />}
        </Field>
        <Field label="To" className="w-44">
          {(id) => <Input id={id} type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />}
        </Field>
        <Segmented
          className="mb-1"
          value={flagged}
          onChange={(v) => (setFlagged(v), setPage(1))}
          options={[
            { value: 'all', label: 'All changes' },
            { value: 'flagged', label: 'Marked only' },
          ]}
        />
      </div>
      <Table fill className="min-h-[360px] shrink-0">
        <THead>
          <tr>
            <Th className="w-44 whitespace-nowrap">Time</Th>
            <Th className="min-w-52">Staff</Th>
            <Th className="min-w-64">Action</Th>
            <Th className="w-40">Kind of work</Th>
            <Th className="min-w-56">Check</Th>
            <Th className="w-24 text-right">Result</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} emptyIcon={History} emptyTitle={flagged === 'flagged' ? 'No marked changes' : 'No changes recorded'} />
          {(d?.items ?? []).map((a) => (
            <Tr key={a.id} className={a.flagged ? 'bg-warning-bg/40' : undefined}>
              <Td className="whitespace-nowrap tabular">{formatDateTime(a.at)}</Td>
              <Td>
                <button type="button" onClick={() => chooseStaff(a.staffId)} className="flex items-center gap-2 text-left hover:underline">
                  <Avatar name={a.staffName} />
                  <span>{a.staffName}</span>
                </button>
              </Td>
              <Td>
                <span className="text-fg">{a.action}</span>
                {a.objectId && <span className="text-fg-secondary"> · {a.objectId}</span>}
              </Td>
              <Td>{a.handle ? tr(a.handle) : <span className="text-fg-tertiary">{t('Any')}</span>}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {a.inShift && a.roleMatch && <Tag tone="success">In shift, own work</Tag>}
                  {!a.inShift && <Tag tone="warning">Outside the shift</Tag>}
                  {!a.roleMatch && <Tag tone="warning">Not their work</Tag>}
                  {a.acknowledged && <Tag>Confirmed warning</Tag>}
                </div>
              </Td>
              <Td className="text-right">{a.status < 400 ? <Tag tone="success">Done</Tag> : <Tag tone="error">{t('Failed ({status})', { status: a.status })}</Tag>}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <Pagination
        total={d?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onChange={setPage}
        onPageSizeChange={(n) => (setPageSize(n), setPage(1))}
        noun={['change', 'changes']}
      />
    </>
  )
}
