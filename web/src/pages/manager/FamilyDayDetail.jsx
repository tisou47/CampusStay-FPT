import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Ban, ChartColumn, CheckCheck, DoorOpen, Pencil, Send, TriangleAlert, UserX, Users } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { KpiTile } from '@/components/ui/Charts'
import { Alert, Breadcrumb, Card, CardHeader, DescriptionList } from '@/components/ui/Display'
import { Field, SearchInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { Pagination } from '@/components/ui/Pagination'
import { QueryState, TableStatus } from '@/components/ui/States'
import { Table, TBody, THead, Td, Th, Tr, TwoLine } from '@/components/ui/Table'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { t, tr } from '@/i18n'
import { FamilyDayFormModal } from './familyDayForm'
import { guestStatusLabel, familyDayStatusLabel } from '@/lib/familyDayStatus'

// SCR-VIS-02 Family Day — Manager and Staff (ADR-29, contract A-69): the day, its time slots with places and who is
// inside, the registrations with their guests. Managers edit a Draft, publish, cancel (while no guest came in) and
// close it (after the time slots, nobody inside: guests who never came become No-shows); they also cancel one
// registration with a reason. Staff open the visitor desk from here.
// GET /family-days/:id → { id, block, title, description, area, status, registrationOpensAt, registrationClosesAt,
//   startsAt, endsAt, maxGuests, slots: [{ id, startsAt, endsAt, capacity, booked, remaining, inside, checkedOut,
//   noShow }], counts: { registrations, guests, notArrived, inside, overdue, checkedOut, noShow, cancelled },
//   createdBy, createdAt, publishedAt, cancelledAt, cancelReason, closedAt, closedBy, closeNote,
//   actions: { edit, publish, cancel, close } }
// GET /family-days/:id/registrations?slotId&q&page&pageSize → { items: [{ id, studentName, studentCode, room,
//   slotId, slotStartsAt, slotEndsAt, status, createdAt, cancelReason, guests: [{ id, fullName, relationship,
//   birthYear, status, overdue, checkedInAt, checkedOutAt }] }], total, guests }
// PUT /family-days/:id · POST /family-days/:id/publish · /cancel { reason } · /close { note }
// POST /family-day-registrations/:id/cancel { reason }

const slotLabel = (s) => `${formatDateTime(s.startsAt)} – ${formatTime(s.endsAt)}`

// Who cancelled a registration, when, and why: the student themself (no reason needed) or a Manager (a reason is
// required; cancelling the whole Family Day also cancels every registration with its reason).
function CancellationNote({ registration: r }) {
  const who = r.cancelledByStudent ? t('Cancelled by the student') : t('Cancelled by a Manager')
  return (
    <div className="mt-1 flex gap-2 rounded-md border border-line bg-subtle px-3 py-2 text-sm">
      <Ban size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium text-fg">{who}</p>
        {(r.cancelledBy || r.cancelledAt) && (
          <p className="text-fg-secondary">{[r.cancelledBy, r.cancelledAt && formatDateTime(r.cancelledAt)].filter(Boolean).join(' · ')}</p>
        )}
        {r.cancelReason ? (
          <p className="text-fg">{t('Reason: {reason}', { reason: r.cancelReason })}</p>
        ) : (
          r.cancelledByStudent && <p className="text-fg-secondary">{t('No reason needed when students cancel themselves.')}</p>
        )}
      </div>
    </div>
  )
}

function Registrations({ day, manager }) {
  const { notify } = useToast()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [cancelling, setCancelling] = useState(null)
  const [reason, setReason] = useState('')
  const filters = { q: q.trim() || undefined, page, pageSize }
  const query = useQuery(['family-day-registrations', day.id, filters], ({ signal }) => api.familyDays.registrations(day.id, filters, { signal }))
  const items = query.data?.items ?? []
  const cancel = useMutation(() => api.familyDays.cancelRegistration(cancelling.id, { reason: reason.trim() }), {
    invalidates: ['family-day-registrations', 'family-day'],
    onSuccess: () => {
      notify({ title: 'Registration cancelled', message: t('{name} was told and the passes no longer work.', { name: cancelling.studentName }) })
      setCancelling(null)
      setReason('')
    },
    onError: () => {},
  })
  const editable = day.status !== 'Cancelled' && day.status !== 'Completed' && day.status !== 'Draft'

  return (
    <Card padding="none" className="flex shrink-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h2 className="text-h3 font-semibold text-fg">{t('Registrations')}</h2>
        <SearchInput
          wrapperClassName="w-72"
          placeholder="Student, student code or guest"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
      </div>
      <Table>
        <THead>
          <tr>
            <Th className="w-56">Student</Th>
            <Th className="w-48">Time slot</Th>
            <Th>Guests</Th>
            <Th className="w-28">Status</Th>
            {manager && (
              <Th className="w-24">
                <span className="sr-only">{t('Actions')}</span>
              </Th>
            )}
          </tr>
        </THead>
        <TBody>
          <TableStatus query={query} colSpan={manager ? 5 : 4} emptyIcon={Users} emptyTitle="No registrations yet" />
          {items.map((r) => (
            <Tr key={r.id}>
              <Td>
                <TwoLine primary={r.studentName} secondary={[r.studentCode, r.room].filter(Boolean).join(' · ')} />
              </Td>
              <Td className="whitespace-nowrap">{slotLabel({ startsAt: r.slotStartsAt, endsAt: r.slotEndsAt })}</Td>
              <Td>
                <ul className="flex flex-col gap-1 py-1">
                  {r.guests.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-fg">{g.fullName}</span>
                      <span className="text-fg-secondary">
                        {tr(g.relationship)} · {g.birthYear}
                      </span>
                      <StatusTag status={g.overdue ? 'Overdue' : g.status}>{g.overdue ? t('Overdue') : guestStatusLabel(g.status)}</StatusTag>
                    </li>
                  ))}
                </ul>
                {r.status === 'Cancelled' && <CancellationNote registration={r} />}
              </Td>
              <Td>
                <StatusTag status={r.status} />
              </Td>
              {manager && (
                <Td>
                  {editable && r.status === 'Approved' && r.guests.every((g) => !g.checkedInAt) && (
                    <Button variant="text" onClick={() => setCancelling(r)}>
                      Cancel
                    </Button>
                  )}
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex justify-end p-3">
        <Pagination
          total={query.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      </div>

      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title={cancelling ? t('Cancel the registration of {name}', { name: cancelling.studentName }) : ''}
        footer={
          <>
            <Button onClick={() => setCancelling(null)}>Back</Button>
            <Button variant="danger" disabled={cancel.pending || !reason.trim()} onClick={() => cancel.run()}>
              {cancel.pending ? t('Saving…') : t('Cancel registration')}
            </Button>
          </>
        }
      >
        {cancel.error && <Alert type="error" title="Could not cancel">{cancel.error.message}</Alert>}
        <Field label="Why is it cancelled? The student sees this." required>
          {(id) => <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </Modal>
    </Card>
  )
}

export default function FamilyDayDetail() {
  const { id } = useParams()
  const { user } = useSession()
  const manager = user?.role === 'manager'
  const base = manager ? '/manager' : '/staff'
  const navigate = useNavigate()
  const { notify } = useToast()
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [closing, setClosing] = useState(false)
  const [text, setText] = useState('')

  const query = useQuery(['family-day', id], ({ signal }) => api.familyDays.get(id, { signal }))
  const day = query.data
  const done = (title, message) => () => {
    notify({ title, message })
    setEditing(false)
    setCancelling(false)
    setClosing(false)
    setText('')
  }
  const update = useMutation((body) => api.familyDays.update(id, body), { invalidates: ['family-day', 'family-days'], onSuccess: done('Draft saved'), onError: () => {} })
  const publish = useMutation(() => api.familyDays.publish(id), {
    invalidates: ['family-day', 'family-days'],
    onSuccess: done('Family Day published', "The Block's residents were told and can register their guests."),
    onError: () => {},
  })
  const cancel = useMutation(() => api.familyDays.cancel(id, { reason: text.trim() }), {
    invalidates: ['family-day', 'family-days', 'family-day-registrations'],
    onSuccess: done('Family Day cancelled', 'Every pass stopped working and the students who registered were told.'),
    onError: () => {},
  })
  const close = useMutation(() => api.familyDays.close(id, { note: text.trim() || null }), {
    invalidates: ['family-day', 'family-days', 'family-day-registrations'],
    onSuccess: done('Family Day closed', 'The counts are final; guests who never came are No-shows.'),
    onError: () => {},
  })

  return (
    <QueryState query={query} isEmpty={() => false}>
      {() => (
        <>
          <PageHeader
            breadcrumb={<Breadcrumb items={[{ label: 'Family Days', to: `${base}/family-days` }, { label: day.title }]} />}
            title={day.title}
            badge={<StatusTag status={day.status}>{familyDayStatusLabel(day.status)}</StatusTag>}
            description={t('Block {block} · {area}', { block: day.block, area: day.area })}
            actions={
              <>
                {day.status !== 'Draft' && day.status !== 'Cancelled' && (
                  <Button icon={ChartColumn} onClick={() => navigate(`${base}/family-day-stats/${day.id}`)}>
                    Statistics
                  </Button>
                )}
                {day.status !== 'Draft' && day.status !== 'Cancelled' && (
                  <Button icon={DoorOpen} onClick={() => navigate(`${base}/family-days/${day.id}/desk`)}>
                    Visitor desk
                  </Button>
                )}
                {day.actions.edit && (
                  <Button icon={Pencil} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )}
                {day.actions.cancel && (
                  <Button variant="danger-text" icon={Ban} onClick={() => setCancelling(true)}>
                    Cancel Family Day
                  </Button>
                )}
                {day.actions.close && (
                  <Button variant="primary" icon={CheckCheck} onClick={() => setClosing(true)}>
                    Close Family Day
                  </Button>
                )}
                {day.actions.publish && (
                  <Button variant="primary" icon={Send} disabled={publish.pending} onClick={() => publish.run()}>
                    {publish.pending ? t('Publishing…') : t('Publish')}
                  </Button>
                )}
              </>
            }
          />

          {publish.error && <Alert type="error" title="Could not publish">{publish.error.message}</Alert>}
          {day.status === 'Cancelled' && <Alert type="warning" title="Cancelled">{day.cancelReason}</Alert>}
          {day.counts.overdue > 0 && (
            <Alert type="warning" title={t('{n} guests are still inside after their time slot', { n: day.counts.overdue })}>
              {t('Find them, then check them out at the visitor desk.')}
            </Alert>
          )}

          <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiTile size="md" icon={Users} label="Guests registered" value={formatNumber(day.counts.guests)} note={t('{n} students', { n: formatNumber(day.counts.registrations) })} />
            <KpiTile size="md" icon={DoorOpen} label="Inside now" value={formatNumber(day.counts.inside)} />
            <KpiTile size="md" icon={TriangleAlert} label="Overdue" value={formatNumber(day.counts.overdue)} valueTone={day.counts.overdue ? 'error' : undefined} note="Inside after their time slot" />
            <KpiTile size="md" icon={CheckCheck} label="Left" value={formatNumber(day.counts.checkedOut)} />
            <KpiTile size="md" icon={UserX} label="No-shows" value={formatNumber(day.counts.noShow)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <Card>
              <CardHeader title="Details" />
              <DescriptionList
                items={[
                  ['Registration', `${formatDateTime(day.registrationOpensAt)} – ${formatDateTime(day.registrationClosesAt)}`],
                  ['Guests per student', formatNumber(day.maxGuests)],
                  ['Created by', `${day.createdBy ?? '—'} · ${formatDateTime(day.createdAt)}`],
                  day.publishedAt && ['Published', formatDateTime(day.publishedAt)],
                  day.closedAt && ['Closed', [formatDateTime(day.closedAt), day.closedBy, day.closeNote].filter(Boolean).join(' · ')],
                  day.description && ['Description', day.description],
                ].filter(Boolean)}
              />
            </Card>
            <Card padding="none">
              <div className="p-4">
                <h2 className="text-h3 font-semibold text-fg">{t('Time slots')}</h2>
              </div>
              <Table>
                <THead>
                  <tr>
                    <Th>Time slot</Th>
                    <Th align="right">Places taken</Th>
                    <Th align="right">Inside</Th>
                    <Th align="right">Left</Th>
                    <Th align="right">No-shows</Th>
                  </tr>
                </THead>
                <TBody>
                  {day.slots.map((s) => (
                    <Tr key={s.id}>
                      <Td className="whitespace-nowrap">{slotLabel(s)}</Td>
                      <Td align="right">
                        {t('{booked} / {capacity}', { booked: formatNumber(s.booked), capacity: formatNumber(s.capacity) })}
                        {s.remaining === 0 && (
                          <Tag tone="warning" className="ml-2">
                            Full
                          </Tag>
                        )}
                      </Td>
                      <Td align="right">{formatNumber(s.inside)}</Td>
                      <Td align="right">{formatNumber(s.checkedOut)}</Td>
                      <Td align="right">{formatNumber(s.noShow)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>

          {day.status !== 'Draft' && <Registrations day={day} manager={manager} />}

          {editing && (
            <FamilyDayFormModal open day={day} onClose={() => setEditing(false)} onSave={(body) => update.run(body)} saving={update.pending} error={update.error} />
          )}

          <Modal
            open={cancelling}
            onClose={() => setCancelling(false)}
            title="Cancel the Family Day"
            footer={
              <>
                <Button onClick={() => setCancelling(false)}>Back</Button>
                <Button variant="danger" disabled={cancel.pending || !text.trim()} onClick={() => cancel.run()}>
                  {cancel.pending ? t('Saving…') : t('Cancel Family Day')}
                </Button>
              </>
            }
          >
            {cancel.error && <Alert type="error" title="Could not cancel">{cancel.error.message}</Alert>}
            <Alert type="warning" title="What happens">
              {t('Every registration is cancelled and every pass stops working. The students who registered guests are told with your reason.')}
            </Alert>
            <Field label="Why is it cancelled?" required>
              {(fid) => <Textarea id={fid} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />}
            </Field>
          </Modal>

          <Modal
            open={closing}
            onClose={() => setClosing(false)}
            title="Close the Family Day"
            footer={
              <>
                <Button onClick={() => setClosing(false)}>Back</Button>
                <Button variant="primary" disabled={close.pending} onClick={() => close.run()}>
                  {close.pending ? t('Saving…') : t('Close Family Day')}
                </Button>
              </>
            }
          >
            {close.error && <Alert type="error" title="Could not close">{close.error.message}</Alert>}
            <p className="text-base text-fg-secondary">
              {t('{out} guests came and left; {noShow} guests who never came will be recorded as No-shows.', {
                out: formatNumber(day.counts.checkedOut),
                noShow: formatNumber(day.counts.notArrived + day.counts.noShow),
              })}
            </p>
            <Field label="Note for the report">
              {(fid) => <Textarea id={fid} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />}
            </Field>
          </Modal>
        </>
      )}
    </QueryState>
  )
}
