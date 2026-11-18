import { Bed, Package, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar, Card, Facts, Note } from '@/components/ui/Display'
import { LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { Tooltip } from '@/components/ui/Tooltip'
import { countLines, typeName } from '@/lib/furniture'
import { formatDate, formatDateRange } from '@/lib/format'
import { t, tr, tx } from '@/i18n'

function groupFurniture(items) {
  return Object.values(
    (items ?? []).reduce((acc, i) => {
      const name = typeName(i)
      ;(acc[name] ??= { name, items: [] }).items.push(i)
      return acc
    }, {}),
  )
}

function FurnitureSummaryValue({ allocationFurniture, furnitureItems }) {
  const groups = furnitureItems?.length
    ? groupFurniture(furnitureItems).map((g) => ({ label: `${g.items.length} × ${g.name}`, name: g.name, qty: g.items.length }))
    : (allocationFurniture ?? []).map((l) => ({ label: `${l.quantity} × ${typeName(l)}`, name: typeName(l), qty: l.quantity }))

  if (!groups.length) return '—'
  if (groups.length === 1 && !allocationFurniture?.length) return groups[0].label

  const preview = groups.slice(0, 2).map((g) => g.label).join(' · ')
  const rest = groups.length - 2

  return (
    <Tooltip
      touch
      side="top"
      align="start"
      title={t('Furniture & equipment')}
      label={
        <ul className="flex flex-col gap-1 pt-1">
          {groups.map((g) => (
            <li key={g.name} className="flex items-center justify-between gap-4 tabular">
              <span>{g.name}</span>
              <span className="font-semibold text-orange-200">{`× ${g.qty}`}</span>
            </li>
          ))}
        </ul>
      }
    >
      <span tabIndex={0} className="inline-flex cursor-help flex-wrap items-center gap-1.5 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <span>{preview || countLines(allocationFurniture)}</span>
        {rest > 0 && (
          <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-sm font-semibold text-fg-brand tabular">
            +{rest}
          </span>
        )}
      </span>
    </Tooltip>
  )
}

export function RoomHeroCard({ data, furnitureItems }) {
  const { allocation: a, term: tm } = data
  const detailItems = [
    ['Block', a.blockLabel ?? a.block ?? '—'],
    ['Floor', a.floor ?? '—'],
    ['Room type', a.roomTypeName ?? '—'],
    ['Room tier', a.roomClassName ?? '—'],
    ['Furniture', <FurnitureSummaryValue key="furniture" allocationFurniture={a.furniture} furnitureItems={furnitureItems} />],
    ['Allocated on', formatDate(a.allocatedAt)],
    ...(data.stay
      ? [
          ['Stay length', t('{n} terms', { n: data.stay.committedTerms })],
          ['Terms used', data.stay.termsUsed],
        ]
      : data.stayTerms
        ? [['Stay length', t('{n} terms', { n: data.stayTerms })]]
        : []),
    ...(a.residentSince ? [['Resident since', formatDate(a.residentSince)]] : []),
  ]

  return (
    <Card padding="none" className="flex shrink-0 flex-col overflow-hidden">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-line bg-brand-subtle p-5 sm:flex-row sm:items-center lg:px-6 lg:py-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand shadow-card sm:flex">
            <Bed size={28} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-h1 font-semibold text-fg tabular">
                <span className="max-lg:hidden">{t('Room')} </span>
                {a.room} · {t('Bed {bed}', { bed: a.bed })}
              </p>
              <StatusTag status={a.status ?? 'Allocated'} />
            </div>
            <p className="text-base text-fg-secondary lg:text-lg">
              {[a.block, a.floor, a.roomTypeName, a.roomClassName].filter(Boolean).map(tr).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 lg:px-6 lg:py-5">
        <h2 className="text-h3 font-semibold text-fg max-lg:hidden">{t('Details')}</h2>
        {tm && (
          <Facts
            className="lg:hidden"
            items={[
              ['Term', tm.name],
              ...(tm.stayStart ? [['Stay', formatDateRange(tm.stayStart, tm.stayEnd)]] : []),
            ]}
          />
        )}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {detailItems.map(([label, value]) => (
            <div key={label} className="flex min-w-0 items-start justify-between gap-4 sm:flex-col sm:justify-start sm:gap-1">
              <dt className="shrink-0 text-sm text-fg-tertiary">{tx(label)}</dt>
              <dd className="min-w-0 text-right text-base font-medium text-fg tabular sm:text-left">{typeof value === 'string' || typeof value === 'number' ? tx(value) : value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  )
}

export function RoommatesCard({ roommates = [], capacity, roomCode }) {
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-fg">{t('Roommates')}</h2>
        {capacity != null && (
          <span className="text-sm font-medium text-fg-tertiary tabular">
            {t('{n} of {total}', { n: roommates.length, total: capacity })}
          </span>
        )}
      </div>
      {roommates.length ? (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
          {roommates.map((p) => (
            <li key={`${p.bed}-${p.name}`} className="min-w-0">
              <Tooltip
                touch
                block
                side="top"
                align="start"
                title={p.name}
                label={roomCode ? `${t('Room {code}', { code: roomCode })} · ${t('Bed {bed}', { bed: p.bed })}` : t('Bed {bed}', { bed: p.bed })}
              >
                <div
                  tabIndex={0}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-subtle px-3.5 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={p.name} />
                    <span className="truncate text-base font-medium text-fg">{p.name}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-sm font-medium text-fg-secondary tabular">
                    {t('Bed {bed}', { bed: p.bed })}
                  </span>
                </div>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-fg-secondary">{t('No roommates assigned yet.')}</p>
      )}
      <Note>Only names are shared. Contact details stay private; you meet your roommates at check-in.</Note>
    </Card>
  )
}

export function FurnitureCard({ furnitureQuery }) {
  const items = furnitureQuery.data?.items
  if (furnitureQuery.loading && !items) return <LoadingState />
  if (!items) return null

  // Students only see furniture categories, quantities, and status counts (never internal assetCode).
  const groups = groupFurniture(items)

  return (
    <Card padding="lg" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-h3 font-semibold text-fg">{t('Furniture & equipment')}</h2>
          <span className="text-sm font-medium text-fg-tertiary tabular">({items.length})</span>
        </div>
        <Button variant="primary" icon={Wrench} to="/student/requests/maintenance/new">
          {t('Report broken equipment')}
        </Button>
      </div>

      {items.length ? (
        <ul className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4" aria-label={t('Furniture')}>
          {groups.map((g) => {
            const statusCounts = g.items.reduce((acc, item) => {
              const st = item.status || 'In use'
              acc[st] = (acc[st] ?? 0) + 1
              return acc
            }, {})
            return (
              <li key={g.name} className="flex flex-col justify-between gap-3 rounded-lg bg-subtle p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-brand">
                      <Package size={18} aria-hidden="true" />
                    </span>
                    <span className="text-base font-semibold text-fg">{g.name}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-sm font-semibold text-fg-brand tabular">
                    {`× ${g.items.length}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <span key={status} className="inline-flex items-center gap-1.5 text-sm text-fg-secondary tabular">
                      <StatusTag status={status} />
                      {Object.keys(statusCounts).length > 1 && <span className="font-medium">({count})</span>}
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-base text-fg-secondary">{t('No furniture recorded in this room.')}</p>
      )}
      <Note className="shrink-0">Something broken? Report it from requests so staff can repair it.</Note>
    </Card>
  )
}
