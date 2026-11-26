import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useScopeQuery } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { EmptyBlock, ErrorState, LoadingState, QueryState } from '@/components/ui/States'
import { formatDate } from '@/lib/format'
import { t, tr } from '@/i18n'
import { exportRun, printBatchForms, printBlankForms } from './inspections/inspectionPrint'
import { RoomListPane } from './inspections/RoomListPane'
import { RunHeaderAndStats, RunSwitcher } from './inspections/RunHeaderAndStats'
import { SubmitReviewModal } from './inspections/SubmitReviewModal'

// SCR-MNT-12 Inspection Checklist (Figma 98:4293).
// Overview page: runs assigned by managers, KPI queue tabs, and full-width room table linking to InspectionRoomPage.

function Run({ run, switcher, onSubmitted }) {
  const { notify, notifyError } = useToast()
  const [page, setPage] = useState(1)
  const [roomFilter, setRoomFilter] = useState('all')
  const [calendar, setCalendar] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printingBatch, setPrintingBatch] = useState(null)

  useEffect(() => {
    setPage(1)
    setRoomFilter('all')
  }, [run.id])

  const rooms = useQuery(['inspections', 'rooms', run.id, page], ({ signal }) =>
    api.inspections.rooms(run.id, { page, pageSize: 20 }, { signal }),
  )
  const upcoming = useQuery(['inspections', 'upcoming'], ({ signal }) => api.inspections.upcoming(undefined, { signal }), {
    enabled: calendar,
  })

  const allItems = rooms.data?.items ?? []
  const items = allItems.filter((r) => {
    if (roomFilter === 'todo') return r.status === 'To do' || r.status === 'In progress'
    if (roomFilter === 'failed') return (r.results ?? []).some((x) => x.result === 'Fail' || x.condition === 'Damaged' || x.condition === 'Missing')
    if (roomFilter === 'done') return r.status === 'Done' || r.status === 'Not reachable'
    return true
  })

  const sent = run.status === 'Submitted'
  const mine = Boolean(run.mine)

  const submit = useMutation(() => api.inspections.submit(run.id, { confirmed: true }), {
    invalidates: ['inspections'],
    onSuccess: () => {
      onSubmitted?.(run.id)
      setReviewing(false)
      notify({ title: 'Results submitted', message: 'Sent to the managers. Unvisited rooms move to the next run.' })
    },
    onError: (e) => notifyError(e, 'Could not submit the results'),
  })

  const doPrintForms = async () => {
    setPrinting(true)
    try {
      if (!(await printBlankForms(run))) notify({ type: 'info', title: 'Allow pop-ups to print the report' })
    } catch (e) {
      notifyError(e, 'Could not print the forms')
    } finally {
      setPrinting(false)
    }
  }

  const doPrintBatch = async (mode) => {
    setPrintingBatch(mode)
    try {
      const res = await printBatchForms(run, mode)
      if (res.empty) {
        notify({
          type: 'info',
          title: mode === 'todo' ? t('No unfinished inspection forms to export') : t('No completed inspection forms to export'),
        })
      } else if (!res.opened) {
        notify({ type: 'info', title: 'Allow pop-ups to print the report' })
      }
    } catch (e) {
      notifyError(e, 'Could not print the forms')
    } finally {
      setPrintingBatch(null)
    }
  }

  const doExport = async () => {
    setExporting(true)
    try {
      await exportRun(run)
    } catch (e) {
      notifyError(e, 'Could not export the run')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <RunHeaderAndStats
        run={run}
        switcher={switcher}
        sent={sent}
        mine={mine}
        exporting={exporting}
        printing={printing}
        printingBatch={printingBatch}
        submitPending={submit.pending}
        onOpenCalendar={() => setCalendar(true)}
        onExport={doExport}
        onPrintForms={doPrintForms}
        onPrintBatch={doPrintBatch}
        onOpenReview={() => setReviewing(true)}
      />

      {/* A paused run stays readable but greyed: its rooms open read only. */}
      <div className={run.status === 'Paused' ? 'flex min-h-0 flex-1 flex-col opacity-60 grayscale' : 'contents'}>
      <RoomListPane
        run={run}
        roomsQuery={rooms}
        allItems={allItems}
        items={items}
        roomFilter={roomFilter}
        onFilterChange={setRoomFilter}
        page={page}
        onPageChange={setPage}
      />
      </div>

      {reviewing && (
        <SubmitReviewModal run={run} pending={submit.pending} onClose={() => setReviewing(false)} onSubmit={() => submit.run()} />
      )}

      <Modal
        open={calendar}
        onClose={() => setCalendar(false)}
        title="Upcoming inspections"
        description="Scheduled by the managers."
        footer={<Button onClick={() => setCalendar(false)}>Close</Button>}
      >
        <QueryState query={upcoming} compact empty={<p className="text-base text-fg-secondary">{t('No inspections scheduled.')}</p>}>
          {(d) => (
            <ul className="flex flex-col gap-2">
              {d.items.map((u) => (
                <li key={u.id} className="flex justify-between gap-4 text-base">
                  <span className="text-fg">{[tr(u.scheduleName), tr(u.scope)].filter(Boolean).join(' · ')}</span>
                  <span className="text-fg-secondary tabular">{formatDate(u.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Modal>
    </>
  )
}

export default function InspectionChecklist() {
  const scope = useScopeQuery()
  const list = useQuery(['inspections', 'runs', scope], ({ signal }) => api.inspections.runs(scope, { signal }))
  const runs = list.data?.items ?? []
  const [runId, setRunId] = useState(null)
  const run = runs.find((r) => r.id === runId) ?? runs[0]
  if (run) {
    return <Run run={run} switcher={<RunSwitcher runs={runs} value={run.id} onChange={setRunId} />} onSubmitted={setRunId} />
  }
  return (
    <>
      <PageHeader title="Inspections" />
      {list.data === undefined && list.loading ? (
        <LoadingState />
      ) : list.data === undefined ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <Card className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock icon={CircleCheck} title="No inspection run today">
            Runs are scheduled by the managers. The next one appears here on its date.
          </EmptyBlock>
        </Card>
      )}
    </>
  )
}
