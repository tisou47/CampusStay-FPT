-- =====================================================================
-- CampusStay FPT — V97: Admin › Stay and renewal keeps the stay length,
-- extensions and the beds kept for new students. How many emergency
-- contacts a student may keep (A-70) is an account setting: it moves to
-- Admin › System parameters (section Students). The value is kept.
-- =====================================================================

UPDATE cfg_parameter SET settings_group = NULL, section = 'Students', sort_order = 85
WHERE key = 'student.emergency_contacts_max';
