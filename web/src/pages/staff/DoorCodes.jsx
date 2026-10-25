import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Eye, KeyRound, Shuffle, Upload, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Radio } from '@/components/ui/Choice'
import { Alert, Note } from '@/components/ui/Display'
import { Field, Input, SearchInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-INV-12 Door codes (Change Spec v2 phase 3, ADR-23, spec §6.8). Shared by Staff (their Blocks) and Managers.
// GET /door-codes?block&status&q&page&pageSize → { items: [{ room, block, floor, status (Change needed, Not set, Active),
//   proposed, proposedAt, activeSince, task: { reason, since } | null, residents }], total,
//   counts: { toChange, notSet, proposed, active }, statuses }
// POST /door-codes/:room { code? } → { room, code } · POST /door-codes/:room/confirm · POST /door-codes/:room/cancel
// POST /door-codes/:room/reveal → { room, active, proposed }
// POST /door-codes/import (multipart file: CSV room,code) → { proposed }

function CodeText({ code }) {
  return <span className="font-mono text-h1 font-semibold tracking-[0.3em] text-fg tabular">{code}</span>
}

function SetCodeModal({ room, onClose }) {
  const { notify } = useToast()
  const [mode, setMode] = useState('random')
  const [code, setCode] = useState('')
  const [proposed, setProposed] = useState(null)
  const propose = useMutation(() => api.doorCodes.propose(room.room, mode === 'typed' ? { code: code.trim() } : {}), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: (res) => setProposed(res.code),
    onError: () => {},
  })
  const confirm = useMutation(() => api.doorCodes.confirm(room.room), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: () => {
      notify({ title: t('Door code of Room {code} changed', { code: room.room }), message: 'Its residents are told that the code changed (never the code itself).' })
      onClose()
    },
    onError: () => {},
  })
  const error = propose.error ?? confirm.error
  return (
    <Modal
      open
      onClose={onClose}
      title={t('New door code · Room {code}', { code: room.room })}
      description={proposed ? 'Set this code on the lock, try it, then confirm it here.' : 'The current code stays active until you confirm the new one.'}
      footer={
        proposed ? (
          <>
            <Button onClick={onClose}>Confirm later</Button>
            <Button variant="primary" icon={Check} onClick={() => confirm.run()} disabled={confirm.pending}>
              The lock uses this code
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={KeyRound} onClick={() => propose.run()} disabled={propose.pending || (mode === 'typed' && !/^\d{6}$/.test(code.trim()))}>
              {mode === 'random' ? t('Draw a code') : t('Use this code')}
            </Button>
          </>
        )
      }
    >
      {error && <Alert type="error" title="Could not change the door code">{error.summary}</Alert>}
      {proposed ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-subtle p-5">
          <CodeText code={proposed} />
          <span className="text-sm text-fg-tertiary">{t('Shown to you only; the Audit Log records that a code was set.')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('New door code')}>
          <Radio name="mode" label="Draw a random code" description="Never the same as the current code." checked={mode === 'random'} onChange={() => setMode('random')} />
          <Radio name="mode" label="Type the code" description="For a code already set on the lock." checked={mode === 'typed'} onChange={() => setMode('typed')} />
          {mode === 'typed' && (
            <Field label="Door code" helper="6 digits" error={propose.error?.fields?.code}>
              {(id) => <Input id={id} value={code} inputMode="numeric" maxLength={6} autoComplete="off" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}
            </Field>
          )}
        </div>
      )}
    </Modal>
  )
}

function RevealModal({ codes: d, onClose }) {
  return (
    <Modal open onClose={onClose} title={t('Door code · Room {code}', { code: d.room })} description="This view is written to the Audit Log." footer={<Button onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line p-4">
          <span className="text-base text-fg-secondary">{t('Current code')}</span>
          {d.active ? <CodeText code={d.active} /> : <span className="text-fg-tertiary">{t('Not set')}</span>}
        </div>
        {d.proposed && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-info bg-info-bg p-4">
            <span className="text-base text-fg-secondary">{t('New code waiting for confirmation')}</span>
            <CodeText code={d.proposed} />
          </div>
        )}
      </div>
    </Modal>
  )
}

function ImportModal({ onClose }) {
  const { notify } = useToast()
  const input = useRef(null)
  const run = useMutation(
    (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.doorCodes.import(form)
    },
    {
      invalidates: ['door-codes'],
      onSuccess: (res) => {
        notify({ title: t(res?.proposed === 1 ? '{n} new door code to confirm' : '{n} new door codes to confirm', { n: res?.proposed ?? 0 }), message: 'Set each code on its lock, then confirm it.' })
        onClose()
      },
      onError: () => {},
    },
  )
  const problems = Object.values(run.error?.fields ?? {})
  return (
    <Modal
      open
      onClose={onClose}
      title="Import door codes"
      description="A CSV file with the columns Room and Code (6 digits), one Room per line. Every line is checked first; nothing is saved while a line has a problem."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) run.run(file)
              e.target.value = ''
            }}
          />
          <Button variant="primary" icon={Upload} onClick={() => input.current?.click()} disabled={run.pending}>
            {run.pending ? t('Reading the file…') : t('Choose a CSV file')}
          </Button>
        </>
      }
    >
      <pre className="rounded-lg border border-line bg-subtle p-3 text-sm text-fg-secondary">{'Room,Code\nA-101,482915\nA-102,730164'}</pre>
      {run.error && (
        <Alert type="error" title="The file was not imported">
          {problems.length ? (
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            run.error.message
          )}
        </Alert>
      )}
      <Note>Imported codes wait for confirmation, like codes typed one by one.</Note>
    </Modal>
  )
}

export default function DoorCodes() {
  const { block } = useSession()
  const { notify, notifyError } = useToast()
  const [params] = useSearchParams()
  const [status, setStatus] = useState(params.get('room') ? '' : 'Change needed')
  const [q, setQ] = useState(params.get('room') ?? '')
  const [search, setSearch] = useState(params.get('room') ?? '')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [modal, setModal] = useState(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])
  const request = { block: block ?? undefined, status: status || undefined, q: search || undefined, page, pageSize }
  const query = useQuery(['door-codes', request], ({ signal }) => api.doorCodes.list(request, { signal }))
  const d = query.data
  const counts = d?.counts
  const cancel = useMutation((room) => api.doorCodes.cancel(room), {
    invalidates: ['door-codes'],
    onSuccess: (_, room) => notify({ title: t('New code of Room {code} dropped', { code: room }), message: 'The current code stays active.' }),
    onError: (e) => notifyError(e, 'Could not drop the new code'),
  })
  const reveal = useMutation((room) => api.doorCodes.reveal(room), {
    onSuccess: (codes) => setModal({ type: 'reveal', codes }),
    onError: (e) => notifyError(e, 'Could not show the code'),
  })
  const confirm = useMutation((room) => api.doorCodes.confirm(room), {
    invalidates: ['door-codes', 'inventory'],
    onSuccess: (_, room) => notify({ title: t('Door code of Room {code} changed', { code: room }), message: 'Its residents are told that the code changed (never the code itself).' }),
    onError: (e) => notifyError(e, 'Could not confirm the code'),
  })

  return (
    <>
      <PageHeader
        title="Door codes"
        description="One 6-digit code per Room. Set the new code on the lock, then confirm it here; residents are told without the code."
        actions={
          <Button icon={Upload} onClick={() => setModal({ type: 'import' })}>
            Import codes
          </Button>
        }
      />
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <Tabs
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          items={[
            { key: 'Change needed', label: 'Change needed', count: counts?.toChange },
            { key: 'Not set', label: 'Not set', count: counts?.notSet },
            { key: 'Waiting for confirmation', label: 'Waiting for confirmation', count: counts?.proposed },
            { key: 'Active', label: 'Active', count: counts?.active },
            { key: '', label: 'All Rooms' },
          ]}
        />
        <SearchInput wrapperClassName="w-60" aria-label={t('Search')} placeholder="Room code" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Table fill>
          <THead>
            <tr>
              <Th className="w-32">Room</Th>
              <Th className="w-56">Status</Th>
              <Th className="w-24" align="right">
                Living here
              </Th>
              <Th>Why · since</Th>
              <Th className="w-80">
                <span className="sr-only">{t('Actions')}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            <TableStatus query={query} colSpan={5} rows={d?.items} emptyIcon={KeyRound} emptyTitle="No Rooms here" emptyText={status === 'Change needed' ? 'No door code needs to change.' : undefined} />
            {(d?.items ?? []).map((r) => (
              <Tr key={r.room} className="[&>td]:h-14">
                <Td>
                  <TwoLine primary={r.room} secondary={t('Block {code} · Floor {n}', { code: r.block, n: r.floor })} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusTag status={r.status} />
                    {r.proposed && <Tag tone="info" dot={false}>New code waiting</Tag>}
                  </div>
                </Td>
                <Td align="right" className="tabular">
                  {r.residents}
                </Td>
                <Td className="text-sm text-fg-secondary">
                  {r.task
                    ? t('{reason} · {date}', { reason: tr(r.task.reason), date: formatDateTime(r.task.since) })
                    : r.activeSince
                      ? t('Active since {date}', { date: formatDateTime(r.activeSince) })
                      : '—'}
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    {(r.status === 'Active' || r.proposed) && (
                      <Button variant="text" icon={Eye} onClick={() => reveal.run(r.room)} disabled={reveal.pending}>
                        Show code
                      </Button>
                    )}
                    {r.proposed ? (
                      <>
                        <Button variant="text" icon={X} onClick={() => cancel.run(r.room)} disabled={cancel.pending}>
                          Drop
                        </Button>
                        <Button variant="primary" size="sm" icon={Check} onClick={() => confirm.run(r.room)} disabled={confirm.pending}>
                          Confirm
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" icon={Shuffle} onClick={() => setModal({ type: 'set', room: r })}>
                        Set new code
                      </Button>
                    )}
                  </div>
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
            onChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            noun={['room', 'rooms']}
          />
        </div>
      </div>
      {modal?.type === 'set' && <SetCodeModal room={modal.room} onClose={() => setModal(null)} />}
      {modal?.type === 'reveal' && <RevealModal codes={modal.codes} onClose={() => setModal(null)} />}
      {modal?.type === 'import' && <ImportModal onClose={() => setModal(null)} />}
    </>
  )
}
