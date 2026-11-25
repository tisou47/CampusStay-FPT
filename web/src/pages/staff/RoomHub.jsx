import { useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, BedDouble, ClipboardCheck, Gauge, KeyRound, Package, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, Card } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { countLines, typeName } from '@/lib/furniture'
import { formatDate, formatNumber } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'
import { SetCodeModal } from './DoorCodes'
import { RoomReportList, useRoomReports } from './inventory/RoomReports'

// SCR-INV-14 Room hub (spec §11.3): residents of the current and the next Term, Room Class per Term and furniture
// conformance, door code, meter readings, Maintenance Requests and inspections. Shared by Staff and Managers.
// GET /inventory/rooms/:code/hub?termId → { details: { room, block, floor, roomType, term, roomClass,
//   next: { termId, term, roomClass } | null, conformance: { status, missing, extra }, furniture: [...],
//   doorCode: { status, proposed } | null },
//   sections: { residents, meterReadings, maintenance, inspections: [{ kind, id, title, detail, status, at }] } }
// Layout (UI only): a row of tiles that each say a section's state and jump to it, then the sections.

function SectionTitle({ icon: Glyph, title, aside }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Glyph size={18} className="text-fg-tertiary" aria-hidden="true" />
        {t(title)}
      </h2>
      {aside && <span className="shrink-0 text-sm text-fg-tertiary">{aside}</span>}
    </div>
  )
}

function Section({ id, icon, title, items, empty, link, aside, className }) {
  return (
    <Card id={id} className={cx('flex h-full min-h-0 scroll-mt-4 flex-col gap-3', className)}>
      <SectionTitle icon={icon} title={title} aside={aside} />
      <ul className="flex min-h-0 flex-col divide-y divide-line">
        {items.map((item) => {
          const to = link?.(item)
          return (
            <li key={`${item.kind}:${item.id}:${item.detail}`} className="flex items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                {to ? (
                  <Button variant="text" to={to} className="justify-start truncate">
                    {item.title}
                  </Button>
                ) : (
                  <span className="truncate text-base font-medium text-fg">{tr(item.title)}</span>
                )}
                <span className="truncate text-sm text-fg-secondary" title={tr(item.detail)}>
                  {tr(item.detail)}
                </span>
              </div>
              <span className="shrink-0 text-sm text-fg-tertiary tabular">{item.kind === 'student' ? '' : formatDate(item.at)}</span>
              {item.status && <StatusTag status={item.status} />}
            </li>
          )
        })}
        {items.length === 0 && <li className="py-2 text-base text-fg-tertiary">{t(empty)}</li>}
      </ul>
    </Card>
  )
}

/** One tile per section: its state in words, and a jump to the section. */
function Tile({ href, onClick, label, value, note, noteTone = 'tertiary' }) {
  const tone = { tertiary: 'text-fg-tertiary', success: 'text-success-fg', warning: 'text-warning-fg', error: 'text-error-fg' }[noteTone]
  return (
    <a
      href={href}
      onClick={onClick}
      className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="truncate text-sm font-medium text-fg-tertiary">{t(label)}</span>
      <span className="truncate text-h2 font-semibold text-fg tabular">{value}</span>
      {note && <span className={cx('truncate text-sm', tone)}>{note}</span>}
    </a>
  )
}

/** Residents as cards, one per Bed they hold (current and next Term). */
function Residents({ items, link }) {
  return (
    <Card id="residents" className="flex scroll-mt-4 flex-col gap-3">
      <SectionTitle icon={BedDouble} title="Residents" aside={items.length ? t('{n} beds held', { n: items.length }) : null} />
      {items.length === 0 ? (
        <p className="text-base text-fg-tertiary">{t('Nobody holds a bed of this room in the current or next term.')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <li key={`${r.kind}:${r.id}:${r.detail}`} className="flex flex-col gap-2 rounded-lg border border-line p-3.5">
              <div className="flex items-start justify-between gap-2">
                <Button variant="text" to={link(r)} className="-ml-2 min-w-0 justify-start truncate font-semibold">
                  {r.title}
                </Button>
                {r.status && <StatusTag status={r.status} className="shrink-0" />}
              </div>
              <span className="truncate text-sm text-fg-secondary">{tr(r.detail)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** "Electricity 1095 → 1140 kWh · Water 38 → 42 m³" → its two readings, kept whole when it reads otherwise. */
function splitReading(detail) {
  const m = /^Electricity (.+?) · Water (.+)$/.exec(detail ?? '')
  return m ? { power: m[1], water: m[2] } : null
}

function MeterReadings({ items, className }) {
  return (
    <Card id="meters" className={cx('flex min-w-0 scroll-mt-4 flex-col gap-3', className)}>
      <SectionTitle icon={Gauge} title="Meter readings" />
      {items.length === 0 ? (
        <p className="text-base text-fg-tertiary">{t('No meter reading yet.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-subtle text-left text-fg-secondary">
                <th className="rounded-l-md px-2.5 py-1.5 font-medium">{t('Period')}</th>
                <th className="px-2.5 py-1.5 font-medium">{t('Electricity')}</th>
                <th className="px-2.5 py-1.5 font-medium">{t('Water')}</th>
                <th className="px-2.5 py-1.5 font-medium">{t('Date')}</th>
                <th className="rounded-r-md px-2.5 py-1.5 font-medium">{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const r = splitReading(m.detail)
                return (
                  <tr key={m.id} className="border-b border-line">
                    <td className="px-2.5 py-2 font-semibold whitespace-nowrap text-fg tabular">{tr(m.title)}</td>
                    {r ? (
                      <>
                        <td className="px-2.5 py-2 text-fg-secondary tabular">{r.power}</td>
                        <td className="px-2.5 py-2 text-fg-secondary tabular">{r.water}</td>
                      </>
                    ) : (
                      <td colSpan={2} className="px-2.5 py-2 text-fg-secondary">
                        {tr(m.detail)}
                      </td>
                    )}
                    <td className="px-2.5 py-2 whitespace-nowrap text-fg tabular">{formatDate(m.at)}</td>
                    <td className="px-2.5 py-2">{m.status && <StatusTag status={m.status} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function RoomHub() {
  const { code } = useParams()
  const base = useRoleBase()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { term } = useSession()
  const query = useQuery(['inventory', 'hub', code, term?.id], ({ signal }) => api.inventory.hub(code, { termId: term?.id }, { signal }))
  // The door code is changed here, in the Door codes page's modal; both screens refresh.
  const [changingCode, setChangingCode] = useState(false)
  const backParam = params.get('back')
  const backUrl = backParam?.startsWith('/') ? backParam : `${base}/inventory?room=${encodeURIComponent(code ?? '')}`
  const handleBack = () => {
    if (location.state?.fromInventory) navigate(-1)
    else navigate(backUrl)
  }
  const topBar = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={handleBack}>
        {t('Back')}
      </Button>
      <Breadcrumb items={[{ label: 'Rooms', to: backUrl }, { label: code }]} />
    </div>
  )
  if (query.loading && !query.data) return <LoadingState />
  if (query.error) {
    return (
      <>
        <PageHeader breadcrumb={topBar} title={t('Room {code}', { code })} />
        <ErrorState error={query.error} onRetry={query.reload} />
      </>
    )
  }
  const { details: d, sections: s } = query.data
  const c = d.conformance
  const latestMeter = s.meterReadings[0]
  const inUse = d.furniture.filter((f) => f.status === 'In use').length
  const conformanceGap = c.missing.length + c.extra.length
  const hereUrl = `${location.pathname}${location.search}`
  const goFurniture = (itemId) =>
    navigate(`${base}/furniture?room=${encodeURIComponent(d.room)}${itemId ? `&item=${encodeURIComponent(itemId)}` : ''}&from=room&back=${encodeURIComponent(hereUrl)}`, {
      state: { fromInventory: true },
    })
  return (
    <>
      <PageHeader
        breadcrumb={topBar}
        title={t('Room {code}', { code: d.room })}
        badge={<StatusTag status={c.status} />}
        description={[t('Block {code} · Floor {n}', { code: d.block, n: d.floor }), tr(d.roomType), d.term && t('{term}: {roomClass}', { term: d.term, roomClass: tr(d.roomClass) })].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon={Package} onClick={() => goFurniture()}>
              Furniture
            </Button>
            {d.doorCode && (
              <Button icon={KeyRound} onClick={() => setChangingCode(true)}>
                Set new code
              </Button>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Tile href="#residents" label="Residents" value={formatNumber(s.residents.length)} note={tr(d.roomType)} />
          <Tile
            href={`${base}/furniture?room=${encodeURIComponent(d.room)}&from=room&back=${encodeURIComponent(hereUrl)}`}
            onClick={(e) => {
              e.preventDefault()
              goFurniture()
            }}
            label="Furniture"
            value={tr(c.status)}
            note={conformanceGap ? t('{n} items to fix', { n: conformanceGap }) : t('{n} items · {inUse} in use', { n: d.furniture.length, inUse })}
            noteTone={conformanceGap ? 'error' : 'success'}
          />
          <Tile
            href="#furniture"
            label="Door code"
            value={d.doorCode ? tr(d.doorCode.status) : '—'}
            note={d.doorCode?.proposed ? t('New code waiting') : null}
            noteTone="warning"
          />
          <Tile
            href="#meters"
            label="Meter readings"
            value={latestMeter ? tr(latestMeter.title) : '—'}
            note={latestMeter ? tr(latestMeter.status) : t('No meter reading yet.')}
            noteTone={latestMeter && latestMeter.status !== 'Confirmed' ? 'warning' : 'tertiary'}
          />
          <Tile
            href="#maintenance"
            label="Maintenance · Inspections"
            value={`${formatNumber(s.maintenance.length)} · ${formatNumber(s.inspections.length)}`}
            note={t('Maintenance requests · inspections')}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
          <div className="flex min-w-0 flex-col gap-4">
            <Residents items={s.residents} link={(i) => `${base}/students/${i.id}`} />
            <MeterReadings items={s.meterReadings} className="flex-1" />
          </div>
          <Card id="furniture" className="flex h-full min-w-0 scroll-mt-4 flex-col gap-3">
            <SectionTitle icon={Package} title="Room tier and furniture" aside={d.furniture.length ? t('{n} items', { n: d.furniture.length }) : null} />
            {(d.next || d.doorCode) && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
                {d.next && <span className="text-fg">{t('Next term ({term}): {roomClass}', { term: d.next.term, roomClass: tr(d.next.roomClass) })}</span>}
                {d.doorCode && (
                  <span className="flex items-center gap-2 text-fg">
                    {t('Door code')}
                    <StatusTag status={d.doorCode.status} />
                    {d.doorCode.proposed && <Tag tone="info" dot={false}>New code waiting</Tag>}
                  </span>
                )}
              </div>
            )}
            {c.missing.length > 0 && <p className="text-sm text-error-fg">{t('Missing: {items}', { items: countLines(c.missing) })}</p>}
            {c.extra.length > 0 && <p className="text-sm text-fg-secondary">{t('Remove: {items}', { items: countLines(c.extra) })}</p>}
            {d.furniture.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm" aria-label={t('Furniture')}>
                  <thead>
                    <tr className="bg-subtle text-left text-fg-secondary">
                      <th className="rounded-l-md px-2.5 py-1.5 font-medium">{t('Code')}</th>
                      <th className="px-2.5 py-1.5 font-medium">{t('Type')}</th>
                      <th className="rounded-r-md px-2.5 py-1.5 font-medium">{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.furniture.map((f) => (
                      <tr
                        key={f.id}
                        onClick={() => goFurniture(f.id)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            goFurniture(f.id)
                          }
                        }}
                        className="cursor-pointer border-b border-line transition-colors hover:bg-primary-subtle/60 focus-visible:bg-primary-subtle/60 focus-visible:outline-none"
                      >
                        <td className="px-2.5 py-2 font-semibold whitespace-nowrap text-fg-brand hover:underline tabular">{f.assetCode}</td>
                        <td className="px-2.5 py-2 text-fg-secondary">{typeName(f)}</td>
                        <td className="px-2.5 py-2">
                          <StatusTag status={f.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-fg-tertiary">{t('No furniture recorded in this room.')}</p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
          <Section id="maintenance" icon={Wrench} title="Maintenance requests" items={s.maintenance} empty="No maintenance request for this room." link={(i) => `${base}/maintenance/${i.id}`} />
          <RoomReportsCard room={d.room} />
        </div>
      </div>
      {changingCode && <SetCodeModal room={{ room: d.room }} onClose={() => setChangingCode(false)} />}
    </>
  )
}

/** The room's reports: report 1, every inspection saved for it and the students' check-in inventories (Rooms and beds shows the same). */
function RoomReportsCard({ room }) {
  const { rows, loading } = useRoomReports(room)
  return (
    <Card id="inspections" className="flex h-full min-h-0 scroll-mt-4 flex-col gap-3">
      <SectionTitle icon={ClipboardCheck} title="Reports" aside={rows.length ? formatNumber(rows.length) : null} />
      <RoomReportList rows={rows} loading={loading} className="max-h-96" />
    </Card>
  )
}
