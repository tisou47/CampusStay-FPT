-- A meter period is closed after its month ends (review finding BE-APP-BIL-05). For a demonstration the Admin may
-- allow closing the current month early.
INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('utility.close_before_month_end', 'Deadlines and reminders', 'Allow closing a meter period before its month ends',
     'BOOL', 'false', 'For demonstrations only: Utility Invoices then miss the last days of the month.', 45, 'DEADLINES',
     'Meter readings: Close the month')
ON CONFLICT (key) DO NOTHING;
