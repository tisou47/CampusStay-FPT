import { useState } from 'react'
import { CalendarPlus, Check, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// Term transition › Extensions (spec §6.10, D-30): an extension is approved at once when the student is enrolled and
// owes nothing overdue; the others wait for Staff of the Block. Ends of stay are listed too (always automatic).
// GET /stay-requests?termId&block&kind&status&page&pageSize → { items: [{ id, kind (Extension, End of stay), studentName,
//   studentCode, room, block, terms, committedTerms, termsUsed, reason, status, automatic, submittedAt, dueAt,
//   decisionNote, decidedBy, decidedAt }], total, window }
// POST /stay-requests/:id/decision { decision: Approved | Rejected, note }

export default function StayRequests({ termId }) {
  const scope = useScopeQuery()
  const { notify } = useToast()
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('Pending')
  const [page, setPage] = useState(1)
  const [deciding, setDeciding] = useState(null)
  const [note, setNote] = useState('')
  const filters = { termId, block: scope.block, kind: kind || undefined, status: status || undefined, page, pageSize: 20 }
  const query = useQuery(['stay-requests', filters], ({ signal }) => api.stay.requests(filters, { signal }))
  const items = query.data?.items ?? []
  const decide = useMutation(() => api.stay.decide(deciding.request.id, { decision: deciding.decision, note: note.trim() || undefined }), {
    invalidates: ['stay-requests', 'next-term-requests', 'renewal-overview'],
    onSuccess: (r) => {
      notify({ title: t('{id}: {status}', { id: r.id, status: tr(r.status) }), message: tr(r.decisionNote) })
      setDeciding(null)
      setNote('')
    },
    onError: () => {},
  })
  const filter = (set) => (e) => {
    set(e.target.value)
    setPage(1)
  }
  return (
    <>
      <div className="flex shrink-0 items-center gap-3">
        <Select
          wrapperClassName="w-52"
          aria-label={t('Kind')}
          value={kind}
          onChange={filter(setKind)}
          options={[{ value: '', label: 'Kind: All' }, { value: 'Extension', label: 'Kind: Extension' }, { value: 'End of stay', label: 'Kind: End of stay' }]}
        />
        <Select
          wrapperClassName="w-48"
          aria-label={t('Status')}
          value={status}
          onChange={filter(setStatus)}
          options={[{ value: '', label: 'Status: All' }, ...['Pending', 'Approved', 'Rejected', 'Cancelled'].map((s) => ({ value: s, label: t('Status: {s}', { s: t(s) }) }))]}
        />
      </div>
      <Table fill>
        <THead>
          <tr>
            <Th className="w-40">Request</Th>
            <Th className="w-52">Student</Th>
            <Th className="w-36">Kind</Th>
            <Th>Stay</Th>
            <Th className="w-32">Status</Th>
            <Th className="w-36">Decide by</Th>
            <Th className="w-48">
              <span className="sr-only">{t('Actions')}</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={7} emptyIcon={CalendarPlus} emptyTitle="No requests match these filters" />
          {items.map((r) => (
            <Tr key={r.id} className="[&>td]:h-14">
              <Td className="font-medium text-fg-brand">{r.id}</Td>
              <Td>
                <TwoLine primary={r.studentName} secondary={`${r.studentCode} · ${r.room ?? ''}`} />
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  {tr(r.kind)}
                  {r.kind === 'Extension' && <Tag>{t('+{n}', { n: r.terms })}</Tag>}
                </span>
              </Td>
              <Td className="text-sm text-fg-secondary">
                {t('{used} of {committed} Terms used', { used: r.termsUsed, committed: r.committedTerms })}
                {r.reason ? ` · ${r.reason}` : ''}
                {r.decisionNote ? ` · ${tr(r.decisionNote)}` : ''}
              </Td>
              <Td>
                <StatusTag status={r.status} tone={r.status === 'Approved' ? 'success' : undefined}>
                  {r.automatic && r.status === 'Approved' ? t('Approved · automatic') : undefined}
                </StatusTag>
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(r.dueAt)}</Td>
              <Td>
                {r.status === 'Pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" icon={X} onClick={() => setDeciding({ request: r, decision: 'Rejected' })}>
                      Reject
                    </Button>
                    <Button size="sm" variant="primary" icon={Check} onClick={() => setDeciding({ request: r, decision: 'Approved' })}>
                      Approve
                    </Button>
                  </div>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex shrink-0 justify-end">
        <Pagination total={query.data?.total ?? 0} page={page} pageSize={20} onChange={setPage} showSizeChanger={false} />
      </div>
      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={deciding ? t('{decision}: {id}', { decision: t(deciding.decision === 'Approved' ? 'Approve' : 'Reject'), id: deciding.request.id }) : ''}
        footer={
          <>
            <Button onClick={() => setDeciding(null)}>Cancel</Button>
            <Button variant={deciding?.decision === 'Approved' ? 'primary' : 'danger'} disabled={decide.pending || (deciding?.decision === 'Rejected' && !note.trim())} onClick={() => decide.run()}>
              {decide.pending ? t('Saving…') : deciding?.decision === 'Approved' ? t('Approve') : t('Reject')}
            </Button>
          </>
        }
      >
        {decide.error && <Alert type="error" title="Could not decide">{decide.error.details?.fields?.note ?? decide.error.message}</Alert>}
        {deciding?.decision === 'Approved' && (
          <p className="text-base text-fg-secondary">
            {t('{name} keeps the Bed for the next Term and the stay commits {n} more Terms.', { name: deciding.request.studentName, n: deciding.request.terms })}
          </p>
        )}
        <Field label={deciding?.decision === 'Approved' ? 'Note to the student (optional)' : 'Why (the student sees it)'} required={deciding?.decision === 'Rejected'}>
          {(id) => <Textarea id={id} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </Modal>
    </>
  )
}
