-- =====================================================================
-- CampusStay FPT — V54: configuration of the Term transition (Change
-- Specification v2 phase 6; spec §6.13, §9). Reasons of an operational move;
-- the Stay and renewal settings now say where they act.
-- =====================================================================

INSERT INTO cfg_lookup (list_key, code, label, sort_order) VALUES
  ('MOVE_REASON', 'ROOM_UNUSABLE', 'Room unusable', 1),
  ('MOVE_REASON', 'SAFETY', 'Safety', 2),
  ('MOVE_REASON', 'CONFLICT', 'Serious conflict', 3),
  ('MOVE_REASON', 'OTHER', 'Other', 4)
ON CONFLICT (list_key, code) DO NOTHING;

UPDATE cfg_parameter SET used_in = 'Application wizard (Gia hạn) and extension requests (the most Terms of a Stay)'
WHERE key = 'stay.max_terms';
UPDATE cfg_parameter SET used_in = 'Extension requests: approved at once when the student is enrolled and owes nothing overdue'
WHERE key = 'stay.auto_extension';
UPDATE cfg_parameter SET used_in = 'Next-Term room changes and swaps: continuing residents never take this share of the Beds'
WHERE key = 'stay.reserved_new_percent';
UPDATE cfg_parameter SET used_in = 'Requests window: Managers are alerted about undecided requests and open reconciliation items'
WHERE key = 'stay.escalate_before_hours';
