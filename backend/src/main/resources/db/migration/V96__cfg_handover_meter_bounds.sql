-- =====================================================================
-- CampusStay FPT — V96: bounds of the meter readings of the check-in
-- inventory. Report 1 (Staff's inspection before arrival) is the Room's
-- record: meters only go up, so a reading lower than it (beyond a small
-- misreading allowance) is refused for the student and for Staff's visit,
-- and the comparison marks it a Major difference; a reading far above the
-- accepted use is refused as a typo. Section "Room handover" is reordered
-- so each meter's parameters stand together.
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, used_in) VALUES
  ('handover.electricity_below_tolerance', 'Room handover',
     'Electricity reading lower than the Room''s record still accepted (kWh)', 'DECIMAL', '0.5',
     'Meters only go up: a reading lower than Report 1 by more than this is refused. 0: any lower reading is refused.',
     312, 'Check-in inventory submit, Staff''s Room visit and comparison'),
  ('handover.electricity_max_above', 'Room handover',
     'Electricity above the accepted use refused as a typo, beyond (kWh)', 'DECIMAL', '200',
     'Up to this a reading beyond the accepted use is a Major difference (Staff check the Room). 0: no limit.',
     313, 'Check-in inventory submit and Staff''s Room visit'),
  ('handover.water_below_tolerance', 'Room handover',
     'Water reading lower than the Room''s record still accepted (m³)', 'DECIMAL', '0.05',
     'Meters only go up: a reading lower than Report 1 by more than this is refused. 0: any lower reading is refused.',
     316, 'Check-in inventory submit, Staff''s Room visit and comparison'),
  ('handover.water_max_above', 'Room handover',
     'Water above the accepted use refused as a typo, beyond (m³)', 'DECIMAL', '20',
     'Up to this a reading beyond the accepted use is a Major difference (Staff check the Room). 0: no limit.',
     317, 'Check-in inventory submit and Staff''s Room visit')
ON CONFLICT (key) DO NOTHING;

UPDATE cfg_parameter SET sort_order = CASE key
    WHEN 'handover.electricity_tolerance' THEN 310
    WHEN 'handover.electricity_per_person_hour' THEN 311
    WHEN 'handover.water_tolerance' THEN 314
    WHEN 'handover.water_per_person_hour' THEN 315
    WHEN 'handover.major_mismatches' THEN 318
    WHEN 'handover.visit_from_hour' THEN 319
    WHEN 'handover.visit_to_hour' THEN 320
    WHEN 'handover.visit_within_days' THEN 321
    WHEN 'handover.acknowledge_hours' THEN 330
    ELSE sort_order END
WHERE key LIKE 'handover.%';
