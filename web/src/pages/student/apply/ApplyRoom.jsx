import { useNavigate } from 'react-router'
import { Card } from '@/components/ui/Display'
import { formatVnd } from '@/lib/format'
import { OptionCard, WizardActions, WizardLayout, isTwoBed, useWizard } from './wizard'

// SCR-APP-01 Application Wizard – 2 Room preference (Figma 14:355)
// Room Type and Room Class only. Roommate options (and the optional preference matching) live on the
// Roommate step, which appears for 2-bed Rooms.
export default function ApplyRoom() {
  const navigate = useNavigate()
  const wizard = useWizard()
  const { draft, setDraft, catalog, helpers } = wizard
  const roomTypes = catalog.data?.roomTypes ?? []
  const roomClasses = catalog.data?.roomClasses ?? []

  return (
    <WizardLayout
      wizard={wizard}
      stepKey="room"
      actions={<WizardActions backTo={wizard.prev('room')} onNext={() => navigate(wizard.next('room'))} nextDisabled={!draft.roomTypeId || !draft.roomClassId} />}
    >
      <Card padding="lg" className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">Room Type</h2>
          <p className="text-base text-fg-secondary">Number of Beds in the Room. Prices are per Bed for the whole Term.</p>
        </div>
        <div className="flex items-stretch gap-4" role="radiogroup" aria-label="Room Type">
          {roomTypes.map((t) => {
            const from = helpers.fromPrice(t.id)
            return (
              <OptionCard
                key={t.id}
                name="roomType"
                value={t.id}
                selected={draft.roomTypeId === t.id}
                onSelect={(v) => setDraft({ roomTypeId: v })}
                title={t.name}
                price={from != null ? `from ${formatVnd(from)}` : null}
                lines={[t.description ?? (isTwoBed(t) ? 'Name one roommate, or be matched automatically.' : 'Matched automatically by gender.')]}
              />
            )
          })}
        </div>
      </Card>

      <Card padding="lg" className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h3 font-semibold text-fg">Room Class</h2>
          <p className="text-base text-fg-secondary">Amenities level. The surcharge is added to the Room Type price.</p>
        </div>
        <div className="flex items-stretch gap-4" role="radiogroup" aria-label="Room Class">
          {roomClasses.map((c) => {
            const price = draft.roomTypeId ? helpers.termPrice(draft.roomTypeId, c.id) : null
            return (
              <OptionCard
                key={c.id}
                name="roomClass"
                value={c.id}
                selected={draft.roomClassId === c.id}
                onSelect={(v) => setDraft({ roomClassId: v })}
                title={`${c.name}  +${Math.round((c.surchargeRate ?? 0) * 100)}%`}
                price={price != null ? formatVnd(price) : 'Choose a Room Type'}
                lines={c.amenities ?? []}
              />
            )
          })}
        </div>
      </Card>
    </WizardLayout>
  )
}
