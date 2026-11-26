import { useState } from 'react'
import { Bed, FileText, History, LogOut, Package } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { cx } from '@/lib/cx'
import { formatDate, formatDateRange, formatDateTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { StudentPage } from './shared'
import { NextTermCard } from './room/NextTermCard'
import { StayActivityLogCard, StayContractCard } from './room/StayContractCard'
import { HandoverBanner } from './room/HandoverBanner'
import { BalanceCard, CheckInHeaderWidget, DoorCodeCard, LateCheckInCard, RoomQuickLinksCard } from './room/RoomAccessAndFinance'
import { FurnitureCard, RoomHeroCard } from './room/RoomHeroAndDetails'

function RoomSegmentedTabs({ items, value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label={t('My room')}
      className="flex w-full shrink-0 gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 scrollbar-none"
    >
      {items.map((item) => {
        const active = item.key === value
        const Glyph = item.icon
        return (
          <button
            key={item.key}
            id={`room-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`room-panel-${item.key}`}
            onClick={() => onChange(item.key)}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active ? 'bg-primary font-semibold text-fg-on-brand shadow-card' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
            )}
          >
            {Glyph && <Glyph size={16} aria-hidden="true" className={active ? 'text-fg-on-brand' : 'text-fg-tertiary'} />}
            <span>{item.label}</span>
            {item.count != null && (
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 text-sm font-semibold tabular',
                  active ? 'bg-surface/20 text-fg-on-brand' : 'bg-subtle text-fg-secondary',
                )}
              >
                {item.count}
              </span>
            )}
            {item.dot && !active && <span aria-hidden="true" className="size-2 rounded-full bg-warning" />}
          </button>
        )
      })}
    </div>
  )
}

function Room({ data }) {
  const { allocation: a, roommates = [], checkIn, balance, termination } = data
  const resident = a.status === 'Resident'
  const [tab, setTab] = useState('overview')
  const furnitureQuery = useQuery(['my-furniture'], ({ signal }) => api.me.furniture(undefined, { signal }))
  const furnitureItems = furnitureQuery.data?.items
  // Your bed's items and the shared ones (the roommates' personal sets are not yours).
  const furnitureCount = furnitureItems?.filter((i) => !i.personal || i.bed === a.bed).length

  const nextTermAttention = data.nextTerm?.state === 'Awaiting extension' || data.nextTerm?.fee?.status === 'Unpaid'

  const tabs = [
    { key: 'overview', label: t('Room details'), icon: Bed },
    { key: 'furniture', label: t('Furniture & equipment'), icon: Package, count: furnitureCount },
    { key: 'contract', label: t('Stay & next term'), icon: FileText, dot: nextTermAttention },
    { key: 'activity', label: t('Activity'), icon: History },
  ]

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <HandoverBanner />
      {!termination && data.nextTerm?.state === 'Not continuing' && (
        <Alert
          type="warning"
          title="Check-out period"
          action={
            <Button size="sm" variant="primary" icon={LogOut} to="/student/room/check-out">
              Open check-out
            </Button>
          }
          className="shrink-0"
        >
          {t('You do not continue next Term. Photograph every item and the meters, declare what is not Good, and submit before you check out at the desk.')}
        </Alert>
      )}
      {termination && (
        <Alert
          type="error"
          title={termination.status === 'Checked out' ? 'Stay ended' : 'Your stay is terminated'}
          action={
            <Button size="sm" variant="primary" icon={LogOut} to="/student/room/check-out">
              Open check-out
            </Button>
          }
          className="shrink-0"
        >
          {t('Reason: {reason}.', { reason: tr(termination.reason) })}
          {termination.note ? ' ' + termination.note : ''}
          {termination.status !== 'Checked out' && ' ' + t('Check out at the desk by {date}.', { date: formatDate(termination.moveOutBy) })}
        </Alert>
      )}
      {!resident && a.status === 'Assigned – unpaid' && (
        <Alert type="warning" title="Pay the balance to keep your bed" className="shrink-0">
          {t('Your bed is held until {date}. Unpaid by then, it is released and the deposit is kept.', { date: formatDateTime(balance?.dueAt) })}
        </Alert>
      )}

      <RoomSegmentedTabs items={tabs} value={tab} onChange={setTab} />
      {/* Each tab has its own layout: the main card on the left, what goes with it on the right. */}
      <div id={`room-panel-${tab}`} role="tabpanel" aria-labelledby={`room-tab-${tab}`} className="animate-fade-in lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5">
            <RoomHeroCard data={data} furnitureItems={furnitureItems} />
            <div className="flex flex-col gap-3">
              <DoorCodeCard />
              <BalanceCard balance={balance} />
              {!checkIn?.checkedInAt && !resident && <LateCheckInCard />}
              <RoomQuickLinksCard rulesUrl={data.rulesUrl} />
            </div>
          </div>
        )}
        {tab === 'furniture' && <FurnitureCard furnitureQuery={furnitureQuery} myBed={a.bed} />}
        {tab === 'contract' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start xl:gap-5">
            <StayContractCard data={data} />
            <NextTermCard data={data} />
          </div>
        )}
        {tab === 'activity' && <StayActivityLogCard data={data} />}
      </div>
    </div>
  )
}

export default function MyRoom() {
  const { term } = useSession()
  const query = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
  const checkOut = useQuery(['check-out-furniture', 'mine'], ({ signal }) => api.checkOutFurniture.mine(undefined, { signal }))
  const data = query.data
  const tm = data?.term ?? term
  const description = tm ? `${tm.name}${tm.stayStart ? ` · ${formatDateRange(tm.stayStart, tm.stayEnd)}` : ''}` : undefined

  return (
    <StudentPage
      title="My room"
      badge={data?.allocation && <StatusTag status={data.allocation.status ?? 'Allocated'} />}
      badgeOnPhone={false}
      description={description}
      actions={data?.checkIn ? <CheckInHeaderWidget checkIn={data.checkIn} /> : undefined}
    >
      {data === undefined && query.loading ? (
        <LoadingState />
      ) : data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !data.allocation ? (
        <Card padding="none" className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock
            icon={Bed}
            title="No room assigned yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="lg" to={data.application ? `/student/applications/${data.application.id}` : '/student/apply/term'} disabled={!data.application && !term?.registrationOpen}>
                  {data.application ? t('View application') : t('Start application')}
                </Button>
                {/* After a check-out the room is gone, but its record stays reachable. */}
                {checkOut.data?.checkedOutAt && (
                  <Button size="lg" icon={LogOut} to="/student/room/check-out">
                    Check-out
                  </Button>
                )}
              </div>
            }
          >
            {t('The dormitory assigns your room and bed after review.')}
            {tm?.resultsPublishedAt ? ` ${t('Assignment results are published on {date}.', { date: formatDate(tm.resultsPublishedAt) })}` : ''}
          </EmptyBlock>
        </Card>
      ) : (
        <Room data={data} />
      )}
    </StudentPage>
  )
}
