import { ParametersPage } from './SystemParameters'

// SCR-CFG-28 Rules › Room handover: the check-in inventory, its photos, the meter tolerances, Room visits and the
// time a student has to acknowledge shared damage. The section "Room handover" of the system parameters, on its own
// page so System parameters stays short.
// GET /admin/system-parameters · PUT /admin/system-parameters (only this section is sent back changed)

export default function RoomHandoverSettings() {
  return (
    <ParametersPage
      title="Room handover"
      description="The check-in inventory, meter tolerances and Room visits."
      show={(title) => title === 'Room handover'}
      savedMessage="New check-in inventories and visits use the new values."
    />
  )
}
