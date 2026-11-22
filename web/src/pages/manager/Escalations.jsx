import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Clock, ExternalLink, TriangleAlert } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery, useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card, ProgressBar } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { EmptyBlock, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Segmented } from '@/components/ui/Tabs'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime, initials } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-REQ-21 Escalations (Figma 69:1335)
// GET /escalations?termId&block → { items: [{ id, kind: 'maintenance'|'room-change', title, subtitle, room, why, tone, openFor, ownerName,
//   handled: { action, at, note } | null, events: [{ text, at }], suggestedAssigneeId, link, canOfferTemporaryBed }], assignees: [{ id, name }] }
// POST /escalations/:id/actions { action: 'reassign', assigneeId, note } | { action: 'temporary-bed', note }
// item.candidates: [{ id, name, onDuty, handles, open, owner, suggested }] — the staff of the request's own Block (only
// they can take it), the suggested one first; assignees is the older list of every Block's staff.

/** One staff member to pick: who they are, whether they are on duty and handle this kind, and how busy they are. */
function Candidate({ c, kind, maxOpen, selected, onSelect }) {
  const disabled = c.owner
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={() => onSelect(c.id)}
        className={cx(
          'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
          selected ? 'border-primary bg-primary-subtle/60' : 'border-line hover:border-line-strong hover:bg-subtle/50',
          disabled && 'cursor-not-allowed opacity-55 hover:border-line hover:bg-transparent',
        )}
      >
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', selected ? 'bg-primary text-fg-on-brand' : 'bg-subtle text-fg-secondary')}>
          {initials(c.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-base font-medium text-fg">{c.name}</span>
            {c.suggested && <Tag tone="brand">{t('Suggested')}</Tag>}
            {c.owner && <Tag tone="neutral">{t('Has it now')}</Tag>}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className={cx('inline-flex items-center gap-1', c.onDuty ? 'text-success-fg' : 'text-fg-tertiary')}>
              <span aria-hidden="true" className={cx('size-1.5 rounded-full', c.onDuty ? 'bg-success' : 'bg-fg-tertiary/60')} />
              {c.onDuty ? t('On duty') : t('Off duty')}
            </span>
            {!c.handles && <span className="text-warning-fg">{kind === 'room-change' ? t('Does not handle room changes') : t('Does not handle maintenance')}</span>}
          </span>
        </span>
        <span className="flex w-20 shrink-0 flex-col items-end gap-1">
          <span className={cx('text-xs tabular', c.open ? 'font-medium text-fg' : 'text-fg-tertiary')}>{c.open ? t('{n} open', { n: c.open }) : t('No open work')}</span>
          {c.open > 0 && <ProgressBar value={c.open} max={maxOpen} tone={c.open >= maxOpen ? 'warning' : 'accent'} className="h-1 w-full" />}
        </span>
      </button>
    </li>
  )
}

function Detail({ item, assignees }) {
  const { notify, notifyError } = useToast()
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
          ? { title: t('{id} reassigned', { id: item.id }), message: t('{name} was notified. The request is no longer overdue.', { name: [...(item.candidates ?? []), ...assignees].find((a) => a.id === body.assigneeId)?.name ?? t('The new owner') }) }
          : { type: 'info', title: 'Temporary bed offer recorded', message: t('{id} is no longer overdue and nobody is notified. Tell the student; the move happens when the request is decided in room changes.', { id: item.id }) },
      ),
    onError: (e) => notifyError(e, 'Could not save the action'),
  })
  const events = [...(item.handled ? [{ text: item.handled.action, at: item.handled.at }] : []), ...(item.events ?? [])]
  const candidates = item.candidates ?? []
  const maxOpen = Math.max(1, ...candidates.map((c) => c.open))

  const chosen = candidates.find((c) => c.id === assigneeId)

  // Header (the request), the body scrolls (its history, then whom to give it to), the note and the action stay at
  // the bottom.
  return (
    <Card padding="none" className="flex min-h-0 w-100 shrink-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-1 border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-fg-tertiary">
            {item.id}
            {item.room ? ` · ${item.room}` : ''}
          </p>
          {item.link && (
            <Button size="sm" icon={ExternalLink} iconSize={14} to={item.link} tip="Open the full request: its photos, history and status.">
              Open request
            </Button>
          )}
        </div>
        <h2 className="text-h3 font-semibold text-fg">{tr(item.title)}</h2>
        <ol className="mt-1 flex flex-col gap-1.5">
          {events.map((e) => (
            <li key={`${e.at}-${e.text}`} className="flex items-baseline gap-2 text-sm">
              <Clock size={14} aria-hidden="true" className="shrink-0 translate-y-0.5 text-error-fg" />
              <span className="min-w-0 flex-1 text-fg">{tr(e.text)}</span>
              <span className="shrink-0 text-fg-tertiary tabular">{formatDateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      </div>

      {item.handled ? (
        <div className="p-5">
          <Alert type="success" title="Handled">
            {item.handled.note || t('The request is no longer overdue and the owner was notified.')}
          </Alert>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
            {candidates.length ? (
              <>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-fg">{t('Reassign to')}</span>
                  <span className="text-xs text-fg-tertiary">{t('Staff of this block · open requests')}</span>
                </span>
                <ul role="radiogroup" aria-label={t('Reassign to')} className="flex flex-col gap-1.5">
                  {candidates.map((c) => (
                    <Candidate key={c.id} c={c} kind={item.kind} maxOpen={maxOpen} selected={assigneeId === c.id} onSelect={setAssigneeId} />
                  ))}
                </ul>
              </>
            ) : (
              <Field label="Reassign to">
                {(id) => <Select id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} options={[{ value: '', label: 'Choose…', disabled: true }, ...assignees.map((a) => ({ value: a.id, label: a.name }))]} />}
              </Field>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-subtle/40 px-5 py-4">
            <Textarea aria-label={t('Manager note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Manager note…" className="resize-none" />
            <Button
              variant="primary"
              block
              icon={Check}
              onClick={() => act.run({ action: 'reassign', assigneeId, note: note.trim() || undefined })}
              disabled={!assigneeId || act.pending}
            >
              {chosen ? t('Reassign to {name}', { name: chosen.name }) : t('Reassign')}
            </Button>
            {item.canOfferTemporaryBed && (
              <Button
                block
                tip="Write in the note which bed and until when: the student and the request's owner are told."
                onClick={() => act.run({ action: 'temporary-bed', note: note.trim() })}
                disabled={!note.trim() || act.pending}
              >
                Temporary bed arranged
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

/** The overdue requests of the Manager's scope (GET /escalations), optionally of one kind; null while not a Manager. */
export function useOverdue(kind, enabled = true) {
  const scope = useScopeQuery()
  const query = useQuery(['escalations', scope], ({ signal }) => api.escalations.list(scope, { signal }), { enabled })
  const items = (query.data?.items ?? []).filter((e) => !kind || e.kind === kind)
  return { query, items, open: items.filter((e) => !e.handled).length }
}

/**
 * Overdue requests with the Manager's actions (reassign, temporary bed), shown as a view of Maintenance
 * (kind "maintenance") and of Room changes (kind "room-change").
 */
export function OverdueRequests({ kind }) {
  const [params] = useSearchParams()
  const { query, items } = useOverdue(kind)
  const [selectedId, setSelectedId] = useState(params.get('id'))
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
            <Tr key={e.id} selected={e.id === selected?.id} onClick={() => setSelectedId(e.id)} className="[&>td]:h-15">
              <Td className="font-medium whitespace-nowrap text-fg-brand">{e.id}</Td>
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
        <Detail item={selected} assignees={query.data?.assignees ?? []} />
      ) : (
        <Card className="flex w-85 shrink-0 flex-col">
          <EmptyBlock icon={TriangleAlert} title="Select a request" />
        </Card>
      )}
    </div>
  )
}

/** "All requests | Overdue · n": the two views of a Manager's queue (?view=overdue). */
export function OverdueSwitch({ kind, allLabel = 'All requests' }) {
  const [params, setParams] = useSearchParams()
  const { open } = useOverdue(kind)
  const view = params.get('view') === 'overdue' ? 'overdue' : 'all'
  return (
    <Segmented
      className="shrink-0 self-start"
      value={view}
      onChange={(v) => {
        const next = new URLSearchParams(params)
        if (v === 'overdue') next.set('view', 'overdue')
        else next.delete('view')
        next.delete('id')
        setParams(next, { replace: true })
      }}
      options={[
        { value: 'all', label: t(allLabel) },
        { value: 'overdue', label: open ? t('Overdue · {n}', { n: open }) : t('Overdue') },
      ]}
    />
  )
}

/** The former page: every overdue request (the menu now opens them from Maintenance and Room changes). */
export default function Escalations() {
  const { block } = useSession()
  return (
    <>
      <PageHeader title={block ? t('Overdue requests · Block {code}', { code: block }) : 'Overdue requests'} />
      <OverdueRequests />
    </>
  )
}
