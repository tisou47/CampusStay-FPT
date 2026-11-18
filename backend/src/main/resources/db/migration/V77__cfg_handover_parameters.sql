-- =====================================================================
-- CampusStay FPT — V77: parameters of the check-in inventory and the
-- furniture compensation at check-out (Admin › System parameters,
-- section "Room handover"). Percentages are of the item's replacement
-- price for its Room Class (inv_furniture_price).
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, used_in) VALUES
  ('handover.required', 'Room handover', 'New residents file a check-in inventory before they receive the door code',
     'BOOL', 'true', 'Off: the door code is released as soon as the Balance is paid, as before.', 300,
     'Door code release and the student''s My Room'),
  ('handover.submit_hours', 'Room handover', 'Hours to file the check-in inventory after receiving the door code',
     'INT', '48', 'After this the inventory is accepted as the Room''s recorded condition.', 301,
     'Check-in inventory deadline job'),
  ('handover.photos_required', 'Room handover', 'Photos are required for Damaged and Missing items and the meters',
     'BOOL', 'false', NULL, 302, 'Check-in inventory form'),
  ('handover.max_photos', 'Room handover', 'Photos per item or meter, at most', 'INT', '3', NULL, 303,
     'Check-in inventory form'),
  ('handover.electricity_tolerance', 'Room handover', 'Electricity difference always accepted (kWh)',
     'DECIMAL', '2', NULL, 310, 'Comparison of the check-in inventory'),
  ('handover.electricity_per_person_hour', 'Room handover', 'Electricity use accepted per resident and hour (kWh)',
     'DECIMAL', '0.25', NULL, 311, 'Comparison of the check-in inventory'),
  ('handover.water_tolerance', 'Room handover', 'Water difference always accepted (m³)',
     'DECIMAL', '0.2', NULL, 312, 'Comparison of the check-in inventory'),
  ('handover.water_per_person_hour', 'Room handover', 'Water use accepted per resident and hour (m³)',
     'DECIMAL', '0.01', NULL, 313, 'Comparison of the check-in inventory'),
  ('handover.major_mismatches', 'Room handover', 'Items that differ from the record before the inventory needs a visit',
     'INT', '3', NULL, 314, 'Comparison of the check-in inventory'),
  ('handover.acknowledge_hours', 'Room handover', 'Hours a student has to acknowledge damage to a shared item',
     'INT', '48', 'Not acknowledged in time: nobody is charged.', 320, 'Shared furniture damage'),
  ('compensation.worn_percent', 'Room handover', 'Charge for a Worn item (% of its price)', 'INT', '0', NULL, 330,
     'Check-out furniture charges'),
  ('compensation.damaged_percent', 'Room handover', 'Charge for a Damaged item (% of its price)', 'INT', '50', NULL,
     331, 'Check-out furniture charges'),
  ('compensation.missing_percent', 'Room handover', 'Charge for a Missing item (% of its price)', 'INT', '100', NULL,
     332, 'Check-out furniture charges')
ON CONFLICT (key) DO NOTHING;
