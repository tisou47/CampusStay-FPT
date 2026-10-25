import SettingsGroup from './SettingsGroup'

// SCR-CFG-24 Rules › Deadlines and reminders (spec §9): the Deposit window, Balance days, payment reminders and the
// limits of payment claims. A Term copies the payment windows when it is built.
// GET /admin/settings/deadlines · PUT /admin/settings/deadlines { values }

export default function Deadlines() {
  return <SettingsGroup group="deadlines" title="Deadlines and reminders" description="Payment windows and reminders; a Term copies the payment windows when it is built." />
}
