import { Link, useNavigate, useParams } from 'react-router'
import { ErrorState } from '@/components/ui/States'
import { Button } from '@/components/ui/Button'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber } from '@/lib/format'
import { conditionName, typeName } from '@/lib/furniture'
import { StatusBadge } from './components/Badges'
import { FocusTopBar, ReportActionPanel, useReportActions } from './components/ReportUI'
import { photoCount, signedDelta, usePhotoCaptureConfig, useQueuePosition, useReport, useReportsBase, useShortcuts } from './checkinReports'
import { LockedFinalCard } from './StudentReportsPage'

// Staff › Check-in inventories › one student › one report, in focus mode (no sidebar): 1 Record, 2 Student, 3 Final.
// Keys: 1 / 2 / 3 switch the report, C the comparison, Esc back to the student.

const META = {
  1: { kicker: 'Report 1 · Record', title: "The Room's record", by: 'Staff, before the student moved in' },
  2: { kicker: 'Report 2 · Student', title: 'Filed by the student', by: 'The student, on the app' },
  3: { kicker: 'Report 3 · Final', title: 'Checked in the Room', by: 'Staff, in the Room with the student' },
}

function Number3({ label, value, warn }) {
  return (
    <div className="flex flex-col">
      <span className={cx('text-[28px] leading-9 font-semibold tabular-nums', warn ? 'text-warning-fg' : 'text-fg')}>{value}</span>
      <span className="text-xs text-fg-secondary">{t(label)}</span>
    </div>
  )
}

function SideCard({ title, children }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-h3 font-semibold text-fg">{t(title)}</h2>
      {children}
    </section>
  )
}

function Timeline({ detail }) {
  const row = detail.row
  const steps = [
    { label: 'Record made by Staff', at: detail.electricity?.baselineAt },
    { label: 'Student received the Room', at: row.openedAt },
    { label: 'Student filed the inventory', at: row.submittedAt },
    { label: 'Room visit', at: row.visitAt },
    { label: 'Final', at: detail.finalizedAt },
  ]
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-3 left-[5px] h-full w-px bg-line" />}
          <span aria-hidden="true" className={cx('relative mt-1.5 size-[11px] shrink-0 rounded-full border-2', s.at ? 'border-success bg-success' : 'border-line-strong bg-surface')} />
          <div className="flex flex-col">
            <span className={cx('text-sm', s.at ? 'text-fg' : 'text-fg-tertiary')}>{t(s.label)}</span>
            <span className="text-xs text-fg-secondary tabular-nums">{s.at ? formatDateTime(s.at) : t('Not yet')}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function ReportDetailPage() {
  const { id, n: raw } = useParams()
  const n = ['1', '2', '3'].includes(raw) ? raw : '2'
  const base = useReportsBase()
  const navigate = useNavigate()
  const position = useQueuePosition(id)
  const { query, detail, diff } = useReport(id)
  const photos = usePhotoCaptureConfig(detail)
  const here = `${base}/${id}`
  const from = `?from=${position.from}`
  const actions = useReportActions(detail, { onDone: () => navigate(`${here}${from}`) })

  useShortcuts({
    1: () => navigate(`${here}/report/1${from}`),
    2: () => navigate(`${here}/report/2${from}`),
    3: () => navigate(`${here}/report/3${from}`),
    c: () => navigate(`${here}${from}`),
    Escape: () => navigate(`${base}?tab=${position.from}`),
  })

  if (query.loading && !detail) return <div aria-busy="true" className="h-full min-h-96 animate-pulse rounded-lg bg-subtle" />
  if (query.error && !detail) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail || !diff) return null

  const meta = META[n]
  const at = n === '1' ? detail.electricity?.baselineAt : n === '2' ? detail.row.submittedAt : detail.finalizedAt
  const missing = n === '3' && !diff.final
  const value = (i) => (n === '1' ? i.base : n === '2' ? i.student : i.final)
  const note = (raw) => (n === '1' ? raw.baselineNote : n === '2' ? raw.note : raw.verifiedNote)
  const shownPhotos = n === '2' && photos.enabled
  const differing = n === '1' ? 0 : diff.diffCount
  const meterValue = (m) => (n === '1' ? m.base : n === '2' ? m.student : m.final)

  return (
    <>
      <FocusTopBar back={`${base}?tab=${position.from}`} detail={detail} current={n} reportTo={(k) => `${here}/report/${k}${from}`} compareTo={`${here}${from}`} />
      <div className="grid min-h-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-fg-brand">{t(meta.kicker)}</span>
                <h1 className="text-h1 font-bold text-fg">{t(meta.title)}</h1>
                <p className="text-sm text-fg-secondary">{[t(meta.by), at ? formatDateTime(at) : null].filter(Boolean).join(' · ')}</p>
              </div>
              {!missing && (
                <div className="flex gap-8">
                  <Number3 label="Items" value={diff.items.length} />
                  <Number3 label="Differ from the record" value={differing} warn={differing > 0} />
                  <Number3 label="Photos" value={n === '2' ? photoCount(detail) : 0} />
                </div>
              )}
            </div>

            {!missing && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  {diff.meters.map((m) => {
                    const v = meterValue(m)
                    return (
                      <div key={m.key} className={cx('flex items-center justify-between gap-3 rounded-md px-3 py-2', n !== '1' && m.isDiff ? 'bg-warning-bg' : 'bg-subtle/60')}>
                        <div className="flex flex-col">
                          <span className="text-xs text-fg-secondary">{t(m.label)}</span>
                          <span className="text-base font-semibold text-fg tabular-nums">{v == null ? '—' : `${formatNumber(v, { decimals: Number.isInteger(v) ? 0 : 2 })} ${m.unit}`}</span>
                        </div>
                        {n === '2' && m.delta != null && (
                          <span className={cx('text-xs tabular-nums', m.isDiff ? 'font-medium text-warning-fg' : 'text-fg-secondary')}>
                            {t('{delta} vs. the record', { delta: signedDelta(m.delta, m.unit) })}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {shownPhotos && detail.meterPhotos?.length > 0 && (
                  <Link to={`${here}/evidence${from}&item=meters`} className="shrink-0 text-sm font-medium text-fg-link hover:underline">
                    {t('See the meter photos ({n})', { n: detail.meterPhotos.length })}
                  </Link>
                )}
              </div>
            )}
          </section>

          {missing ? (
            <LockedFinalCard
              large
              text={detail.row.status === 'Final' ? t('Confirmed without a Room visit: there is no Final report.') : t('Only when Staff check the Room with the student.')}
            />
          ) : (
            <section className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <caption className="sr-only">{t(meta.title)}</caption>
                <thead className="bg-subtle/60 text-xs text-fg-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-semibold">{t('Item')}</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-semibold">{t('Note')}</th>
                    <th scope="col" className="w-32 px-4 py-2.5 text-left font-semibold">{t('Item condition')}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.items.map((i) => {
                    const warn = n !== '1' && i.isDiff
                    const text = note(i.raw)
                    return (
                      <tr key={i.key} className={cx('border-t border-line', warn && 'bg-warning-bg/50 [&>th]:border-l-2 [&>th]:border-l-amber-500')}>
                        <th scope="row" className="px-4 py-3 text-left font-normal">
                          <span className="block font-medium text-fg">{`${typeName(i.raw)}${i.raw.bed ? ` · ${t('Bed {bed}', { bed: i.raw.bed })}` : ''}`}</span>
                          <span className="text-xs text-fg-secondary">
                            {i.raw.assetCode}
                            {n !== '1' && i.base ? ` · ${t('Record: {value}', { value: conditionName(i.base) })}` : ''}
                          </span>
                        </th>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {text ? <span className="text-fg">{text}</span> : <span className="text-fg-tertiary">{t('No note')}</span>}
                            {shownPhotos &&
                              (i.raw.photos ?? []).map((p, k) => (
                                <Link key={p.id} to={`${here}/evidence${from}&item=${i.key}`} aria-label={t('Photo {n} of {item}', { n: k + 1, item: typeName(i.raw) })} className="block size-10 overflow-hidden rounded-md border border-line">
                                  <img src={p.url} alt="" className="size-full object-cover" />
                                </Link>
                              ))}
                            {n === '2' && i.raw.preExisting && <span className="text-xs text-fg-secondary">{t('There before the student: never charged to them')}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={value(i)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-0">
          <SideCard title="What to do">
            <ReportActionPanel detail={detail} actions={actions} />
          </SideCard>
          <SideCard title="Timeline">
            <Timeline detail={detail} />
          </SideCard>
        </aside>
      </div>
      {actions.dialogs}
    </>
  )
}
