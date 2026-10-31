-- =====================================================================
-- Demo accounts of the base data: new names and password (review item R-01,
-- user decision 30/10/2026).
--
-- The base data (db/seed) now has admin01…admin04, manager01…manager04 and
-- staffa01…staffh04 (four per Block), all @fpt.edu.vn, and every fictional
-- account signs in with the password 123. A database that loaded the older
-- seed (admin, manager.a…manager.h, staff.a1…staff.h2, password 12321321)
-- keeps its history: the accounts are renamed, not replaced, so Audit Log
-- rows, decisions and demo data stay linked to them.
--   admin → admin01, manager.a…d → manager01…04, staff.x1/x2 → staffx01/02;
--   manager.e…h are disabled (kept for their history);
--   the accounts the older seed did not have are added, only when the seed
--   was loaded (a database without it gets no account here);
--   every fictional account with a password gets the new one.
-- Only fictional accounts (auth_user.demo) are touched, and a rename is
-- skipped when the new address is taken, so this is safe to run again and on
-- a database without the seed. On a fresh database it runs before db/seed,
-- which then adds the accounts itself.
-- =====================================================================

UPDATE auth_user u
SET email = m.new_name || '@fpt.edu.vn', updated_at = now()
FROM (VALUES
  ('admin', 'admin01'),
  ('manager.a', 'manager01'),
  ('manager.b', 'manager02'),
  ('manager.c', 'manager03'),
  ('manager.d', 'manager04'),
  ('staff.a1', 'staffa01'),
  ('staff.a2', 'staffa02'),
  ('staff.b1', 'staffb01'),
  ('staff.b2', 'staffb02'),
  ('staff.c1', 'staffc01'),
  ('staff.c2', 'staffc02'),
  ('staff.d1', 'staffd01'),
  ('staff.d2', 'staffd02'),
  ('staff.e1', 'staffe01'),
  ('staff.e2', 'staffe02'),
  ('staff.f1', 'stafff01'),
  ('staff.f2', 'stafff02'),
  ('staff.g1', 'staffg01'),
  ('staff.g2', 'staffg02'),
  ('staff.h1', 'staffh01'),
  ('staff.h2', 'staffh02')) AS m (old_name, new_name)
WHERE u.demo
  AND lower(u.email) = m.old_name || '@fpt.edu.vn'
  AND NOT EXISTS (SELECT 1 FROM auth_user x WHERE lower(x.email) = m.new_name || '@fpt.edu.vn');

-- Four Managers work for every Block: the other four are disabled and signed out.
UPDATE auth_user
SET status = 'DISABLED', updated_at = now()
WHERE demo AND status <> 'DISABLED' AND lower(email) IN ('manager.e@fpt.edu.vn', 'manager.f@fpt.edu.vn', 'manager.g@fpt.edu.vn', 'manager.h@fpt.edu.vn');

UPDATE auth_session s SET revoked_at = now()
FROM auth_user u
WHERE u.id = s.user_id AND s.revoked_at IS NULL AND u.demo AND lower(u.email) IN ('manager.e@fpt.edu.vn', 'manager.f@fpt.edu.vn', 'manager.g@fpt.edu.vn', 'manager.h@fpt.edu.vn');

-- The accounts the older seed did not have (the same list as db/seed).
INSERT INTO auth_user (email, display_name, password_hash, role, title, demo)
SELECT v.account || '@fpt.edu.vn', v.name, '$2a$10$ZnX/vzGmBxfAftho3lPbDOh/77QstH0rKRE5vDVjI5qY5p/VU8K5C', v.role, v.title, TRUE
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
WHERE EXISTS (SELECT 1 FROM auth_user WHERE demo AND email ~ '^(admin0[1-4]|manager0[1-4]|staff[a-h]0[1-4])@fpt\.edu\.vn$')
ON CONFLICT DO NOTHING;

INSERT INTO auth_user_block (user_id, building_id)
SELECT u.id, b.id
FROM auth_user u JOIN inv_building b ON u.email ~ ('^staff' || lower(b.code) || '0[1-4]@fpt\.edu\.vn$')
WHERE u.demo AND u.role = 'STAFF'
ON CONFLICT DO NOTHING;

INSERT INTO auth_staff_profile (user_id)
SELECT u.id FROM auth_user u WHERE u.demo AND u.role = 'STAFF' AND u.email ~ '^staff[a-h]0[1-4]@fpt\.edu\.vn$'
ON CONFLICT (user_id) DO NOTHING;

-- Password 123 for every fictional account that has one (back office and the 6,200 students).
UPDATE auth_user
SET password_hash = '$2a$10$ZnX/vzGmBxfAftho3lPbDOh/77QstH0rKRE5vDVjI5qY5p/VU8K5C', failed_attempts = 0, locked_until = NULL, updated_at = now()
WHERE demo AND password_hash IS NOT NULL AND password_hash <> '$2a$10$ZnX/vzGmBxfAftho3lPbDOh/77QstH0rKRE5vDVjI5qY5p/VU8K5C';
