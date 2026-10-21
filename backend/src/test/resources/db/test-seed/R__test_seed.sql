-- =====================================================================
-- CampusStay FPT — test seed (profile "test" only): the small, fixed data the
-- integration tests rely on (2 Blocks, 48 students, @campusstay.test accounts).
-- Repeatable migration; every statement is idempotent (ON CONFLICT / NOT EXISTS).
-- All people, emails and student codes are fictional.
-- Password for every seeded account: CampusStay@2026
-- To test Google sign-in, change one account's email to your own
-- @fpt.edu.vn address (see backend/README.md).
-- =====================================================================

-- ---------- catalog: Room Types and Room Classes ----------
INSERT INTO cfg_room_type (name, beds, base_price, roommate_selection, description, sort_order) VALUES
  ('2-bed', 2, 9000000, 'MUTUAL', 'Two Beds; invite one roommate or be matched', 1),
  ('4-bed', 4, 6000000, 'AUTO',   'Four Beds; roommates matched automatically', 2),
  ('6-bed', 6, 4500000, 'AUTO',   'Six Beds; roommates matched automatically', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO cfg_room_class (name, surcharge_rate, amenities, sort_order) VALUES
  ('Basic',    0.0000, '{"Fan","Shared bathroom per room","Wardrobe"}', 1),
  ('Standard', 0.1500, '{"Air conditioning","Private bathroom","Wardrobe","Desk lamp"}', 2),
  ('Premium',  0.3000, '{"Air conditioning","Private bathroom","Water heater","Fridge","Balcony"}', 3)
ON CONFLICT (name) DO NOTHING;

-- ---------- Terms ----------
INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at, registration_closes_at,
                      results_published_at, roommate_hours, deposit_hours, balance_due_at,
                      check_in_start, check_in_end, check_out_by, published_at)
VALUES
  ('FA26', 'Fall 2026', 'PUBLISHED', '2026-09-07', '2026-12-27',
   '2026-07-01 01:00:00+00', '2026-07-31 16:59:00+00', '2026-08-10 01:00:00+00', 48, 48,
   '2026-08-25 16:59:00+00', '2026-09-03', '2026-09-06', '2026-12-28', '2026-06-20 01:00:00+00'),
  ('SP27', 'Spring 2027', 'PUBLISHED', '2027-01-04', '2027-04-25',
   '2026-10-15 01:00:00+00', '2026-11-15 16:59:00+00', '2026-11-22 01:00:00+00', 48, 48,
   '2026-12-10 16:59:00+00', '2026-12-30', '2027-01-03', '2027-04-26', '2026-10-01 01:00:00+00')
ON CONFLICT (code) DO NOTHING;

-- ---------- Buildings, Floors, layout, Rooms, Beds ----------
INSERT INTO inv_building (code, name, gender) VALUES
  ('A', 'Block A', 'M'),
  ('B', 'Block B', 'F')
ON CONFLICT (code) DO NOTHING;

-- Floors 1-2 Basic, 3-4 Standard, 5 Premium.
INSERT INTO inv_floor (building_id, floor_no, room_class_id)
SELECT b.id, f.n,
       (SELECT id FROM cfg_room_class WHERE name = CASE WHEN f.n <= 2 THEN 'Basic' WHEN f.n <= 4 THEN 'Standard' ELSE 'Premium' END)
FROM inv_building b CROSS JOIN generate_series(1, 5) AS f(n)
WHERE b.code IN ('A', 'B')
ON CONFLICT (building_id, floor_no) DO NOTHING;

-- Each Floor: 4 × 2-bed, 4 × 4-bed, 2 × 6-bed = 10 Rooms, 36 Beds.
INSERT INTO inv_floor_layout (floor_id, room_type_id, room_count)
SELECT fl.id, rt.id, CASE rt.name WHEN '2-bed' THEN 4 WHEN '4-bed' THEN 4 ELSE 2 END
FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id
CROSS JOIN cfg_room_type rt
WHERE b.code IN ('A', 'B')
ON CONFLICT (floor_id, room_type_id) DO NOTHING;

-- Room numbers: <floor><nn>; 01-04 are 2-bed, 05-08 4-bed, 09-10 6-bed.
INSERT INTO inv_room (code, building_id, floor_id, room_type_id)
SELECT b.code || '-' || fl.floor_no || lpad(r.n::text, 2, '0'), b.id, fl.id,
       (SELECT id FROM cfg_room_type WHERE name = CASE WHEN r.n <= 4 THEN '2-bed' WHEN r.n <= 8 THEN '4-bed' ELSE '6-bed' END)
FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id
CROSS JOIN generate_series(1, 10) AS r(n)
WHERE b.code IN ('A', 'B')
ON CONFLICT (code) DO NOTHING;

INSERT INTO inv_bed (room_id, label)
SELECT ro.id, chr(64 + s.n)
FROM inv_room ro JOIN cfg_room_type rt ON rt.id = ro.room_type_id
CROSS JOIN LATERAL generate_series(1, rt.beds) AS s(n)
ON CONFLICT (room_id, label) DO NOTHING;

-- One Room out of service for demo screens.
UPDATE inv_room SET status = 'OUT_OF_SERVICE', oos_since = '2026-10-10 02:00:00+00', oos_reason = 'MAINTENANCE',
                    oos_note = 'Water leak under the bathroom sink'
WHERE code = 'A-305' AND status = 'IN_SERVICE';

INSERT INTO cfg_block_settings (building_id, desk_opens, desk_closes, visit_from, visit_until, quiet_from, house_rules)
SELECT id, '07:30', '21:00', '08:00', '21:30', '23:00',
       'No guests overnight. Quiet hours from 23:00. Cooking only in the shared kitchen.'
FROM inv_building WHERE code IN ('A', 'B')
ON CONFLICT (building_id) DO NOTHING;

INSERT INTO req_sla_policy (building_id, urgent_hours, normal_hours, room_change_hours)
SELECT id, 4, 48, 72 FROM inv_building WHERE code IN ('A', 'B')
ON CONFLICT (building_id) DO NOTHING;

-- ---------- back-office accounts ----------
INSERT INTO auth_user (email, display_name, password_hash, role, title) VALUES
  ('admin@campusstay.test',     'Tran Minh Quan',  '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'ADMIN',   'Housing Administrator'),
  ('manager.a@campusstay.test', 'Le Hoang Nam',    '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'MANAGER', 'Block A Manager'),
  ('manager.b@campusstay.test', 'Pham Thu Ha',     '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'MANAGER', 'Block B Manager'),
  ('staff.a1@campusstay.test',  'Nguyen Van Binh', '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'STAFF',   'Residence Life Officer'),
  ('staff.a2@campusstay.test',  'Vo Thanh Tung',   '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'STAFF',   'Maintenance Technician'),
  ('staff.b1@campusstay.test',  'Do Ngoc Lan',     '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'STAFF',   'Residence Life Officer'),
  ('staff.ab@campusstay.test',  'Huynh Gia Bao',   '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S', 'STAFF',   'Finance Officer')
ON CONFLICT DO NOTHING;

INSERT INTO auth_user_block (user_id, building_id)
SELECT u.id, b.id
FROM auth_user u JOIN inv_building b ON
     (u.email IN ('manager.a@campusstay.test', 'staff.a1@campusstay.test', 'staff.a2@campusstay.test', 'staff.ab@campusstay.test') AND b.code = 'A')
  OR (u.email IN ('manager.b@campusstay.test', 'staff.b1@campusstay.test', 'staff.ab@campusstay.test') AND b.code = 'B')
ON CONFLICT DO NOTHING;

INSERT INTO auth_staff_profile (user_id, handles, on_duty)
SELECT u.id,
       CASE u.email
         WHEN 'staff.a1@campusstay.test' THEN '{DESK,APPLICATIONS,ROOM_CHANGES}'::text[]
         WHEN 'staff.a2@campusstay.test' THEN '{MAINTENANCE,INSPECTIONS,METER_READINGS}'::text[]
         WHEN 'staff.b1@campusstay.test' THEN '{DESK,APPLICATIONS,MAINTENANCE,ROOM_CHANGES}'::text[]
         ELSE '{PAYMENTS}'::text[] END,
       TRUE
FROM auth_user u WHERE u.role = 'STAFF'
ON CONFLICT (user_id) DO NOTHING;

-- ---------- students (mock SIS directory) ----------
-- 24 male + 24 female students, codes SE190001..SE190048.
WITH names AS (
  SELECT n,
         CASE WHEN n <= 24 THEN 'M' ELSE 'F' END AS gender,
         (ARRAY['Nguyen','Tran','Le','Pham','Hoang','Vo','Dang','Bui','Do','Ho','Ngo','Duong'])[1 + (n * 7) % 12] AS family,
         CASE WHEN n <= 24
              THEN (ARRAY['Minh Khoa','Gia Huy','Duc Anh','Quoc Bao','Thanh Long','Hoang Phuc','Tuan Kiet','Nhat Nam',
                          'Trung Hieu','Van Tai','Huu Loc','Dinh Phong'])[1 + n % 12]
              ELSE (ARRAY['Ngoc Anh','Thu Trang','Bao Ngan','Khanh Linh','My Tien','Thanh Truc','Phuong Vy','Ha My',
                          'Quynh Nhu','Minh Thu','Gia Han','Tuyet Mai'])[1 + n % 12] END AS given
  FROM generate_series(1, 48) AS g(n)
)
INSERT INTO auth_user (email, display_name, password_hash, role)
SELECT 'se19' || lpad(n::text, 4, '0') || '@student.campusstay.test',
       family || ' ' || given,
       '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S',
       'STUDENT'
FROM names
ON CONFLICT DO NOTHING;

INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, semester_no, hometown, region,
                          priority_groups, phone, emergency_name, emergency_relationship, emergency_phone)
SELECT u.id,
       'SE19' || lpad(s.n::text, 4, '0'),
       CASE WHEN s.n <= 24 THEN 'M' ELSE 'F' END,
       DATE '2005-01-15' + (s.n * 23),
       (ARRAY['SE','AI','IA','GD','BA','MC'])[1 + s.n % 6],
       (ARRAY['K19','K20','K21'])[1 + s.n % 3],
       (ARRAY[1,3,5])[1 + s.n % 3],
       (ARRAY['Ha Noi','Nghe An','Da Nang','Dak Lak','Binh Duong','Dong Nai','Can Tho','An Giang'])[1 + s.n % 8],
       (ARRAY['NORTH','NORTH','CENTRAL','HIGHLANDS','SOUTHEAST','SOUTHEAST','MEKONG','MEKONG'])[1 + s.n % 8],
       CASE WHEN s.n % 3 = 0 THEN '{FIRST_YEAR}'::text[] WHEN s.n % 7 = 0 THEN '{SCHOLARSHIP}'::text[] ELSE '{}'::text[] END,
       '09' || lpad((10000000 + s.n * 137)::text, 8, '0'),
       'Parent of SE19' || lpad(s.n::text, 4, '0'),
       CASE WHEN s.n % 2 = 0 THEN 'MOTHER' ELSE 'FATHER' END,
       '08' || lpad((20000000 + s.n * 311)::text, 8, '0')
FROM generate_series(1, 48) AS s(n)
JOIN auth_user u ON u.email = 'se19' || lpad(s.n::text, 4, '0') || '@student.campusstay.test'
ON CONFLICT (user_id) DO NOTHING;

-- ---------- in-app notifications (one welcome note per account) ----------
INSERT INTO ntf_notification (user_id, event_key, title, body, link, created_at)
SELECT u.id, 'WELCOME', 'Welcome to CampusStay',
       CASE WHEN u.role = 'STUDENT'
            THEN 'Your account is ready. Updates on your Application, Invoices and requests appear here.'
            ELSE 'Your account is ready. Work that needs you appears here.' END,
       CASE WHEN u.role = 'STUDENT' THEN '/student' ELSE NULL END,
       '2026-10-01 01:00:00+00'
FROM auth_user u
WHERE NOT EXISTS (SELECT 1 FROM ntf_notification n WHERE n.user_id = u.id AND n.event_key = 'WELCOME');

-- ---------- inspection checklist (Admin publishes it, Block Managers schedule runs) ----------
INSERT INTO mnt_checklist (family_key, name, version, status, published_at, updated_at)
SELECT 'CL-ROOM', 'Room safety check', 1, 'PUBLISHED', '2026-10-01 01:00:00+00', '2026-10-01 01:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM mnt_checklist WHERE family_key = 'CL-ROOM');

INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
SELECT c.id, v.label, v.category, v.severity, v.n
FROM mnt_checklist c,
     (VALUES ('Smoke detector works', 'ELECTRICAL', 'CRITICAL', 1),
             ('Lights and sockets work', 'ELECTRICAL', 'MAJOR', 2),
             ('No leaks under the sink or in the shower', 'PLUMBING', 'MAJOR', 3),
             ('Air conditioner cools and drains', 'AIR_CONDITIONING', 'MINOR', 4),
             ('Beds, desks and wardrobes are intact', 'FURNITURE', 'MINOR', 5),
             ('Room is clean', 'CLEANING', 'TRIVIAL', 6)) AS v (label, category, severity, n)
WHERE c.family_key = 'CL-ROOM' AND c.version = 1
  AND NOT EXISTS (SELECT 1 FROM mnt_checklist_item i WHERE i.checklist_id = c.id);
