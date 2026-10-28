import { useState } from 'react'
import { Download, FileText, RotateCcw } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidateAll, useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDateTime } from '@/lib/format'
import { getLang, t, tr } from '@/i18n'

// SCR-CFG-27 Demo data (spec §15, demo servers only: DEMO_TOOLS=true)
// GET /admin/demo → { enabled, stages: [{ code, title, description }], scenarios: [{ id, stages, account, role, scenario,
//   where, scenarioVi, whereVi }], files: [{ kind, name, title, use }], lastReset: { stage, at, by } }
// POST /admin/demo/reset { stage, confirm: "RESET" } → { stage, at, counts } · GET /admin/demo/files/:kind (CSV)

export default function DemoData() {
  const { notify } = useToast()
  const query = useQuery(['admin', 'demo'], ({ signal }) => api.admin.demo.status(undefined, { signal }))
  const [stage, setStage] = useState('A')
  const [confirm, setConfirm] = useState('')
  const reset = useMutation(() => api.admin.demo.reset({ stage, confirm }), {
    onSuccess: (res) => {
      setConfirm('')
      invalidateAll()
      notify({
        title: t('Stage {stage} loaded', { stage: res.stage }),
        message: t('{terms} Terms, {applications} Applications, {allocations} Allocations, {invoices} Invoices.', res.counts),
      })
    },
  })
  const download = useMutation((f) => api.admin.demo.file(f.kind, f.name), {
    onError: (err) => notify({ type: 'error', title: t('Download failed'), message: err.message }),
  })
  if (!query.data) return query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : <LoadingState />
  const d = query.data
  const vi = getLang() === 'vi'
  const scenarios = d.scenarios.filter((s) => s.stages.includes(stage))
  return (
    <>
      <PageHeader
        title="Demo data"
        description="Replace the business data by a demo stage whose dates are relative to today. Accounts, Buildings, furniture and settings stay."
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        {!d.enabled && (
          <Alert type="info" title="The demo tools are off on this server">
            {t('Set DEMO_TOOLS=true in the server settings and restart the API to use them.')}
          </Alert>
        )}
        <div className="grid shrink-0 grid-cols-5 gap-4">
          <Card padding="lg" className="col-span-3 flex flex-col gap-4">
            <h2 className="text-h3 font-semibold text-fg">{t('Choose a stage')}</h2>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('Stage')}>
              {d.stages.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  role="radio"
                  aria-checked={stage === s.code}
                  onClick={() => setStage(s.code)}
                  className={cx(
                    'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                    stage === s.code ? 'border-primary bg-primary-subtle' : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className="flex items-center gap-2 text-base font-medium text-fg">
                    <span className={cx('grid size-6 shrink-0 place-items-center rounded-full text-sm font-semibold', stage === s.code ? 'bg-primary text-fg-on-brand' : 'bg-subtle text-fg-secondary')}>
                      {s.code}
                    </span>
                    {tr(s.title)}
                  </span>
                  <span className="text-sm text-fg-secondary">{tr(s.description)}</span>
                </button>
              ))}
            </div>
            {reset.error && <Alert type="error" title="Could not reset the demo data">{reset.error.message}</Alert>}
            <div className="flex items-end gap-3">
              <Field label="Type RESET to confirm" className="w-56" error={reset.error?.fields?.confirm}>
                {(id) => <Input id={id} value={confirm} disabled={!d.enabled} onChange={(e) => setConfirm(e.target.value)} />}
              </Field>
              <Button variant="danger" icon={RotateCcw} disabled={!d.enabled || confirm.trim() !== 'RESET' || reset.pending} onClick={() => reset.run()}>
                {reset.pending ? t('Loading the stage…') : t('Reset to stage {stage}', { stage })}
              </Button>
            </div>
            <p className="text-sm text-fg-tertiary">
              {d.lastReset
                ? t('Last reset: stage {stage}, {at}, by {by}.', { stage: d.lastReset.stage, at: formatDateTime(d.lastReset.at), by: d.lastReset.by })
                : t('Not reset yet on this server.')}{' '}
              {t('Every business record is replaced, for every user. The reset is written to the Audit Log.')}
            </p>
          </Card>
          <Card padding="lg" className="col-span-2 flex flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Sample files')}</h2>
            <p className="text-sm text-fg-tertiary">{t('Made from the stage loaded now; download them again after a reset.')}</p>
            <ul className="flex flex-col divide-y divide-line">
              {d.files.map((f) => (
                <li key={f.kind} className="flex items-start gap-3 py-2.5">
                  <FileText size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-tertiary" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-medium text-fg">{tr(f.title)}</span>
                    <span className="text-sm text-fg-secondary">{tr(f.use)}</span>
                  </div>
                  <Button size="sm" icon={Download} disabled={download.pending} onClick={() => download.run(f)}>
                    CSV
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card padding="none" className="flex shrink-0 flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Scenario accounts of stage {stage}', { stage })}</h2>
            <span className="text-sm text-fg-tertiary">{t('Password of every demo account: 12321321')}</span>
          </div>
          <Table>
            <THead>
              <tr>
                <Th className="w-16">ID</Th>
                <Th className="w-72">Account</Th>
                <Th className="w-24">Role</Th>
                <Th>Scenario</Th>
                <Th className="w-96">Where</Th>
              </tr>
            </THead>
            <TBody>
              {scenarios.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.id}</Td>
                  <Td className="break-words">{s.account}</Td>
                  <Td>
                    <Tag tone={s.role === 'Student' ? 'info' : s.role === 'Admin' ? 'brand' : 'neutral'} dot={false}>
                      {s.role}
                    </Tag>
                  </Td>
                  <Td>{vi ? s.scenarioVi : s.scenario}</Td>
                  <Td className="text-fg-secondary">{vi ? s.whereVi : s.where}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  )
}
