-- Resolved Maintenance Requests the student never confirms close by themselves after this many days (BE-OPS-15).
INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order) VALUES
  ('maintenance.auto_close_days', 'Maintenance', 'Close resolved requests after (days)', 'INT', '7',
     'A resolved request the student has not confirmed closes by itself', 12)
ON CONFLICT (key) DO NOTHING;
