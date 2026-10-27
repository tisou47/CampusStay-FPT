import { useParams } from 'react-router'
import { BedDouble, ClipboardCheck, Gauge, KeyRound, Package, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, Card } from '@/components/ui/Display'
import { ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { countLines, typeName } from '@/lib/furniture'
import { formatDate } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'
import { t, tr } from '@/i18n'

// SCR-INV-14 Room hub (spec §11.3): residents of the current and the next Term, Room Class per Term and furniture
// conformance, door code, meter readings, Maintenance Requests and inspections. Shared by Staff and Managers.
// GET /inventory/rooms/:code/hub?termId → { details: { room, block, floor, roomType, term, roomClass,
//   next: { termId, term, roomClass } | null, conformance: { status, missing, extra }, furniture: [...],
//   doorCode: { status, proposed } | null },
//   sections: { residents, meterReadings, maintenance, inspections: [{ kind, id, title, detail, status, at }] } }

function Section({ icon: Glyph, title, items, empty, link }) {
  return (
    <Card className="flex min-h-0 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Glyph size={18} aria-hidden="true" />
        {t(title)}
      </h2>
      <ul className="flex min-h-0 flex-col divide-y divide-line overflow-y-auto">
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
                <span className="truncate text-sm text-fg-secondary">{tr(item.detail)}</span>
              </div>
              <span className="shrink-0 text-sm text-fg-tertiary">{item.kind === 'student' ? '' : formatDate(item.at)}</span>
              {item.status && <StatusTag status={item.status} />}
            </li>
          )
        })}
        {items.length === 0 && <li className="py-2 text-base text-fg-tertiary">{t(empty)}</li>}
      </ul>
    </Card>
  )
}

export default function RoomHub() {
  const { code } = useParams()
  const base = useRoleBase()
  const { term } = useSession()
  const query = useQuery(['inventory', 'hub', code, term?.id], ({ signal }) => api.inventory.hub(code, { termId: term?.id }, { signal }))
  const breadcrumb = <Breadcrumb items={[{ label: 'Rooms', to: `${base}/inventory` }, { label: code }]} />
  if (query.loading && !query.data) return <LoadingState />
  if (query.error) {
    return (
      <>
        <PageHeader breadcrumb={breadcrumb} title={t('Room {code}', { code })} />
        <ErrorState error={query.error} onRetry={query.reload} />
      </>
    )
  }
  const { details: d, sections: s } = query.data
  const c = d.conformance
  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb}
        title={t('Room {code}', { code: d.room })}
        badge={<StatusTag status={c.status} />}
        description={[t('Block {code} · Floor {n}', { code: d.block, n: d.floor }), tr(d.roomType), d.term && t('{term}: {roomClass}', { term: d.term, roomClass: tr(d.roomClass) })].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon={Package} to={`${base}/furniture?room=${d.room}`}>
              Furniture
            </Button>
            {d.doorCode && (
              <Button icon={KeyRound} to={`${base}/door-codes?room=${d.room}`}>
                Door code
              </Button>
            )}
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-4">
        <Section icon={BedDouble} title="Residents" items={s.residents} empty="Nobody holds a Bed of this Room in the current or next Term." link={(i) => `${base}/students/${i.id}`} />
        <Card className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
            <Package size={18} aria-hidden="true" />
            {t('Room Class and furniture')}
          </h2>
          {d.next && <p className="text-base text-fg">{t('Next Term ({term}): {roomClass}', { term: d.next.term, roomClass: tr(d.next.roomClass) })}</p>}
          {d.doorCode && (
            <p className="flex items-center gap-2 text-base text-fg">
              {t('Door code')}
              <StatusTag status={d.doorCode.status} />
              {d.doorCode.proposed && <Tag tone="info" dot={false}>New code waiting</Tag>}
            </p>
          )}
          {c.missing.length > 0 && <p className="text-sm text-error-fg">{t('Missing: {items}', { items: countLines(c.missing) })}</p>}
          {c.extra.length > 0 && <p className="text-sm text-fg-secondary">{t('Remove: {items}', { items: countLines(c.extra) })}</p>}
          <ul className="flex flex-col gap-2" aria-label={t('Furniture')}>
            {d.furniture.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-fg">{f.assetCode}</span>
                <span className="min-w-0 truncate text-fg-secondary">{typeName(f)}</span>
                <StatusTag status={f.status} className="ml-auto" />
              </li>
            ))}
            {!d.furniture.length && <li className="text-sm text-fg-tertiary">{t('No furniture recorded in this Room.')}</li>}
          </ul>
        </Card>
        <Section icon={Wrench} title="Maintenance Requests" items={s.maintenance} empty="No Maintenance Request for this Room." link={(i) => `${base}/maintenance/${i.id}`} />
        <Section icon={Gauge} title="Meter readings" items={s.meterReadings} empty="No meter reading yet." />
        <Section icon={ClipboardCheck} title="Inspections" items={s.inspections} empty="No inspection of this Room yet." />
      </div>
    </>
  )
}
