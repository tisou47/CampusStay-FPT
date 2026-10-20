-- =====================================================================
-- CampusStay FPT — V11: Admin › Buildings bulk Room generation (S1)
-- =====================================================================

-- Floors offered by "Bulk generate Rooms" (Admin data, not a constant in code).
INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, options, sort_order) VALUES
  ('inventory.max_floor', 'Inventory', 'Highest Floor for bulk Room generation', 'INT', '10',
     'Buildings › Bulk generate Rooms offers Floors 1 to this number', NULL, 12);
