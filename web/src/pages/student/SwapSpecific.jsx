import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api/endpoints'
import { useMutation } from '@/api/hooks'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { StudentPage } from './shared'
import { SwapModePicker, YourRoomNow } from './swap'

// SCR-REQ-03 Room Swap – Specific Student (Figma 104:2080)
// POST /swaps { studentCode, reason } → { id }
const rules = [
  'Same gender, both checked in this Term',
  'No overdue Invoices for either Student',
  'Any price difference is invoiced or refunded for the rest of the Term',
  'Your partner must accept before the invitation expires',
]

export default function SwapSpecific() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  const send = useMutation(() => api.swaps.create({ studentCode: code.trim().toUpperCase(), reason: reason.trim() || undefined }), {
    invalidates: ['requests'],
    onSuccess: () => {
      notify({ title: 'Swap invitation sent', message: 'If the code is eligible, they get your invitation.' })
      navigate('/student/requests?tab=swaps')
    },
    onError: () => {},
  })

  return (
    <StudentPage breadcrumb={[{ label: 'Requests', to: '/student/requests' }, { label: 'Room swap' }]} title="Swap your Room">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card padding="lg" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <SwapModePicker value="specific" />
            {send.error && (
              <Alert type="error" title="This swap cannot be requested">
                {send.error.message}
              </Alert>
            )}
            <Field label="Student code of the person you swap with" helper="For privacy we never show who the code belongs to.">
              {(id) => <Input id={id} size="lg" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SE190702" autoComplete="off" />}
            </Field>
            <Field label="Reason (optional)">{(id) => <Input id={id} size="lg" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            <p className="text-base font-medium text-fg">Rules checked after you send</p>
            <ul className="flex flex-col gap-2">
              {rules.map((rule) => (
                <li key={rule} className="flex gap-2.5 text-base text-fg-secondary">
                  <span aria-hidden="true">•</span>
                  {rule}
                </li>
              ))}
            </ul>
            <Alert type="info" title="One message for every problem">
              If the code cannot be used for any reason, you see the same message: “This swap cannot be requested. Check the code or try the swap board.”
            </Alert>
          </Card>
          <div className="flex shrink-0 justify-end gap-3">
            <Button size="lg" to="/student/room">
              Cancel
            </Button>
            <Button variant="primary" size="lg" onClick={() => send.run()} disabled={!code.trim() || send.pending}>
              {send.pending ? 'Sending…' : 'Send swap invitation'}
            </Button>
          </div>
        </div>
        <YourRoomNow />
      </div>
    </StudentPage>
  )
}
