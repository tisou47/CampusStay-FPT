import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download, FileText } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { SearchInput, Select } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t } from '@/i18n'

// SCR-AUTH-12 Audit Log (Figma 72:3772)
// GET /admin/audit-log?q&actor&action&range&page&pageSize → { items: [{ id, at, actor, action, tone, object, change }], total,
//   actors: [string], actions: [string], retentionMonths }
// GET /exports/audit-log?…filters (.csv) — the export itself is written to the log by the server.

const ranges = [
  { value: '30d', label: 'Date: Last 30 days' },
  { value: '7d', label: 'Date: Last 7 days' },
  { value: '90d', label: 'Date: Last 90 days' },
  { value: 'all', label: 'Date: All time' },
]

export default function AuditLog() {
  const [params] = useSearchParams()
  const { notifyError } = useToast()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [range, setRange] = useState('30d')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const filters = { q: search, actor, action, range, page, pageSize }
  const query = useQuery(['audit-log', filters], ({ signal }) => api.admin.auditLog(filters, { signal }))
  const d = query.data
  const exporting = useMutation(() => api.exports.download('audit-log', { ...filters, page: undefined, pageSize: undefined }, 'audit-log.csv'), {
    onSuccess: () => query.reload(),
    onError: (e) => notifyError(e, 'Export failed'),
  })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        description={`${t('Every configuration change, irreversible action and data export. Read-only.')}${d?.retentionMonths ? ` ${t('Kept {n} months.', { n: d.retentionMonths })}` : ''}`}
        actions={
          <Button icon={Download} onClick={() => exporting.run()} disabled={exporting.pending}>
            Export .csv
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-3">
        <SearchInput aria-label={t('Search object or user')} placeholder="Search object or user" wrapperClassName="w-65" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label={t('Actor')} wrapperClassName="w-48" value={actor} onChange={filter(setActor)} options={[{ value: '', label: 'Actor: All' }, ...(d?.actors ?? []).map((a) => ({ value: a, label: t('Actor: {a}', { a }) }))]} />
        <Select aria-label={t('Action')} wrapperClassName="w-48" value={action} onChange={filter(setAction)} options={[{ value: '', label: 'Action: All' }, ...(d?.actions ?? []).map((a) => ({ value: a, label: t('Action: {a}', { a }) }))]} />
        <Select aria-label={t('Date')} wrapperClassName="w-48" value={range} onChange={filter(setRange)} options={ranges} />
      </div>
      <Table fill tableClassName="table-fixed">
        <THead>
          <tr>
            <Th className="w-40">Time</Th>
            <Th className="w-44">Actor</Th>
            <Th className="w-44">Action</Th>
            <Th className="w-52">Object</Th>
            <Th>Change</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} emptyIcon={FileText} emptyTitle="No entries match these filters" />
          {(d?.items ?? []).map((e) => (
            <Tr key={e.id} className="[&>td]:h-12">
              <Td className="font-medium whitespace-nowrap tabular">{formatDateTime(e.at)}</Td>
              <Td className="truncate">{e.actor}</Td>
              <Td>
                <Tag tone={e.tone ?? 'info'}>{e.action}</Tag>
              </Td>
              <Td className="truncate" title={e.object}>
                {e.object}
              </Td>
              <Td className="truncate" title={e.change}>
                {e.change}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex shrink-0 justify-end">
        <Pagination
          total={d?.total ?? 0}
          page={page}
          pageSize={pageSize}
          noun={['entry', 'entries']}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>
    </>
  )
}
