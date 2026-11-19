-- =====================================================================
-- CampusStay FPT — V86: align handover visit start hour label to 1–24
-- =====================================================================

UPDATE cfg_parameter
SET label = 'Room visits start at (hour, 1–24)'
WHERE key = 'handover.visit_from_hour';
