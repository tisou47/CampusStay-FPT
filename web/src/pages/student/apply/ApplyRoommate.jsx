import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { CircleCheck } from 'lucide-react'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useSession } from '@/app/session'
import { Button } from '@/components/ui/Button'
import { Radio, Switch } from '@/components/ui/Choice'
import { Alert, Card, Note } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Field'
import { Tag } from '@/components/ui/Tag'
import { WizardActions, WizardLayout, isTwoBed, useWizard } from './wizard'

// SCR-APP-01 Application Wizard – Roommate (2-bed only), states "code accepted" (15:811) and "code rejected" (33:1068).
// "Match me automatically" can add the free Roommate preferences service: the matcher then also weighs
// region, semester and major when it pairs the student with another 2-bed applicant.
// POST /applications/roommate-check { termId, studentCode } → { valid, checksLeft }
export default function ApplyRoommate() {
  const navigate = useNavigate()
  const { term } = useSession()
  const wizard = useWizard()
  const { draft, setDraft, catalog, roomType } = wizard
  const roommate = draft.roommate
  const [code, setCode] = useState(roommate.verifiedCode ?? roommate.code ?? '')
  const setRoommate = (patch) => setDraft((d) => ({ ...d, roommate: { ...d.roommate, ...patch } }))
  const check = useMutation((studentCode) => api.applications.checkRoommate({ termId: term?.id, studentCode }))

  if (catalog.data && !isTwoBed(roomType)) return <Navigate to="/student/apply/room" replace />

  const runCheck = async () => {
    const value = code.trim().toUpperCase()
    if (!value || roommate.checksLeft === 0) return
    try {
      const result = await check.run(value)
      setRoommate({ code: value, verifiedCode: result.valid ? value : null, rejected: !result.valid, checksLeft: result.checksLeft ?? null })
    } catch {
      // The error is shown under the field.
    }
  }

  const invite = roommate.mode === 'invite'
  const accepted = invite && roommate.verifiedCode && roommate.verifiedCode === code.trim().toUpperCase()
  const rejected = invite && roommate.rejected
  const options = catalog.data?.preferenceOptions ?? {}
  const prefs = roommate.preferences ?? {}
  const setPref = (key) => (e) => setRoommate({ preferences: { ...prefs, [key]: e.target.value } })
  const prefsComplete = !roommate.preferencesOn || ['region', 'semester', 'major'].every((k) => prefs[k])
  const canContinue = invite ? Boolean(accepted) : prefsComplete

  return (
    <WizardLayout
      wizard={wizard}
      stepKey="roommate"
      actions={<WizardActions backTo={wizard.prev('roommate')} onNext={() => navigate(wizard.next('roommate'))} nextDisabled={!canContinue} />}
    >
      <Card padding="lg" className="flex shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">Roommate</h2>
          <p className="text-base text-fg-secondary">2-bed Rooms only. Enter the student code of the person you want to share with, or let the dormitory match you.</p>
        </div>
        <div className="flex items-start gap-6" role="radiogroup" aria-label="Roommate">
          <Radio name="roommateMode" label="Invite a roommate" checked={invite} onChange={() => setRoommate({ mode: 'invite' })} />
          <Radio name="roommateMode" label="Match me automatically" checked={!invite} onChange={() => setRoommate({ mode: 'auto' })} />
        </div>

        {invite ? (
          <>
            <div className="flex items-start gap-3">
              <Field
                label="Roommate's student code"
                className="flex-1"
                error={
                  check.error
                    ? check.error.message
                    : rejected
                      ? 'This student code cannot be used. Check it and try again, or choose Match me automatically.'
                      : undefined
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    size="lg"
                    value={code}
                    invalid={rejected || Boolean(check.error)}
                    onChange={(e) => {
                      setCode(e.target.value)
                      if (roommate.rejected || roommate.verifiedCode) setRoommate({ rejected: false, verifiedCode: null })
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && runCheck()}
                    placeholder="e.g. SE190388"
                    autoComplete="off"
                  />
                )}
              </Field>
              <div className="pt-6.5">
                <Button size="lg" onClick={runCheck} disabled={check.pending || roommate.checksLeft === 0 || !code.trim()}>
                  {check.pending ? 'Checking…' : 'Check'}
                </Button>
              </div>
            </div>
            {accepted && (
              <p className="flex items-center gap-2 text-base text-success-fg">
                <CircleCheck size={16} aria-hidden="true" className="shrink-0 text-success" />
                Student code {roommate.verifiedCode} noted. The invitation is sent when you submit.
              </p>
            )}
            <Note>
              For privacy, we never show who a student code belongs to. Any code that cannot be used returns the same message.
              {roommate.checksLeft != null && ` ${roommate.checksLeft} ${roommate.checksLeft === 1 ? 'check' : 'checks'} left for this Application.`}
            </Note>
          </>
        ) : (
          <Note>The dormitory pairs you with another Student of the same gender who also chose a 2-bed Room.</Note>
        )}
      </Card>

      {!invite && (
        <Card padding="lg" className="flex shrink-0 flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-h3 font-semibold text-fg">Roommate preferences</h2>
                <Tag tone="success" dot={false}>
                  Free
                </Tag>
                <Tag dot={false}>Optional</Tag>
              </div>
              <p className="text-base text-fg-secondary">
                Add-on service for 2-bed Rooms: we look for a roommate who matches your preferences. They raise the match score; they are not guaranteed.
              </p>
            </div>
            <Switch
              aria-label="Use roommate preferences"
              checked={Boolean(roommate.preferencesOn)}
              onChange={(on) => setRoommate({ preferencesOn: on })}
            />
          </div>
          {roommate.preferencesOn && (
            <div className="flex items-start gap-4">
              <Field label="Region" className="flex-1">
                {(id) => <Select id={id} size="lg" value={prefs.region ?? ''} onChange={setPref('region')} options={[{ value: '', label: 'Choose…', disabled: true }, ...(options.region ?? [])]} />}
              </Field>
              <Field label="Semester" className="flex-1">
                {(id) => <Select id={id} size="lg" value={prefs.semester ?? ''} onChange={setPref('semester')} options={[{ value: '', label: 'Choose…', disabled: true }, ...(options.semester ?? [])]} />}
              </Field>
              <Field label="Major" className="flex-1">
                {(id) => <Select id={id} size="lg" value={prefs.major ?? ''} onChange={setPref('major')} options={[{ value: '', label: 'Choose…', disabled: true }, ...(options.major ?? [])]} />}
              </Field>
            </div>
          )}
        </Card>
      )}

      {invite && (
        <Alert type="info" title="How pairing works" className="shrink-0">
          After you submit, your roommate has a limited time to accept. Each of you pays your own deposit; both Applications reach the dormitory office
          together once both deposits are paid. If the invitation is declined or not answered, invite someone else or continue alone.
        </Alert>
      )}
    </WizardLayout>
  )
}
