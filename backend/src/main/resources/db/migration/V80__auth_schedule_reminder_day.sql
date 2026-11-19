-- =====================================================================
-- CampusStay FPT — V80: Admin chooses when Managers are reminded to send next
-- week's Staff schedule: the weekday (or no reminder) and the hour, both as
-- lists (an INT parameter cannot hold the hour 0).
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, options, sort_order, settings_group, used_in) VALUES
  ('workload.schedule_reminder_day', 'Staff', 'Day Managers are reminded to send next week''s schedule', 'CHOICE', '7',
     'Campus time. The reminder goes once that day while some Block''s schedule is not sent; "Off" sends none.',
     '[{"value":"1","label":"Monday"},{"value":"2","label":"Tuesday"},{"value":"3","label":"Wednesday"},{"value":"4","label":"Thursday"},{"value":"5","label":"Friday"},{"value":"6","label":"Saturday"},{"value":"7","label":"Sunday"},{"value":"0","label":"Off (no reminder)"}]',
     72, NULL, 'Manager › Staff and workload')
ON CONFLICT (key) DO NOTHING;

UPDATE cfg_parameter
SET value_type = 'CHOICE',
    label = 'Hour Managers are reminded to send next week''s schedule',
    helper = 'Campus time, on the reminder day.',
    options = (SELECT jsonb_agg(jsonb_build_object('value', h::text, 'label', lpad(h::text, 2, '0') || ':00') ORDER BY h)
               FROM generate_series(0, 23) AS h),
    value = CASE WHEN value ~ '^\d{1,2}$' AND value::int BETWEEN 0 AND 23 THEN value::int::text ELSE '9' END,
    sort_order = 73
WHERE key = 'workload.schedule_reminder_hour';
