-- =====================================================================
-- CampusStay FPT — V140: business values that were hard-coded (BE-ASG-17,
-- wave 3 B8), now Admin › System parameters with the values used so far.
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, used_in) VALUES
  ('handover.remind_hours', 'Room handover', 'First check-in inventory reminder (hours before the deadline)',
     'INT', '24', NULL, 304, 'Check-in inventory deadline job'),
  ('handover.remind_last_hours', 'Room handover', 'Last check-in inventory reminder (hours before the deadline)',
     'INT', '4', NULL, 305, 'Check-in inventory deadline job'),
  ('checkout.damage_due_days', 'Room handover', 'Days to pay a furniture damage charge from a check-out',
     'INT', '7', NULL, 321, 'Check-out furniture charges and shared damage'),
  ('round2.max_options', 'Assignment', 'Beds offered in one Round-2 offer, at most', 'INT', '3', NULL, 4,
     'Round-2 offers')
ON CONFLICT (key) DO NOTHING;
