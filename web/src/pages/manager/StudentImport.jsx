import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CheckCheck, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Checkbox } from '@/components/ui/Choice'
import { Alert, Breadcrumb, Card, CardHeader } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// SCR-AUTH-15 Import student list (D-07, spec §6.2): template → upload CSV or XLSX → preview line by line → confirm.
// GET /student-imports/template (CSV) · POST /student-imports (multipart file) → the preview:
//   { id, fileName, status, uploadedAt, uploadedBy, fields, counts: { created, updated, unchanged, errors }, missing,
//   rows: { items: [{ line, studentCode, name, email, outcome, message, changes }], total }, result }
// GET /student-imports/:id?outcome&page&pageSize · POST /student-imports/:id/confirm { markMissingNotEnrolled }
// GET /student-imports → { items: [{ id, fileName, status, uploadedAt, uploadedBy, appliedAt, result }], total }

const FIELD_LABELS = {
  studentCode: 'Student code',
  name: 'Full name',
  email: 'Email',
  gender: 'Gender',
  dateOfBirth: 'Date of birth',
  major: 'Major',
  cohort: 'Cohort',
  semester: 'Semester',
  hometown: 'Hometown',
  region: 'Region',
  enrollment: 'Enrollment',
  priorityGroups: 'Priority groups',
  verification: 'Verification',
}

function ConfirmModal({ data, markMissing, onClose, onDone }) {
  const confirm = useMutation(() => api.studentImports.confirm(data.id, { markMissingNotEnrolled: markMissing }), {
    invalidates: ['student-import', 'student-imports', 'students'],
    onSuccess: (result) => {
      onDone(result)
      onClose()
    },
    onError: () => {},
  })
  const c = data.counts
  return (
    <Modal
      open
      onClose={onClose}
      title="Import this file?"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={confirm.pending} onClick={() => confirm.run()}>
            {t('Import {n} students', { n: formatNumber(c.created + c.updated) })}
          </Button>
        </>
      }
    >
      {confirm.error && <Alert type="error" title="Could not import">{confirm.error.message}</Alert>}
      <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-fg">
        <li>{t('{n} new student accounts', { n: formatNumber(c.created) })}</li>
        <li>{t('{n} accounts updated', { n: formatNumber(c.updated) })}</li>
        <li>{t('{n} lines unchanged', { n: formatNumber(c.unchanged) })}</li>
        {c.errors > 0 && <li>{t('{n} lines with errors are skipped', { n: formatNumber(c.errors) })}</li>}
        {markMissing && data.missing > 0 && <li>{t('{n} students missing from the file become Not enrolled', { n: formatNumber(data.missing) })}</li>}
      </ul>
      <p className="text-sm text-fg-tertiary">{t('Every line is checked again when you confirm, so the result may differ if someone changed an account meanwhile.')}</p>
    </Modal>
  )
}

function Preview({ id }) {
  const { notify } = useToast()
  const [outcome, setOutcome] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [markMissing, setMarkMissing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const request = { outcome, page, pageSize }
  const query = useQuery(['student-import', id, request], ({ signal }) => api.studentImports.get(id, request, { signal }))
  const d = query.data
  const applied = d?.status === 'Applied'
  return (
    <QueryState query={query}>
      {(data) => (
        <>
          <Card className="flex shrink-0 flex-col gap-4">
            <CardHeader
              title={data.fileName}
              description={t('Uploaded {at} by {by}', { at: formatDateTime(data.uploadedAt), by: data.uploadedBy })}
              actions={<StatusTag status={data.status} />}
            />
            <div className="flex gap-4">
              <KpiTile size="md" label="New" value={formatNumber(data.counts.created)} />
              <KpiTile size="md" label="Update" value={formatNumber(data.counts.updated)} />
              <KpiTile size="md" label="Unchanged" value={formatNumber(data.counts.unchanged)} />
              <KpiTile size="md" label="Error" value={formatNumber(data.counts.errors)} valueTone={data.counts.errors ? 'error' : undefined} />
            </div>
            {applied && data.result && (
              <Alert type="success" title="Imported">
                {t('{created} created, {updated} updated ({verified} verified), {unchanged} unchanged, {errors} skipped, {marked} marked Not enrolled.', {
                  created: formatNumber(data.result.created),
                  updated: formatNumber(data.result.updated),
                  verified: formatNumber(data.result.verified),
                  unchanged: formatNumber(data.result.unchanged),
                  errors: formatNumber(data.result.errors),
                  marked: formatNumber(data.result.markedNotEnrolled),
                })}
              </Alert>
            )}
            {!applied && (
              <div className="flex items-end justify-between gap-4">
                <Checkbox
                  label={t('Mark the {n} students missing from this file as Not enrolled', { n: formatNumber(data.missing) })}
                  description="Leave it off for a list of new students only. Demo accounts are never changed."
                  checked={markMissing}
                  disabled={!data.missing}
                  onChange={(e) => setMarkMissing(e.target.checked)}
                />
                <Button variant="primary" icon={CheckCheck} disabled={!(data.counts.created + data.counts.updated) && !markMissing} onClick={() => setConfirming(true)}>
                  Confirm import
                </Button>
              </div>
            )}
          </Card>
          <Tabs
            items={[
              { key: '', label: 'All lines' },
              { key: 'New', label: 'New', count: data.counts.created },
              { key: 'Update', label: 'Update', count: data.counts.updated },
              { key: 'Unchanged', label: 'Unchanged', count: data.counts.unchanged },
              { key: 'Error', label: 'Error', count: data.counts.errors },
            ]}
            value={outcome}
            onChange={(key) => {
              setOutcome(key)
              setPage(1)
            }}
          />
          <Table fill>
            <THead>
              <tr>
                <Th className="w-16">Line</Th>
                <Th className="w-28">Student code</Th>
                <Th>Student</Th>
                <Th className="w-28">Result</Th>
                <Th>Details</Th>
              </tr>
            </THead>
            <TBody>
              <TableStatus query={query} colSpan={5} emptyIcon={FileSpreadsheet} emptyTitle="No lines here" />
              {data.rows.items.map((r) => (
                <Tr key={r.line}>
                  <Td>{r.line}</Td>
                  <Td className="whitespace-nowrap">{r.studentCode || '—'}</Td>
                  <Td>
                    <TwoLine primary={r.name || '—'} secondary={r.email} />
                  </Td>
                  <Td>
                    <StatusTag status={r.outcome} />
                  </Td>
                  <Td className={r.outcome === 'Error' ? 'text-error-fg' : 'text-fg-secondary'}>
                    {r.message
                      ? r.message
                          .split(/(?<=\.)\s+(?=[A-Z])/)
                          .map((sentence) => tr(sentence))
                          .join(' ')
                      : r.changes?.length
                        ? t('Changes: {fields}', { fields: r.changes.map((f) => t(FIELD_LABELS[f] ?? f)).join(', ') })
                        : '—'}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex shrink-0 justify-end">
            <Pagination
              total={data.rows.total}
              page={page}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
              noun={['line', 'lines']}
            />
          </div>
          {confirming && (
            <ConfirmModal
              data={data}
              markMissing={markMissing}
              onClose={() => setConfirming(false)}
              onDone={() => notify({ title: t('Student list imported'), message: 'The result is shown above and written to the Audit Log.' })}
            />
          )}
        </>
      )}
    </QueryState>
  )
}

export default function StudentImport() {
  const base = useRoleBase()
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()
  const id = params.get('id')
  const fileInput = useRef(null)
  const history = useQuery(['student-imports'], ({ signal }) => api.studentImports.history({ pageSize: 10 }, { signal }))
  const upload = useMutation(
    (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.studentImports.upload(form)
    },
    {
      invalidates: ['student-imports'],
      onSuccess: (result) => setParams({ id: result.id }),
      onError: () => {},
    },
  )
  const template = useMutation(() => api.studentImports.template(), { onError: (err) => notify({ type: 'error', title: t('Download failed'), message: err.message }) })

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Students', to: `${base}/students` }, { label: 'Import student list' }]} />}
        title="Import student list"
        description="Upload the list from the training office. Students are matched on the student code; columns the file does not have are kept."
        actions={
          <>
            <Button icon={Download} disabled={template.pending} onClick={() => template.run()}>
              Download template
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload.run(file)
                e.target.value = ''
              }}
            />
            <Button variant="primary" icon={Upload} disabled={upload.pending} onClick={() => fileInput.current?.click()}>
              {upload.pending ? t('Reading the file…') : t('Upload CSV or XLSX')}
            </Button>
          </>
        }
      />
      {upload.error && (
        <Alert type="error" title="Could not read the file">
          {upload.error.message}
        </Alert>
      )}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {id ? (
            <Preview key={id} id={id} />
          ) : (
            <Card className="flex flex-col gap-3">
              <CardHeader title="How it works" />
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-base text-fg">
                <li>{t('Download the template and fill one line per student (CSV UTF-8 or XLSX; Vietnamese column names work too).')}</li>
                <li>{t('Upload the file: nothing changes yet. Each line shows New, Update, Unchanged or Error with the reason.')}</li>
                <li>{t('Confirm: new students get an account they open with Google; students who signed up and match are verified.')}</li>
              </ol>
              <p className="text-sm text-fg-tertiary">
                {t('Required columns: student code, full name, email, gender, major, cohort. Optional: date of birth, semester, hometown, region, enrollment status, priority groups.')}
              </p>
            </Card>
          )}
        </div>
        <Card className="flex min-h-0 w-80 shrink-0 flex-col gap-2.5 overflow-y-auto">
          <CardHeader title="Recent imports" />
          <QueryState query={history} compact isEmpty={(h) => !h.items?.length} empty={<p className="text-base text-fg-tertiary">{t('No file imported yet.')}</p>}>
            {(h) => (
              <ul className="flex flex-col divide-y divide-line">
                {h.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="flex w-full flex-col gap-0.5 py-2 text-left hover:bg-subtle" onClick={() => setParams({ id: item.id })}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-base font-medium text-fg">{item.fileName}</span>
                        <StatusTag status={item.status} />
                      </span>
                      <span className="text-sm text-fg-tertiary">
                        {formatDateTime(item.uploadedAt)} · {item.uploadedBy}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Card>
      </div>
    </>
  )
}
