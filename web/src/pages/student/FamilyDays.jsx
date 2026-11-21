import { HeartHandshake } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useQuery } from '@/api/hooks'
import { Note } from '@/components/ui/Display'
import { EmptyBlock, QueryState } from '@/components/ui/States'
import { StatusTag } from '@/components/ui/Tag'
import { formatDateTime, formatDateTimeRange, formatTime } from '@/lib/format'
import { t } from '@/i18n'
import { ActivitySwitch, StatusList, StatusRow, StudentPage } from './shared'
import { familyDayStatusLabel } from '@/lib/familyDayStatus'

// SCR-VIS-04 Family Days — Student (ADR-29, contract A-69): the Family Days of the Block the student lives in, and
// those they registered guests for. Families meet residents in a common area: never in the Rooms, never overnight.
// GET /students/me/family-days → { resident, items: [{ id, block, title, area, status, registrationOpensAt,
//   registrationClosesAt, startsAt, endsAt, registration: { status, slotId, slotStartsAt, slotEndsAt, guests } | null }] }

export default function FamilyDays() {
  const query = useQuery(['my-family-days'], ({ signal }) => api.me.familyDays(undefined, { signal }))
  return (
    <StudentPage
      title="Family Days"
      description="Invite your family to visit you in the common area of your block."
      width="lg:max-w-3xl"
      phoneTop={<ActivitySwitch current="family-days" />}
    >
      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyBlock icon={HeartHandshake} title="No Family Day yet">
            {query.data && !query.data.resident ? t('Family Days are for students who live in the dormitory.') : t('When a manager plans one for your block, you will be told.')}
          </EmptyBlock>
        }
      >
        {(data) => (
          <>
            <StatusList>
              {data.items.map((d) => (
                <StatusRow
                  key={d.id}
                  icon={HeartHandshake}
                  value={d.title}
                  note={[formatDateTimeRange(d.startsAt, d.endsAt), d.area].filter(Boolean).join(' · ')}
                  below={
                    <>
                      <StatusTag status={d.status}>{familyDayStatusLabel(d.status)}</StatusTag>
                      {d.registration && (
                        <span className="text-sm text-fg-secondary">
                          {d.registration.status === 'Approved'
                            ? t('{n} guests registered for {time}', { n: d.registration.guests, time: formatTime(d.registration.slotStartsAt) })
                            : t('Registration cancelled')}
                        </span>
                      )}
                    </>
                  }
                  to={`/student/family-days/${d.id}`}
                />
              ))}
            </StatusList>
            <Note>{t('Guests stay in the common area of the block. They may not enter the rooms or stay overnight.')}</Note>
          </>
        )}
      </QueryState>
    </StudentPage>
  )
}
