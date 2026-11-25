-- =====================================================================
-- CampusStay FPT — V107: a student's check-out declaration needs photos:
-- every worn, damaged or missing item and the meter readings
-- (Admin › System parameters, section "Room handover").
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, used_in) VALUES
  ('checkout.photos_required', 'Room handover',
     'Photos are required for a declared item and the meter readings at check-out', 'BOOL', 'true',
     'Off: students may declare an item or enter the meters without a photo.', 330,
     'Student check-out declaration')
ON CONFLICT (key) DO NOTHING;
