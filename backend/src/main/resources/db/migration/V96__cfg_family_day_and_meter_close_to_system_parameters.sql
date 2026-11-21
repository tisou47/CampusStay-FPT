-- =====================================================================
-- CampusStay FPT — V96: Admin › Deadlines and reminders keeps the payment
-- windows and reminders only. The Family Day check-in margin, the adult age
-- of a guest and the days before a meter period closes are not payment
-- deadlines: they move to Admin › System parameters (sections Family Day
-- and Utility). Values are kept; changing them no longer posts an
-- announcement to every student.
-- =====================================================================

UPDATE cfg_parameter SET settings_group = NULL, section = 'Family Day', sort_order = 80
WHERE key = 'family_day.early_minutes';

UPDATE cfg_parameter SET settings_group = NULL, section = 'Family Day', sort_order = 81
WHERE key = 'family_day.adult_age';

UPDATE cfg_parameter SET settings_group = NULL, section = 'Utility', sort_order = 45
WHERE key = 'utility.close_days';
