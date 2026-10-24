-- =====================================================================
-- CampusStay FPT — base data (profile "dev"; a demo server may load it too).
--
-- A fresh system, ready to sign in and nothing more: 8 Blocks (A–D male,
-- E–H female; 10 floors, 960 Rooms, 3,680 Beds) with their Room Types and
-- Room Classes, one Admin, a Manager and two Staff per Block, and 6,200
-- students in the student directory (cohorts K18–K22, all enrolled). There is
-- no Term, Application, Invoice or any other history: the Admin starts by
-- confirming the fees and publishing a Term.
--
-- People are fictional and generated deterministically. Emails use the FPT
-- format: <student code>@fpt.edu.vn for students (se190001@fpt.edu.vn) and
-- <account>@fpt.edu.vn for staff (admin, manager.a, staff.a1). In dev every
-- email stops in Mailpit. Password of every account: 12321321
--
-- Repeatable migration; every statement is idempotent (ON CONFLICT), so a new
-- version only adds what is missing. The integration tests use their own seed
-- (src/test/resources/db/test-seed).
-- =====================================================================

-- ---------- helpers (this session only) ----------
CREATE OR REPLACE FUNCTION pg_temp.rnd(seed text) RETURNS double precision LANGUAGE sql IMMUTABLE AS $f$
    SELECT (('x' || lpad(substr(md5(seed), 1, 8), 16, '0'))::bit(64)::bigint) / 4294967296.0
$f$;

CREATE OR REPLACE FUNCTION pg_temp.pick(arr text[], seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
    SELECT arr[1 + floor(pg_temp.rnd(seed) * array_length(arr, 1))::int]
$f$;

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

-- ---------- Buildings, Floors, layout, Rooms, Beds ----------
INSERT INTO inv_building (code, name, gender)
SELECT c, 'Block ' || c, CASE WHEN c < 'E' THEN 'M' ELSE 'F' END
FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) AS c
ON CONFLICT (code) DO NOTHING;

-- Floors 1-4 Basic, 5-8 Standard, 9-10 Premium.
INSERT INTO inv_floor (building_id, floor_no, room_class_id)
SELECT b.id, f.n,
       (SELECT id FROM cfg_room_class WHERE name = CASE WHEN f.n <= 4 THEN 'Basic' WHEN f.n <= 8 THEN 'Standard' ELSE 'Premium' END)
FROM inv_building b CROSS JOIN generate_series(1, 10) AS f(n)
WHERE b.code BETWEEN 'A' AND 'H'
ON CONFLICT (building_id, floor_no) DO NOTHING;

-- Each Floor: 4 × 2-bed, 5 × 4-bed, 3 × 6-bed = 12 Rooms, 46 Beds.
INSERT INTO inv_floor_layout (floor_id, room_type_id, room_count)
SELECT fl.id, rt.id, CASE rt.name WHEN '2-bed' THEN 4 WHEN '4-bed' THEN 5 ELSE 3 END
FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id CROSS JOIN cfg_room_type rt
WHERE b.code BETWEEN 'A' AND 'H'
ON CONFLICT (floor_id, room_type_id) DO NOTHING;

-- Room numbers <floor><nn>: 01-04 are 2-bed, 05-09 4-bed, 10-12 6-bed (A-101 … A-1012).
INSERT INTO inv_room (code, building_id, floor_id, room_type_id)
SELECT b.code || '-' || fl.floor_no || lpad(r.n::text, 2, '0'), b.id, fl.id,
       (SELECT id FROM cfg_room_type WHERE name = CASE WHEN r.n <= 4 THEN '2-bed' WHEN r.n <= 9 THEN '4-bed' ELSE '6-bed' END)
FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id CROSS JOIN generate_series(1, 12) AS r(n)
WHERE b.code BETWEEN 'A' AND 'H'
ON CONFLICT (code) DO NOTHING;

INSERT INTO inv_bed (room_id, label)
SELECT ro.id, chr(64 + s.n)
FROM inv_room ro JOIN cfg_room_type rt ON rt.id = ro.room_type_id CROSS JOIN LATERAL generate_series(1, rt.beds) AS s(n)
ON CONFLICT (room_id, label) DO NOTHING;

-- ---------- back-office accounts ----------
INSERT INTO auth_user (email, display_name, password_hash, role, title)
SELECT v.account || '@fpt.edu.vn', v.name, '$2a$10$aTv5QYm9jSPCEi8eeISY8eyqjt0mFPE6LYW2EyMl6nT0zCFJNAjiu', v.role, v.title
FROM (VALUES
  ('admin',     'Tran Minh Quan',      'ADMIN',   'Housing Administrator'),
  ('manager.a', 'Le Hoang Nam',        'MANAGER', 'Dormitory Manager'),
  ('manager.b', 'Pham Thanh Tung',     'MANAGER', 'Dormitory Manager'),
  ('manager.c', 'Vo Minh Triet',       'MANAGER', 'Dormitory Manager'),
  ('manager.d', 'Dang Quoc Viet',      'MANAGER', 'Dormitory Manager'),
  ('manager.e', 'Pham Thu Ha',         'MANAGER', 'Dormitory Manager'),
  ('manager.f', 'Nguyen Ngoc Diem',    'MANAGER', 'Dormitory Manager'),
  ('manager.g', 'Tran Bao Chau',       'MANAGER', 'Dormitory Manager'),
  ('manager.h', 'Huynh Thanh Thao',    'MANAGER', 'Dormitory Manager'),
  ('staff.a1',  'Nguyen Van Binh',     'STAFF',   'Residence Life Officer'),
  ('staff.a2',  'Vo Thanh Tung',       'STAFF',   'Maintenance Technician'),
  ('staff.b1',  'Tran Quoc Huy',       'STAFF',   'Residence Life Officer'),
  ('staff.b2',  'Le Van Thanh',        'STAFF',   'Maintenance Technician'),
  ('staff.c1',  'Phan Minh Khoa',      'STAFF',   'Residence Life Officer'),
  ('staff.c2',  'Bui Duc Thang',       'STAFF',   'Maintenance Technician'),
  ('staff.d1',  'Ho Tan Phat',         'STAFF',   'Residence Life Officer'),
  ('staff.d2',  'Ngo Van Hai',         'STAFF',   'Maintenance Technician'),
  ('staff.e1',  'Do Ngoc Lan',         'STAFF',   'Residence Life Officer'),
  ('staff.e2',  'Truong Van Loc',      'STAFF',   'Maintenance Technician'),
  ('staff.f1',  'Nguyen Thi Mai',      'STAFF',   'Residence Life Officer'),
  ('staff.f2',  'Dinh Quang Vinh',     'STAFF',   'Maintenance Technician'),
  ('staff.g1',  'Le Thi Hong Nhung',   'STAFF',   'Residence Life Officer'),
  ('staff.g2',  'Cao Van Duc',         'STAFF',   'Maintenance Technician'),
  ('staff.h1',  'Pham Thi Thanh Truc', 'STAFF',   'Residence Life Officer'),
  ('staff.h2',  'Mai Xuan Truong',     'STAFF',   'Maintenance Technician')) AS v (account, name, role, title)
ON CONFLICT DO NOTHING;

-- staff.a1 and staff.a2 work in Block A, and so on. Managers work for every Block (ADR-19).
INSERT INTO auth_user_block (user_id, building_id)
SELECT u.id, b.id
FROM auth_user u JOIN inv_building b
  ON u.email IN ('staff.' || lower(b.code) || '1@fpt.edu.vn', 'staff.' || lower(b.code) || '2@fpt.edu.vn')
ON CONFLICT DO NOTHING;

-- What each person handles is set by a Manager (Staff).
INSERT INTO auth_staff_profile (user_id)
SELECT u.id FROM auth_user u WHERE u.role = 'STAFF' AND u.email LIKE 'staff.__@fpt.edu.vn'
ON CONFLICT (user_id) DO NOTHING;

-- ---------- students (mock SIS directory) ----------
-- Cohorts K18 (entered 2022) … K22 (2026); 58% male. Codes SE/SS/SA + cohort + number, e.g. SE190421.
CREATE TEMP TABLE t_student ON COMMIT DROP AS
WITH c (cohort, entry, size, base) AS (VALUES (18, 2022, 1000, 0), (19, 2023, 1250, 1000), (20, 2024, 1300, 2250),
                                              (21, 2025, 1300, 3550), (22, 2026, 1350, 4850)),
g AS (SELECT c.cohort, c.entry, s AS seq, c.base + s AS n FROM c CROSS JOIN LATERAL generate_series(1, c.size) AS s),
x AS (
    SELECT g.*, pg_temp.rnd('gender' || n) < 0.58 AS male,
           pg_temp.pick(ARRAY['SE','SE','SE','SE','SE','SE','SE','AI','AI','AI','IA','IA','GD','GD','BA','BA','BA','MC','EN','JP'], 'major' || n) AS major,
           pg_temp.pick(ARRAY[
               'Ho Chi Minh City|SOUTHEAST','Ho Chi Minh City|SOUTHEAST','Ho Chi Minh City|SOUTHEAST','Binh Duong|SOUTHEAST',
               'Dong Nai|SOUTHEAST','Ba Ria - Vung Tau|SOUTHEAST','Tay Ninh|SOUTHEAST','Binh Phuoc|SOUTHEAST',
               'Ha Noi|NORTH','Hai Phong|NORTH','Nam Dinh|NORTH','Thai Binh|NORTH','Thanh Hoa|NORTH',
               'Nghe An|CENTRAL','Ha Tinh|CENTRAL','Hue|CENTRAL','Da Nang|CENTRAL','Quang Nam|CENTRAL','Quang Ngai|CENTRAL',
               'Binh Dinh|CENTRAL','Phu Yen|CENTRAL','Khanh Hoa|CENTRAL','Ninh Thuan|CENTRAL','Binh Thuan|CENTRAL',
               'Dak Lak|HIGHLANDS','Gia Lai|HIGHLANDS','Lam Dong|HIGHLANDS','Kon Tum|HIGHLANDS','Dak Nong|HIGHLANDS',
               'Can Tho|MEKONG','An Giang|MEKONG','Tien Giang|MEKONG','Ben Tre|MEKONG','Long An|MEKONG','Dong Thap|MEKONG',
               'Kien Giang|MEKONG','Soc Trang|MEKONG','Ca Mau|MEKONG','Vinh Long|MEKONG','Bac Lieu|MEKONG'], 'home' || n) AS home
    FROM g),
p AS (
    SELECT x.*, CASE major WHEN 'GD' THEN 'SA' WHEN 'BA' THEN 'SS' WHEN 'MC' THEN 'SS' WHEN 'EN' THEN 'SS' WHEN 'JP' THEN 'SS'
                           ELSE 'SE' END AS prefix
    FROM x)
-- Numbered per prefix and cohort, so SE190001, SS190001 and SA190001 all exist.
SELECT n, cohort, entry, CASE WHEN male THEN 'M' ELSE 'F' END AS gender, major,
       prefix || cohort || lpad((row_number() OVER (PARTITION BY prefix, cohort ORDER BY seq))::text, 4, '0') AS code,
       split_part(home, '|', 1) AS hometown, split_part(home, '|', 2) AS region,
       pg_temp.pick(ARRAY['Nguyen','Nguyen','Nguyen','Nguyen','Nguyen','Tran','Tran','Tran','Le','Le','Le','Pham','Pham',
                          'Hoang','Huynh','Huynh','Vo','Vo','Vu','Phan','Phan','Dang','Bui','Bui','Do','Ho','Ngo','Duong',
                          'Ly','Truong','Dinh','Lam','Mai','Cao','Ta','Luong','Ha','Trinh','Doan','Chau'], 'family' || n) AS family,
       CASE WHEN male
            THEN pg_temp.pick(ARRAY['Van','Minh','Duc','Quoc','Thanh','Hoang','Gia','Huu','Tuan','Nhat','Dinh','Anh','Trung',
                                    'Cong','Bao','Tan','Quang','Hai','Phuoc','Thien'], 'middle' || n)
            ELSE pg_temp.pick(ARRAY['Thi','Thi','Ngoc','Thu','Bao','Khanh','My','Thanh','Phuong','Ha','Quynh','Minh','Gia',
                                    'Kim','Tuyet','Hong','Thao','Diem','Lan','Cam'], 'middle' || n) END AS middle,
       CASE WHEN male
            THEN pg_temp.pick(ARRAY['An','Anh','Bao','Binh','Cuong','Dat','Dung','Duy','Hai','Hieu','Hoang','Huy','Khang',
                                    'Khoa','Kiet','Lam','Long','Loc','Minh','Nam','Nghia','Nhan','Phat','Phong','Phuc',
                                    'Quan','Sang','Son','Tai','Tam','Thang','Thinh','Tien','Toan','Trung','Tuan','Vinh',
                                    'Vu','Hung','Hau','Khanh','Luan','Nhat','Thuan','Tri','Viet'], 'given' || n)
            ELSE pg_temp.pick(ARRAY['Anh','Chau','Diep','Dung','Giang','Ha','Han','Hang','Hien','Hoa','Huong','Lan','Linh',
                                    'Ly','Mai','Ngan','Ngoc','Nhi','Nhu','Nga','Oanh','Phuong','Quyen','Tam','Thao','Thu',
                                    'Thuy','Tien','Trang','Tram','Trinh','Uyen','Van','Vy','Xuan','Yen','Nhung','Huyen',
                                    'Loan','My'], 'given' || n) END AS given
FROM p;

INSERT INTO auth_user (email, display_name, password_hash, role)
SELECT lower(code) || '@fpt.edu.vn', family || ' ' || middle || ' ' || given,
       '$2a$10$aTv5QYm9jSPCEi8eeISY8eyqjt0mFPE6LYW2EyMl6nT0zCFJNAjiu', 'STUDENT'
FROM t_student
ON CONFLICT DO NOTHING;

INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, semester_no, hometown, region,
                          priority_groups, phone, emergency_name, emergency_relationship, emergency_phone)
SELECT u.id, s.code, s.gender, make_date(s.entry - 18, 1, 1) + (pg_temp.rnd('dob' || s.n) * 364)::int, s.major,
       'K' || s.cohort, least(12, (2026 - s.entry) * 3 + 1), s.hometown, s.region,
       array_remove(ARRAY[
           CASE WHEN s.cohort = 22 THEN 'FIRST_YEAR' END,
           CASE WHEN s.region <> 'SOUTHEAST' THEN 'FAR_FROM_CAMPUS' END,
           CASE WHEN pg_temp.rnd('scholar' || s.n) < 0.07 THEN 'SCHOLARSHIP' END,
           CASE WHEN pg_temp.rnd('policy' || s.n) < 0.03 THEN 'POLICY_BENEFICIARY' END], NULL),
       '0' || pg_temp.pick(ARRAY['90','91','93','94','96','97','98','86','88','89','70','76','77','78','79','83','84','85'], 'carrier' || s.n)
           || lpad(((s.n * 7919 + 1234567) % 10000000)::text, 7, '0'),
       s.family || ' ' || pg_temp.pick(ARRAY['Van Hung','Thi Lan','Minh Tuan','Thi Hoa','Quoc Dung','Thi Mai','Van Long',
                                             'Thi Hanh','Duc Thinh','Thi Thu'], 'parent' || s.n),
       pg_temp.pick(ARRAY['MOTHER','MOTHER','FATHER','FATHER','GUARDIAN','SIBLING'], 'rel' || s.n),
       '0' || pg_temp.pick(ARRAY['90','91','93','97','98','35','36','37','38','39'], 'pcarrier' || s.n)
           || lpad(((s.n * 104729 + 7654321) % 10000000)::text, 7, '0')
FROM t_student s JOIN auth_user u ON u.email = lower(s.code) || '@fpt.edu.vn'
ON CONFLICT DO NOTHING;

-- ---------- every account above is fictional ----------
-- Only the emails of fictional accounts go to the demo mailbox (MAIL_REDIRECT_TO); real accounts, which sign up
-- with Google or come from an imported student list, receive their own email (spec O-3).
UPDATE auth_user SET demo = TRUE
WHERE NOT demo
  AND (email ~ '^(admin|manager\.[a-h]|staff\.[a-h][12])@fpt\.edu\.vn$'
       OR email IN (SELECT lower(code) || '@fpt.edu.vn' FROM t_student));
