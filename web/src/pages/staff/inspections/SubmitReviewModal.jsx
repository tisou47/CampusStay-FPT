import { useState } from 'react'
import { useQuery } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Choice'
import { Alert } from '@/components/ui/Display'
import { Modal } from '@/components/ui/Overlay'
import { QueryState } from '@/components/ui/States'
import { Tag } from '@/components/ui/Tag'
import { formatNumber } from '@/lib/format'
import { conditionName, conditionTone, typeName } from '@/lib/furniture'
import { t, tr } from '@/i18n'
import { fetchAllRunRooms } from './inspectionPrint'

export function SubmitReviewModal({ run, onClose, onSubmit, pending }) {
  const [committed, setCommitted] = useState(false)
  // Every Room of the run, not only the first page (WEB-OPS-22).
  const all = useQuery(['inspections', 'rooms', run.id, 'review'], () => fetchAllRunRooms(run.id))
  const rooms = all.data ?? []
  const notDone = rooms.filter((r) => r.status === 'To do' || r.status === 'In progress')
  const noMeters = rooms.filter((r) => r.metersNeeded && r.status !== 'Not reachable' && !r.meters)
  const unreachable = rooms.filter((r) => r.status === 'Not reachable')
  const found = rooms.flatMap((r) =>
    (r.results ?? [])
      .filter((x) => x.condition === 'Damaged' || x.condition === 'Missing' || x.result === 'Fail')
      .map((x) => {
        const check = (r.checks ?? []).find((c) => c.id === x.itemId)
        const item = run.checklist?.items?.find((i) => String(i.id) === String(x.itemId))
        return {
          room: r.room,
          label: check ? `${typeName(check)} · ${check.assetCode}` : tr(item?.label) ?? x.itemId,
          condition: x.condition,
          result: x.result,
          note: x.note,
        }
      }),
  )
  const blocking = notDone.length > 0 || noMeters.length > 0

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title="Review before sending"
      description="Check the results of every Room. Once sent, they cannot be changed: Rooms not visited move to the next run and the record of each Room is what new residents' inventories are compared with."
      footer={
        <>
          <Button onClick={onClose}>Back to the Rooms</Button>
          <Button variant="primary" disabled={!committed || pending || all.loading} onClick={onSubmit}>
            Send results
          </Button>
        </>
      }
    >
      <QueryState query={all} compact>
        {() => (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-subtle p-3">
                <p className="text-h3 font-semibold text-fg tabular">
                  {formatNumber(rooms.length - notDone.length - unreachable.length)}
                </p>
                <p className="text-xs text-fg-secondary">{t('Rooms inspected')}</p>
              </div>
              <div className="rounded-lg bg-subtle p-3">
                <p className="text-h3 font-semibold text-fg tabular">{formatNumber(notDone.length)}</p>
                <p className="text-xs text-fg-secondary">{t('Rooms not finished')}</p>
              </div>
              <div className="rounded-lg bg-subtle p-3">
                <p className="text-h3 font-semibold text-fg tabular">{formatNumber(found.length)}</p>
                <p className="text-xs text-fg-secondary">{t('Items failed, damaged or missing')}</p>
              </div>
            </div>
            {notDone.length > 0 && (
              <Alert type="error" title={t('{n} Rooms are not finished', { n: notDone.length })}>
                {notDone.map((r) => r.room).join(', ')}.{' '}
                {t('If you send now they are not inspected: new residents of these Rooms have no record to be compared with.')}
              </Alert>
            )}
            {noMeters.length > 0 && (
              <Alert type="warning" title={t('Meters not read in {n} Rooms', { n: noMeters.length })}>
                {noMeters.map((r) => r.room).join(', ')}
              </Alert>
            )}
            {unreachable.length > 0 && (
              <Alert type="info" title={t('{n} Rooms not reachable', { n: unreachable.length })}>
                {unreachable.map((r) => r.room).join(', ')}
              </Alert>
            )}
            {found.length > 0 && (
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border border-line p-3">
                {found.map((f, i) => (
                  <div key={`${f.room}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-fg">
                      {f.room} · {f.label}
                      {f.note ? <span className="text-fg-secondary"> · {f.note}</span> : null}
                    </span>
                    <Tag tone={conditionTone[f.condition] ?? 'error'}>
                      {f.condition ? conditionName(f.condition) : f.result}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
            <Checkbox
              label={
                blocking
                  ? 'I checked the list and still send it with the Rooms above not finished'
                  : 'I inspected these Rooms myself and the conditions and meters are correct'
              }
              description="Your name and the time are kept with the results."
              checked={committed}
              onChange={(e) => setCommitted(e.target.checked)}
            />
          </div>
        )}
      </QueryState>
    </Modal>
  )
}
