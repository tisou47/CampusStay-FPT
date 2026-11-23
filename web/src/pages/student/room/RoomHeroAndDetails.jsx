import { useState } from 'react'
import { AlertTriangle, Bed, BedDouble, CalendarCheck, ClipboardEdit, Clock, Gem, KeyRound, Package, Users, Wrench } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar, Card } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { InfoTip, Tooltip } from '@/components/ui/Tooltip'
import { conditionName, conditionOptions, conditionTone, countLines, typeName } from '@/lib/furniture'
import { cx } from '@/lib/cx'
import { formatDate } from '@/lib/format'
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

/** One fact of the room: an icon, a small label and its value. */
function Fact({ icon: Glyph, label, children }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg bg-subtle/60 px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-brand">
        <Glyph size={16} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-fg-tertiary">{label}</span>
        <span className="text-base font-medium text-fg tabular">{children}</span>
      </span>
    </div>
  )
}

export function RoomHeroCard({ data, furnitureItems }) {
  const { allocation: a, roommates = [], roommateCapacity } = data
  // The beds of the room: yours, your roommates' (names only), and the ones still free.
  const others = roommates.map((r) => ({ bed: r.bed, name: r.name }))
  const free = Math.max(0, (roommateCapacity ?? others.length) - others.length)
  const beds = [{ bed: a.bed, you: true }, ...others].sort((x, y) => String(x.bed).localeCompare(String(y.bed)))

  return (
    <Card padding="none" className="flex shrink-0 flex-col overflow-hidden">
      <div className="flex items-center gap-4 border-b border-line bg-brand-subtle px-5 py-4 lg:px-6">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface text-fg-brand shadow-card">
          <Bed size={28} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-h1 font-semibold text-fg tabular">
            {t('Room')} {a.room} · {t('Bed {bed}', { bed: a.bed })}
          </p>
          <p className="text-base text-fg-secondary">{[a.blockLabel ?? (a.block && t('Block {code}', { code: a.block })), a.floor != null && t('Floor {n}', { n: a.floor })].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="ml-auto shrink-0">
          <StatusTag status={a.status ?? 'Allocated'} />
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5 lg:px-6">
        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          <Fact icon={BedDouble} label={t('Room type')}>
            {tr(a.roomTypeName) || '—'}
          </Fact>
          <Fact icon={Gem} label={t('Room tier')}>
            {tr(a.roomClassName) || '—'}
          </Fact>
          <Fact icon={Package} label={t('Furniture')}>
            <FurnitureSummaryValue allocationFurniture={a.furniture} furnitureItems={furnitureItems} />
          </Fact>
          <Fact icon={CalendarCheck} label={t('Allocated on')}>
            {formatDate(a.allocatedAt)}
          </Fact>
          <Fact icon={KeyRound} label={t('Resident since')}>
            {a.residentSince ? formatDate(a.residentSince) : t('Not yet')}
          </Fact>
          <Fact icon={Clock} label={t('Terms of stay')}>
            {data.stay ? t('{used} of {total} terms', { used: data.stay.termsUsed, total: data.stay.committedTerms }) : data.stayTerms ? t('{n} terms', { n: data.stayTerms }) : '—'}
          </Fact>
        </dl>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            {t('Beds in the room')}
            <InfoTip label={t('Only names are shared. Contact details stay private; you meet your roommates at check-in.')} />
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {beds.map((x) => (
              <li
                key={x.bed}
                className={cx('flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2', x.you ? 'border-primary bg-primary-subtle/50' : 'border-line')}
              >
                {x.you ? (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-fg-on-brand">{x.bed}</span>
                ) : (
                  <Avatar name={x.name} />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className={cx('truncate text-sm font-medium', x.you ? 'text-fg-brand' : 'text-fg')}>{x.you ? t('You') : x.name}</span>
                  <span className="text-xs text-fg-tertiary">{t('Bed {bed}', { bed: x.bed })}</span>
                </span>
              </li>
            ))}
            {Array.from({ length: free }, (_, n) => (
              <li key={`free-${n}`} className="flex items-center gap-2.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-fg-tertiary">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle">
                  <Bed size={15} aria-hidden="true" />
                </span>
                {t('Free bed')}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  )
}

export function RoommatesCard({ roommates = [], capacity, roomCode }) {
  return (
    <Card className="flex shrink-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          <Users size={17} aria-hidden="true" className="text-fg-brand" />
          {t('Roommates')}
          <InfoTip label={t('Only names are shared. Contact details stay private; you meet your roommates at check-in.')} />
        </h2>
        {capacity != null && (
          <span className="text-sm font-medium text-fg-tertiary tabular">
            {t('{n} of {total}', { n: roommates.length, total: capacity })}
          </span>
        )}
      </div>
      {roommates.length ? (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
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
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
        <p className="text-sm text-fg-secondary">{t('No roommates assigned yet.')}</p>
      )}
    </Card>
  )
}

export function FurnitureCard({ furnitureQuery, myBed }) {
  const { notify, notifyError } = useToast()
  const [declareOpen, setDeclareOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [condition, setCondition] = useState('Damaged')
  const [note, setNote] = useState('')

  const items = furnitureQuery.data?.items
  const reportableItems = (items ?? []).filter((i) => i.reportable !== false && i.itemId)
  const reportedItems = (items ?? []).filter((i) => i.reportedCondition)

  const saveReport = useMutation(
    (payload) => api.me.reportFurniture(payload),
    {
      invalidates: ['my-furniture'],
      onSuccess: () => {
        notify({
          title: t('Furniture condition declared'),
          message: t('Your declaration has been saved and will be shown during check-out.'),
        })
        setDeclareOpen(false)
        setNote('')
      },
      onError: (e) => notifyError(e, 'Could not save furniture declaration'),
    },
  )

  if (furnitureQuery.loading && !items) return <LoadingState />
  if (!items) return null

  const openModalFor = (item) => {
    const target = item ?? reportableItems[0]
    if (!target) return
    setSelectedItemId(target.itemId)
    setCondition(target.reportedCondition ?? 'Damaged')
    setNote(target.reportedNote ?? '')
    setDeclareOpen(true)
  }

  // Students only see furniture categories, quantities, and status counts (never internal assetCode).

  return (
    <Card padding="lg" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-h3 font-semibold text-fg">{t('Furniture & equipment')}</h2>
          <span className="text-sm font-medium text-fg-tertiary tabular">({items.filter((i) => !i.personal || !myBed || i.bed === myBed).length})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reportableItems.length > 0 && (
            <Button icon={ClipboardEdit} onClick={() => openModalFor(null)}>
              {t('Declare damaged / missing')}
            </Button>
          )}
            <Button variant="primary" icon={Wrench} to="/student/requests/maintenance/new">
            {t('Report broken equipment')}
          </Button>
        </div>
      </div>


      {reportedItems.length > 0 && (
        <Alert type="warning" title={t('Declared furniture issues during stay ({n})', { n: reportedItems.length })}>
          <ul className="mt-1 flex flex-col gap-1.5">
            {reportedItems.map((i) => (
              <li key={i.itemId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">
                    {typeName(i)} · {i.personal && i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}
                  </span>
                  <Tag tone={conditionTone[i.reportedCondition] ?? 'warning'}>{conditionName(i.reportedCondition)}</Tag>
                  {i.reportedNote && <span className="text-fg-secondary">— {i.reportedNote}</span>}
                </div>
                <Button size="sm" variant="text" onClick={() => openModalFor(i)}>
                  {t('Update')}
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {items.length ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto" aria-label={t('Furniture')}>
          {[
            // Personal: only the items of the student's own bed (the roommates' sets are theirs).
            {
              key: 'personal',
              title: t('Personal furniture'),
              hint: myBed ? t('Your Bed {bed}', { bed: myBed }) : t('One set per bed'),
              list: items.filter((i) => i.personal && (!myBed || i.bed === myBed)),
            },
            { key: 'shared', title: t('Shared furniture'), hint: t('Used by the whole room'), list: items.filter((i) => !i.personal) },
          ]
            .filter((section) => section.list.length)
            .map((section) => (
              <section key={section.key} className="flex flex-col gap-2.5">
                <h3 className="text-base font-semibold text-fg">{section.title}</h3>
                <ul className="grid grid-cols-1 content-start gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  {groupFurniture(section.list).map((g) => {
                    const statusCounts = g.items.reduce((acc, item) => {
                  const st = item.status || 'In use'
                  acc[st] = (acc[st] ?? 0) + 1
                  return acc
                }, {})
                const groupReported = g.items.filter((i) => i.reportedCondition)
                return (
                  <li key={g.name} className="flex flex-col justify-between gap-3 rounded-lg bg-subtle p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-brand">
                          <Package size={18} aria-hidden="true" />
                        </span>
                        <span className="text-base font-semibold text-fg">
                          {g.name}
                          {/* The bed the item belongs to (from the item itself); its asset code is never shown to students. */}
                          {section.key === 'personal' && g.items[0]?.bed ? ` ${g.items[0].bed}` : ''}
                        </span>
                      </div>
                      {g.items.length > 1 && <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-sm font-semibold text-fg-brand tabular">{`× ${g.items.length}`}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {Object.entries(statusCounts).map(([status, count]) => (
                        <span key={status} className="inline-flex items-center gap-1.5 text-sm text-fg-secondary tabular">
                          <StatusTag status={status} />
                          {Object.keys(statusCounts).length > 1 && <span className="font-medium">({count})</span>}
                        </span>
                      ))}
                      {groupReported.map((ri) => (
                        <Tag key={ri.itemId} tone={conditionTone[ri.reportedCondition] ?? 'warning'}>
                          <AlertTriangle size={12} aria-hidden="true" />
                          {t('Declared: {c}', { c: conditionName(ri.reportedCondition) })}
                        </Tag>
                      ))}
                    </div>
                  </li>
                )
                  })}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <p className="text-base text-fg-secondary">{t('No furniture recorded in this room.')}</p>
      )}

      <Modal
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        title={t('Declare furniture condition')}
        description={t('Select the item in your room and its current condition. Staff will review this declaration at check-out.')}
        footer={
          <>
            <Button onClick={() => setDeclareOpen(false)}>{t('Cancel')}</Button>
            <Button
              variant="primary"
              disabled={!selectedItemId || saveReport.pending}
              onClick={() => saveReport.run({ itemId: selectedItemId, condition, note: note.trim() || undefined })}
            >
              {t('Save declaration')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Furniture item" required>
            <Select
              value={selectedItemId}
              onChange={(e) => {
                const nextId = e.target.value
                setSelectedItemId(nextId)
                const found = reportableItems.find((x) => x.itemId === nextId)
                setCondition(found?.reportedCondition ?? 'Damaged')
                setNote(found?.reportedNote ?? '')
              }}
              options={reportableItems.map((i) => ({
                value: i.itemId,
                label: `${typeName(i)} · ${i.personal && i.bed ? t('Bed {bed}', { bed: i.bed }) : t('Shared')}${i.reportedCondition ? ` (${conditionName(i.reportedCondition)})` : ''}`,
              }))}
            />
          </Field>
          <Field label="Condition" required>
            <Select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              options={conditionOptions()}
            />
          </Field>
          <Field label="Note" helper={t('Describe what happened (optional). Choose Good to clear an existing declaration.')}>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder={t('e.g. Broken chair leg, missing locker key…')}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
