import { useRef, useState } from 'react'
import { Download, FileSearch, Upload } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Radio } from '@/components/ui/Choice'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'

// SCR-AUTH-17 Reconciliation — Manager › Residents (Change Spec v2 phase 6, spec §6.12, D-28). For a Term, a Manager
// uploads the enrolled list (recommended) or a list of leavers and resolves each difference with a note:
//   1 someone of the Term (resident, continuing resident, applicant) not enrolled · 2 a resident or applicant missing
//   from the enrolled list · 3 a student code that does not exist (information) · 4 an enrollment status that changed
//   (the directory is updated). "Not enrolled" releases the next-Term Bed, rejects the Application or terminates the
//   stay of a resident of a Term that has started. The next-Term fees wait until no item of groups 1–2 is open.
// GET /reconciliations?termId → { term, terms, runs: [{ id, kind, fileName, rowsRead, by, createdAt, counts: { notEnrolled,
//   notFound, unknownCodes, changed, open } }], openItems, resolved, people }
// GET /reconciliations/template?kind=enrolled|leavers · POST /reconciliations (multipart termId, kind, file) → detail
// GET /reconciliations/:id → { run, term, items: [{ id, group, studentCode, studentName, roles, fileStatus,
//   directoryStatus, line, status (Open, Resolved, Info), outcome, note, resolvedBy, resolvedAt }] }
// POST /reconciliations/:id/items/:itemId/resolve { outcome: Not enrolled | Enrolled, note } → item

const groups = [
  { key: 1, label: 'Not enrolled', hint: 'Someone of the Term who is not enrolled or is on the leavers list.' },
  { key: 2, label: 'Not on the list', hint: 'Someone of the Term missing from the enrolled list: check and record.' },
  { key: 3, label: 'Unknown codes', hint: 'Student codes of the file that do not exist (information).' },
  { key: 4, label: 'Status changed', hint: 'Enrollment statuses updated in the directory (information).' },
]

function Resolve({ run, item, onClose }) {
  const { notify } = useToast()
  const [outcome, setOutcome] = useState(item.group === 1 ? 'Not enrolled' : 'Enrolled')
  const [note, setNote] = useState('')
  const resolve = useMutation(() => api.reconciliations.resolve(run, item.id, { outcome, note: note.trim() }), {
    invalidates: ['reconciliations', 'renewal-overview', 'next-term-fees'],
    onSuccess: () => {
      notify({ title: 'Item resolved', message: outcome === 'Not enrolled' ? t('{code}: what the student holds in the Term ends; they are told.', { code: item.studentCode }) : t('{code}: nothing changes.', { code: item.studentCode }) })
      onClose()
    },
    onError: () => {},
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={t('Resolve {code}', { code: item.studentCode })}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={outcome === 'Not enrolled' ? 'danger' : 'primary'} disabled={resolve.pending || !note.trim()} onClick={() => resolve.run()}>
            {resolve.pending ? t('Saving…') : t('Resolve')}
          </Button>
        </>
      }
    >
      {resolve.error && <Alert type="error" title="Could not resolve">{resolve.error.details?.fields?.note ?? resolve.error.message}</Alert>}
      <p className="text-base text-fg-secondary">
        {item.studentName} · {(item.roles ?? []).map(tr).join(', ')}
      </p>
      <fieldset className="flex flex-col gap-2">
        <Radio name="outcome" label="Not enrolled: end what the student holds in the Term" checked={outcome === 'Not enrolled'} onChange={() => setOutcome('Not enrolled')} />
        <Radio name="outcome" label="Enrolled: keep everything" checked={outcome === 'Enrolled'} onChange={() => setOutcome('Enrolled')} />
      </fieldset>
      <Field label="Note (audited)" required>
        {(id) => <Textarea id={id} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {outcome === 'Not enrolled' && (
        <Note>A Bed kept for the next Term is released, a live Application is rejected (a paid Deposit is refunded by the rule Not enrolled) and a resident of a Term that has started gets a termination.</Note>
      )}
    </Modal>
  )
}

function RunDetail({ id }) {
  const [group, setGroup] = useState(1)
  const [resolving, setResolving] = useState(null)
  const query = useQuery(['reconciliations', 'run', id], ({ signal }) => api.reconciliations.get(id, { signal }))
  const items = (query.data?.items ?? []).filter((i) => i.group === group)
  const count = (g) => (query.data?.items ?? []).filter((i) => i.group === g).length
  return (
    <>
      <Tabs className="shrink-0" value={group} onChange={setGroup} items={groups.map((g) => ({ key: g.key, label: g.label, count: count(g.key) }))} />
      <p className="shrink-0 text-sm text-fg-secondary">{t(groups.find((g) => g.key === group).hint)}</p>
      <Table fill>
        <THead>
          <tr>
            <Th className="w-56">Student</Th>
            <Th className="w-56">Holds in the Term</Th>
            <Th className="w-36">File</Th>
            <Th className="w-36">Directory before</Th>
            <Th className="w-28">Status</Th>
            <Th>Outcome</Th>
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={6} rows={items} emptyIcon={FileSearch} emptyTitle="Nothing in this group" />
          {items.map((i) => (
            <Tr key={i.id} className="[&>td]:h-13">
              <Td>
                <TwoLine primary={i.studentName ?? '—'} secondary={i.line ? t('{code} · line {n}', { code: i.studentCode, n: i.line }) : i.studentCode} />
              </Td>
              <Td>{(i.roles ?? []).map(tr).join(', ') || '—'}</Td>
              <Td>{tr(i.fileStatus) || '—'}</Td>
              <Td>{tr(i.directoryStatus) || '—'}</Td>
              <Td>
                <StatusTag status={i.status} tone={i.status === 'Open' ? 'warning' : undefined} />
              </Td>
              <Td>
                {i.status === 'Open' ? (
                  <Button size="sm" variant="primary" onClick={() => setResolving(i)}>
                    Resolve
                  </Button>
                ) : i.outcome ? (
                  <TwoLine primary={tr(i.outcome)} secondary={[i.note, i.resolvedBy, formatDateTime(i.resolvedAt)].filter(Boolean).join(' · ')} />
                ) : (
                  '—'
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {resolving && <Resolve run={id} item={resolving} onClose={() => setResolving(null)} />}
    </>
  )
}

export default function Reconciliation() {
  const { notify } = useToast()
  const [termId, setTermId] = useState(undefined)
  const [kind, setKind] = useState('enrolled')
  const [runId, setRunId] = useState(null)
  const file = useRef(null)
  const query = useQuery(['reconciliations', termId], ({ signal }) => api.reconciliations.overview({ termId }, { signal }))
  const o = query.data
  const upload = useMutation(
    (f) => {
      const form = new FormData()
      form.append('termId', o.term.id)
      form.append('kind', kind)
      form.append('file', f)
      return api.reconciliations.upload(form)
    },
    {
      invalidates: ['reconciliations', 'renewal-overview', 'next-term-fees'],
      onSuccess: (d) => {
        notify({ title: 'List reconciled', message: t('{rows} lines read, {open} items to resolve.', { rows: d.run.rowsRead, open: d.run.counts.open }) })
        setRunId(d.run.id)
      },
      onError: () => {},
    },
  )
  const template = useMutation(() => api.reconciliations.template(kind))
  const shownRun = runId ?? o?.runs?.[0]?.id

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Compare the enrolled list of a Term with its residents and applicants, and resolve every difference."
        actions={
          o?.terms?.length > 0 && (
            <Select
              wrapperClassName="w-60"
              aria-label={t('Term')}
              value={o.term.id}
              onChange={(e) => {
                setTermId(e.target.value)
                setRunId(null)
              }}
              options={o.terms.map((x) => ({ value: x.id, label: x.name }))}
            />
          )
        }
      />
      <QueryState query={query} isEmpty={() => false}>
        {(d) => (
          <>
            <div className="flex shrink-0 flex-col gap-4 lg:flex-row">
              <Card padding="lg" className="flex flex-1 flex-col gap-3">
                <h2 className="text-h3 font-semibold text-fg">{t('Upload a list for {term}', { term: d.term.name })}</h2>
                <fieldset className="flex gap-6">
                  <Radio name="kind" label="Enrolled list (recommended)" checked={kind === 'enrolled'} onChange={() => setKind('enrolled')} />
                  <Radio name="kind" label="List of leavers" checked={kind === 'leavers'} onChange={() => setKind('leavers')} />
                </fieldset>
                {upload.error && <Alert type="error" title="Could not read the file">{upload.error.details?.fields?.file ?? upload.error.message}</Alert>}
                <input
                  ref={file}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) upload.run(f)
                    e.target.value = ''
                  }}
                />
                <div className="flex gap-2">
                  <Button variant="primary" icon={Upload} disabled={upload.pending} onClick={() => file.current?.click()}>
                    {upload.pending ? t('Reading…') : t('Choose CSV or XLSX')}
                  </Button>
                  <Button icon={Download} onClick={() => template.run()}>
                    Template
                  </Button>
                </div>
                <Note>{kind === 'enrolled' ? t('Columns: student code, full name (optional), enrollment status (blank = Enrolled).') : t('Columns: student code, full name (optional), reason (Graduated, Withdrawn).')}</Note>
              </Card>
              <div className="flex flex-1 flex-wrap gap-4">
                <KpiTile size="md" label="People of the Term" value={formatNumber(d.people)} note="Residents, continuing residents and applicants" />
                <KpiTile size="md" label="Open items" value={formatNumber(d.openItems)} note={d.resolved ? 'Reconciled' : d.runs.length ? 'Resolve them before the next-Term fees' : 'No list uploaded yet'} valueTone={d.openItems || !d.runs.length ? 'warning' : 'success'} />
              </div>
            </div>
            {d.runs.length > 0 ? (
              <>
                <div className="flex shrink-0 items-center gap-3">
                  <Select
                    wrapperClassName="w-120"
                    aria-label={t('File')}
                    value={shownRun}
                    onChange={(e) => setRunId(e.target.value)}
                    options={d.runs.map((r) => ({
                      value: r.id,
                      label: `${tr(r.kind)} · ${r.fileName} · ${formatDateTime(r.createdAt)} · ${t('{n} open', { n: r.counts.open })}`,
                    }))}
                  />
                </div>
                {shownRun && <RunDetail key={shownRun} id={shownRun} />}
              </>
            ) : (
              <Card padding="none" className="flex min-h-0 flex-1 flex-col">
                <EmptyBlock icon={FileSearch} title="No list reconciled for this Term yet">
                  {t('Upload the enrolled list before the next-Term fees, and again at the start of the Term to catch late changes.')}
                </EmptyBlock>
              </Card>
            )}
          </>
        )}
      </QueryState>
    </>
  )
}
