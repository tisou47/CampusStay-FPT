-- =====================================================================
-- CampusStay FPT — V47: configuration of money and residence (Change
-- Specification v2 phase 5; spec §9, §12, §13).
--   * cfg_fee_policy drops block_check_in_if_unpaid and allow_manual_confirm:
--     the door code (and the desk) always need the Balance paid, and every
--     payment is a claim confirmed by a Manager.
--   * stay.program_semesters caps Gia hạn by the semesters a student has left.
--   * A check-out reason for terminations.
-- =====================================================================

ALTER TABLE cfg_fee_policy DROP COLUMN block_check_in_if_unpaid, DROP COLUMN allow_manual_confirm;

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('stay.program_semesters', 'Stay and renewal', 'Semesters of a study programme (Gia hạn stops at the last one)',
     'INT', '9', NULL, 64, 'STAY', 'Application wizard: Gia hạn is at most the semesters the student has left')
ON CONFLICT (key) DO NOTHING;

UPDATE cfg_parameter SET used_in = 'Application wizard (Gia hạn) and extension requests' WHERE key = 'stay.max_terms';
UPDATE cfg_parameter SET used_in = 'Late check-in requests and decisions (Balance and arrival deadlines)'
WHERE key = 'late_check_in.max_days';
UPDATE cfg_parameter SET used_in = 'Utility debt: warnings and terminations' WHERE key LIKE 'termination.%'
  AND key <> 'termination.move_out_days';

INSERT INTO cfg_lookup (list_key, code, label, sort_order) VALUES
  ('CHECK_OUT_REASON', 'TERMINATION', 'Termination', 4)
ON CONFLICT (list_key, code) DO NOTHING;
