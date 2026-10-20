import { Bed, Calendar, ChevronRight, Clock, CreditCard, ExternalLink, MapPin, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar, Card, Facts, Note } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatDate, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'

// SCR-ASG-01 My Room (Figma 39:1535)
// GET /students/me/allocation?termId → {
//   term: { name, stayStart, stayEnd, resultsPublishedAt },
//   allocation: { room, bed, block, blockLabel, floor, roomTypeName, roomClassName, amenities, allocatedAt, status } | null,
//   roommates: [{ name, bed }], roommateCapacity,
//   checkIn: { start, end, deskHours, location, checkedInAt } | null,
//   balance: { invoiceId, amount, status, dueAt, paidAt } | null,
//   application: { id, status } | null, rulesUrl }

function InfoRow({ icon: Glyph, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Glyph size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <div className="flex flex-col">
        <span className="text-sm text-fg-tertiary">{label}</span>
        <span className="text-base font-medium text-fg">{value}</span>
      </div>
    </div>
  )
}

function MoreLink({ icon: Glyph, to, href, children }) {
  const classes = 'flex items-center gap-2.5 rounded-md py-2 text-base text-fg hover:text-fg-brand'
  const body = (
    <>
      <Glyph size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
      <span className="flex-1">{children}</span>
      {href ? <ExternalLink size={16} aria-hidden="true" className="text-fg-secondary" /> : <ChevronRight size={16} aria-hidden="true" className="text-fg-secondary" />}
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <Link to={to} className={classes}>
      {body}
    </Link>
  )
}

function Room({ data }) {
  const { allocation: a, roommates = [], checkIn, balance } = data
  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <section className="flex shrink-0 items-center gap-6 rounded-lg border border-orange-200 bg-brand-subtle px-6 py-5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand">
            <Bed size={28} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-h1 font-semibold text-fg">
              Room {a.room} · Bed {a.bed}
            </p>
            <p className="text-lg text-fg-secondary">{[a.block, a.floor, a.roomTypeName, a.roomClassName].filter(Boolean).join(' · ')}</p>
          </div>
        </section>

        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <h2 className="text-h3 font-semibold text-fg">Details</h2>
          <Facts
            items={[
              ['Block', a.blockLabel ?? a.block ?? '—'],
              ['Floor', a.floor ?? '—'],
              ['Room Type', a.roomTypeName ?? '—'],
            ]}
          />
          <Facts
            items={[
              ['Room Class', a.roomClassName ?? '—'],
              ['Amenities', a.amenities?.length ? a.amenities.join(', ') : '—'],
              ['Allocated on', formatDate(a.allocatedAt)],
            ]}
          />
        </Card>

        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 font-semibold text-fg">Roommates</h2>
            {data.roommateCapacity != null && (
              <span className="text-sm text-fg-tertiary">
                {roommates.length} of {data.roommateCapacity}
              </span>
            )}
          </div>
          {roommates.length ? (
            <ul className="flex items-stretch gap-4">
              {roommates.map((p) => (
                <li key={`${p.bed}-${p.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-subtle p-4">
                  <Avatar name={p.name} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-medium text-fg">{p.name}</span>
                    <span className="text-sm text-fg-tertiary">Bed {p.bed}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-fg-secondary">No roommates assigned yet.</p>
          )}
          <Note>Only names are shared. Contact details stay private; you meet your roommates at check-in.</Note>
        </Card>
      </div>

      <div className="flex w-90 shrink-0 flex-col gap-4 overflow-y-auto">
        {checkIn && (
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">Check-in</h2>
            {checkIn.checkedInAt ? (
              <InfoRow icon={Calendar} label="Checked in" value={formatDate(checkIn.checkedInAt)} />
            ) : (
              <>
                <InfoRow icon={Calendar} label="Window" value={`${formatDate(checkIn.start)} – ${formatDate(checkIn.end)}`} />
                {checkIn.deskHours && <InfoRow icon={Clock} label="Desk hours" value={checkIn.deskHours} />}
                {checkIn.location && <InfoRow icon={MapPin} label="Where" value={checkIn.location} />}
                <Alert type="info" title="Bring your QR pass">
                  Open the CampusStay Android app to show your check-in QR pass.
                </Alert>
              </>
            )}
          </Card>
        )}

        {balance && (
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">Balance</h2>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-h2 font-semibold text-fg">{formatVnd(balance.amount)}</p>
                <p className="text-sm text-fg-secondary">{balance.status === 'Paid' ? `Paid ${formatDate(balance.paidAt)}` : `Due ${formatDate(balance.dueAt)}`}</p>
              </div>
              <StatusTag status={balance.status} />
            </div>
            {balance.status === 'Paid' ? (
              <Button size="lg" block to="/student/invoices">
                View invoices
              </Button>
            ) : (
              <Button variant="primary" size="lg" block icon={CreditCard} to={`/student/invoices/${balance.invoiceId}/pay`}>
                Pay balance
              </Button>
            )}
          </Card>
        )}

        <Card padding="sm" className="flex shrink-0 flex-col gap-1">
          {data.rulesUrl && (
            <MoreLink icon={Bed} href={data.rulesUrl}>
              Dormitory rules
            </MoreLink>
          )}
          <MoreLink icon={Repeat} to="/student/requests/room-change/new">
            Request a room change{checkIn?.checkedInAt ? '' : ' (after check-in)'}
          </MoreLink>
          <MoreLink icon={Users} to="/student/requests/swap/new">
            Swap Rooms with another Student
          </MoreLink>
        </Card>
      </div>
    </div>
  )
}

export default function MyRoom() {
  const { term } = useSession()
  const query = useQuery(['allocation', term?.id], ({ signal }) => api.me.allocation({ termId: term?.id }, { signal }))
  const data = query.data
  const t = data?.term ?? term
  const description = t ? `${t.name}${t.stayStart ? ` · ${formatDate(t.stayStart)} – ${formatDate(t.stayEnd)}` : ''}` : undefined

  return (
    <StudentPage title="My Room" badge={data?.allocation && <StatusTag status={data.allocation.status ?? 'Allocated'} />} description={description}>
      {data === undefined && query.loading ? (
        <LoadingState />
      ) : data === undefined ? (
        <ErrorState error={query.error} onRetry={query.reload} />
      ) : !data.allocation ? (
        <Card padding="none" className="flex min-h-0 flex-1 flex-col">
          <EmptyBlock
            icon={Bed}
            title="No Room assigned yet"
            action={
              <Button variant="primary" size="lg" to={data.application ? `/student/applications/${data.application.id}` : '/student/apply/term'}>
                {data.application ? 'View application' : 'Start application'}
              </Button>
            }
          >
            The dormitory assigns your Room and Bed after review.{t?.resultsPublishedAt ? ` Assignment results are published on ${formatDate(t.resultsPublishedAt)}.` : ''}
          </EmptyBlock>
        </Card>
      ) : (
        <Room data={data} />
      )}
    </StudentPage>
  )
}
