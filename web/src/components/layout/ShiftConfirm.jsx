import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { setShiftConfirmer } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { t, tr } from '@/i18n'

/**
 * Asks a Staff member to confirm a change made outside their shift or outside the work a Manager gave them
 * (428 SHIFT_CONFIRM_REQUIRED). Confirming sends the change again; the API records it and marks it for the Managers.
 */
export function ShiftConfirmHost() {
  const [ask, setAsk] = useState(null)
  const resolver = useRef(null)

  useEffect(() => {
    setShiftConfirmer(
      (details) =>
        new Promise((resolve) => {
          resolver.current = resolve
          setAsk(details)
        }),
    )
    return () => setShiftConfirmer(null)
  }, [])

  const answer = (ok) => {
    resolver.current?.(ok)
    resolver.current = null
    setAsk(null)
  }

  if (!ask) return null
  return (
    <Modal
      open
      onClose={() => answer(false)}
      icon={Clock}
      width={520}
      title={ask.outOfShift && ask.roleMismatch ? 'Outside your shift and your work' : ask.outOfShift ? 'Outside your shift' : 'Not your assigned work'}
      footer={
        <>
          <Button onClick={() => answer(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => answer(true)}>
            Confirm and continue
          </Button>
        </>
      }
    >
      <Alert type="warning">{ask.message}</Alert>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-fg-secondary">
        {ask.outOfShift && <li>{ask.shiftToday ? t('Your shifts today: {spans}.', { spans: ask.shiftToday }) : t('You have no shift now. Ask your Manager to set your shifts.')}</li>}
        {ask.roleMismatch && ask.handle && <li>{t('This is {kind} work, which your Manager has not given you.', { kind: tr(ask.handle) })}</li>}
        <li>{t('Your Manager sees this action marked in the staff activity log.')}</li>
      </ul>
    </Modal>
  )
}
