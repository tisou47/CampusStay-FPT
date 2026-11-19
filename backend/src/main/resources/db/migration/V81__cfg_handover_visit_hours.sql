-- =====================================================================
-- CampusStay FPT — V81: when Staff may come to check a Room with the
-- student (a check-in inventory with a difference): the working hours of
-- the dormitory office and how many days ahead a visit may be set. The
-- visit picker offers only these hours and suggests the next free ones.
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, used_in) VALUES
  ('handover.visit_from_hour', 'Room handover', 'Room visits start at (hour, 0–23)', 'INT', '8',
     'The first hour Staff may come to check a Room with the student.', 315, 'Room visit of a check-in inventory'),
  ('handover.visit_to_hour', 'Room handover', 'Room visits end at (hour, 1–24)', 'INT', '17',
     'A visit starts before this hour.', 316, 'Room visit of a check-in inventory'),
  ('handover.visit_within_days', 'Room handover', 'A Room visit is set within (days)', 'INT', '3',
     'Counted from today: the student is not left waiting longer.', 317, 'Room visit of a check-in inventory')
ON CONFLICT (key) DO NOTHING;
