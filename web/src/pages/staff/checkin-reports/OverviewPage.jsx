import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowUpDown, ClipboardCheck, ClipboardList, ListChecks, Play } from 'lucide-react'
import { api } from '@/api/endpoints'
import { invalidate } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Tabs'
import { EmptyBlock } from '@/components/ui/States'
import { t } from '@/i18n'
import { QueueTable } from './components/QueueTable'
import { BulkActionBar, KpiTabs, ProgressSegmentBar, UndoToast } from './components/ReportUI'
import { TABS, severityOf, tabOf, useCounts, useQueue, useReportsBase, useShortcuts } from './checkinReports'

// Staff › Check-in › Inventories (and Manager › Check-in inventories): the queue of check-in inventories.
// GET /handovers?block&status&comparison → { items: [{ id, studentName, studentCode, room, bed, block, status,
//   comparison, openedAt, dueAt, submittedAt, visitAt, lateReport }], total, counts }
// URL: ?tab=review|visit|live|late|done&severity=minor|major&sort=severity|waiting.
// ?mode=bulk: review the minor differences in bulk (…/bulk redirects here). The former ?id=HO-…&status=… links
// (Check-in desk) open the student's reports.

// One short line per empty tab: what the tab holds is already in its tooltip.
const EMPTY = {
  review: 'Nothing to review',
  visit: 'No Room visit set',
  live: 'No inventory being filled in',
  late: 'No late report',
  done: 'No final inventory yet',
}

/** The queue: progress, KPI tabs, filters and the table. */
function QueueView({ base }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const tab = tabOf(params.get('tab')).key
  const severity = params.get('severity') ?? ''
  const sort = params.get('sort') ?? 'severity'
  const set = (patch) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
      return next
    })

  const { query, rows } = useQueue(tab, { comparison: severity === 'minor' ? 'Minor' : severity === 'major' ? 'Major' : undefined })
  const { counts } = useCounts()
  const review = useQueue('review')
  const sorted = useMemo(() => {
    if (sort !== 'waiting') return rows
    const since = (r) => new Date(r.submittedAt ?? r.openedAt ?? 0).getTime()
    return [...rows].sort((a, b) => since(a) - since(b))
  }, [rows, sort])

  const total = counts.review + counts.visit + counts.live + counts.done
  const firstToReview = review.rows[0]?.id

  return (
    <>
      <PageHeader
        compact
        title="Check-in inventories"
        tip="Students file the inventory of their Bed and the Room when they receive it. Matching inventories are final at once; the others wait for you here."
        actions={
          <>
            <ProgressSegmentBar
              compact
              title="finalized"
              done={counts.done}
              total={total}
              note={t('Inventories of the Term in your Blocks')}
              segments={[
                { key: 'done', label: 'Final', value: counts.done, className: 'bg-success' },
                { key: 'review', label: 'To review', value: counts.review, className: 'bg-warning' },
                { key: 'visit', label: 'Room visits', value: counts.visit, className: 'bg-info' },
                { key: 'live', label: 'In progress', value: counts.live, className: 'bg-gray-300' },
                // TODO(api): Beds whose new resident has not started the inventory are not counted by GET /handovers.
              ]}
            />
            <Button variant="primary" icon={Play} disabled={!firstToReview} onClick={() => navigate(`${base}/${firstToReview}?from=review`)}>
              {t('Start reviewing ({n})', { n: counts.review })}
            </Button>
          </>
        }
      />

      <KpiTabs label={t('Inventory queues')} value={tab} onChange={(key) => set({ tab: key === 'review' ? null : key, severity: null })} items={TABS.map((x) => ({ ...x, count: counts[x.key] }))} />

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Segmented
          value={severity}
          onChange={(v) => set({ severity: v })}
          options={[
            { value: '', label: 'All' },
            { value: 'major', label: 'Major difference' },
            { value: 'minor', label: 'Minor difference' },
          ]}
        />
        <label className="ml-1 inline-flex items-center gap-1.5 text-sm text-fg-secondary">
          <ArrowUpDown size={14} aria-hidden="true" />
          <span className="sr-only">{t('Sort')}</span>
          <Select
            size="sm"
            wrapperClassName="w-44"
            value={sort}
            onChange={(e) => set({ sort: e.target.value === 'severity' ? null : e.target.value })}
            options={[
              { value: 'severity', label: 'Major first' },
              { value: 'waiting', label: 'Longest waiting first' },
            ]}
          />
        </label>
        {tab === 'review' && (
          <div className="ml-auto">
            <Button size="sm" variant="text" icon={ListChecks} to={`${base}?mode=bulk`} tip={t('Accept the minor differences in one go. Major differences are not selectable: open them one by one.')}>
              {t('Bulk review')}
            </Button>
          </div>
        )}
      </div>

      <QueueTable
        query={query}
        rows={sorted}
        base={base}
        from={tab}
        waitingLabel={tab === 'visit' ? 'Room visit' : 'Waiting'}
        summaries={tab === 'review' || tab === 'visit'}
        empty={<EmptyBlock icon={tab === 'done' ? ClipboardCheck : ClipboardList} title={EMPTY[tab]} className="py-8" />}
      />
    </>
  )
}

/**
 * Review the minor differences in bulk. Only minor ones can be selected: a major difference is read one by one (the
 * backend refuses to confirm it from the desk, 409 MAJOR_NEEDS_VISIT). "Accept the student's" confirms each selected
 * inventory (POST /handovers/:id/confirm) once the 5-second Undo is over; nothing is sent before, so Undo really
 * undoes, and leaving the page during the countdown sends it. Keys: A accept, Esc clear.
 * TODO(api): no endpoint finalizes an inventory with the Room's record from the desk; "Keep the record" stays off.
 */
function BulkView({ base }) {
  const { notify, notifyError } = useToast()
  const { query, rows } = useQueue('review')
  const [selected, setSelected] = useState(() => new Set())
  const [pending, setPending] = useState(null) // { ids, message } while the Undo countdown runs
  const [hidden, setHidden] = useState(() => new Set()) // rows sent, until the list reloads

  const visible = useMemo(() => rows.filter((r) => !hidden.has(r.id) && !pending?.ids.includes(r.id)), [rows, hidden, pending])
  const minor = useMemo(() => visible.filter((r) => severityOf(r.comparison) !== 'major'), [visible])
  const chosen = minor.filter((r) => selected.has(r.id))

  const selection = {
    selectable: minor.length > 0,
    allSelected: minor.length > 0 && chosen.length === minor.length,
    someSelected: chosen.length > 0,
    isSelected: (id) => selected.has(id),
    toggle: (id) =>
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    toggleAll: (on) => setSelected(on ? new Set(minor.map((r) => r.id)) : new Set()),
  }

  const accept = () => {
    if (!chosen.length || pending) return
    const ids = chosen.map((r) => r.id)
    setSelected(new Set())
    setPending({ ids, message: t(ids.length === 1 ? 'Accepting {n} inventory' : 'Accepting {n} inventories', { n: ids.length }) })
  }

  const send = async () => {
    const ids = pending.ids
    setHidden((h) => new Set([...h, ...ids]))
    setPending(null)
    const failed = []
    for (const id of ids) {
      try {
        await api.handover.confirm(id, {})
      } catch (e) {
        failed.push({ id, e })
      }
    }
    if (failed.length) {
      setHidden((h) => {
        const next = new Set(h)
        failed.forEach((f) => next.delete(f.id))
        return next
      })
      notifyError(failed[0].e, t('Could not accept {n} of {total}', { n: failed.length, total: ids.length }))
    }
    if (failed.length < ids.length) {
      notify({ title: t('Accepted {n} inventories', { n: ids.length - failed.length }), message: t('They are final: Utility counts from the students’ readings.') })
    }
    invalidate('handovers', 'check-in')
  }

  // Leaving the page during the countdown sends what was accepted (only Undo cancels it).
  const pendingRef = useRef(null)
  pendingRef.current = pending
  useEffect(
    () => () => {
      const left = pendingRef.current
      if (!left) return
      Promise.allSettled(left.ids.map((id) => api.handover.confirm(id, {}))).then(() => invalidate('handovers', 'check-in'))
    },
    [],
  )

  useShortcuts({ a: accept, Escape: () => setSelected(new Set()) }, !pending)

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to={base} className="inline-flex w-fit items-center gap-1 text-sm text-fg-secondary hover:text-fg-brand">
            <ArrowLeft size={14} aria-hidden="true" />
            {t('Check-in inventories')}
          </Link>
        }
        title={t('To review · {n} inventories', { n: visible.length })}
        description="Accept the minor differences in one go. Major differences are not selectable: open them one by one."
        actions={
          <Button icon={ListChecks} disabled={!minor.length} onClick={() => selection.toggleAll(true)}>
            {t('Select every minor difference ({n})', { n: minor.length })}
          </Button>
        }
      />
      <QueueTable
        query={query}
        rows={visible}
        base={base}
        from="review"
        selection={selection}
        empty={
          <EmptyBlock icon={ListChecks} title="Nothing to review">
            {t('Inventories that differ from the Room’s record wait here.')}
          </EmptyBlock>
        }
      />
      <div className="h-16 shrink-0" aria-hidden="true" />
      {!pending && (
        <BulkActionBar
          count={chosen.length}
          onClear={() => setSelected(new Set())}
          actions={[
            { key: 'base', label: 'Keep the record', disabled: true, tip: t('Keeping the record is done in the Room: open the inventory and set a visit.') },
            { key: 'student', label: "Accept the student's", kbd: 'A', primary: true, onClick: accept },
          ]}
        />
      )}
      {pending && <UndoToast key={pending.ids.join()} message={pending.message} onUndo={() => setPending(null)} onExpire={send} />}
    </>
  )
}

export default function OverviewPage() {
  const base = useReportsBase()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // Links of the former page (?id=HO-…) open the student's reports.
  const legacyId = params.get('id')
  useEffect(() => {
    if (legacyId) navigate(`${base}/${legacyId}`, { replace: true })
  }, [legacyId, base, navigate])

  if (pathname.endsWith('/bulk')) return <Navigate to={`${base}?mode=bulk`} replace />
  return params.get('mode') === 'bulk' ? <BulkView base={base} /> : <QueueView base={base} />
}
