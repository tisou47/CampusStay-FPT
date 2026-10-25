import { useEffect, useState } from 'react'
import { Bed, Calendar, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, KeyRound, MapPin, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Alert, Avatar, Card, Facts, Note } from '@/components/ui/Display'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { typeName } from '@/lib/furniture'
import { formatDate, formatDateTime, formatVnd } from '@/lib/format'
import { StudentPage } from './shared'
import { t, tr, tx } from '@/i18n'

// SCR-ASG-01 My Room (Figma 39:1535)
// GET /students/me/allocation?termId → {
//   term: { name, stayStart, stayEnd, resultsPublishedAt },
//   allocation: { room, bed, block, blockLabel, floor, roomTypeName, roomClassName, amenities, allocatedAt, status } | null,
//   roommates: [{ name, bed }], roommateCapacity,
//   checkIn: { start, end, deskHours, location, checkedInAt } | null,
//   balance: { invoiceId, amount, status, dueAt, paidAt } | null,
//   application: { id, status } | null, rulesUrl }
// GET /students/me/door-code → { room, status (Ready, Not ready, Not set), note, changedAt } · POST /students/me/door-code/reveal
//   → { room, code, changedAt } (audited) · GET /students/me/furniture → { room, items: [{ assetCode, type, typeVi, status }] }

const SHOW_SECONDS = 30

/** The Room's door code (ADR-23): shown on request for a short time; every view is written to the Audit Log. */
function DoorCodeCard() {
  const query = useQuery(['door-code'], ({ signal }) => api.me.doorCode(undefined, { signal }))
  const [code, setCode] = useState(null)
  const reveal = useMutation(() => api.me.revealDoorCode(), { onSuccess: (res) => setCode(res.code), onError: () => {} })
  useEffect(() => {
    if (!code) return undefined
    const timer = setTimeout(() => setCode(null), SHOW_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [code])
  const d = query.data
  if (!d) return null
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-fg">{t('Door code')}</h2>
        <StatusTag status={d.status} />
      </div>
      {d.status === 'Ready' ? (
        <>
          {code ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle px-4 py-3">
              <span className="font-mono text-h1 font-semibold tracking-[0.3em] text-fg tabular">{code}</span>
              <Button variant="text" icon={EyeOff} onClick={() => setCode(null)}>
                Hide
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="lg" block icon={Eye} onClick={() => reveal.run()} disabled={reveal.pending}>
              Show door code
            </Button>
          )}
          {reveal.error && <Alert type="error" title="Could not show the code">{reveal.error.message}</Alert>}
          <p className="text-sm text-fg-tertiary">
            {t('Changed {date}. It changes whenever someone leaves the Room; never share it.', { date: formatDateTime(d.changedAt) })}
          </p>
        </>
      ) : (
        <InfoRow icon={KeyRound} label={t('Room {code}', { code: d.room })} value={tr(d.note)} />
      )}
    </Card>
  )
}

function FurnitureCard() {
  const query = useQuery(['my-furniture'], ({ signal }) => api.me.furniture(undefined, { signal }))
  const items = query.data?.items
  if (!items) return null
  // One line per type ("4 × Bed"); items that are not in use are named with their asset code.
  const groups = Object.values(
    items.reduce((acc, i) => {
      const name = typeName(i)
      ;(acc[name] ??= { name, items: [] }).items.push(i)
      return acc
    }, {}),
  )
  return (
    <Card padding="lg" className="flex shrink-0 flex-col gap-3">
      <h2 className="text-h3 font-semibold text-fg">{t('Furniture')}</h2>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.name} className="flex flex-col gap-1">
              <span className="text-base text-fg">{`${g.items.length} × ${g.name}`}</span>
              {g.items
                .filter((i) => i.status !== 'In use')
                .map((i) => (
                  <span key={i.assetCode} className="flex items-center gap-2 pl-4 text-sm text-fg-tertiary">
                    {i.assetCode}
                    <StatusTag status={i.status} />
                  </span>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-fg-secondary">{t('No furniture recorded in this Room.')}</p>
      )}
      <Note>Something broken? Report it from Requests so Staff can repair it.</Note>
    </Card>
  )
}

function InfoRow({ icon: Glyph, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Glyph size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <div className="flex flex-col">
        <span className="text-sm text-fg-tertiary">{tx(label)}</span>
        <span className="text-base font-medium text-fg">{tx(value)}</span>
      </div>
    </div>
  )
}

function MoreLink({ icon: Glyph, to, href, children }) {
  const classes = 'flex items-center gap-2.5 rounded-md py-2 text-base text-fg hover:text-fg-brand'
  const body = (
    <>
      <Glyph size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
      <span className="flex-1">{tx(children)}</span>
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
  const { allocation: a, roommates = [], checkIn, balance, term: tm } = data
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-1 lg:gap-4 lg:overflow-y-auto">
        <section className="flex shrink-0 flex-col items-start gap-1.5 rounded-xl border border-orange-200 bg-brand-subtle p-4 lg:flex-row lg:items-center lg:gap-6 lg:rounded-lg lg:px-6 lg:py-5">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-surface text-fg-brand lg:flex">
            <Bed size={28} aria-hidden="true" />
          </span>
          <StatusTag status={a.status ?? 'Allocated'} className="lg:hidden" />
          <div className="flex flex-col gap-1">
            <p className="text-h1 font-semibold text-fg">
              <span className="max-lg:hidden">{t('Room')} </span>
              {a.room} · {t('Bed {bed}', { bed: a.bed })}
            </p>
            <p className="text-base text-fg-secondary lg:text-lg">{[a.block, a.floor, a.roomTypeName, a.roomClassName].filter(Boolean).map(tr).join(' · ')}</p>
          </div>
        </section>

        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <h2 className="text-h3 font-semibold text-fg max-lg:hidden">{t('Details')}</h2>
          {tm && (
            <Facts
              className="lg:hidden"
              items={[
                ['Term', tm.name],
                ...(tm.stayStart ? [['Stay', `${formatDate(tm.stayStart)} – ${formatDate(tm.stayEnd)}`]] : []),
              ]}
            />
          )}
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
              ['Amenities', a.amenities?.length ? a.amenities.map(tr).join(', ') : '—'],
              ['Allocated on', formatDate(a.allocatedAt)],
            ]}
          />
        </Card>

        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 font-semibold text-fg">{t('Roommates')}</h2>
            {data.roommateCapacity != null && (
              <span className="text-sm text-fg-tertiary">
                {t('{n} of {total}', { n: roommates.length, total: data.roommateCapacity })}
              </span>
            )}
          </div>
          {roommates.length ? (
            <ul className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-4">
              {roommates.map((p) => (
                <li key={`${p.bed}-${p.name}`} className="flex min-w-0 items-center gap-3 py-1.5 lg:flex-1 lg:rounded-lg lg:border lg:border-line lg:bg-subtle lg:p-4">
                  <Avatar name={p.name} />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:flex-col lg:items-start lg:justify-start lg:gap-0">
                    <span className="truncate text-base font-medium text-fg">{p.name}</span>
                    <span className="shrink-0 text-sm text-fg-tertiary">{t('Bed {bed}', { bed: p.bed })}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-fg-secondary">{t('No roommates assigned yet.')}</p>
          )}
          <Note>Only names are shared. Contact details stay private; you meet your roommates at check-in.</Note>
        </Card>
        <FurnitureCard />
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-90 lg:gap-4 lg:overflow-y-auto">
        <DoorCodeCard />
        {checkIn && (
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Check-in')}</h2>
            {checkIn.checkedInAt ? (
              <InfoRow icon={Calendar} label="Checked in" value={formatDate(checkIn.checkedInAt)} />
            ) : (
              <>
                <InfoRow icon={Calendar} label="Window" value={`${formatDate(checkIn.start)} – ${formatDate(checkIn.end)}`} />
                {checkIn.deskHours && <InfoRow icon={Clock} label="Desk hours" value={checkIn.deskHours} />}
                {checkIn.location && <InfoRow icon={MapPin} label="Where" value={checkIn.location} />}
                <Alert type="info" title="Bring your QR pass">
                  {t('Open the CampusStay Android app to show your check-in QR pass.')}
                </Alert>
              </>
            )}
          </Card>
        )}

        {balance && (
          <Card padding="lg" className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{t('Balance')}</h2>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-h2 font-semibold text-fg">{formatVnd(balance.amount)}</p>
                <p className="text-sm text-fg-secondary">{balance.status === 'Paid' ? t('Paid {date}', { date: formatDate(balance.paidAt) }) : t('Due {date}', { date: formatDate(balance.dueAt) })}</p>
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
            {checkIn?.checkedInAt ? t('Request a room change') : t('Request a room change (after check-in)')}
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
  const tm = data?.term ?? term
  const description = tm ? `${tm.name}${tm.stayStart ? ` · ${formatDate(tm.stayStart)} – ${formatDate(tm.stayEnd)}` : ''}` : undefined

  return (
    <StudentPage
      title="My Room"
      badge={data?.allocation && <StatusTag status={data.allocation.status ?? 'Allocated'} />}
      badgeOnPhone={false}
      description={description}
    >
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
                {data.application ? t('View application') : t('Start application')}
              </Button>
            }
          >
            {t('The dormitory assigns your Room and Bed after review.')}
            {tm?.resultsPublishedAt ? ` ${t('Assignment results are published on {date}.', { date: formatDate(tm.resultsPublishedAt) })}` : ''}
          </EmptyBlock>
        </Card>
      ) : (
        <Room data={data} />
      )}
    </StudentPage>
  )
}
