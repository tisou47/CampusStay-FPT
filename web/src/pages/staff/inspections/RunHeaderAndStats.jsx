import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Download, Printer } from 'lucide-react'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatNumber } from '@/lib/format'
import { t, tr } from '@/i18n'
import { ProgressSegmentBar } from '../checkin-reports/components/ReportUI'

/** A Manager paused the run's schedule (user decision 26/11/2026): it is read only until resumed. */
export function PausedRunNote() {
  return (
    <Alert type="warning" title={t('A Manager paused this inspection')}>
      {t('The run is on hold: nothing can be saved or submitted until a Manager resumes the schedule. What you saved is kept, and you are notified when it resumes.')}
    </Alert>
  )
}

export function RunSwitcher({ runs, value, onChange }) {
  if (runs.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('Inspection runs assigned to you')}>
      {runs.map((r) => {
        const active = r.id === value
        const done = (r.inspected ?? 0) + (r.unreachable ?? 0)
        const held = r.status === 'Paused'
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.id)}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active
                ? 'border-primary bg-brand-subtle text-fg shadow-xs'
                : 'border-line bg-surface text-fg-secondary hover:bg-subtle hover:text-fg',
              held && 'opacity-60 grayscale',
            )}
          >
            <span className="font-mono font-semibold text-fg">{r.id}</span>
            <span className="max-w-64 truncate font-medium">{tr(r.scheduleName) || t('Inspection')}</span>
            <span className="rounded bg-subtle px-1.5 py-0.5 font-medium text-fg tabular">
              {done}/{r.rooms}
            </span>
            {held ? <Tag tone="neutral">Paused</Tag> : r.overdue && <Tag tone="error">Overdue</Tag>}
          </button>
        )
      })}
    </div>
  )
}

function PrintMenu({ printing, printingBatch, onPrintForms, onPrintBatch }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const busy = printing || printingBatch !== null

  return (
    <div ref={boxRef} className="relative">
      <Button
        size="sm"
        icon={Printer}
        iconAfter={ChevronDown}
        disabled={busy}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t('Print forms')}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 flex w-68 flex-col rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onPrintForms()
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-fg transition-colors hover:bg-subtle"
          >
            <Printer size={14} strokeWidth={1.5} className="shrink-0 text-fg-secondary" aria-hidden="true" />
            <span>{t('Print Report 1 forms')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onPrintBatch('todo')
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-fg transition-colors hover:bg-subtle"
          >
            <Printer size={14} strokeWidth={1.5} className="shrink-0 text-fg-secondary" aria-hidden="true" />
            <span>{t('Print all unfinished forms')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onPrintBatch('done')
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-fg transition-colors hover:bg-subtle"
          >
            <Printer size={14} strokeWidth={1.5} className="shrink-0 text-fg-secondary" aria-hidden="true" />
            <span>{t('Print all completed forms')}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function RunHeaderAndStats({
  run,
  switcher,
  sent,
  mine,
  exporting,
  printing,
  printingBatch,
  submitPending,
  onOpenCalendar,
  onExport,
  onPrintForms,
  onPrintBatch,
  onOpenReview,
}) {
  const doneCount = (run.inspected ?? 0) + (run.unreachable ?? 0)
  const totalCount = run.rooms ?? 0
  const todoCount = Math.max(0, totalCount - doneCount)
  const assignee = run.assigneeName ?? run.inspectorName

  return (
    <>
      <PageHeader
        compact
        title="Inspections"
        tip={[run.id, formatDate(run.date), tr(run.scheduleName), tr(run.scope), run.block && t('Block {code}', { code: run.block })].filter(Boolean).join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProgressSegmentBar
              compact
              title="inspected"
              done={doneCount}
              total={totalCount}
              note={run.dueAt ? t('Due {date}', { date: formatDate(run.dueAt) }) : null}
              segments={[
                { key: 'done', label: 'Inspected', value: doneCount, className: 'bg-success' },
                { key: 'failed', label: 'Items failed', value: run.failed ?? 0, className: 'bg-error' },
                { key: 'todo', label: 'To do', value: todoCount, className: 'bg-warning' },
              ]}
            />
            <Button size="sm" icon={CalendarDays} onClick={onOpenCalendar}>
              Calendar
            </Button>
            <Button size="sm" icon={Download} onClick={onExport} disabled={exporting}>
              Export CSV
            </Button>
            <PrintMenu
              printing={printing}
              printingBatch={printingBatch}
              onPrintForms={onPrintForms}
              onPrintBatch={onPrintBatch}
            />
            {!sent && mine && (
              <Button size="sm" variant="primary" onClick={onOpenReview} disabled={submitPending || run.status === 'Paused'}>
                Submit results
              </Button>
            )}
          </div>
        }
      />

      {run.status === 'Paused' && <PausedRunNote />}

      {/* Run Switcher + Run Metadata (cleanly separated so long task lists never get clipped) */}
      <div className="flex shrink-0 flex-col gap-2.5 rounded-lg border border-line bg-surface p-3">
        {switcher}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs text-fg-secondary">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {t('Assignee')}:{' '}
              <strong className={assignee ? 'font-semibold text-fg' : 'font-medium text-fg-tertiary'}>
                {assignee || t('Unassigned')}
              </strong>
            </span>
            {run.scope && <span>{tr(run.scope)}</span>}
            {run.block && <span>{t('Block {code}', { code: run.block })}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular">
            <span>
              {t('Rooms in this run')}: <strong className="font-semibold text-fg">{formatNumber(run.rooms)}</strong>
            </span>
            <span>
              {t('Inspected')}: <strong className="font-semibold text-fg">{formatNumber(run.inspected)}</strong>
            </span>
            <span className={run.failed > 0 ? 'font-medium text-error-fg' : undefined}>
              {t('Items failed')}: <strong className="font-semibold">{formatNumber(run.failed)}</strong>
            </span>
            {run.dueAt && (
              <span className={run.overdue ? 'font-medium text-error-fg' : undefined}>
                {t('Due {date}', { date: formatDate(run.dueAt) })}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
