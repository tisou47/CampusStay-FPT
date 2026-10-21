-- =====================================================================
-- CampusStay FPT — V19: Admin limits for Block Managers (S6)
-- A Block Manager sets the escalation timers and the Block's visitor and
-- quiet hours; Admin › System parameters keeps the outer limits, so a Block
-- can only be stricter.
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, options, sort_order) VALUES
  ('sla.urgent_max_hours', 'Requests', 'Longest escalation timer for urgent requests (hours)', 'INT', '8',
     'Block Managers may only choose a shorter timer', NULL, 12),
  ('sla.normal_max_hours', 'Requests', 'Longest escalation timer for normal requests (hours)', 'INT', '72',
     'Block Managers may only choose a shorter timer', NULL, 13),
  ('sla.room_change_max_hours', 'Requests', 'Longest decision time for Room-Change Requests (hours)', 'INT', '96',
     'Block Managers may only choose a shorter time', NULL, 14),
  ('sla.unassigned_max_hours', 'Requests', 'Escalate a Maintenance Request still unassigned after (hours)', 'INT', '1',
     'Applies when no routing rule matched the request', NULL, 15),
  ('block.visit_from_earliest', 'Blocks', 'Visitors may come from (earliest)', 'CHOICE', '07:00', NULL,
     '[{"value":"06:00","label":"06:00"},{"value":"06:30","label":"06:30"},{"value":"07:00","label":"07:00"},{"value":"07:30","label":"07:30"},{"value":"08:00","label":"08:00"},{"value":"08:30","label":"08:30"},{"value":"09:00","label":"09:00"}]', 16),
  ('block.visit_until_latest', 'Blocks', 'Visitors must leave by (latest)', 'CHOICE', '22:00', NULL,
     '[{"value":"20:00","label":"20:00"},{"value":"20:30","label":"20:30"},{"value":"21:00","label":"21:00"},{"value":"21:30","label":"21:30"},{"value":"22:00","label":"22:00"},{"value":"22:30","label":"22:30"},{"value":"23:00","label":"23:00"}]', 17),
  ('block.quiet_from_latest', 'Blocks', 'Quiet hours start by (latest)', 'CHOICE', '23:30', NULL,
     '[{"value":"21:00","label":"21:00"},{"value":"21:30","label":"21:30"},{"value":"22:00","label":"22:00"},{"value":"22:30","label":"22:30"},{"value":"23:00","label":"23:00"},{"value":"23:30","label":"23:30"}]', 18)
ON CONFLICT (key) DO NOTHING;
