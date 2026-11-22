import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowRight, CalendarClock, CameraOff, CircleCheck, ExternalLink, ImageOff, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useFocusMode } from '@/app/focus'
import { Button, IconButton } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { t } from '@/i18n'
import { cx } from '@/lib/cx'
import { formatDateTime, formatNumber } from '@/lib/format'
import { conditionName } from '@/lib/furniture'
import { StatusBadge } from './components/Badges'
import { FocusTopBar, useReportActions } from './components/ReportUI'
import { itemLabel, signedDelta, usePhotoCaptureConfig, useQueuePosition, useReport, useReportsBase, useShortcuts } from './checkinReports'

// Staff › Check-in inventories › one student › the student's photos of what differs (Report 2). Report 1 and the
// Final report have no photos (Staff record them as text). With photos off for the Term (Admin › System parameters ›
// Room handover) the viewer gives way to a note and the other ways to settle a difference.
// TODO(api): a photo's capture time and source (camera or gallery) and the furniture type's sample photo are not sent;
// the "Photo reliability" card and "Beside the sample" appear only when they are.

const ZOOMS = [1, 1.5, 2, 3]

/**
 * A student's photo, large, with zoom and the strip of every photo of the item below.
 * TODO(api): no capture time, source (camera or gallery) or marked area comes with a photo; the viewer shows
 * them when the API sends `takenAt`, `source` and `mark: { x, y, r }` (fractions of the image).
 */
function PhotoViewer({ photos, label }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(0)
  const [marks, setMarks] = useState(true)
  const photo = photos[Math.min(index, photos.length - 1)]
  if (!photo) return null
  const scale = ZOOMS[zoom]
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative overflow-auto rounded-lg border border-line bg-subtle/50" style={{ height: 420 }}>
        <span className="absolute top-2 left-2 z-10 rounded-full bg-fg/80 px-2.5 py-0.5 text-xs font-medium text-white">
          {label}
          {photo.takenAt ? ` · ${formatDateTime(photo.takenAt)}` : ''}
        </span>
        <div className={cx('flex min-h-full items-center justify-center p-2', scale > 1 && 'w-max')}>
          <div className="relative">
            <img
              src={photo.url}
              alt={t('Photo {n} of {total}', { n: index + 1, total: photos.length })}
              className="object-contain"
              style={scale === 1 ? { maxHeight: 400, maxWidth: '100%' } : { height: 400 * scale, maxWidth: 'none' }}
            />
            {marks && photo.mark && (
              <span
                aria-hidden="true"
                className="absolute rounded-full border-2 border-dashed border-orange-500"
                style={{ left: `${(photo.mark.x - photo.mark.r) * 100}%`, top: `${(photo.mark.y - photo.mark.r) * 100}%`, width: `${photo.mark.r * 200}%`, aspectRatio: '1' }}
              />
            )}
          </div>
        </div>
        <div className="absolute right-2 bottom-2 z-10 flex gap-1 rounded-md border border-line bg-surface p-0.5">
          <IconButton icon={ZoomOut} size="sm" aria-label={t('Zoom out')} disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))} />
          <IconButton icon={ZoomIn} size="sm" aria-label={t('Zoom in')} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} />
          {photo.mark && (
            <button type="button" aria-pressed={marks} onClick={() => setMarks((m) => !m)} className="h-7 rounded px-2 text-xs text-fg-secondary hover:bg-subtle">
              {t('Marks')}
            </button>
          )}
          <a href={photo.url} target="_blank" rel="noreferrer" aria-label={t('Open the photo in a new tab')} className="inline-flex size-7 items-center justify-center rounded text-fg-secondary hover:bg-subtle">
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
      {photos.length > 1 && (
        <div className="flex flex-wrap gap-2" role="listbox" aria-label={t('Photos')}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === index}
              onClick={() => {
                setIndex(i)
                setZoom(0)
              }}
              className={cx('size-14 overflow-hidden rounded-md border-2', i === index ? 'border-line-brand' : 'border-transparent hover:border-line-strong')}
            >
              <img src={p.url} alt={t('Photo {n}', { n: i + 1 })} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SideCard({ title, badge, tone, children }) {
  return (
    <section className={cx('flex flex-col gap-2 rounded-lg border p-4', tone === 'warn' ? 'border-amber-500/40 bg-warning-bg' : 'border-line bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{t(title)}</h2>
        {badge}
      </div>
      {children}
    </section>
  )
}

export default function EvidencePage() {
  useFocusMode()
  const { id } = useParams()
  const base = useReportsBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const position = useQueuePosition(id)
  const { query, detail, diff } = useReport(id)
  const config = usePhotoCaptureConfig(detail)
  const [meterCheck, setMeterCheck] = useState(null) // 'match' | 'mismatch': Staff's own check of the photo
  const here = `${base}/${id}`
  const from = `?from=${position.from}`
  const actions = useReportActions(detail, { onDone: () => navigate(`${base}?tab=${position.from}`) })
  useShortcuts({ Escape: () => navigate(`${here}${from}`) })

  if (query.loading && !detail) return <div aria-busy="true" className="h-full min-h-96 animate-pulse rounded-lg bg-subtle" />
  if (query.error && !detail) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!detail || !diff) return null

  // The list: the meters (when they differ or have photos), then every item that differs or has a photo.
  const meterEntry = diff.meters.some((m) => m.isDiff) || (detail.meterPhotos?.length ?? 0) > 0
  const entries = [
    ...(meterEntry ? [{ key: 'meters', label: t('Meters'), photos: detail.meterPhotos ?? [], meters: diff.meters }] : []),
    ...diff.items.filter((i) => i.isDiff || (i.raw.photos?.length ?? 0) > 0).map((i) => ({ key: i.key, label: itemLabel(i.raw), photos: i.raw.photos ?? [], item: i })),
  ]
  const current = entries.find((e) => e.key === params.get('item')) ?? entries[0]
  const choose = (key) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('item', key)
      return next
    })

  return (
    <>
      <FocusTopBar back={`${here}${from}`} detail={detail} current="2" reportTo={(k) => `${here}/report/${k}${from}`} compareTo={`${here}/compare${from}`}>
        <Tag tone={config.enabled ? 'success' : 'neutral'}>
          {config.enabled ? t('Photos: on') : t('Photos: off')}
          {config.source === 'inferred' ? '' : ` · ${t('set by Admin')}`}
        </Tag>
      </FocusTopBar>

      <div className="grid min-h-0 grid-cols-1 items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <nav aria-label={t('What differs')} className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-2">
          <span className="px-2 pt-1 pb-2 text-xs font-semibold text-fg-secondary">{t('{n} to look at', { n: entries.length })}</span>
          {!entries.length && <p className="px-2 py-4 text-sm text-fg-secondary">{t('Nothing differs from the record.')}</p>}
          {entries.map((e) => {
            const active = e.key === current?.key
            return (
              <button
                key={e.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => choose(e.key)}
                className={cx('flex min-h-12 items-center gap-2.5 rounded-md p-2 text-left focus-visible:outline-2 focus-visible:outline-focus', active ? 'bg-primary-subtle' : 'hover:bg-subtle')}
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-subtle">
                  {config.enabled && e.photos[0] ? <img src={e.photos[0].url} alt="" className="size-full object-cover" /> : <ImageOff size={16} aria-hidden="true" className="text-fg-tertiary" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cx('truncate text-sm', active ? 'font-semibold text-fg-brand' : 'text-fg')}>{e.label}</span>
                  <span className="text-xs text-fg-secondary">
                    {e.item
                      ? `${conditionName(e.item.base) || t('No record')} → ${conditionName(e.item.student) || '—'}`
                      : e.meters.filter((m) => m.isDiff).map((m) => `${t(m.label)} ${signedDelta(m.delta, m.unit)}`).join(' · ') || t('Same as the record')}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          {!config.enabled ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 text-center">
              <CameraOff size={28} aria-hidden="true" className="text-fg-tertiary" />
              <p className="text-base font-medium text-fg">{t('Students are not asked for photos this Term')}</p>
              <p className="max-w-sm text-sm text-fg-secondary">{t('Settle the difference from the answers: ask the student to describe it again, or check the Room with them.')}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {actions.can.refile && (
                  <Button icon={RotateCcw} onClick={() => actions.open('refile')}>
                    Ask the student to describe it again
                  </Button>
                )}
                {actions.can.visit && (
                  <Button variant="primary" icon={CalendarClock} onClick={() => actions.open('visit')}>
                    Check the Room with the student
                  </Button>
                )}
              </div>
            </div>
          ) : current && current.photos.length ? (
            <PhotoViewer key={current.key} photos={current.photos} label={t('Student photo · {date}', { date: detail.row.submittedAt ? formatDateTime(detail.row.submittedAt) : '—' })} />
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 text-center">
              <ImageOff size={28} aria-hidden="true" className="text-fg-tertiary" />
              <p className="text-base font-medium text-fg">{t('No photo of this from the student')}</p>
              <p className="max-w-sm text-sm text-fg-secondary">{t('Read the answer and the note beside it, or check the Room with the student.')}</p>
            </div>
          )}
        </section>

        {current && (
          <aside className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1">
            {current.item ? (
              <div className="flex items-stretch gap-2">
                <SideCard title="Record · Staff" badge={<Tag tone="neutral" dot={false}>No photos</Tag>}>
                  <StatusBadge value={current.item.base} />
                  <p className="text-sm text-fg-secondary">{current.item.raw.baselineNote || t('No note')}</p>
                </SideCard>
                <ArrowRight size={16} aria-hidden="true" className="shrink-0 self-center text-fg-tertiary" />
                <SideCard title="Student" tone={current.item.isDiff ? 'warn' : undefined}>
                  <StatusBadge value={current.item.student} />
                  <p className="text-sm text-fg">{current.item.raw.note || t('No note')}</p>
                </SideCard>
              </div>
            ) : (
              <SideCard title="Meters">
                <ul className="flex flex-col gap-1.5 text-sm">
                  {current.meters.map((m) => (
                    <li key={m.key} className="flex justify-between gap-2">
                      <span className="text-fg-secondary">{t(m.label)}</span>
                      <span className="tabular-nums text-fg">
                        {m.base != null ? formatNumber(m.base) : '—'} → <strong>{m.student != null ? formatNumber(m.student) : '—'}</strong> {m.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                {config.enabled && current.photos.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-line pt-2">
                    <span className="text-sm font-medium text-fg">{t('Does the number on the photo match what the student typed?')}</span>
                    <div role="radiogroup" className="flex gap-2">
                      {[
                        ['match', 'Matches'],
                        ['mismatch', 'Does not match'],
                      ].map(([v, label]) => (
                        <Button key={v} size="sm" variant={meterCheck === v ? 'primary' : 'default'} role="radio" aria-checked={meterCheck === v} onClick={() => setMeterCheck(v)}>
                          {label}
                        </Button>
                      ))}
                    </div>
                    {meterCheck === 'mismatch' && <p className="text-xs text-warning-fg">{t('Check the Room with the student, or ask them to file again.')}</p>}
                  </div>
                )}
              </SideCard>
            )}

            {config.enabled && current.photos.some((p) => p.takenAt) && (
              <SideCard title="Photo reliability">
                {current.photos
                  .filter((p) => p.takenAt)
                  .slice(0, 1)
                  .map((p) => {
                    const after = detail.row.openedAt && new Date(p.takenAt) >= new Date(detail.row.openedAt)
                    return (
                      <div key={p.id} className="flex flex-col gap-1.5 text-sm">
                        <span className="text-fg-secondary">{t('Taken {date}', { date: formatDateTime(p.takenAt) })}</span>
                        <Tag tone={after ? 'success' : 'error'}>{after ? 'After receiving the Room' : 'Before receiving the Room'}</Tag>
                        {p.source && <span className="text-fg-secondary">{t(p.source === 'camera' ? 'Taken in the app' : 'From the gallery')}</span>}
                      </div>
                    )
                  })}
              </SideCard>
            )}

            <SideCard title="What to do">
              <div className="flex flex-col gap-2">
                {actions.can.confirm && (
                  <Button block variant="primary" icon={CircleCheck} onClick={() => actions.run.confirm()} disabled={actions.pending}>
                    Accept the student's report
                  </Button>
                )}
                {actions.can.visit && (
                  <Button block variant={actions.can.confirm ? 'default' : 'primary'} icon={CalendarClock} onClick={() => actions.open('visit')}>
                    Check the Room with the student
                  </Button>
                )}
                {actions.can.refile && (
                  <Button block icon={RotateCcw} onClick={() => actions.open('refile')}>
                    {config.enabled ? 'Ask the student for more photos' : 'Ask the student to describe it again'}
                  </Button>
                )}
                {!actions.can.confirm && !actions.can.visit && !actions.can.refile && <p className="text-sm text-fg-secondary">{t('Nothing to decide here: the inventory is {status}.', { status: t(detail.row.status) })}</p>}
              </div>
            </SideCard>
          </aside>
        )}
      </div>
      {actions.dialogs}
    </>
  )
}
