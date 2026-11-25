import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { Check, Clock, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { EmptyBlock, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-REQ-21 Escalations (Figma 69:1335): since 24/11/2026 the "Overdue" tab of Manager › Maintenance (user decision:
// one page for the repair work); /manager/escalations opens that tab.
// GET /escalations?termId&block → { items: [{ id, kind: 'maintenance'|'room-change', title, subtitle, room, why, tone, openFor, ownerName,
//   handled: { action, at, note } | null, events: [{ text, at }], suggestedAssigneeId, link, canOfferTemporaryBed,
//   assignees: [{ id, name }] (the staff of the request's own Block) }] }
// POST /escalations/:id/actions { action: 'reassign', assigneeId, note } | { action: 'temporary-bed', note }

function Detail({ item }) {
  const { notify, notifyError } = useToast()
  const assignees = item.assignees ?? []
  const [assigneeId, setAssigneeId] = useState(item.suggestedAssigneeId ?? '')
  const [note, setNote] = useState('')
  useEffect(() => {
    setAssigneeId(item.suggestedAssigneeId ?? '')
    setNote('')
  }, [item])
  const act = useMutation((body) => api.escalations.act(item.id, body), {
    invalidates: ['escalations', 'maintenance', 'dashboard'],
    onSuccess: (_, body) =>
      notify(
        body.action === 'reassign'
          ? { title: t('{id} reassigned', { id: item.id }), message: t('{name} was notified. The request is no longer overdue.', { name: assignees.find((a) => a.id === body.assigneeId)?.name ?? t('The new owner') }) }
          : { type: 'info', title: 'Temporary bed offer recorded', message: t('{id} is no longer overdue and nobody is notified. Tell the student; the move happens when the request is decided in room changes.', { id: item.id }) },
      ),
    onError: (e) => notifyError(e, 'Could not save the action'),
  })
  const events = [...(item.handled ? [{ text: item.handled.action, at: item.handled.at }] : []), ...(item.events ?? [])]

  return (
    <Card className="flex min-h-0 w-85 shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-fg-tertiary">
          {item.link ? (
            <Link to={item.link} className="text-fg-brand hover:underline">
              {item.id}
            </Link>
          ) : (
            item.id
          )}
          {item.room ? ` · ${item.room}` : ''}
        </p>
        <h2 className="text-h3 font-semibold text-fg">{tr(item.title)}</h2>
      </div>
      <ol className="flex flex-col gap-3">
        {events.map((e) => (
          <li key={`${e.at}-${e.text}`} className="flex items-start gap-2.5">
            <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
            <div className="flex min-w-0 flex-col">
              <p className="text-base text-fg">{tr(e.text)}</p>
              <p className="text-sm text-fg-tertiary">{formatDateTime(e.at)}</p>
            </div>
          </li>
        ))}
      </ol>
      {item.handled ? (
        <Alert type="success" title="Handled">
          {item.handled.note || t('The request is no longer overdue and the owner was notified.')}
        </Alert>
      ) : (
        <>
          <Field label="Reassign to" helper={item.assignees && !assignees.length ? t('Nobody works in this block yet.') : undefined}>
            {(id) => <Select id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} options={[{ value: '', label: 'Choose…', disabled: true }, ...assignees.map((a) => ({ value: a.id, label: a.name }))]} />}
          </Field>
          <Textarea aria-label={t('Manager note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Manager note…" />
          <div className="flex flex-wrap justify-end gap-2">
            {item.canOfferTemporaryBed && (
              <Button
                tip="Write in the note which bed and until when: the student and the request's owner are told."
                onClick={() => act.run({ action: 'temporary-bed', note: note.trim() })}
                disabled={!note.trim() || act.pending}
              >
                Temporary bed arranged
              </Button>
            )}
            <Button variant="primary" icon={Check} onClick={() => act.run({ action: 'reassign', assigneeId, note: note.trim() || undefined })} disabled={!assigneeId || act.pending}>
              Reassign
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

/** The overdue requests of the scope with the selected one's history and actions; `query` is the page's GET /escalations. */
export function OverdueRequests({ query, selectedId, onSelect }) {
  const items = query.data?.items ?? []
  const selected = items.find((e) => e.id === selectedId) ?? items[0]
  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-4">
      <Table fill className="min-w-0">
        <THead>
          <tr>
            <Th className="w-36">Request</Th>
            <Th>Title</Th>
            <Th className="w-44">Why</Th>
            <Th className="w-22">Open for</Th>
            <Th className="w-36">Owner</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={5} rows={items} emptyIcon={TriangleAlert} emptyTitle="No overdue requests" emptyText="Requests that pass their time limit appear here." />
          {items.map((e) => (
            <Tr key={e.id} selected={e.id === selected?.id} onClick={() => onSelect(e.id)} className="[&>td]:h-15">
              <Td className="whitespace-nowrap">
                <TwoLine primary={<span className="font-medium text-fg-brand">{e.id}</span>} secondary={e.kind === 'room-change' ? t('Room change') : t('Maintenance')} />
              </Td>
              <Td>
                <TwoLine primary={tr(e.title)} secondary={e.subtitle?.split(' · ').map((part) => tr(part)).join(' · ')} />
              </Td>
              <Td>{e.handled ? <Tag tone="success">Handled</Tag> : <Tag tone={e.tone ?? 'warning'}>{tr(e.why)}</Tag>}</Td>
              <Td className="whitespace-nowrap">{tr(e.openFor)}</Td>
              <Td className="whitespace-nowrap">{e.ownerName ?? '—'}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {selected ? (
        <Detail item={selected} />
      ) : (
        <Card className="flex w-85 shrink-0 flex-col">
          <EmptyBlock icon={TriangleAlert} title="Select a request" />
        </Card>
      )}
    </div>
  )
}

/** The former page: links from notifications and bookmarks open the Maintenance page's Overdue tab. */
export default function Escalations() {
  const [params] = useSearchParams()
  const id = params.get('id')
  return <Navigate replace to={`/manager/maintenance?tab=overdue${id ? `&id=${encodeURIComponent(id)}` : ''}`} />
}
