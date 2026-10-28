-- =====================================================================
-- CampusStay FPT — V61: the other majors of FPT University. The list had
-- eight, so a student list from the academic office naming, for example,
-- Digital Marketing or Korean Language could not be imported. The import
-- also accepts each major's Vietnamese name (i18n/messages_vi.txt).
-- =====================================================================

INSERT INTO cfg_lookup (list_key, code, label, sort_order) VALUES
  ('MAJOR', 'IS', 'Information Systems', 9),
  ('MAJOR', 'IOT', 'Internet of Things', 10),
  ('MAJOR', 'MKT', 'Digital Marketing', 11),
  ('MAJOR', 'IB', 'International Business', 12),
  ('MAJOR', 'HM', 'Hotel Management', 13),
  ('MAJOR', 'TM', 'Tourism and Travel Management', 14),
  ('MAJOR', 'FIN', 'Finance', 15),
  ('MAJOR', 'PR', 'Public Relations', 16),
  ('MAJOR', 'KR', 'Korean Language', 17),
  ('MAJOR', 'CN', 'Chinese Language', 18)
ON CONFLICT (list_key, code) DO NOTHING;
