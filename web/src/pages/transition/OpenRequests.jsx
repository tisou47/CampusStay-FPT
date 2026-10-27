import { useState } from 'react'
import { Check, ClipboardList, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine, stop } from '@/components/ui/Table'
import { SlaBadge, StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// Statuses of requests already decided: no time left to show.
const DECIDED = ['Approved', 'Rejected', 'Cancelled', 'Set back', 'Declined', 'Expired']

// Term transition › Open requests (spec §5.1 M4: every request decided; Managers decide in bulk).
// GET /next-term-requests?termId&block&kind → { items: [{ kind (room-change, swap, room-class-change, extension), id,
//   student, studentCode, summary, status, submittedAt, dueAt, crossBlock }], total, window }
// POST /next-term-requests/decision { items: [{ kind, id }], decision: Approved | Rejected, reason }
//   → { decided, failed: [{ kind, id, message }] } — a room change approved in bulk gets the first matching free Bed.

const kindLabels = { 'room-change': 'Room change', swap: 'Swap', 'room-class-change': 'Room Class change', extension: 'Extension' }
const kindFilters = [{ value: '', label: 'Kind: All' }, ...Object.entries(kindLabels).map(([value, label]) => ({ value, label: t('Kind: {k}', { k: t(label) }) }))]

export default function OpenRequests({ termId }) {
  const base = useRoleBase()
  const scope = useScopeQuery()
  const { notify } = useToast()
  const [kind, setKind] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [deciding, setDeciding] = useState(null)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState(null)
  const filters = { termId, block: scope.block, kind: kind || undefined }
  const query = useQuery(['next-term-requests', filters], ({ signal }) => api.nextTermRequests.list(filters, { signal }))
  const items = query.data?.items ?? []
  const key = (r) => `${r.kind}:${r.id}`
  const all = items.length > 0 && items.every((r) => selected.has(key(r)))

  const decide = useMutation(
    () => api.nextTermRequests.decide({ items: items.filter((r) => selected.has(key(r))).map((r) => ({ kind: r.kind, id: r.id })), decision: deciding, reason: reason.trim() || undefined }),
    {
      invalidates: ['next-term-requests', 'renewal-overview', 'room-changes', 'swaps', 'room-class-changes', 'stay-requests'],
      onSuccess: (r) => {
        notify({ title: deciding === 'Approved' ? 'Requests approved' : 'Requests rejected', message: t('{n} decided, {failed} could not be.', { n: r.decided, failed: r.failed.length }) })
        setResult(r)
        setDeciding(null)
        setReason('')
        setSelected(new Set())
      },
      onError: () => {},
    },
  )
  const link = (r) =>
    r.kind === 'room-change' ? `${base}/room-changes?id=${r.id}` : r.kind === 'swap' ? `${base}/room-changes/swaps` : r.kind === 'room-class-change' ? `${base}/next-term/room-classes?termId=${termId}&id=${r.id}` : `${base}/next-term/extensions?termId=${termId}`

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Select wrapperClassName="w-64" aria-label={t('Kind')} value={kind} onChange={(e) => setKind(e.target.value)} options={kindFilters} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-secondary">{t('{n} selected', { n: selected.size })}</span>
          <Button variant="danger" icon={X} disabled={!selected.size} onClick={() => setDeciding('Rejected')}>
            Reject
          </Button>
          <Button variant="primary" icon={Check} disabled={!selected.size} onClick={() => setDeciding('Approved')}>
            Approve
          </Button>
        </div>
      </div>
      {result?.failed?.length > 0 && (
        <Alert type="warning" title={t('{n} requests were not decided', { n: result.failed.length })} onClose={() => setResult(null)} className="shrink-0">
          <ul className="flex flex-col gap-1">
            {result.failed.map((f) => (
              <li key={`${f.kind}:${f.id}`}>
                {f.id}: {tr(f.message)}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <Table fill>
        <THead>
          <tr>
            <Th className="w-10">
              <Checkbox aria-label={t('Select all')} checked={all} onChange={() => setSelected(all ? new Set() : new Set(items.map(key)))} />
            </Th>
            <Th className="w-44">Kind</Th>
            <Th className="w-40">Request</Th>
            <Th className="w-52">Student</Th>
            <Th>Summary</Th>
            <Th className="w-36">Status</Th>
            <Th className="w-36">Decide by</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={ClipboardList} emptyTitle="No open next-Term requests" emptyText="Every request of this window is decided." />
          {items.map((r) => (
            <Tr key={key(r)} selected={selected.has(key(r))} className="[&>td]:h-13">
              <Td onClick={stop}>
                <Checkbox
                  aria-label={t('Select {id}', { id: r.id })}
                  checked={selected.has(key(r))}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s)
                      next.has(key(r)) ? next.delete(key(r)) : next.add(key(r))
                      return next
                    })
                  }
                />
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  {t(kindLabels[r.kind] ?? r.kind)}
                  {r.crossBlock && <Tag tone="info">Cross-Block</Tag>}
                </span>
              </Td>
              <Td>
                <Button variant="text" to={link(r)}>
                  {r.id}
                </Button>
              </Td>
              <Td>
                <TwoLine primary={tr(r.student)} secondary={r.studentCode} />
              </Td>
              <Td className="text-sm text-fg-secondary">{tr(r.summary)}</Td>
              <Td>
                <StatusTag status={r.status} />
              </Td>
              <Td className="whitespace-nowrap">
                <span className="flex items-center gap-2">
                  {formatDateTime(r.dueAt)}
                  <SlaBadge dueAt={r.dueAt} done={DECIDED.includes(r.status)} warnHours={48} />
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={deciding === 'Approved' ? t('Approve {n} requests', { n: selected.size }) : t('Reject {n} requests', { n: selected.size })}
        footer={
          <>
            <Button onClick={() => setDeciding(null)}>Cancel</Button>
            <Button variant={deciding === 'Approved' ? 'primary' : 'danger'} disabled={decide.pending || (deciding === 'Rejected' && !reason.trim())} onClick={() => decide.run()}>
              {decide.pending ? t('Saving…') : deciding === 'Approved' ? t('Approve') : t('Reject')}
            </Button>
          </>
        }
      >
        {decide.error && <Alert type="error" title="Could not decide">{decide.error.details?.fields?.reason ?? decide.error.message}</Alert>}
        {deciding === 'Approved' ? (
          <p className="text-base text-fg-secondary">
            {t('Each request is decided on its own. A room change gets the first matching free Bed you may give; a Room Class change needs every consent first. Requests that cannot be approved are listed afterwards.')}
          </p>
        ) : (
          <Field label="Why (the students see it)" required>
            {(id) => <Textarea id={id} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        )}
      </Modal>
    </>
  )
}
