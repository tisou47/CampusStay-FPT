-- =====================================================================
-- CampusStay FPT — V77: a Staff member's or Manager's duty follows their
-- presence. Signing in (or using the app) puts them on duty; signing out,
-- or no use of the app for this many minutes, takes them off. Nobody
-- switches duty by hand any more.
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('workload.duty_idle_minutes', 'Staff', 'Minutes without using the app before a staff member goes off duty',
     'INT', '30', 'Signing in puts Staff and Managers on duty, signing out takes them off; this covers a closed browser.',
     71, NULL, 'Manager › Staff and workload, routing')
ON CONFLICT (key) DO NOTHING;
