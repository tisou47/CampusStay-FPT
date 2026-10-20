import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, CircleCheck, CircleX, Clock, FileText, X } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation, useQuery } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { PageHeader } from '@/components/layout/BackOfficeLayout'
import { Button } from '@/components/ui/Button'
import { Breadcrumb, Card, Facts } from '@/components/ui/Display'
import { Textarea } from '@/components/ui/Field'
import { EmptyBlock, ErrorState, LoadingState } from '@/components/ui/States'
import { StatusTag, Tag } from '@/components/ui/Tag'
import { formatDateTime, formatVnd } from '@/lib/format'
import { useRoleBase } from '@/lib/useRoleBase'

// SCR-APP-11 Application Review (Figma 22:732)
// GET /applications/:id (back-office view) → { id, status, termName,
//   student: { name, studentCode, gender, cohort, major, hometown, phone, emergencyContact, syncedAt },
//   roomTypeName, roomClassName, surchargeRate, termPrice, roommate: { mode, studentCode, status } | null, pair,
//   eligibility: [{ title, passed }], deposit: { invoiceId, amount, method, paidAt, status } | null, activity: [{ text, at }] }
// POST /applications/:id/review { decision, note }

const v = (x) => x ?? '—'

function Review({ app }) {
  const navigate = useNavigate()
  const base = useRoleBase()
  const { notify, notifyError } = useToast()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const s = app.student ?? {}
  const decided = !['Submitted', 'Under Review'].includes(app.status)
  const passed = (app.eligibility ?? []).filter((c) => c.passed).length

  const review = useMutation((decision) => api.applications.review(app.id, { decision, note: note.trim() || undefined }), {
    invalidates: ['applications', 'dashboard'],
    onSuccess: (_, decision) => {
      notify({
        type: decision === 'Approved' ? 'success' : 'info',
        title: `${app.id} ${decision.toLowerCase()}`,
        message: decision === 'Approved' ? `${s.name} joins the next assignment run.` : `${s.name} is notified with your note. The deposit refund follows the refund rules.`,
      })
      navigate(`${base}/applications`)
    },
    onError: (e) => notifyError(e, 'Could not save the decision'),
  })

  const decide = (decision) => {
    if (decision === 'Rejected' && !note.trim()) {
      setNoteError('Add a note before rejecting. The student sees this note.')
      return
    }
    review.run(decision)
  }

  const roommate = app.roommate?.mode === 'invite' ? `Pair · ${app.roommate.studentCode}${app.roommate.status ? ` (${app.roommate.status.toLowerCase()})` : ''}` : 'Matched automatically'

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Applications', to: `${base}/applications` }, { label: app.id }]} />}
        title={`${app.id} · ${v(s.name)}`}
        badge={<StatusTag status={app.status} />}
        actions={
          <>
            <Button to={`${base}/applications`}>Back to queue</Button>
            <Button variant="danger" icon={X} onClick={() => decide('Rejected')} disabled={decided || review.pending}>
              Reject
            </Button>
            <Button variant="primary" icon={Check} onClick={() => decide('Approved')} disabled={decided || review.pending}>
              Approve
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 items-stretch gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-h3 font-semibold text-fg">Student</h2>
              {s.syncedAt && <span className="text-sm text-fg-tertiary">From FPT student records · synced {formatDateTime(s.syncedAt)}</span>}
            </div>
            <Facts
              dense
              items={[
                ['Full name', v(s.name)],
                ['Student code', v(s.studentCode)],
                ['Gender', v(s.gender)],
                ['Cohort', v(s.cohort)],
              ]}
            />
            <Facts
              dense
              items={[
                ['Major', v(s.major)],
                ['Hometown', v(s.hometown)],
                ['Phone', v(s.phone)],
                ['Emergency contact', v(s.emergencyContact)],
              ]}
            />
          </Card>

          <Card className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">Room preference</h2>
            <Facts
              dense
              items={[
                ['Room Type', v(app.roomTypeName)],
                ['Room Class', app.roomClassName ? `${app.roomClassName}${app.surchargeRate != null ? ` (+${Math.round(app.surchargeRate * 100)}%)` : ''}` : '—'],
                ['Roommate', roommate],
                ['Term price per Bed', formatVnd(app.termPrice)],
              ]}
            />
          </Card>

          <Card className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-h3 font-semibold text-fg">Eligibility checks</h2>
              {app.eligibility?.length > 0 && (
                <Tag tone={passed === app.eligibility.length ? 'success' : 'error'}>
                  {passed} of {app.eligibility.length} passed
                </Tag>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-3">
              {(app.eligibility ?? []).map((c) => (
                <li key={c.title} className="flex items-center gap-2 text-base text-fg">
                  {c.passed ? <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" /> : <CircleX size={16} aria-hidden="true" className="shrink-0 text-error" />}
                  {c.title}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex w-90 shrink-0 flex-col gap-4 overflow-y-auto">
          <Card className="flex shrink-0 flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">Deposit</h2>
            {app.deposit ? (
              <>
                {[
                  ['Invoice', app.deposit.invoiceId],
                  ['Amount', <span className="font-medium">{formatVnd(app.deposit.amount)}</span>],
                  ['Method', v(app.deposit.method)],
                  ['Paid at', formatDateTime(app.deposit.paidAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-base">
                    <span className="text-fg-secondary">{label}</span>
                    <span className="text-fg">{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-base">
                  <span className="text-fg-secondary">Status</span>
                  <StatusTag status={app.deposit.status} />
                </div>
              </>
            ) : (
              <p className="text-base text-fg-secondary">No deposit Invoice yet.</p>
            )}
          </Card>

          <Card className="flex min-h-40 flex-1 flex-col gap-3">
            <h2 className="shrink-0 text-h3 font-semibold text-fg">Activity</h2>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {(app.activity ?? []).map((a) => (
                <div key={`${a.at}-${a.text}`} className="flex items-start gap-3">
                  <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
                  <div className="flex flex-col">
                    <span className="text-base text-fg">{a.text}</span>
                    <span className="text-sm text-fg-tertiary">{formatDateTime(a.at)}</span>
                  </div>
                </div>
              ))}
              {!app.activity?.length && <p className="text-base text-fg-secondary">No activity yet.</p>}
            </div>
          </Card>

          <Card className="flex shrink-0 flex-col gap-2">
            <h2 className="text-h3 font-semibold text-fg">Decision note</h2>
            <Textarea
              rows={2}
              placeholder="Add a note…"
              value={note}
              invalid={Boolean(noteError)}
              disabled={decided}
              onChange={(e) => {
                setNote(e.target.value)
                setNoteError('')
              }}
              aria-label="Decision note"
            />
            <p className={noteError ? 'text-sm text-error-fg' : 'text-sm text-fg-tertiary'}>{noteError || 'Required when rejecting. The student sees this note.'}</p>
          </Card>
        </div>
      </div>
    </>
  )
}

export default function ApplicationReview() {
  const { id } = useParams()
  const base = useRoleBase()
  const query = useQuery(['applications', id], ({ signal }) => api.applications.get(id, { signal }))
  if (query.data) return <Review app={query.data} />
  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb items={[{ label: 'Applications', to: `${base}/applications` }, { label: id }]} />} title={id} />
      {query.loading ? (
        <LoadingState />
      ) : query.error?.status === 404 ? (
        <EmptyBlock icon={FileText} title="Application not found" action={<Button to={`${base}/applications`}>Back to queue</Button>} />
      ) : (
        <ErrorState error={query.error} onRetry={query.reload} />
      )}
    </>
  )
}
