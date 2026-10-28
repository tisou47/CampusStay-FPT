import SettingsGroup from './SettingsGroup'

// SCR-CFG-26 Rules › Stay and renewal (spec §9): the most Terms a student may commit to (stay length), automatic
// extensions, the share of Beds kept for new students and the alert before the decision deadline.
// GET /admin/settings/stay · PUT /admin/settings/stay { values }

export default function StayRenewal() {
  return <SettingsGroup group="stay" title="Stay and renewal" description="How long students may commit to stay, extensions, and the Beds kept for new students." />
}
