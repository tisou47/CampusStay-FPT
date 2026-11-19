import { useState } from 'react'
import { Bed, KeyRound, Package } from 'lucide-react'
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
import { FurnitureCard, RoomHeroCard, RoommatesCard } from './room/RoomHeroAndDetails'

function RoomSegmentedTabs({ items, value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label={t('My room')}
      className="flex w-full shrink-0 gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface p-1.5 sm:w-fit scrollbar-none"
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
              'flex items-center gap-2 rounded-lg px-4 py-2 text-base font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
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
  const furnitureCount = furnitureItems?.length

  const hasContractAttention =
    (balance && balance.status !== 'Paid') ||
    data.nextTerm?.state === 'Awaiting extension' ||
    data.nextTerm?.fee?.status === 'Unpaid'

  const tabs = [
    { key: 'overview', label: t('Room overview'), icon: Bed },
    { key: 'furniture', label: t('Furniture & equipment'), icon: Package, count: furnitureCount },
    { key: 'contract', label: t('Contract & utilities'), icon: KeyRound, dot: hasContractAttention },
  ]

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <HandoverBanner />
      {termination && (
        <Alert type="error" title={termination.status === 'Checked out' ? 'Stay ended' : 'Your stay is terminated'} className="shrink-0">
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

      {/* Tab 1: Room overview */}
      {tab === 'overview' && (
        <div
          id="room-panel-overview"
          role="tabpanel"
          aria-labelledby="room-tab-overview"
          className="grid animate-fade-in grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-start lg:gap-6 lg:overflow-y-auto"
        >
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-7 xl:col-span-8">
            <RoomHeroCard data={data} furnitureItems={furnitureItems} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5 xl:col-span-4">
            <RoommatesCard roommates={roommates} capacity={data.roommateCapacity} roomCode={a.room} />
            <RoomQuickLinksCard rulesUrl={data.rulesUrl} />
          </div>
        </div>
      )}

      {/* Tab 2: Furniture & equipment */}
      {tab === 'furniture' && (
        <div
          id="room-panel-furniture"
          role="tabpanel"
          aria-labelledby="room-tab-furniture"
          className="flex animate-fade-in flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden"
        >
          <FurnitureCard furnitureQuery={furnitureQuery} />
        </div>
      )}

      {/* Tab 3: Contract & utilities */}
      {tab === 'contract' && (
        <div
          id="room-panel-contract"
          role="tabpanel"
          aria-labelledby="room-tab-contract"
          className="grid animate-fade-in grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-start lg:gap-6 lg:overflow-y-auto"
        >
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
            <StayContractCard data={data} />
            <StayActivityLogCard data={data} />
            <NextTermCard data={data} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
            <BalanceCard balance={balance} />
            <DoorCodeCard />
            {!checkIn?.checkedInAt && !resident && <LateCheckInCard />}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MyRoom() {
  const { term } = useSession()
  const query = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
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
              <Button variant="primary" size="lg" to={data.application ? `/student/applications/${data.application.id}` : '/student/apply/term'}>
                {data.application ? t('View application') : t('Start application')}
              </Button>
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
