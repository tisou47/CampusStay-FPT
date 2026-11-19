-- =====================================================================
-- CampusStay FPT — base data (profile "dev"; a demo server may load it too).
--
-- A fresh system, ready to sign in and nothing more: 8 Blocks (A–D male,
-- E–H female; 10 floors, 960 Rooms, 3,680 Beds) with their Room Types and
-- Room Classes, the furniture each Room has (a bed, wardrobe and desk per
-- Bed, the items its Room Class requires, spares in every Block store), four
-- Admins, four Managers (for every Block) and four Staff per Block, and 6,200
-- students in the student directory (cohorts K18–K22, all enrolled). There is
-- no Term, Application, Invoice or any other history: the Admin starts by
-- confirming the fees and publishing a Term.
--
-- People are fictional and generated deterministically. Emails use the FPT
-- format: <student code>@fpt.edu.vn for students (se190001@fpt.edu.vn) and
-- <account>@fpt.edu.vn for staff (admin01…04, manager01…04, staffa01…staffh04).
-- In dev every email stops in Mailpit. Password of every account: 123 (a demo
-- with no real users, user decision 30/10/2026; V68 converted older databases).
-- The back-office ones sign in with the password only, never with Google.
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
INSERT INTO inv_room (code, building_id, floor_id, room_type_id, room_class_id)
SELECT b.code || '-' || fl.floor_no || lpad(r.n::text, 2, '0'), b.id, fl.id,
       (SELECT id FROM cfg_room_type WHERE name = CASE WHEN r.n <= 4 THEN '2-bed' WHEN r.n <= 9 THEN '4-bed' ELSE '6-bed' END),
       fl.room_class_id
FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id CROSS JOIN generate_series(1, 12) AS r(n)
WHERE b.code BETWEEN 'A' AND 'H'
ON CONFLICT (code) DO NOTHING;

INSERT INTO inv_bed (room_id, label)
SELECT ro.id, chr(64 + s.n)
FROM inv_room ro JOIN cfg_room_type rt ON rt.id = ro.room_type_id CROSS JOIN LATERAL generate_series(1, rt.beds) AS s(n)
ON CONFLICT (room_id, label) DO NOTHING;

-- ---------- furniture (types: V39) ----------
-- Basic: a ceiling fan; Standard: an air conditioner and a water heater; Premium: both and a fridge.
INSERT INTO inv_room_class_requirement (room_class_id, furniture_type_id, quantity)
SELECT c.id, t.id, 1
FROM cfg_room_class c JOIN inv_furniture_type t ON
     (c.name = 'Basic' AND t.code = 'FAN')
  OR (c.name = 'Standard' AND t.code IN ('AC', 'WH'))
  OR (c.name = 'Premium' AND t.code IN ('AC', 'WH', 'FRG'))
ON CONFLICT DO NOTHING;

-- Real price of one new item (VND, V75), sample values; a price the Admin has set is kept.
UPDATE inv_furniture_type t SET unit_price = v.price, updated_at = now()
FROM (VALUES ('BED', 2000000), ('WRD', 2500000), ('DESK', 1500000), ('FAN', 800000), ('AC', 8000000),
             ('WH', 3500000), ('FRG', 5000000)) AS v(code, price)
WHERE t.code = v.code AND t.unit_price IS NULL;

-- Per Bed a bed, a wardrobe and a desk (asset code <type>-<Room><Bed>, BED-A101A); per Room the items of its
-- Room Class (<type>-<Room>-<n>, AC-A501-1); in every Block store 4 fans, 2 air conditioners, 2 water heaters and
-- 2 fridges (<type>-<Block>STORE-<n>).
INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, room_id)
SELECT t.code || '-' || replace(r.code, '-', '') || bd.label, t.id, 'IN_USE', r.id
FROM inv_bed bd JOIN inv_room r ON r.id = bd.room_id JOIN inv_building b ON b.id = r.building_id
CROSS JOIN inv_furniture_type t
WHERE b.code BETWEEN 'A' AND 'H' AND t.code IN ('BED', 'WRD', 'DESK')
ON CONFLICT (asset_code) DO NOTHING;

-- Personal items belong to their Bed (V77): the Bed is the last letter of the asset code.
UPDATE inv_furniture_item f SET bed_id = bd.id
FROM inv_bed bd JOIN inv_room r ON r.id = bd.room_id, inv_furniture_type t
WHERE t.id = f.furniture_type_id AND t.code IN ('BED', 'WRD', 'DESK') AND f.room_id = r.id AND f.bed_id IS NULL
  AND f.asset_code = t.code || '-' || replace(r.code, '-', '') || bd.label;

INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, room_id)
SELECT t.code || '-' || replace(r.code, '-', '') || '-' || n.n, t.id, 'IN_USE', r.id
FROM inv_room r JOIN inv_building b ON b.id = r.building_id
JOIN inv_room_class_requirement q ON q.room_class_id = r.room_class_id
JOIN inv_furniture_type t ON t.id = q.furniture_type_id
CROSS JOIN LATERAL generate_series(1, q.quantity) AS n(n)
WHERE b.code BETWEEN 'A' AND 'H'
ON CONFLICT (asset_code) DO NOTHING;

INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, store_building_id)
SELECT t.code || '-' || b.code || 'STORE-' || n.n, t.id, 'IN_STORE', b.id
FROM inv_building b
CROSS JOIN (VALUES ('FAN', 4), ('AC', 2), ('WH', 2), ('FRG', 2)) AS v(type, spares)
JOIN inv_furniture_type t ON t.code = v.type
CROSS JOIN LATERAL generate_series(1, v.spares) AS n(n)
WHERE b.code BETWEEN 'A' AND 'H'
ON CONFLICT (asset_code) DO NOTHING;

-- ---------- back-office accounts ----------
INSERT INTO auth_user (email, display_name, password_hash, role, title)
SELECT v.account || '@fpt.edu.vn', v.name, '$2a$10$ZnX/vzGmBxfAftho3lPbDOh/77QstH0rKRE5vDVjI5qY5p/VU8K5C', v.role, v.title
FROM (VALUES
  ('admin01',   'Tran Minh Quan',       'ADMIN',   'Housing Administrator'),
  ('admin02',   'Nguyen Thi Thu Trang', 'ADMIN',   'Housing Administrator'),
  ('admin03',   'Le Quoc Bao',          'ADMIN',   'Housing Administrator'),
  ('admin04',   'Pham Ngoc Anh',        'ADMIN',   'Housing Administrator'),
  ('manager01', 'Le Hoang Nam',         'MANAGER', 'Dormitory Manager'),
  ('manager02', 'Pham Thanh Tung',      'MANAGER', 'Dormitory Manager'),
  ('manager03', 'Vo Minh Triet',        'MANAGER', 'Dormitory Manager'),
  ('manager04', 'Dang Quoc Viet',       'MANAGER', 'Dormitory Manager'),
  ('staffa01',  'Nguyen Van Binh',      'STAFF',   'Residence Life Officer'),
  ('staffa02',  'Vo Thanh Tung',        'STAFF',   'Maintenance Technician'),
  ('staffa03',  'Tran Duc Manh',        'STAFF',   'Front Desk Officer'),
  ('staffa04',  'Le Van Khai',          'STAFF',   'Maintenance Technician'),
  ('staffb01',  'Tran Quoc Huy',        'STAFF',   'Residence Life Officer'),
  ('staffb02',  'Le Van Thanh',         'STAFF',   'Maintenance Technician'),
  ('staffb03',  'Nguyen Huu Phuoc',     'STAFF',   'Front Desk Officer'),
  ('staffb04',  'Pham Van Sang',        'STAFF',   'Maintenance Technician'),
  ('staffc01',  'Phan Minh Khoa',       'STAFF',   'Residence Life Officer'),
  ('staffc02',  'Bui Duc Thang',        'STAFF',   'Maintenance Technician'),
  ('staffc03',  'Hoang Gia Bao',        'STAFF',   'Front Desk Officer'),
  ('staffc04',  'Do Van Tai',           'STAFF',   'Maintenance Technician'),
  ('staffd01',  'Ho Tan Phat',          'STAFF',   'Residence Life Officer'),
  ('staffd02',  'Ngo Van Hai',          'STAFF',   'Maintenance Technician'),
  ('staffd03',  'Vu Minh Hieu',         'STAFF',   'Front Desk Officer'),
  ('staffd04',  'Luong Van Toan',       'STAFF',   'Maintenance Technician'),
  ('staffe01',  'Do Ngoc Lan',          'STAFF',   'Residence Life Officer'),
  ('staffe02',  'Truong Van Loc',       'STAFF',   'Maintenance Technician'),
  ('staffe03',  'Nguyen Thi Kim Ngan',  'STAFF',   'Front Desk Officer'),
  ('staffe04',  'Huynh Van Tri',        'STAFF',   'Maintenance Technician'),
  ('stafff01',  'Nguyen Thi Mai',       'STAFF',   'Residence Life Officer'),
  ('stafff02',  'Dinh Quang Vinh',      'STAFF',   'Maintenance Technician'),
  ('stafff03',  'Tran Thi Bich Ngoc',   'STAFF',   'Front Desk Officer'),
  ('stafff04',  'Ly Van Cuong',         'STAFF',   'Maintenance Technician'),
  ('staffg01',  'Le Thi Hong Nhung',    'STAFF',   'Residence Life Officer'),
  ('staffg02',  'Cao Van Duc',          'STAFF',   'Maintenance Technician'),
  ('staffg03',  'Pham Thi My Duyen',    'STAFF',   'Front Desk Officer'),
  ('staffg04',  'Ta Van Long',          'STAFF',   'Maintenance Technician'),
  ('staffh01',  'Pham Thi Thanh Truc',  'STAFF',   'Residence Life Officer'),
  ('staffh02',  'Mai Xuan Truong',      'STAFF',   'Maintenance Technician'),
  ('staffh03',  'Vo Thi Thu Hien',      'STAFF',   'Front Desk Officer'),
  ('staffh04',  'Chau Van Nghia',       'STAFF',   'Maintenance Technician')) AS v (account, name, role, title)
ON CONFLICT DO NOTHING;

-- staffa01 … staffa04 work in Block A, and so on. Managers work for every Block (ADR-19).
INSERT INTO auth_user_block (user_id, building_id)
SELECT u.id, b.id
FROM auth_user u JOIN inv_building b
  ON u.email ~ ('^staff' || lower(b.code) || '0[1-4]@fpt\.edu\.vn$')
ON CONFLICT DO NOTHING;

-- What each person handles matches their role in the Block:
--   01 Residence Life Officer : next-Term requests, room changes/swaps, desk handover
--   02 Maintenance Technician : maintenance, room inspections, meter readings
--   03 Front Desk Officer     : check-in/check-out desk, Family Day guests
--   04 Maintenance Technician : maintenance, room inspections, meter readings
INSERT INTO auth_staff_profile (user_id, handles, on_duty)
SELECT u.id,
       CASE
           WHEN u.email ~ '^staff[a-h]01@' THEN '{DESK,NEXT_TERM,ROOM_CHANGES}'::text[]
           WHEN u.email ~ '^staff[a-h]02@' THEN '{MAINTENANCE,INSPECTIONS,METER_READINGS}'::text[]
           WHEN u.email ~ '^staff[a-h]03@' THEN '{DESK,FAMILY_DAY}'::text[]
           ELSE '{MAINTENANCE,INSPECTIONS,METER_READINGS}'::text[]
       END,
       u.email ~ '^staff[a-h]0[1-3]@'
FROM auth_user u WHERE u.role = 'STAFF' AND u.email ~ '^staff[a-h]0[1-4]@fpt\.edu\.vn$'
ON CONFLICT (user_id) DO UPDATE
SET handles = CASE WHEN auth_staff_profile.handles = '{}' THEN EXCLUDED.handles ELSE auth_staff_profile.handles END,
    on_duty = CASE WHEN auth_staff_profile.handles = '{}' THEN EXCLUDED.on_duty ELSE auth_staff_profile.on_duty END;

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
       '$2a$10$ZnX/vzGmBxfAftho3lPbDOh/77QstH0rKRE5vDVjI5qY5p/VU8K5C', 'STUDENT'
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
  AND (email ~ '^(admin0[1-4]|manager0[1-4]|staff[a-h]0[1-4])@fpt\.edu\.vn$'
       OR email IN (SELECT lower(code) || '@fpt.edu.vn' FROM t_student));

-- ---------- published dormitory inspection checklists & clean schedule names ----------
UPDATE mnt_checklist SET name = 'Kiểm tra bàn giao & chuyển kỳ'
WHERE family_key = 'DEMO_TURNOVER' AND name = 'Room turnover check';

INSERT INTO mnt_checklist (family_key, name, version, status, published_at, updated_at)
SELECT v.family_key, v.name, 1, 'PUBLISHED', now() - interval '30 days', now() - interval '30 days'
FROM (VALUES ('DEMO_TURNOVER',        'Kiểm tra bàn giao & chuyển kỳ'),
             ('CL_FIRE_SAFETY',       'Kiểm tra an toàn PCCC & điện'),
             ('CL_PLUMBING_AC',       'Kiểm tra điện lạnh & cấp thoát nước'),
             ('CL_HYGIENE_FURNITURE', 'Kiểm tra nội thất & vệ sinh định kỳ')) v (family_key, name)
WHERE NOT EXISTS (SELECT 1 FROM mnt_checklist c WHERE c.family_key = v.family_key);

INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
SELECT c.id, v.label, v.category, v.severity, v.n
FROM mnt_checklist c
-- "Kiểm tra bàn giao & chuyển kỳ" (DEMO_TURNOVER) has no general items: a pre-arrival inspection records each
-- furniture item of the Room and the meters (the Room's own checks), the record new residents are compared with.
JOIN (VALUES ('CL_FIRE_SAFETY', 1, 'Đầu báo khói và thiết bị báo cháy hoạt động tốt', 'ELECTRICAL', 'CRITICAL'),
             ('CL_FIRE_SAFETY', 2, 'Aptomat, ổ cắm và công tắc điện an toàn, không đánh lửa', 'ELECTRICAL', 'MAJOR'),
             ('CL_FIRE_SAFETY', 3, 'Không có thiết bị nấu nướng hoặc vật dễ cháy nổ trái quy định', 'OTHER', 'CRITICAL'),
             ('CL_FIRE_SAFETY', 4, 'Lối thoát hiểm và cửa ban công thông thoáng', 'OTHER', 'MAJOR'),
             ('CL_PLUMBING_AC', 1, 'Máy điều hòa làm mát tốt, ống thoát nước không rò rỉ', 'AIR_CONDITIONING', 'MAJOR'),
             ('CL_PLUMBING_AC', 2, 'Bình nóng lạnh và quạt trần vận hành êm, an toàn', 'ELECTRICAL', 'MAJOR'),
             ('CL_PLUMBING_AC', 3, 'Phễu thoát sàn nhà tắm và bồn rửa thoát nước nhanh', 'PLUMBING', 'MINOR'),
             ('CL_HYGIENE_FURNITURE', 1, 'Giường tầng, bàn học, ghế và tủ quần áo nguyên vẹn, chắc chắn', 'FURNITURE', 'MINOR'),
             ('CL_HYGIENE_FURNITURE', 2, 'Phòng ở, nhà vệ sinh và ban công sạch sẽ, gọn gàng', 'CLEANING', 'TRIVIAL'),
             ('CL_HYGIENE_FURNITURE', 3, 'Tường, trần và sàn phòng không ẩm mốc hoặc bong tróc', 'OTHER', 'MINOR'))
     v (family_key, n, label, category, severity) ON v.family_key = c.family_key
WHERE NOT EXISTS (SELECT 1 FROM mnt_checklist_item i WHERE i.checklist_id = c.id);

-- Rooms already prepared before the turnover checklist lost its general items: they go where no result names them.
DELETE FROM mnt_checklist_item i
USING mnt_checklist c
WHERE c.id = i.checklist_id AND c.family_key = 'DEMO_TURNOVER'
  AND i.label IN ('Đèn chiếu sáng và ổ cắm điện hoạt động tốt',
                  'Vòi nước, vòi sen và bồn cầu hoạt động tốt, không rò rỉ',
                  'Khóa cửa chính và cửa sổ đóng mở chắc chắn')
  AND NOT EXISTS (SELECT 1 FROM mnt_inspection_result r WHERE r.item_id = i.id);

-- More published checklists, so a schedule has real choices: a full pre-arrival check (the record new residents'
-- inventories are compared with), security and door codes, bathrooms, and the network. Each item is added once.
INSERT INTO mnt_checklist (family_key, name, version, status, published_at, updated_at)
SELECT v.family_key, v.name, 1, 'PUBLISHED', now() - interval '20 days', now() - interval '20 days'
FROM (VALUES ('CL_PRE_ARRIVAL', 'Kiểm tra phòng trước khi giao cho sinh viên mới'),
             ('CL_SECURITY',    'Kiểm tra an ninh, khóa cửa & mã cửa'),
             ('CL_BATHROOM',    'Kiểm tra nhà vệ sinh & nhà tắm'),
             ('CL_NETWORK',     'Kiểm tra mạng Wi-Fi & thiết bị điện tử')) v (family_key, name)
WHERE NOT EXISTS (SELECT 1 FROM mnt_checklist c WHERE c.family_key = v.family_key);

INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
SELECT c.id, v.label, v.category, v.severity, v.n
FROM mnt_checklist c
JOIN (VALUES ('CL_PRE_ARRIVAL', 1, 'Đèn chiếu sáng, đèn bàn học và công tắc hoạt động tốt', 'ELECTRICAL', 'MAJOR'),
             ('CL_PRE_ARRIVAL', 2, 'Ổ cắm điện đủ số lượng, không lỏng hoặc cháy xém', 'ELECTRICAL', 'MAJOR'),
             ('CL_PRE_ARRIVAL', 3, 'Máy điều hòa bật được, làm mát, có điều khiển', 'AIR_CONDITIONING', 'MAJOR'),
             ('CL_PRE_ARRIVAL', 4, 'Bình nóng lạnh có điện và ra nước nóng', 'ELECTRICAL', 'MAJOR'),
             ('CL_PRE_ARRIVAL', 5, 'Vòi nước, vòi sen và bồn cầu không rò rỉ', 'PLUMBING', 'MAJOR'),
             ('CL_PRE_ARRIVAL', 6, 'Khóa mã cửa nhận mã mới và cửa đóng kín', 'OTHER', 'CRITICAL'),
             ('CL_PRE_ARRIVAL', 7, 'Cửa sổ, rèm và lưới chống muỗi nguyên vẹn', 'OTHER', 'MINOR'),
             ('CL_PRE_ARRIVAL', 8, 'Tường, trần và sàn sạch, không ẩm mốc hoặc nứt', 'OTHER', 'MINOR'),
             ('CL_PRE_ARRIVAL', 9, 'Phòng đã được vệ sinh, không còn đồ của người ở trước', 'CLEANING', 'MINOR'),
             ('CL_PRE_ARRIVAL', 10, 'Bảng nội quy và sơ đồ thoát hiểm còn trên cửa', 'OTHER', 'TRIVIAL'),
             ('CL_SECURITY', 1, 'Khóa mã cửa hoạt động, pin còn trên 20 %', 'OTHER', 'CRITICAL'),
             ('CL_SECURITY', 2, 'Cửa chính tự đóng, bản lề và tay nắm chắc chắn', 'OTHER', 'MAJOR'),
             ('CL_SECURITY', 3, 'Chốt cửa sổ và cửa ban công khóa được', 'OTHER', 'MAJOR'),
             ('CL_SECURITY', 4, 'Không có thiết bị lạ gắn vào khóa hoặc ổ điện', 'OTHER', 'CRITICAL'),
             ('CL_BATHROOM', 1, 'Bồn cầu xả nước mạnh, không chảy liên tục', 'PLUMBING', 'MAJOR'),
             ('CL_BATHROOM', 2, 'Vòi sen và vòi lavabo đủ áp lực, không rò rỉ', 'PLUMBING', 'MAJOR'),
             ('CL_BATHROOM', 3, 'Quạt thông gió nhà tắm hoạt động', 'ELECTRICAL', 'MINOR'),
             ('CL_BATHROOM', 4, 'Gương, kệ và móc treo chắc chắn', 'FURNITURE', 'TRIVIAL'),
             ('CL_BATHROOM', 5, 'Nhà tắm khô ráo, không nấm mốc, thoát sàn nhanh', 'CLEANING', 'MINOR'),
             ('CL_NETWORK', 1, 'Wi-Fi của tầng bắt được trong phòng, tốc độ ổn định', 'INTERNET', 'MAJOR'),
             ('CL_NETWORK', 2, 'Ổ mạng dây (LAN) ở bàn học hoạt động', 'INTERNET', 'MINOR'),
             ('CL_NETWORK', 3, 'Không có bộ phát Wi-Fi tự lắp gây nhiễu', 'INTERNET', 'MINOR'))
     v (family_key, n, label, category, severity) ON v.family_key = c.family_key
WHERE c.family_key IN ('CL_PRE_ARRIVAL', 'CL_SECURITY', 'CL_BATHROOM', 'CL_NETWORK')
  AND NOT EXISTS (SELECT 1 FROM mnt_checklist_item i WHERE i.checklist_id = c.id AND i.label = v.label);

UPDATE mnt_inspection_schedule s
SET name = 'Kiểm tra phòng trước nhận phòng · Tòa ' || b.code,
    assignee_id = coalesce((SELECT u.id FROM auth_user u WHERE u.email = 'staff' || lower(b.code) || '02@fpt.edu.vn'), s.assignee_id)
FROM inv_building b
WHERE b.id = s.building_id
  AND (s.name = 'Pre-arrival check (demo)'
       OR s.name LIKE 'Pre-arrival check Block % (demo)'
       OR s.name LIKE 'Kiểm tra phòng trước nhận phòng%');

UPDATE mnt_inspection_run r
SET inspector_id = s.assignee_id
FROM mnt_inspection_schedule s
WHERE r.schedule_id = s.id
  AND s.name LIKE 'Kiểm tra phòng trước nhận phòng%'
  AND r.inspector_id IS DISTINCT FROM s.assignee_id;
