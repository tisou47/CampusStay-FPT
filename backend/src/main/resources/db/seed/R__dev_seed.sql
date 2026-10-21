-- =====================================================================
-- CampusStay FPT — demo seed (profile "dev"; a demo server may load it too).
--
-- A campus of 8 Blocks (A–D male, E–H female; 3,680 Beds), 6,200 students
-- and four years of operation: 14 Terms from Fall 2022 to Spring 2027, three
-- a year. Fall 2026 is the current Term with 60% of the Beds taken; Spring
-- 2027 is open for registration. Every past Term holds its Applications,
-- assignment run, Allocations, check-ins and check-outs, Invoices, Payments
-- and bank transfers, meter readings and Utility Invoices, refunds,
-- Maintenance Requests, inspections, Room-Change Requests, swaps, late
-- check-ins and escalations, so every report and dashboard has history.
--
-- People are fictional and generated deterministically (same data on every
-- load). Emails are <account>@example.com, or <SEED_MAILBOX>+<account>@gmail.com
-- when SEED_MAILBOX is set (placeholder seed_mailbox in application.yml), so
-- no demo email can reach a stranger. Password of every account: CampusStay@2026
--
-- It needs an empty database and runs once; to load a newer version, recreate
-- the database (backend/README.md). The integration tests use their own small
-- seed (src/test/resources/db/test-seed).
-- =====================================================================

-- ---------- helpers (this session only) ----------
CREATE OR REPLACE FUNCTION pg_temp.rnd(seed text) RETURNS double precision LANGUAGE sql IMMUTABLE AS $f$
    SELECT (('x' || lpad(substr(md5(seed), 1, 8), 16, '0'))::bit(64)::bigint) / 4294967296.0
$f$;

CREATE OR REPLACE FUNCTION pg_temp.pick(arr text[], seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
    SELECT arr[1 + floor(pg_temp.rnd(seed) * array_length(arr, 1))::int]
$f$;

CREATE OR REPLACE FUNCTION pg_temp.mail(account text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
    SELECT CASE WHEN '${seed_mailbox}' = '' THEN account || '@example.com'
                ELSE '${seed_mailbox}' || '+' || account || '@gmail.com' END
$f$;

-- A campus-time moment: the day at the given hour (fractions are minutes).
CREATE OR REPLACE FUNCTION pg_temp.at(d date, hours double precision) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $f$
    SELECT (d::timestamp + make_interval(secs => hours * 3600)) AT TIME ZONE 'Asia/Ho_Chi_Minh'
$f$;

-- How a paid Invoice was paid: one in ten confirmed by hand, the rest through the bank feed (VietQR).
CREATE OR REPLACE FUNCTION pg_temp.method(invoice bigint, status text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
    SELECT CASE WHEN status IN ('PAID', 'REFUNDED')
                THEN CASE WHEN pg_temp.rnd('manual' || invoice) < 0.10 THEN 'MANUAL' ELSE 'VIETQR' END END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.up1000(amount numeric) RETURNS bigint LANGUAGE sql IMMUTABLE AS $f$
    SELECT (ceil(amount / 1000) * 1000)::bigint
$f$;

DO $seed$
DECLARE
    pw CONSTANT text := '$2a$10$zoI/Bzs2QVn2P5.PI7WCr.Pjmvj33otA/k4qD9T5jCyU9EhR2ox/S';
    -- "Now" of the demo: inside the current Term even when the seed is loaded a little earlier or later.
    now_ts CONSTANT timestamptz := least(greatest(now(), TIMESTAMPTZ '2026-10-01 08:00+07'),
                                         TIMESTAMPTZ '2026-12-20 08:00+07');
    v_utility_deposit CONSTANT bigint := 600000;
    t record;
    v_snapshot bigint;
    v_run bigint;
    admin_id bigint;
    finance_admin_id bigint;
    rule_utility bigint;
    rule_early bigint;
    rule_before bigint;
    rule_after bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM cfg_term WHERE code = 'FA22') THEN
        RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM auth_user) THEN
        RAISE EXCEPTION 'The demo seed needs an empty database: recreate it (backend/README.md, "Demo data").';
    END IF;

    -- ================================================================ catalog and policies
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
    UPDATE cfg_fee_policy SET policy_confirmed = TRUE, updated_at = TIMESTAMPTZ '2022-06-15 09:00+07' WHERE id = 1;
    SELECT id INTO v_snapshot FROM cfg_matching_snapshot WHERE active ORDER BY id LIMIT 1;
    SELECT id INTO rule_utility FROM cfg_refund_rule WHERE trigger_code = 'UTILITY_DEPOSIT';
    SELECT id INTO rule_early FROM cfg_refund_rule WHERE trigger_code = 'EARLY_CHECK_OUT';
    SELECT id INTO rule_before FROM cfg_refund_rule WHERE trigger_code = 'CANCEL_BEFORE_RESULTS';
    SELECT id INTO rule_after FROM cfg_refund_rule WHERE trigger_code = 'CANCEL_AFTER_RESULTS';

    -- ================================================================ Terms: Fall 2022 … Spring 2027
    RAISE NOTICE 'Demo seed: %', 'Terms: Fall 2022 … Spring 2027';
    CREATE TEMP TABLE t_term ON COMMIT DROP AS
    WITH list (idx, kind, yr) AS (VALUES (1, 'FA', 2022), (2, 'SP', 2023), (3, 'SU', 2023), (4, 'FA', 2023),
                                         (5, 'SP', 2024), (6, 'SU', 2024), (7, 'FA', 2024), (8, 'SP', 2025),
                                         (9, 'SU', 2025), (10, 'FA', 2025), (11, 'SP', 2026), (12, 'SU', 2026),
                                         (13, 'FA', 2026), (14, 'SP', 2027))
    SELECT idx, kind, yr, kind || right(yr::text, 2) AS code,
           CASE kind WHEN 'FA' THEN 'Fall ' WHEN 'SP' THEN 'Spring ' ELSE 'Summer ' END || yr AS name,
           CASE kind WHEN 'FA' THEN make_date(yr, 9, 7) WHEN 'SP' THEN make_date(yr, 1, 4) ELSE make_date(yr, 5, 4) END AS stay_start,
           CASE kind WHEN 'FA' THEN make_date(yr, 12, 27) WHEN 'SP' THEN make_date(yr, 4, 25) ELSE make_date(yr, 8, 22) END AS stay_end,
           pg_temp.at(CASE kind WHEN 'FA' THEN make_date(yr, 7, 1) WHEN 'SP' THEN make_date(yr - 1, 10, 15) ELSE make_date(yr, 3, 15) END, 8) AS reg_open,
           pg_temp.at(CASE kind WHEN 'FA' THEN make_date(yr, 7, 31) WHEN 'SP' THEN make_date(yr - 1, 11, 15) ELSE make_date(yr, 4, 5) END, 23 + 59.0 / 60) AS reg_close,
           pg_temp.at(CASE kind WHEN 'FA' THEN make_date(yr, 8, 10) WHEN 'SP' THEN make_date(yr - 1, 11, 22) ELSE make_date(yr, 4, 12) END, 8) AS results,
           pg_temp.at(CASE kind WHEN 'FA' THEN make_date(yr, 8, 25) WHEN 'SP' THEN make_date(yr - 1, 12, 10) ELSE make_date(yr, 4, 22) END, 23 + 59.0 / 60) AS balance_due,
           CASE kind WHEN 'FA' THEN make_date(yr, 9, 3) WHEN 'SP' THEN make_date(yr - 1, 12, 30) ELSE make_date(yr, 4, 30) END AS ci_start,
           CASE kind WHEN 'FA' THEN make_date(yr, 9, 6) WHEN 'SP' THEN make_date(yr, 1, 3) ELSE make_date(yr, 5, 3) END AS ci_end,
           CASE kind WHEN 'FA' THEN make_date(yr, 12, 28) WHEN 'SP' THEN make_date(yr, 4, 26) ELSE make_date(yr, 8, 23) END AS co_by,
           pg_temp.at(CASE kind WHEN 'FA' THEN make_date(yr, 6, 20) WHEN 'SP' THEN make_date(yr - 1, 10, 1) ELSE make_date(yr, 3, 1) END, 8) AS published,
           CASE WHEN idx <= 12 THEN 'past' WHEN idx = 13 THEN 'current' ELSE 'future' END AS phase,
           CASE WHEN idx = 13 THEN 0.60 WHEN idx = 14 THEN 0
                WHEN kind = 'FA' THEN 0.80 + 0.01 * (yr - 2022)
                WHEN kind = 'SP' THEN 0.72 + 0.01 * (yr - 2023)
                ELSE 0.34 + 0.01 * (yr - 2023) END AS occ,
           least(1.0, 1 - 0.01 * (13 - idx)) AS price_factor,
           0::bigint AS id
    FROM list;

    INSERT INTO cfg_term (code, name, status, stay_start, stay_end, registration_opens_at, registration_closes_at,
                          results_published_at, roommate_hours, deposit_hours, balance_due_at, check_in_start,
                          check_in_end, check_out_by, published_at, created_at, updated_at)
    SELECT code, name, 'PUBLISHED', stay_start, stay_end, reg_open, reg_close, results, 48, 48, balance_due, ci_start,
           ci_end, co_by, published, published - interval '10 days', published
    FROM t_term ORDER BY idx;
    UPDATE t_term x SET id = c.id FROM cfg_term c WHERE c.code = x.code;

    -- Months of each Term: three closed meter months, the fourth is settled at check-out.
    CREATE TEMP TABLE t_month ON COMMIT DROP AS
    SELECT x.idx, x.id AS term_id, m.n,
           (date_trunc('month', x.stay_start) + make_interval(months => m.n - 1))::date AS month_start
    FROM t_term x CROSS JOIN generate_series(1, 4) AS m(n)
    WHERE x.phase <> 'future';

    -- ================================================================ Blocks, Floors, Rooms, Beds
    RAISE NOTICE 'Demo seed: %', 'Blocks, Floors, Rooms, Beds';
    INSERT INTO inv_building (code, name, gender, created_at)
    SELECT c, 'Block ' || c, CASE WHEN c < 'E' THEN 'M' ELSE 'F' END, TIMESTAMPTZ '2022-05-02 09:00+07'
    FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) AS c;

    -- Floors 1-4 Basic, 5-8 Standard, 9-10 Premium.
    INSERT INTO inv_floor (building_id, floor_no, room_class_id)
    SELECT b.id, f.n, (SELECT id FROM cfg_room_class WHERE name = CASE WHEN f.n <= 4 THEN 'Basic' WHEN f.n <= 8 THEN 'Standard' ELSE 'Premium' END)
    FROM inv_building b CROSS JOIN generate_series(1, 10) AS f(n);

    -- Each Floor: 4 × 2-bed, 5 × 4-bed, 3 × 6-bed = 12 Rooms, 46 Beds.
    INSERT INTO inv_floor_layout (floor_id, room_type_id, room_count)
    SELECT fl.id, rt.id, CASE rt.name WHEN '2-bed' THEN 4 WHEN '4-bed' THEN 5 ELSE 3 END
    FROM inv_floor fl CROSS JOIN cfg_room_type rt;

    -- Room numbers <floor><nn>: 01-04 are 2-bed, 05-09 4-bed, 10-12 6-bed (A-101 … A-1012).
    INSERT INTO inv_room (code, building_id, floor_id, room_type_id, created_at)
    SELECT b.code || '-' || fl.floor_no || lpad(r.n::text, 2, '0'), b.id, fl.id,
           (SELECT id FROM cfg_room_type WHERE name = CASE WHEN r.n <= 4 THEN '2-bed' WHEN r.n <= 9 THEN '4-bed' ELSE '6-bed' END),
           TIMESTAMPTZ '2022-05-02 09:00+07'
    FROM inv_floor fl JOIN inv_building b ON b.id = fl.building_id CROSS JOIN generate_series(1, 12) AS r(n);

    INSERT INTO inv_bed (room_id, label)
    SELECT ro.id, chr(64 + s.n)
    FROM inv_room ro JOIN cfg_room_type rt ON rt.id = ro.room_type_id CROSS JOIN LATERAL generate_series(1, rt.beds) AS s(n);

    CREATE TEMP TABLE t_bed ON COMMIT DROP AS
    SELECT b.id AS bed_id, b.label, ascii(b.label) - 64 AS label_no, r.id AS room_id, r.code AS room, r.building_id,
           bl.code AS block, bl.gender, f.floor_no AS floor, r.room_type_id AS type_id, rt.name AS type_name, rt.beds,
           f.room_class_id AS class_id, rc.name AS class_name, round(rt.base_price * (1 + rc.surcharge_rate)) AS price,
           r.code IN ('A-305', 'C-712', 'F-1003', 'H-208') AS oos_now
    FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_floor f ON f.id = r.floor_id
    JOIN inv_building bl ON bl.id = r.building_id JOIN cfg_room_type rt ON rt.id = r.room_type_id
    JOIN cfg_room_class rc ON rc.id = f.room_class_id;
    CREATE INDEX ON t_bed (bed_id);

    -- ================================================================ back-office accounts
    RAISE NOTICE 'Demo seed: %', 'back-office accounts';
    CREATE TEMP TABLE t_staff (account text, name text, role text, title text, blocks text, handles text[], on_duty boolean,
                               status text, uid bigint) ON COMMIT DROP;
    INSERT INTO t_staff (account, name, role, title, blocks, handles, on_duty, status) VALUES
      ('admin',         'Tran Minh Quan',        'ADMIN',   'Housing Administrator', '', NULL, NULL, 'ACTIVE'),
      ('admin.finance', 'Nguyen Thi Thu Hien',   'ADMIN',   'Finance Administrator', '', NULL, NULL, 'ACTIVE'),
      ('manager.a',     'Le Hoang Nam',          'MANAGER', 'Block A Manager', 'A', NULL, NULL, 'ACTIVE'),
      ('manager.b',     'Pham Thanh Tung',       'MANAGER', 'Block B Manager', 'B', NULL, NULL, 'ACTIVE'),
      ('manager.c',     'Vo Minh Triet',         'MANAGER', 'Block C Manager', 'C', NULL, NULL, 'ACTIVE'),
      ('manager.d',     'Dang Quoc Viet',        'MANAGER', 'Block D Manager', 'D', NULL, NULL, 'ACTIVE'),
      ('manager.e',     'Pham Thu Ha',           'MANAGER', 'Block E Manager', 'E', NULL, NULL, 'ACTIVE'),
      ('manager.f',     'Nguyen Ngoc Diem',      'MANAGER', 'Block F Manager', 'F', NULL, NULL, 'ACTIVE'),
      ('manager.g',     'Tran Bao Chau',         'MANAGER', 'Block G Manager', 'G', NULL, NULL, 'ACTIVE'),
      ('manager.h',     'Huynh Thanh Thao',      'MANAGER', 'Block H Manager', 'H', NULL, NULL, 'ACTIVE'),
      ('staff.a1', 'Nguyen Van Binh',    'STAFF', 'Residence Life Officer', 'A', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.a2', 'Vo Thanh Tung',      'STAFF', 'Maintenance Technician', 'A', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('staff.b1', 'Tran Quoc Huy',      'STAFF', 'Residence Life Officer', 'B', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.b2', 'Le Van Thanh',       'STAFF', 'Maintenance Technician', 'B', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', FALSE, 'ACTIVE'),
      ('staff.c1', 'Phan Minh Khoa',     'STAFF', 'Residence Life Officer', 'C', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.c2', 'Bui Duc Thang',      'STAFF', 'Maintenance Technician', 'C', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('staff.d1', 'Ho Tan Phat',        'STAFF', 'Residence Life Officer', 'D', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.d2', 'Ngo Van Hai',        'STAFF', 'Maintenance Technician', 'D', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('staff.e1', 'Do Ngoc Lan',        'STAFF', 'Residence Life Officer', 'E', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.e2', 'Truong Van Loc',     'STAFF', 'Maintenance Technician', 'E', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('staff.f1', 'Nguyen Thi Mai',     'STAFF', 'Residence Life Officer', 'F', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.f2', 'Dinh Quang Vinh',    'STAFF', 'Maintenance Technician', 'F', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('staff.g1', 'Le Thi Hong Nhung',  'STAFF', 'Residence Life Officer', 'G', '{DESK,APPLICATIONS,ROOM_CHANGES}', FALSE, 'ACTIVE'),
      ('staff.g2', 'Cao Van Duc',        'STAFF', 'Maintenance Technician', 'G', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('staff.h1', 'Pham Thi Thanh Truc','STAFF', 'Residence Life Officer', 'H', '{DESK,APPLICATIONS,ROOM_CHANGES}', TRUE, 'ACTIVE'),
      ('staff.h2', 'Mai Xuan Truong',    'STAFF', 'Maintenance Technician', 'H', '{MAINTENANCE,INSPECTIONS,METER_READINGS}', TRUE, 'ACTIVE'),
      ('finance.1', 'Huynh Gia Bao',     'STAFF', 'Finance Officer', 'ABCD', '{PAYMENTS}', TRUE, 'ACTIVE'),
      ('finance.2', 'Vu Thi Kim Ngan',   'STAFF', 'Finance Officer', 'EFGH', '{PAYMENTS}', TRUE, 'ACTIVE'),
      ('staff.former', 'Luong Van Son',  'STAFF', 'Residence Life Officer', 'B', '{DESK,APPLICATIONS}', FALSE, 'DISABLED');
    UPDATE t_staff SET uid = nextval(pg_get_serial_sequence('auth_user', 'id'));
    INSERT INTO auth_user (id, email, display_name, password_hash, role, title, status, created_at, last_sign_in_at)
    OVERRIDING SYSTEM VALUE
    SELECT uid, pg_temp.mail(account), name, pw, role, title, status, TIMESTAMPTZ '2022-05-15 09:00+07',
           CASE WHEN status = 'ACTIVE' THEN now_ts - make_interval(hours => (pg_temp.rnd(account) * 30)::int) END
    FROM t_staff;
    INSERT INTO auth_user_block (user_id, building_id)
    SELECT s.uid, b.id FROM t_staff s JOIN inv_building b ON position(b.code IN s.blocks) > 0;
    INSERT INTO auth_staff_profile (user_id, handles, on_duty)
    SELECT uid, handles, on_duty FROM t_staff WHERE role = 'STAFF';
    SELECT uid INTO admin_id FROM t_staff WHERE account = 'admin';
    SELECT uid INTO finance_admin_id FROM t_staff WHERE account = 'admin.finance';

    -- Who does what in each Block.
    CREATE TEMP TABLE t_role ON COMMIT DROP AS
    SELECT b.id AS building_id, b.code AS block,
           (SELECT uid FROM t_staff WHERE account = 'manager.' || lower(b.code)) AS manager,
           (SELECT uid FROM t_staff WHERE account = 'staff.' || lower(b.code) || '1') AS desk,
           (SELECT uid FROM t_staff WHERE account = 'staff.' || lower(b.code) || '2') AS tech,
           (SELECT uid FROM t_staff WHERE account = CASE WHEN b.code < 'E' THEN 'finance.1' ELSE 'finance.2' END) AS finance
    FROM inv_building b;

    -- ================================================================ Block configuration
    RAISE NOTICE 'Demo seed: %', 'Block configuration';
    UPDATE inv_room r SET status = 'OUT_OF_SERVICE', oos_since = v.since, oos_reason = v.reason, oos_note = v.note,
                          oos_by = (SELECT manager FROM t_role WHERE building_id = r.building_id)
    FROM (VALUES ('A-305', TIMESTAMPTZ '2026-10-10 09:00+07', 'MAINTENANCE', 'Water leak under the bathroom sink'),
                 ('C-712', TIMESTAMPTZ '2026-08-20 09:00+07', 'RENOVATION', 'Bathroom renovation before Fall 2026'),
                 ('F-1003', TIMESTAMPTZ '2026-10-18 15:30+07', 'SAFETY', 'Cracked balcony railing'),
                 ('H-208', TIMESTAMPTZ '2026-10-05 10:00+07', 'MAINTENANCE', 'Air conditioner replacement')) AS v (code, since, reason, note)
    WHERE r.code = v.code;

    INSERT INTO cfg_block_settings (building_id, desk_opens, desk_closes, visit_from, visit_until, quiet_from, house_rules,
                                    edited_at, edited_by)
    SELECT r.building_id,
           CASE WHEN r.block IN ('C', 'G') THEN TIME '07:00' ELSE TIME '07:30' END,
           CASE WHEN r.block IN ('C', 'G') THEN TIME '21:30' ELSE TIME '21:00' END,
           TIME '08:00', CASE WHEN r.block < 'E' THEN TIME '21:30' ELSE TIME '21:00' END,
           CASE WHEN r.block IN ('B', 'F') THEN TIME '22:30' ELSE TIME '23:00' END,
           'No guests overnight. Quiet hours from ' || CASE WHEN r.block IN ('B', 'F') THEN '22:30' ELSE '23:00' END
               || '. Cooking only in the shared kitchen on each floor. Keep corridors and balconies clear.',
           TIMESTAMPTZ '2026-08-15 10:00+07', r.manager
    FROM t_role r;

    INSERT INTO req_sla_policy (building_id, urgent_hours, normal_hours, room_change_hours, updated_at, updated_by)
    SELECT building_id, CASE WHEN block IN ('C', 'G') THEN 2 ELSE 4 END, CASE WHEN block IN ('C', 'G') THEN 24 ELSE 48 END,
           CASE WHEN block IN ('C', 'G') THEN 48 ELSE 72 END, TIMESTAMPTZ '2025-08-20 09:00+07', manager
    FROM t_role;

    INSERT INTO req_routing_rule (building_id, request_type, scope, condition, assignee_id, fallback_id, active, sort_order,
                                  updated_at)
    SELECT building_id, 'MAINTENANCE', 'ALL', NULL, tech, desk, TRUE, 1, TIMESTAMPTZ '2025-08-20 09:00+07' FROM t_role
    UNION ALL
    SELECT building_id, 'ROOM_CHANGE', 'ALL', NULL, desk, manager, TRUE, 2, TIMESTAMPTZ '2025-08-20 09:00+07' FROM t_role
    UNION ALL
    SELECT building_id, 'MAINTENANCE', 'INTERNET', 'Wi-Fi and LAN go to the desk first', desk, tech, TRUE, 3,
           TIMESTAMPTZ '2026-02-10 09:00+07'
    FROM t_role WHERE block IN ('A', 'E')
    UNION ALL
    SELECT building_id, 'SWAP', 'ALL', 'Paused during the Fall 2026 audit', desk, NULL, FALSE, 4,
           TIMESTAMPTZ '2026-09-01 09:00+07'
    FROM t_role WHERE block = 'D';

    INSERT INTO auth_staff_account_request (building_id, requested_by, name, email, role, status, created_at, decided_by,
                                            decided_at)
    SELECT r.building_id, r.manager, v.name, pg_temp.mail(v.account), v.role, v.status, v.created,
           CASE WHEN v.status <> 'PENDING' THEN admin_id END, CASE WHEN v.status <> 'PENDING' THEN v.created + interval '2 days' END
    FROM (VALUES ('B', 'Nguyen Huu Tri', 'tri.nguyen', 'STAFF', 'APPROVED', TIMESTAMPTZ '2025-08-05 10:00+07'),
                 ('G', 'Tran Thi Yen', 'yen.tran', 'STAFF', 'REJECTED', TIMESTAMPTZ '2026-01-12 14:00+07'),
                 ('D', 'Le Minh Duc', 'duc.le', 'STAFF', 'PENDING', TIMESTAMPTZ '2026-10-16 09:20+07'),
                 ('H', 'Vo Thi Bich', 'bich.vo', 'MANAGER', 'PENDING', TIMESTAMPTZ '2026-10-19 16:05+07')) AS v (block, name, account, role, status, created)
    JOIN t_role r ON r.block = v.block;

    -- ================================================================ inspection checklists
    RAISE NOTICE 'Demo seed: %', 'inspection checklists';
    INSERT INTO mnt_checklist (family_key, name, version, status, published_at, archived_at, updated_at) VALUES
      ('CL-ROOM', 'Room safety check', 1, 'REPLACED', TIMESTAMPTZ '2022-08-20 09:00+07', NULL, TIMESTAMPTZ '2024-08-15 09:00+07'),
      ('CL-ROOM', 'Room safety check', 2, 'PUBLISHED', TIMESTAMPTZ '2024-08-15 09:00+07', NULL, TIMESTAMPTZ '2024-08-15 09:00+07'),
      ('CL-AC', 'Air-conditioner check', 1, 'PUBLISHED', TIMESTAMPTZ '2025-03-01 09:00+07', NULL, TIMESTAMPTZ '2025-03-01 09:00+07'),
      ('CL-FIRE', 'Fire extinguisher walk', 1, 'ARCHIVED', TIMESTAMPTZ '2023-01-10 09:00+07', TIMESTAMPTZ '2025-01-05 09:00+07',
       TIMESTAMPTZ '2025-01-05 09:00+07');
    INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
    SELECT c.id, v.label, v.category, v.severity, v.n
    FROM mnt_checklist c JOIN (VALUES
        ('CL-ROOM', 1, 'Smoke detector works', 'ELECTRICAL', 'CRITICAL', 1),
        ('CL-ROOM', 1, 'Lights and sockets work', 'ELECTRICAL', 'MAJOR', 2),
        ('CL-ROOM', 1, 'No leaks under the sink or in the shower', 'PLUMBING', 'MAJOR', 3),
        ('CL-ROOM', 1, 'Beds, desks and wardrobes are intact', 'FURNITURE', 'MINOR', 4),
        ('CL-ROOM', 1, 'Room is clean', 'CLEANING', 'TRIVIAL', 5),
        ('CL-ROOM', 2, 'Smoke detector works', 'ELECTRICAL', 'CRITICAL', 1),
        ('CL-ROOM', 2, 'Lights and sockets work', 'ELECTRICAL', 'MAJOR', 2),
        ('CL-ROOM', 2, 'No leaks under the sink or in the shower', 'PLUMBING', 'MAJOR', 3),
        ('CL-ROOM', 2, 'Air conditioner cools and drains', 'AIR_CONDITIONING', 'MINOR', 4),
        ('CL-ROOM', 2, 'Beds, desks and wardrobes are intact', 'FURNITURE', 'MINOR', 5),
        ('CL-ROOM', 2, 'Room is clean', 'CLEANING', 'TRIVIAL', 6),
        ('CL-AC', 1, 'Filter is clean', 'AIR_CONDITIONING', 'MINOR', 1),
        ('CL-AC', 1, 'Drain pipe does not drip', 'AIR_CONDITIONING', 'MAJOR', 2),
        ('CL-AC', 1, 'Remote control works', 'AIR_CONDITIONING', 'TRIVIAL', 3),
        ('CL-FIRE', 1, 'Extinguisher is in date', 'OTHER', 'CRITICAL', 1),
        ('CL-FIRE', 1, 'Exit sign is lit', 'ELECTRICAL', 'MAJOR', 2)) AS v (family, version, label, category, severity, n)
      ON v.family = c.family_key AND v.version = c.version;

    -- ================================================================ students (mock SIS directory)
    RAISE NOTICE 'Demo seed: %', 'students (mock SIS directory)';
    -- Cohorts K17 (entered 2021) … K22 (2026); 58% male. Codes SE/SS/SA + cohort + number, e.g. SE190421.
    CREATE TEMP TABLE t_stu ON COMMIT DROP AS
    WITH c (cohort, entry, size, base) AS (VALUES (17, 2021, 900, 0), (18, 2022, 1000, 900), (19, 2023, 1080, 1900),
                                                  (20, 2024, 1080, 2980), (21, 2025, 1070, 4060), (22, 2026, 1070, 5130)),
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
                   'Kien Giang|MEKONG','Soc Trang|MEKONG','Ca Mau|MEKONG','Vinh Long|MEKONG','Bac Lieu|MEKONG'], 'home' || n) AS home,
               pg_temp.rnd('enrol' || n) AS er
        FROM g)
    SELECT n, cohort, entry, seq, CASE WHEN male THEN 'M' ELSE 'F' END AS gender, major,
           (CASE major WHEN 'GD' THEN 'SA' WHEN 'BA' THEN 'SS' WHEN 'MC' THEN 'SS' WHEN 'EN' THEN 'SS' WHEN 'JP' THEN 'SS' ELSE 'SE' END)
               || cohort || lpad(seq::text, 4, '0') AS code,
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
                                        'Loan','My'], 'given' || n) END AS given,
           CASE WHEN cohort = 17 THEN CASE WHEN er < 0.90 THEN 'GRADUATED' ELSE 'WITHDRAWN' END
                WHEN cohort = 18 THEN CASE WHEN er < 0.12 THEN 'GRADUATED' WHEN er < 0.17 THEN 'WITHDRAWN'
                                           WHEN er < 0.19 THEN 'SUSPENDED' ELSE 'ENROLLED' END
                WHEN cohort = 22 THEN 'ENROLLED'
                ELSE CASE WHEN er < 0.04 THEN 'WITHDRAWN' WHEN er < 0.06 THEN 'SUSPENDED' ELSE 'ENROLLED' END END AS enrollment,
           -- How keen the student is on the dormitory: students from far away more so.
           pg_temp.rnd('dorm' || n) * 0.8 + CASE WHEN split_part(home, '|', 2) = 'SOUTHEAST' THEN 0 ELSE 0.35 END AS affinity,
           0::bigint AS uid, NULL::date AS left_on
    FROM x;
    UPDATE t_stu SET left_on = CASE enrollment
            WHEN 'GRADUATED' THEN make_date(entry + 4, 8, 31)
            WHEN 'WITHDRAWN' THEN make_date(entry, 9, 1) + (pg_temp.rnd('left' || n) * (DATE '2026-09-01' - make_date(entry, 9, 1)))::int
        END,
        uid = nextval(pg_get_serial_sequence('auth_user', 'id'));
    CREATE INDEX ON t_stu (uid);

    INSERT INTO auth_user (id, email, display_name, password_hash, role, status, created_at, updated_at, last_sign_in_at)
    OVERRIDING SYSTEM VALUE
    SELECT uid, pg_temp.mail(lower(code)), family || ' ' || middle || ' ' || given, pw, 'STUDENT',
           CASE WHEN enrollment IN ('GRADUATED', 'WITHDRAWN') THEN 'DISABLED' ELSE 'ACTIVE' END,
           pg_temp.at(make_date(entry, 8, 20), 9), pg_temp.at(make_date(entry, 8, 20), 9),
           CASE WHEN enrollment IN ('GRADUATED', 'WITHDRAWN') THEN pg_temp.at(left_on, 10)
                ELSE now_ts - make_interval(days => (pg_temp.rnd('seen' || n) * 60)::int, hours => (pg_temp.rnd('seenh' || n) * 20)::int) END
    FROM t_stu;

    INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, semester_no, hometown, region,
                              enrollment_status, priority_groups, phone, emergency_name, emergency_relationship,
                              emergency_phone, synced_at)
    SELECT uid, code, gender, make_date(entry - 18, 1, 1) + (pg_temp.rnd('dob' || n) * 364)::int, major, 'K' || cohort,
           CASE WHEN enrollment = 'ENROLLED' OR enrollment = 'SUSPENDED' THEN least(12, (2026 - entry) * 3 + 1)
                WHEN enrollment = 'GRADUATED' THEN 12
                ELSE least(12, greatest(1, ((left_on - make_date(entry, 9, 1)) / 120) + 1)) END,
           hometown, region, enrollment,
           array_remove(ARRAY[
               CASE WHEN cohort = 22 THEN 'FIRST_YEAR' END,
               CASE WHEN region <> 'SOUTHEAST' THEN 'FAR_FROM_CAMPUS' END,
               CASE WHEN pg_temp.rnd('scholar' || n) < 0.07 THEN 'SCHOLARSHIP' END,
               CASE WHEN pg_temp.rnd('policy' || n) < 0.03 THEN 'POLICY_BENEFICIARY' END], NULL),
           '0' || pg_temp.pick(ARRAY['90','91','93','94','96','97','98','86','88','89','70','76','77','78','79','83','84','85'], 'carrier' || n)
               || lpad(((n * 7919 + 1234567) % 10000000)::text, 7, '0'),
           family || ' ' || pg_temp.pick(ARRAY['Van Hung','Thi Lan','Minh Tuan','Thi Hoa','Quoc Dung','Thi Mai','Van Long',
                                               'Thi Hanh','Duc Thinh','Thi Thu'], 'parent' || n),
           pg_temp.pick(ARRAY['MOTHER','MOTHER','FATHER','FATHER','GUARDIAN','SIBLING'], 'rel' || n),
           '0' || pg_temp.pick(ARRAY['90','91','93','97','98','35','36','37','38','39'], 'pcarrier' || n)
               || lpad(((n * 104729 + 7654321) % 10000000)::text, 7, '0'),
           TIMESTAMPTZ '2026-10-01 01:00+07'
    FROM t_stu;

    -- ================================================================ per-Term working tables
    RAISE NOTICE 'Demo seed: %', 'per-Term working tables';
    CREATE TEMP TABLE t_cand (uid bigint, gender char(1), score double precision, rank int, outcome text) ON COMMIT DROP;
    CREATE TEMP TABLE t_pick (bed_id bigint, gender char(1), r int) ON COMMIT DROP;
    CREATE TEMP TABLE t_app (term_id bigint, app_id bigint, code text, uid bigint, gender char(1), outcome text,
                             bed_id bigint, type_id bigint, class_id bigint, building_id bigint, term_price bigint,
                             deposit bigint, created timestamptz, paid timestamptz, reviewed timestamptz,
                             finished timestamptz, alloc_id bigint, checked_in timestamptz, ended timestamptz,
                             early boolean DEFAULT FALSE, late text, balance_status text) ON COMMIT DROP;
    CREATE TEMP TABLE t_all_app (LIKE t_app) ON COMMIT DROP;

    -- ================================================================ Terms Fall 2022 … Fall 2026
    RAISE NOTICE 'Demo seed: %', 'Terms Fall 2022 … Fall 2026';
    FOR t IN SELECT * FROM t_term WHERE phase <> 'future' ORDER BY idx LOOP
        -- Who applies: students enrolled during the Term, the keenest first.
        TRUNCATE t_cand;
        INSERT INTO t_cand (uid, gender, score)
        SELECT s.uid, s.gender,
               s.affinity * 0.7 + pg_temp.rnd(s.uid || t.code) * 0.3
                   - CASE WHEN t.kind = 'SU' THEN pg_temp.rnd('summer' || s.uid) * 0.5 ELSE 0 END
        FROM t_stu s
        WHERE make_date(s.entry, 9, 1) <= t.stay_start
          AND (s.left_on IS NULL OR t.stay_start < s.left_on)
          AND NOT (s.enrollment = 'SUSPENDED' AND t.phase = 'current');
        WITH ranked AS (SELECT uid, row_number() OVER (PARTITION BY gender ORDER BY score DESC, uid) AS r FROM t_cand)
        UPDATE t_cand c SET rank = ranked.r FROM ranked WHERE ranked.uid = c.uid;
        -- Residents: the Term's occupancy of the Beds, but never more than 62% of the students who could apply
        -- (the first Terms had only two cohorts). Then waitlisted (not in Summer), rejected, cancelled, expired.
        WITH cap AS (
            SELECT b.gender, least(round(b.beds * t.occ), round(c.students * 0.62))::int AS n,
                   CASE WHEN t.kind = 'SU' THEN 0 ELSE round(least(round(b.beds * t.occ), round(c.students * 0.62)) * 0.05) END::int AS w
            FROM (SELECT gender, count(*) AS beds FROM t_bed GROUP BY gender) b
            JOIN (SELECT gender, count(*) AS students FROM t_cand GROUP BY gender) c ON c.gender = b.gender)
        UPDATE t_cand c SET outcome = CASE
                WHEN c.rank <= cap.n THEN 'ALLOCATED'
                WHEN c.rank <= cap.n + cap.w THEN 'WAITLISTED'
                WHEN c.rank <= cap.n * 1.015 + cap.w THEN 'REJECTED'
                WHEN c.rank <= cap.n * 1.045 + cap.w THEN 'CANCELLED'
                WHEN c.rank <= cap.n * 1.075 + cap.w THEN 'EXPIRED'
            END
        FROM cap WHERE cap.gender = c.gender;

        -- Beds: whole Rooms fill before empty ones; Basic Rooms are the most wanted. Rooms out of service now are
        -- left empty in the current Term.
        TRUNCATE t_pick;
        INSERT INTO t_pick (bed_id, gender, r)
        SELECT bed_id, gender, row_number() OVER (PARTITION BY gender ORDER BY
                   pg_temp.rnd(room_id || t.code) * 0.8 + label_no * 0.06
                   + CASE class_name WHEN 'Basic' THEN -0.10 WHEN 'Premium' THEN 0.12 ELSE 0 END, bed_id)
        FROM t_bed WHERE t.phase = 'past' OR NOT oos_now;

        TRUNCATE t_app;
        INSERT INTO t_app (term_id, app_id, uid, gender, outcome, bed_id)
        SELECT t.id, nextval(pg_get_serial_sequence('app_application', 'id')), c.uid, c.gender, c.outcome, p.bed_id
        FROM t_cand c LEFT JOIN t_pick p ON c.outcome = 'ALLOCATED' AND p.gender = c.gender AND p.r = c.rank
        WHERE c.outcome IS NOT NULL
        ORDER BY c.gender, c.rank;
        UPDATE t_app a SET type_id = b.type_id, class_id = b.class_id, building_id = b.building_id
        FROM t_bed b WHERE b.bed_id = a.bed_id;
        UPDATE t_app a SET type_id = (SELECT id FROM cfg_room_type WHERE name = pg_temp.pick(ARRAY['2-bed','4-bed','4-bed','6-bed'], 'type' || a.uid || t.code)),
                           class_id = (SELECT id FROM cfg_room_class WHERE name = pg_temp.pick(ARRAY['Basic','Standard','Standard','Premium'], 'class' || a.uid || t.code))
        WHERE a.bed_id IS NULL;
        UPDATE t_app a SET code = 'APP-' || t.code || '-' || lpad(a.app_id::text, greatest(6, length(a.app_id::text)), '0'),
               term_price = (round(rt.base_price * (1 + rc.surcharge_rate) * t.price_factor / 1000) * 1000)::bigint,
               created = t.reg_open + (t.reg_close - t.reg_open) * (pg_temp.rnd('created' || a.uid || t.code) * 0.92)
        FROM cfg_room_type rt, cfg_room_class rc WHERE rt.id = a.type_id AND rc.id = a.class_id;
        UPDATE t_app SET deposit = round(term_price * 0.20),
               paid = CASE WHEN outcome <> 'EXPIRED' THEN created + make_interval(mins => (20 + pg_temp.rnd('paid' || uid || t.code) * 2500)::int) END,
               reviewed = CASE WHEN outcome IN ('ALLOCATED', 'WAITLISTED', 'REJECTED', 'CANCELLED')
                               THEN least(t.results - interval '5 days',
                                          greatest(created + interval '2 days',
                                                   t.reg_close + make_interval(hours => (6 + pg_temp.rnd('review' || uid || t.code) * 40)::int))) END;
        UPDATE t_app SET finished = CASE outcome
                WHEN 'EXPIRED' THEN created + interval '48 hours'
                WHEN 'CANCELLED' THEN paid + make_interval(days => (1 + pg_temp.rnd('cancel' || uid || t.code) * 25)::int)
                WHEN 'REJECTED' THEN reviewed
                ELSE t.results END;

        -- Late check-ins, early check-outs and, in the current Term, students not checked in yet.
        UPDATE t_app SET late = CASE
                WHEN pg_temp.rnd('late' || uid || t.code) < 0.012 THEN 'LATE'
                WHEN t.phase = 'current' AND pg_temp.rnd('away' || uid || t.code) < 0.018 THEN 'AWAY' END,
               early = pg_temp.rnd('early' || uid || t.code) < CASE WHEN t.phase = 'past' THEN 0.03 ELSE 0.004 END
        WHERE outcome = 'ALLOCATED';
        UPDATE t_app SET early = FALSE WHERE late IS NOT NULL;
        UPDATE t_app SET alloc_id = nextval(pg_get_serial_sequence('asg_allocation', 'id')),
               checked_in = CASE
                   WHEN late = 'AWAY' THEN NULL
                   WHEN late = 'LATE' AND t.phase = 'current' AND pg_temp.rnd('latepending' || uid) < 0.5 THEN NULL
                   WHEN late = 'LATE' THEN pg_temp.at(t.ci_end + 2 + (pg_temp.rnd('latein' || uid || t.code) * 5)::int,
                                                      9 + pg_temp.rnd('lateh' || uid || t.code) * 9)
                   ELSE pg_temp.at(t.ci_start + floor(pg_temp.rnd('ciday' || uid || t.code) * ((t.ci_end - t.ci_start) + 1))::int,
                                   7.5 + pg_temp.rnd('cih' || uid || t.code) * 12) END
        WHERE outcome = 'ALLOCATED';
        UPDATE t_app SET ended = CASE
                WHEN t.phase = 'current' AND early
                    THEN now_ts - make_interval(days => (2 + pg_temp.rnd('earlyday' || uid || t.code) * 14)::int)
                WHEN t.phase = 'current' THEN NULL
                WHEN early THEN pg_temp.at(t.stay_start + (25 + pg_temp.rnd('earlyday' || uid || t.code) * 60)::int, 15)
                ELSE pg_temp.at(t.stay_end - (pg_temp.rnd('coday' || uid || t.code) * 2)::int, 8 + pg_temp.rnd('coh' || uid || t.code) * 10) END
        WHERE outcome = 'ALLOCATED';
        -- Fall 2026: a few students still owe the Balance (they cannot check in yet) or have sent the transfer.
        UPDATE t_app SET balance_status = CASE
                WHEN t.phase = 'past' THEN 'PAID'
                WHEN late = 'AWAY' AND pg_temp.rnd('owe' || uid) < 0.6 THEN 'OVERDUE'
                WHEN late = 'AWAY' THEN 'AWAITING_CONFIRMATION'
                ELSE 'PAID' END
        WHERE outcome = 'ALLOCATED';

        -- Applications and their history.
        INSERT INTO app_application (id, code, term_id, student_id, room_type_id, room_class_id, term_price, surcharge_rate,
                                     deposit_amount, status, roommate_mode, contact, consent_matching, consent_rules,
                                     consented_at, deposit_due_at, submitted_at, reviewed_by, reviewed_at, decision_note,
                                     cancelled_at, cancel_reason, created_at, updated_at, student_name, student_code, gender)
        OVERRIDING SYSTEM VALUE
        SELECT a.app_id, a.code, t.id, a.uid, a.type_id, a.class_id, a.term_price, rc.surcharge_rate, a.deposit, a.outcome,
               'AUTO',
               jsonb_build_object('phone', st.phone, 'email', u.email, 'emergencyName', st.emergency_name,
                                  'relationship', initcap(lower(st.emergency_relationship)), 'emergencyPhone', st.emergency_phone),
               TRUE, TRUE, a.created, a.created + interval '48 hours', a.paid,
               CASE WHEN a.reviewed IS NOT NULL THEN (SELECT desk FROM t_role WHERE block = CASE WHEN a.gender = 'M' THEN 'A' ELSE 'E' END) END,
               a.reviewed,
               CASE WHEN a.outcome = 'REJECTED' THEN pg_temp.pick(ARRAY[
                   'Enrollment status could not be confirmed with the student directory.',
                   'An Invoice from an earlier Term is still overdue.',
                   'The contact details could not be verified.'], 'reject' || a.uid || t.code) END,
               CASE WHEN a.outcome = 'CANCELLED' THEN a.finished END,
               CASE WHEN a.outcome = 'CANCELLED' THEN pg_temp.pick(ARRAY[
                   'Found a room near campus with friends', 'Family moved closer to campus',
                   'Taking a semester off', 'Studying online this Term'], 'creason' || a.uid || t.code) END,
               a.created, coalesce(a.finished, a.created), u.display_name, st.student_code, a.gender
        FROM t_app a JOIN auth_user u ON u.id = a.uid JOIN auth_student st ON st.user_id = a.uid
        JOIN cfg_room_class rc ON rc.id = a.class_id;

        INSERT INTO app_application_event (application_id, status, text, note, visible_to_student, actor_id, at)
        SELECT a.app_id, 'AWAITING_DEPOSIT', 'Application created', NULL, TRUE, a.uid, a.created FROM t_app a
        UNION ALL
        SELECT a.app_id, 'SUBMITTED', 'Deposit paid', NULL, TRUE, NULL, a.paid FROM t_app a WHERE a.paid IS NOT NULL
        UNION ALL
        SELECT a.app_id, CASE WHEN a.outcome = 'REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END,
               CASE WHEN a.outcome = 'REJECTED' THEN 'Not approved' ELSE 'Approved by the dormitory office' END,
               NULL, TRUE, NULL, a.reviewed
        FROM t_app a WHERE a.reviewed IS NOT NULL
        UNION ALL
        SELECT a.app_id, 'ALLOCATED', 'Room and Bed assigned', b.room || ' · Bed ' || b.label, TRUE, NULL, t.results
        FROM t_app a JOIN t_bed b ON b.bed_id = a.bed_id
        UNION ALL
        SELECT a.app_id, 'WAITLISTED', 'Waitlisted', 'No Bed of the chosen Room Type and Room Class was left.', TRUE, NULL,
               t.results
        FROM t_app a WHERE a.outcome = 'WAITLISTED'
        UNION ALL
        SELECT a.app_id, 'CANCELLED', 'Cancelled by the student', NULL, TRUE, a.uid, a.finished
        FROM t_app a WHERE a.outcome = 'CANCELLED'
        UNION ALL
        SELECT a.app_id, 'EXPIRED', 'The Deposit window closed', NULL, TRUE, NULL, a.finished
        FROM t_app a WHERE a.outcome = 'EXPIRED';

        -- The assignment run, reviewed per Block and approved by each Block Manager.
        INSERT INTO asg_run (term_id, kind, status, stage, matching_snapshot_id, started_by, started_at, finished_at,
                             input_count, proposed_count, conflict_count, waitlisted_count, average_fit)
        SELECT t.id, 'REAL', 'COMMITTED', 5, v_snapshot, (SELECT desk FROM t_role WHERE block = 'A'),
               t.results - interval '4 days', t.results - interval '4 days' + interval '3 minutes',
               count(*) FILTER (WHERE outcome IN ('ALLOCATED', 'WAITLISTED')), count(*) FILTER (WHERE outcome = 'ALLOCATED'),
               round(count(*) FILTER (WHERE outcome = 'ALLOCATED') * 0.02), count(*) FILTER (WHERE outcome = 'WAITLISTED'),
               0.7800 + 0.0100 * (t.idx % 5)
        FROM t_app
        RETURNING id INTO v_run;
        INSERT INTO asg_run_block (run_id, building_id, status, submitted_by, submitted_at, decided_by, decided_at, committed_at)
        SELECT v_run, building_id, 'COMMITTED', desk, t.results - interval '3 days', manager, t.results - interval '2 days',
               t.results - interval '1 day'
        FROM t_role;
        INSERT INTO asg_proposal_item (run_id, application_id, building_id, bed_id, fit, issue_code, issue_tone, resolved,
                                       resolution_key, waitlisted, reason)
        SELECT v_run, a.app_id, a.building_id, a.bed_id,
               CASE WHEN a.bed_id IS NOT NULL THEN round((0.55 + pg_temp.rnd('fit' || a.uid || t.code) * 0.44)::numeric, 4) END,
               CASE WHEN a.bed_id IS NOT NULL AND pg_temp.rnd('conflict' || a.uid || t.code) < 0.02 THEN 'ROOMMATE_SPLIT' END,
               CASE WHEN a.bed_id IS NOT NULL AND pg_temp.rnd('conflict' || a.uid || t.code) < 0.02 THEN 'WARNING' END,
               a.bed_id IS NOT NULL AND pg_temp.rnd('conflict' || a.uid || t.code) < 0.02,
               CASE WHEN a.bed_id IS NOT NULL AND pg_temp.rnd('conflict' || a.uid || t.code) < 0.02 THEN 'ACCEPT' END,
               a.outcome = 'WAITLISTED',
               CASE WHEN a.outcome = 'WAITLISTED' THEN 'No Bed of the chosen Room Type and Room Class was left.' END
        FROM t_app a WHERE a.outcome IN ('ALLOCATED', 'WAITLISTED');

        -- Allocations: checked in during the window (late ones after it), checked out at the end of the stay.
        INSERT INTO asg_allocation (id, term_id, application_id, student_id, bed_id, status, source, run_id, allocated_at,
                                    allocated_by, checked_in_at, checked_in_by, hand_over_items, ended_at, end_reason)
        OVERRIDING SYSTEM VALUE
        SELECT a.alloc_id, t.id, a.app_id, a.uid, a.bed_id, CASE WHEN a.ended IS NULL THEN 'ACTIVE' ELSE 'ENDED' END,
               'ASSIGNMENT', v_run, t.results, r.manager, a.checked_in, CASE WHEN a.checked_in IS NOT NULL THEN r.desk END,
               CASE WHEN a.checked_in IS NOT NULL THEN '{ROOM_KEY,ACCESS_CARD,WARDROBE_KEY}'::text[] ELSE '{}'::text[] END,
               a.ended, CASE WHEN a.ended IS NOT NULL THEN 'CHECK_OUT' END
        FROM t_app a JOIN t_role r ON r.building_id = a.building_id
        WHERE a.outcome = 'ALLOCATED';

        -- Late check-ins: approved ones checked in before the deadline; in Fall 2026 some still wait.
        INSERT INTO asg_late_check_in (allocation_id, reason, received_by, requested_for, window_closed_at,
                                       suggested_deadline, status, deadline, decision_reason, decided_by, decided_at,
                                       created_at)
        SELECT a.alloc_id,
               pg_temp.pick(ARRAY['Flight from Hanoi was cancelled', 'Family emergency at home', 'Hospital stay, certificate attached',
                                  'Visa paperwork for the exchange program', 'Exam retake at the high school'], 'latereason' || a.uid),
               r.desk,
               CASE WHEN a.checked_in IS NOT NULL THEN (a.checked_in AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                    ELSE (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2 + (pg_temp.rnd('latefor' || a.uid) * 4)::int END,
               pg_temp.at(t.ci_end, 23 + 59.0 / 60),
               CASE WHEN a.checked_in IS NOT NULL THEN t.ci_end + 7 ELSE (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 7 END,
               CASE WHEN a.checked_in IS NOT NULL OR pg_temp.rnd('latedecide' || a.uid) < 0.4 THEN 'APPROVED' ELSE 'PENDING' END,
               CASE WHEN a.checked_in IS NOT NULL THEN t.ci_end + 10
                    WHEN pg_temp.rnd('latedecide' || a.uid) < 0.4 THEN (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 8 END,
               NULL,
               CASE WHEN a.checked_in IS NOT NULL OR pg_temp.rnd('latedecide' || a.uid) < 0.4 THEN r.manager END,
               CASE WHEN a.checked_in IS NOT NULL THEN pg_temp.at(t.ci_end + 1, 14)
                    WHEN pg_temp.rnd('latedecide' || a.uid) < 0.4 THEN now_ts - interval '20 hours' END,
               CASE WHEN a.checked_in IS NOT NULL THEN pg_temp.at(t.ci_end + 1, 9.5)
                    ELSE now_ts - make_interval(hours => (26 + pg_temp.rnd('latewhen' || a.uid) * 60)::int) END
        FROM t_app a JOIN t_role r ON r.building_id = a.building_id
        WHERE a.late = 'LATE';

        -- Deposit and Balance Invoices (payments come later, for every Term at once).
        INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, allocation_id, building_id, type, title, amount,
                                 utility_deposit, status, lines, transfer_content, issued_at, due_at, paid_at, payment_method, voided_reason,
                                 reminded_at, reference, student_name, student_code, gender, created_at, updated_at)
        OVERRIDING SYSTEM VALUE
        SELECT x.id, 'INV-' || t.code || '-' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), t.id, x.uid, x.app_id,
               x.alloc_id, x.building_id, x.type, x.title, x.amount, x.utility, x.status, x.lines,
               'CSTAY' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.issued, x.due,
               CASE WHEN x.status IN ('PAID', 'REFUNDED') THEN x.paid_at END, pg_temp.method(x.id, x.status),
               CASE WHEN x.status = 'VOID' THEN 'The Deposit window closed before payment.' END,
               CASE WHEN x.status = 'OVERDUE' THEN x.due + interval '1 day' END, x.reference, u.display_name, st.student_code,
               x.gender, x.issued, coalesce(x.paid_at, x.issued)
        FROM (
            SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, a.uid, a.app_id, NULL::bigint AS alloc_id,
                   NULL::bigint AS building_id, 'DEPOSIT' AS type, 'Deposit · ' || t.name AS title, a.deposit AS amount,
                   0 AS utility,
                   CASE WHEN a.outcome = 'EXPIRED' THEN 'VOID'
                        WHEN a.outcome = 'CANCELLED' AND a.finished < t.results THEN 'REFUNDED' ELSE 'PAID' END AS status,
                   jsonb_build_array(jsonb_build_object('label', 'Deposit · ' || rt.name || ' · ' || rc.name, 'amount', a.deposit)) AS lines,
                   a.created AS issued, a.created + interval '48 hours' AS due, a.paid AS paid_at,
                   'Application ' || a.code AS reference, a.gender
            FROM t_app a JOIN cfg_room_type rt ON rt.id = a.type_id JOIN cfg_room_class rc ON rc.id = a.class_id
            UNION ALL
            SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')), a.uid, a.app_id, a.alloc_id, a.building_id, 'BALANCE',
                   'Balance · ' || t.name, a.term_price - a.deposit + v_utility_deposit, v_utility_deposit, a.balance_status,
                   jsonb_build_array(
                       jsonb_build_object('label', 'Term price · Room ' || b.room, 'amount', a.term_price),
                       jsonb_build_object('label', 'Deposit already invoiced', 'amount', -a.deposit),
                       jsonb_build_object('label', 'Utility Deposit (held until check-out)', 'amount', v_utility_deposit)),
                   t.results, t.balance_due,
                   CASE WHEN pg_temp.rnd('ontime' || a.uid || t.code) < 0.88
                        THEN t.results + (t.balance_due - t.results) * pg_temp.rnd('balpaid' || a.uid || t.code)
                        ELSE t.balance_due + make_interval(hours => (5 + pg_temp.rnd('ballate' || a.uid || t.code) * 140)::int) END,
                   'Application ' || a.code || ' · Room ' || b.room, a.gender
            FROM t_app a JOIN t_bed b ON b.bed_id = a.bed_id
            WHERE a.outcome = 'ALLOCATED'
        ) x
        JOIN auth_user u ON u.id = x.uid JOIN auth_student st ON st.user_id = x.uid;

        INSERT INTO t_all_app SELECT * FROM t_app;
    END LOOP;
    CREATE INDEX ON t_all_app (alloc_id);
    CREATE INDEX ON t_all_app (app_id);
    CREATE INDEX ON t_all_app (term_id, bed_id);
    CREATE TEMP TABLE t_balance ON COMMIT DROP AS
    SELECT allocation_id, id FROM bil_invoice WHERE type = 'BALANCE';
    CREATE INDEX ON t_balance (allocation_id);

    -- ================================================================ Room-Change Requests and their moves
    RAISE NOTICE 'Demo seed: %', 'Room-Change Requests and their moves';
    -- About 1.5% of the residents of each Term; approved ones move to a free Bed for the rest of the stay.
    CREATE TEMP TABLE t_rc ON COMMIT DROP AS
    SELECT nextval(pg_get_serial_sequence('req_room_change', 'id')) AS id, a.term_id, x.code AS term_code, x.phase,
           a.uid, a.gender, a.alloc_id, a.app_id, a.bed_id, a.building_id, a.term_price, a.ended, x.stay_start, x.stay_end,
           least(a.checked_in + make_interval(days => (7 + pg_temp.rnd('rcday' || a.uid || x.code) * 45)::int),
                 CASE WHEN x.phase = 'current' THEN now_ts - make_interval(hours => (2 + pg_temp.rnd('rcnow' || a.uid) * 300)::int)
                      ELSE a.ended - interval '5 days' END) AS submitted,
           pg_temp.rnd('rcstatus' || a.uid || x.code) AS rs,
           pg_temp.pick(ARRAY['ROOMMATE_CONFLICT','ROOMMATE_CONFLICT','HEALTH','STUDY_ENVIRONMENT','PRICE','OTHER'], 'rcreason' || a.uid || x.code) AS reason,
           NULL::text AS status, NULL::bigint AS target_bed, NULL::bigint AS new_alloc, NULL::timestamptz AS decided
    FROM t_all_app a JOIN t_term x ON x.id = a.term_id
    WHERE a.outcome = 'ALLOCATED' AND a.checked_in IS NOT NULL AND NOT a.early
      AND pg_temp.rnd('rc' || a.uid || x.code) < 0.015;
    UPDATE t_rc SET status = CASE
            WHEN phase = 'past' THEN CASE WHEN rs < 0.5 THEN 'APPROVED' WHEN rs < 0.75 THEN 'REJECTED' ELSE 'CANCELLED' END
            WHEN submitted > now_ts - interval '72 hours' THEN CASE WHEN rs < 0.6 THEN 'SUBMITTED' ELSE 'PENDING' END
            ELSE CASE WHEN rs < 0.10 THEN 'SUBMITTED' WHEN rs < 0.15 THEN 'PENDING' WHEN rs < 0.65 THEN 'APPROVED'
                      WHEN rs < 0.85 THEN 'REJECTED' ELSE 'CANCELLED' END END;
    UPDATE t_rc SET decided = CASE WHEN status IN ('APPROVED', 'REJECTED', 'CANCELLED')
            THEN submitted + make_interval(hours => (3 + pg_temp.rnd('rcdecide' || id) * 60)::int) END;
    -- A free Bed of the same gender for each approved request.
    WITH free AS (
        SELECT b.bed_id, b.gender, x.id AS term_id,
               row_number() OVER (PARTITION BY x.id, b.gender ORDER BY pg_temp.rnd('free' || b.bed_id || x.code)) AS r
        FROM t_bed b CROSS JOIN t_term x
        WHERE x.phase <> 'future' AND (x.phase = 'past' OR NOT b.oos_now)
          AND NOT EXISTS (SELECT 1 FROM t_all_app a WHERE a.term_id = x.id AND a.bed_id = b.bed_id)),
    want AS (SELECT id, term_id, gender, row_number() OVER (PARTITION BY term_id, gender ORDER BY id) AS r
             FROM t_rc WHERE status = 'APPROVED')
    UPDATE t_rc c SET target_bed = free.bed_id, new_alloc = nextval(pg_get_serial_sequence('asg_allocation', 'id'))
    FROM want JOIN free ON free.term_id = want.term_id AND free.gender = want.gender AND free.r = want.r
    WHERE c.id = want.id;
    UPDATE t_rc SET status = 'REJECTED', decided = coalesce(decided, submitted + interval '1 day')
    WHERE status = 'APPROVED' AND target_bed IS NULL;

    INSERT INTO req_room_change (id, code, term_id, student_id, allocation_id, building_id, kind, target_room_type_id,
                                 target_room_class_id, reason_code, details, price_difference, status, assignee_id,
                                 sla_due_at, target_bed_id, decided_by, decided_at, decision_reason, decision_note,
                                 submitted_at)
    OVERRIDING SYSTEM VALUE
    SELECT c.id, 'RC-' || c.term_code || '-' || lpad(c.id::text, greatest(6, length(c.id::text)), '0'), c.term_id, c.uid,
           c.alloc_id, c.building_id,
           CASE WHEN tb.type_id IS NULL THEN pg_temp.pick(ARRAY['SAME','CLASS','TYPE'], 'rckind' || c.id)
                WHEN tb.type_id = cb.type_id AND tb.class_id = cb.class_id THEN 'SAME'
                WHEN tb.type_id = cb.type_id THEN 'CLASS' ELSE 'TYPE' END,
           coalesce(tb.type_id, cb.type_id), coalesce(tb.class_id, cb.class_id), c.reason,
           CASE c.reason WHEN 'ROOMMATE_CONFLICT' THEN 'We keep different hours and it is hard to sleep.'
                         WHEN 'HEALTH' THEN 'I need a lower floor after a knee injury.'
                         WHEN 'STUDY_ENVIRONMENT' THEN 'I would like a quieter Room to study for my final year.'
                         WHEN 'PRICE' THEN 'I would like a cheaper Room for the rest of the Term.'
                         ELSE 'Personal reasons; I can explain at the desk.' END,
           CASE WHEN tb.price IS NULL THEN 0
                ELSE (round((tb.price - cb.price) * greatest(0, (c.stay_end - c.decided::date)) / (c.stay_end - c.stay_start) / 1000) * 1000)::bigint END,
           c.status, r.desk, c.submitted + make_interval(hours => (SELECT room_change_hours FROM req_sla_policy WHERE building_id = c.building_id)),
           c.target_bed, CASE WHEN c.status IN ('APPROVED', 'REJECTED') THEN r.desk END,
           CASE WHEN c.status <> 'CANCELLED' THEN c.decided END,
           CASE WHEN c.status = 'REJECTED' THEN pg_temp.pick(ARRAY['NO_MATCHING_BED','NO_MATCHING_BED','OUTSTANDING_INVOICE','INSUFFICIENT_REASON'], 'rcrej' || c.id) END,
           CASE WHEN c.status = 'APPROVED' THEN 'Move to ' || tb.room || ' · Bed ' || tb.label || '.'
                WHEN c.status = 'REJECTED' THEN 'No Bed of that kind is free this Term.' END,
           c.submitted
    FROM t_rc c JOIN t_bed cb ON cb.bed_id = c.bed_id LEFT JOIN t_bed tb ON tb.bed_id = c.target_bed
    JOIN t_role r ON r.building_id = c.building_id;

    -- Approved: the old Allocation ends with the room change; the new one starts in the new Bed.
    UPDATE asg_allocation a SET status = 'ENDED', ended_at = c.decided, end_reason = 'ROOM_CHANGE'
    FROM t_rc c WHERE c.alloc_id = a.id AND c.status = 'APPROVED';
    INSERT INTO asg_allocation (id, term_id, application_id, student_id, bed_id, status, source, previous_allocation_id,
                                allocated_at, allocated_by, checked_in_at, checked_in_by, hand_over_items, ended_at, end_reason)
    OVERRIDING SYSTEM VALUE
    SELECT c.new_alloc, c.term_id, c.app_id, c.uid, c.target_bed, CASE WHEN c.ended IS NULL THEN 'ACTIVE' ELSE 'ENDED' END,
           'ROOM_CHANGE', c.alloc_id, c.decided, r.desk, c.decided + interval '3 hours', r.desk,
           '{ROOM_KEY,ACCESS_CARD,WARDROBE_KEY}', c.ended, CASE WHEN c.ended IS NOT NULL THEN 'CHECK_OUT' END
    FROM t_rc c JOIN t_bed b ON b.bed_id = c.target_bed JOIN t_role r ON r.building_id = b.building_id
    WHERE c.status = 'APPROVED';

    -- ================================================================ swaps
    RAISE NOTICE 'Demo seed: %', 'swaps';
    -- Pairs of residents of the same gender; approved swaps exchange the two Beds.
    CREATE TEMP TABLE t_sw ON COMMIT DROP AS
    WITH pool AS (
        SELECT a.*, x.code AS term_code, x.phase,
               row_number() OVER (PARTITION BY a.term_id, a.gender ORDER BY pg_temp.rnd('swap' || a.uid || x.code)) AS r
        FROM t_all_app a JOIN t_term x ON x.id = a.term_id
        WHERE a.outcome = 'ALLOCATED' AND a.checked_in IS NOT NULL AND NOT a.early
          AND pg_temp.rnd('swappool' || a.uid || x.code) < 0.012
          AND NOT EXISTS (SELECT 1 FROM t_rc c WHERE c.alloc_id = a.alloc_id))
    SELECT nextval(pg_get_serial_sequence('req_swap', 'id')) AS id, p.term_id, p.term_code, p.phase,
           p.uid AS a_uid, p.alloc_id AS a_alloc, p.bed_id AS a_bed, p.building_id AS a_building, p.app_id AS a_app,
           q.uid AS b_uid, q.alloc_id AS b_alloc, q.bed_id AS b_bed, q.building_id AS b_building, q.app_id AS b_app,
           p.ended,
           CASE WHEN p.phase = 'current' THEN now_ts - make_interval(hours => (6 + pg_temp.rnd('swnow' || p.uid) * 500)::int)
                ELSE greatest(p.checked_in, q.checked_in) + make_interval(days => (10 + pg_temp.rnd('swday' || p.uid) * 40)::int) END AS created,
           pg_temp.rnd('swstatus' || p.uid || p.term_code) AS rs, NULL::text AS status, NULL::bigint AS a_new, NULL::bigint AS b_new
    FROM pool p JOIN pool q ON q.term_id = p.term_id AND q.gender = p.gender AND q.r = p.r + 1
    WHERE p.r % 2 = 1;
    UPDATE t_sw SET status = CASE
            WHEN phase = 'past' THEN CASE WHEN rs < 0.55 THEN 'APPROVED' WHEN rs < 0.70 THEN 'DECLINED'
                                          WHEN rs < 0.85 THEN 'EXPIRED' ELSE 'REJECTED' END
            WHEN created > now_ts - interval '40 hours' THEN 'INVITED'
            ELSE CASE WHEN a_building <> b_building AND rs < 0.5 THEN 'TO_MANAGER' WHEN rs < 0.25 THEN 'PENDING'
                      WHEN rs < 0.70 THEN 'APPROVED' WHEN rs < 0.85 THEN 'DECLINED' ELSE 'REJECTED' END END;
    UPDATE t_sw SET a_new = nextval(pg_get_serial_sequence('asg_allocation', 'id')),
                    b_new = nextval(pg_get_serial_sequence('asg_allocation', 'id'))
    WHERE status = 'APPROVED';

    INSERT INTO req_swap (id, term_id, kind, a_allocation_id, b_allocation_id, status, cross_block, price_difference, reason,
                          expires_at, agreed_at, decided_by, decided_at, decision_reason, created_at, a_building_id,
                          b_building_id, staff_decided_by, staff_decided_at)
    OVERRIDING SYSTEM VALUE
    SELECT s.id, s.term_id, CASE WHEN pg_temp.rnd('swkind' || s.id) < 0.6 THEN 'DIRECT' ELSE 'BOARD' END, s.a_alloc,
           s.b_alloc, s.status, s.a_building <> s.b_building,
           (round((bb.price - ba.price) * 0.5 / 1000) * 1000)::bigint,
           pg_temp.pick(ARRAY['We are friends and want to share a Room', 'Closer to my classmates',
                              'I prefer a higher floor', 'Swap to a quieter Room'], 'swreason' || s.id),
           s.created + interval '48 hours',
           CASE WHEN s.status IN ('PENDING', 'TO_MANAGER', 'APPROVED', 'REJECTED') THEN s.created + interval '6 hours' END,
           CASE WHEN s.status IN ('APPROVED', 'REJECTED') THEN
                CASE WHEN s.a_building <> s.b_building THEN ra.manager ELSE ra.desk END END,
           CASE WHEN s.status IN ('APPROVED', 'REJECTED') THEN s.created + interval '30 hours' END,
           CASE WHEN s.status = 'REJECTED' THEN 'One of the two Rooms has an open Maintenance Request.' END,
           s.created, s.a_building, s.b_building,
           CASE WHEN s.a_building <> s.b_building AND s.status IN ('TO_MANAGER', 'APPROVED', 'REJECTED') THEN ra.desk END,
           CASE WHEN s.a_building <> s.b_building AND s.status IN ('TO_MANAGER', 'APPROVED', 'REJECTED')
                THEN s.created + interval '20 hours' END
    FROM t_sw s JOIN t_bed ba ON ba.bed_id = s.a_bed JOIN t_bed bb ON bb.bed_id = s.b_bed
    JOIN t_role ra ON ra.building_id = s.a_building;

    UPDATE asg_allocation a SET status = 'ENDED', ended_at = s.created + interval '30 hours', end_reason = 'SWAP'
    FROM t_sw s WHERE s.status = 'APPROVED' AND a.id IN (s.a_alloc, s.b_alloc);
    INSERT INTO asg_allocation (id, term_id, application_id, student_id, bed_id, status, source, previous_allocation_id,
                                allocated_at, allocated_by, checked_in_at, checked_in_by, hand_over_items, ended_at, end_reason)
    OVERRIDING SYSTEM VALUE
    SELECT x.new_id, s.term_id, x.app, x.uid, x.bed, CASE WHEN s.ended IS NULL THEN 'ACTIVE' ELSE 'ENDED' END, 'SWAP',
           x.old, s.created + interval '30 hours', r.desk, s.created + interval '32 hours', r.desk,
           '{ROOM_KEY,ACCESS_CARD,WARDROBE_KEY}', s.ended, CASE WHEN s.ended IS NOT NULL THEN 'CHECK_OUT' END
    FROM t_sw s
    CROSS JOIN LATERAL (VALUES (s.a_new, s.a_app, s.a_uid, s.b_bed, s.a_alloc), (s.b_new, s.b_app, s.b_uid, s.a_bed, s.b_alloc))
        AS x (new_id, app, uid, bed, old)
    JOIN t_bed b ON b.bed_id = x.bed JOIN t_role r ON r.building_id = b.building_id
    WHERE s.status = 'APPROVED';

    -- ================================================================ meters and Utility Invoices
    RAISE NOTICE 'Demo seed: %', 'meters and Utility Invoices';
    -- Stays in a Room (moves and early check-outs included), then the residents of each Room in each month.
    CREATE TEMP TABLE t_stay ON COMMIT DROP AS
    SELECT al.id AS alloc, al.term_id, al.student_id, b.room_id, al.checked_in_at AS since,
           coalesce(al.ended_at, 'infinity'::timestamptz) AS until
    FROM asg_allocation al JOIN t_bed b ON b.bed_id = al.bed_id
    WHERE al.checked_in_at IS NOT NULL AND al.status <> 'CANCELLED';
    CREATE INDEX ON t_stay (room_id, term_id);
    CREATE TEMP TABLE t_room_month ON COMMIT DROP AS
    WITH occupied AS (
        SELECT s.room_id, m.month_start, count(*)::int AS residents
        FROM t_stay s JOIN t_month m ON m.term_id = s.term_id
        WHERE s.since < m.month_start + interval '1 month' AND s.until > m.month_start
        GROUP BY s.room_id, m.month_start),
    use AS (
        SELECT r.room_id, r.building_id, r.room, r.class_name, m.idx, m.term_id, m.n, m.month_start,
               coalesce(o.residents, 0) AS residents,
               -- Use per month: air-conditioned Rooms use more power; an empty Room only its standby.
               round((CASE WHEN o.residents IS NULL THEN 2 + pg_temp.rnd('standby' || r.room_id || m.month_start) * 4
                           ELSE o.residents * (CASE r.class_name WHEN 'Basic' THEN 28 WHEN 'Standard' THEN 78 ELSE 102 END)
                                * (0.8 + pg_temp.rnd('kwh' || r.room_id || m.month_start) * 0.4) END)::numeric, 1) AS kwh,
               round((CASE WHEN o.residents IS NULL THEN pg_temp.rnd('standbyw' || r.room_id || m.month_start) * 0.5
                           ELSE o.residents * (2.6 + pg_temp.rnd('m3' || r.room_id || m.month_start) * 1.6) END)::numeric, 1) AS m3
        FROM (SELECT DISTINCT room_id, building_id, room, class_name FROM t_bed) r CROSS JOIN t_month m
        LEFT JOIN occupied o ON o.room_id = r.room_id AND o.month_start = m.month_start)
    SELECT use.*,
           round((1200 + pg_temp.rnd('meter' || room_id) * 3800)::numeric, 1)
               + sum(kwh) OVER (PARTITION BY room_id ORDER BY month_start) AS e_end,
           round((150 + pg_temp.rnd('water' || room_id) * 400)::numeric, 1)
               + sum(m3) OVER (PARTITION BY room_id ORDER BY month_start) AS w_end
    FROM use;
    CREATE INDEX ON t_room_month (room_id, month_start);

    -- Meter periods: one per Block and month; the current month is still open.
    INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at, closed_at, closed_by)
    SELECT r.building_id, to_char(m.month_start, 'MM/YYYY'), m.month_start, (m.month_start + interval '1 month - 1 day')::date,
           pg_temp.at((m.month_start + interval '1 month')::date + 7, 0),
           CASE WHEN (m.month_start + interval '1 month') <= date_trunc('month', now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')
                THEN pg_temp.at((m.month_start + interval '1 month')::date + 1, 16) END,
           CASE WHEN (m.month_start + interval '1 month') <= date_trunc('month', now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN r.tech END
    FROM (SELECT DISTINCT month_start FROM t_month
          WHERE n <= 3 AND month_start <= date_trunc('month', now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')) m
    CROSS JOIN t_role r;

    -- Readings of the Rooms with residents; the open month is partly entered.
    INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, electricity_curr, water_prev, water_curr, status,
                                   entered_by, entered_at, confirmed_by, confirmed_at)
    SELECT p.id, rm.room_id, rm.e_end - rm.kwh,
           CASE WHEN p.closed_at IS NOT NULL OR pg_temp.rnd('entered' || rm.room_id) < 0.68 THEN rm.e_end END,
           rm.w_end - rm.m3,
           CASE WHEN p.closed_at IS NOT NULL OR pg_temp.rnd('entered' || rm.room_id) < 0.68 THEN rm.w_end END,
           CASE WHEN p.closed_at IS NOT NULL THEN 'CONFIRMED'
                WHEN pg_temp.rnd('entered' || rm.room_id) < 0.30 THEN 'CONFIRMED'
                WHEN pg_temp.rnd('entered' || rm.room_id) < 0.66 THEN 'ENTERED'
                WHEN pg_temp.rnd('entered' || rm.room_id) < 0.68 THEN 'CHECK_VALUE' ELSE 'MISSING' END,
           CASE WHEN p.closed_at IS NOT NULL OR pg_temp.rnd('entered' || rm.room_id) < 0.68 THEN r.tech END,
           CASE WHEN p.closed_at IS NOT NULL OR pg_temp.rnd('entered' || rm.room_id) < 0.68
                THEN pg_temp.at(p.period_end - 3, 9 + pg_temp.rnd('enteredh' || rm.room_id) * 8) END,
           CASE WHEN p.closed_at IS NOT NULL OR pg_temp.rnd('entered' || rm.room_id) < 0.30 THEN r.tech END,
           CASE WHEN p.closed_at IS NOT NULL OR pg_temp.rnd('entered' || rm.room_id) < 0.30 THEN pg_temp.at(p.period_end, 15) END
    FROM bil_meter_period p JOIN t_room_month rm ON rm.building_id = p.building_id AND rm.month_start = p.period_start
    JOIN t_role r ON r.building_id = p.building_id
    WHERE rm.residents > 0;

    -- One Utility Invoice per resident of each closed month; the share follows the Room's use.
    INSERT INTO bil_invoice (id, code, term_id, student_id, allocation_id, building_id, type, title, amount, status, lines,
                             breakdown, transfer_content, issued_at, due_at, paid_at, payment_method, reminded_at, reference, student_name,
                             student_code, gender, created_at, updated_at)
    OVERRIDING SYSTEM VALUE
    SELECT x.id, 'INV-' || x.term_code || '-' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.term_id, x.uid,
           x.alloc, x.building_id, 'UTILITY', 'Utility · ' || x.label, x.share, x.status,
           jsonb_build_array(jsonb_build_object('label', 'Electricity and water · Room ' || x.room, 'amount', x.share)),
           jsonb_build_object('room', x.room, 'subtotal', x.share, 'priceKwh', 3500, 'priceM3', 15000,
                              'roundingNote', 'Each share is rounded up to 1,000 VND.',
                              'segments', jsonb_build_array(jsonb_build_object(
                                  'from', x.period_start, 'to', x.period_end,
                                  'note', to_char(x.period_start, 'DD/MM') || ' – ' || to_char(x.period_end, 'DD/MM'),
                                  'residents', x.residents, 'kwh', x.kwh, 'm3', x.m3,
                                  'electricityCost', round(x.kwh * 3500), 'waterCost', round(x.m3 * 15000),
                                  'share', x.share))),
           'CSTAY' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.closed_at, x.due_at,
           CASE WHEN x.status = 'PAID' THEN x.paid END, pg_temp.method(x.id, x.status), CASE WHEN x.status = 'OVERDUE' THEN x.due_at + interval '1 day' END,
           'Room ' || x.room || ' · ' || x.label, u.display_name, st.student_code, st.gender, x.closed_at,
           coalesce(CASE WHEN x.status = 'PAID' THEN x.paid END, x.closed_at)
    FROM (
        SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, tm.code AS term_code, p.id AS period, rm.term_id,
               s.student_id AS uid, s.alloc, p.building_id, p.label, p.period_start, p.period_end, p.closed_at,
               p.due_at, rm.room, rm.residents, rm.kwh, rm.m3,
               pg_temp.up1000((rm.kwh * 3500 + rm.m3 * 15000) / rm.residents) AS share,
               CASE WHEN tm.phase = 'past' THEN 'PAID'
                    WHEN pg_temp.rnd('upaid' || s.alloc || p.id) < 0.86 THEN 'PAID'
                    WHEN pg_temp.rnd('upaid' || s.alloc || p.id) < 0.96 THEN 'OVERDUE' ELSE 'AWAITING_CONFIRMATION' END AS status,
               p.closed_at + make_interval(hours => (2 + pg_temp.rnd('upaidat' || s.alloc || p.id) * 150)::int) AS paid
        FROM bil_meter_period p
        JOIN t_room_month rm ON rm.building_id = p.building_id AND rm.month_start = p.period_start AND rm.residents > 0
        JOIN t_term tm ON tm.id = rm.term_id
        JOIN t_stay s ON s.room_id = rm.room_id AND s.term_id = rm.term_id
             AND s.since < rm.month_start + interval '1 month' AND s.until > rm.month_start
        WHERE p.closed_at IS NOT NULL
    ) x
    JOIN auth_user u ON u.id = x.uid JOIN auth_student st ON st.user_id = x.uid;

    -- Meter cuts at each check-out and at each move.
    INSERT INTO bil_meter_cut (room_id, cut_date, electricity, water, reason, allocation_id, recorded_by, created_at)
    SELECT DISTINCT ON (b.room_id, (al.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
           b.room_id, (al.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
           coalesce(rm.e_end, 0) - coalesce(rm.kwh, 0) * 0.1, coalesce(rm.w_end, 0) - coalesce(rm.m3, 0) * 0.1,
           CASE al.end_reason WHEN 'CHECK_OUT' THEN 'CHECK_OUT' WHEN 'ROOM_CHANGE' THEN 'ROOM_CHANGE' ELSE 'SWAP' END,
           al.id, r.desk, al.ended_at
    FROM asg_allocation al JOIN t_bed b ON b.bed_id = al.bed_id JOIN t_role r ON r.building_id = b.building_id
    JOIN t_room_month rm ON rm.room_id = b.room_id
         AND rm.month_start = date_trunc('month', al.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    WHERE al.ended_at IS NOT NULL AND al.end_reason IN ('CHECK_OUT', 'ROOM_CHANGE', 'SWAP')
    ORDER BY b.room_id, (al.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, al.id;

    -- ================================================================ check-outs and refunds
    RAISE NOTICE 'Demo seed: %', 'check-outs and refunds';
    CREATE TEMP TABLE t_co ON COMMIT DROP AS
    SELECT nextval(pg_get_serial_sequence('asg_check_out', 'id')) AS id, al.id AS alloc, al.term_id, al.student_id,
           al.ended_at, b.building_id, b.room, a.early, rm.e_end, rm.w_end,
           CASE WHEN rm.residents > 0 THEN pg_temp.up1000((rm.kwh * 3500 + rm.m3 * 15000) / rm.residents * 0.85) ELSE 0 END AS share,
           CASE WHEN pg_temp.rnd('damage' || al.id) < 0.03 THEN (200 + floor(pg_temp.rnd('damageamt' || al.id) * 7) * 100) * 1000 ELSE 0 END AS damage,
           (SELECT bi.id FROM t_balance bi WHERE bi.allocation_id = a.alloc_id) AS balance_invoice,
           a.term_price, x.stay_start, x.stay_end, x.phase,
           -- Older refunds are decided (Staff pay the Utility Deposit within days, Managers take longer); the
           -- newest still wait in the queues.
           x.phase = 'past' OR al.ended_at < now_ts - interval '5 days' AS settled,
           x.phase = 'past' OR al.ended_at < now_ts - interval '10 days' AS decided
    FROM asg_allocation al JOIN t_bed b ON b.bed_id = al.bed_id
    JOIN t_all_app a ON a.app_id = al.application_id
    JOIN t_term x ON x.id = al.term_id
    LEFT JOIN t_room_month rm ON rm.room_id = b.room_id
         AND rm.month_start = date_trunc('month', al.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    WHERE al.end_reason = 'CHECK_OUT';

    INSERT INTO asg_check_out (id, allocation_id, reason, status, electricity, water, condition_good, key_returned,
                               damage_charge, refund_amount, refund_status, requested_at, completed_at, completed_by,
                               deposit_held, utility_share, unpaid_utility, share_period, settled_amount, updated_at)
    OVERRIDING SYSTEM VALUE
    SELECT c.id, c.alloc, CASE WHEN c.early THEN 'EARLY_LEAVE' ELSE 'TERM_END' END, 'COMPLETED', coalesce(c.e_end, 0),
           coalesce(c.w_end, 0), c.damage = 0, TRUE, c.damage, greatest(0, v_utility_deposit - c.share - c.damage),
           CASE WHEN v_utility_deposit - c.share - c.damage <= 0 THEN 'NONE' WHEN c.settled THEN 'PAID' ELSE 'PENDING' END,
           c.ended_at - interval '20 minutes', c.ended_at, r.desk, v_utility_deposit, c.share, 0,
           to_char(c.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM/YYYY'), v_utility_deposit - c.share - c.damage, c.ended_at
    FROM t_co c JOIN t_role r ON r.building_id = c.building_id;

    -- Utility Deposit refunds (Staff) and refunds for unused days after an early check-out (Block Manager).
    INSERT INTO bil_refund (term_id, student_id, building_id, source_type, source_id, reason, rule_id, paid_amount, amount,
                            exception, status, note, decided_by, decided_at, created_at, student_name, student_code, gender,
                            invoice_id)
    SELECT c.term_id, c.student_id, c.building_id, 'CHECK_OUT', c.id, 'Utility Deposit at check-out', rule_utility,
           v_utility_deposit, v_utility_deposit - c.share - c.damage, FALSE, CASE WHEN c.settled THEN 'PAID' ELSE 'PENDING' END,
           NULL, CASE WHEN c.settled THEN r.desk END, CASE WHEN c.settled THEN c.ended_at + interval '1 day' END,
           c.ended_at, u.display_name, st.student_code, st.gender, c.balance_invoice
    FROM t_co c JOIN t_role r ON r.building_id = c.building_id JOIN auth_user u ON u.id = c.student_id
    JOIN auth_student st ON st.user_id = c.student_id
    WHERE v_utility_deposit - c.share - c.damage > 0
    UNION ALL
    SELECT c.term_id, c.student_id, c.building_id, 'CHECK_OUT', c.id, 'Early check-out: unused days of the Term', rule_early,
           c.term_price, (round(c.term_price * 0.30 * (c.stay_end - (c.ended_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
                                / (c.stay_end - c.stay_start) / 1000) * 1000)::bigint,
           FALSE,
           CASE WHEN NOT c.decided THEN 'PENDING' WHEN pg_temp.rnd('earlyrefund' || c.id) >= 0.9 THEN 'REJECTED'
                WHEN c.phase = 'past' THEN 'PAID' ELSE 'APPROVED' END,
           CASE WHEN c.decided AND pg_temp.rnd('earlyrefund' || c.id) >= 0.9
                THEN 'Left without notice; the rule needs two weeks'' notice.' END,
           CASE WHEN c.decided THEN r.manager END, CASE WHEN c.decided THEN c.ended_at + interval '3 days' END,
           c.ended_at, u.display_name, st.student_code, st.gender, c.balance_invoice
    FROM t_co c JOIN t_role r ON r.building_id = c.building_id JOIN auth_user u ON u.id = c.student_id
    JOIN auth_student st ON st.user_id = c.student_id
    WHERE c.early;

    -- Deposits of cancelled Applications: in full before results (Invoice Refunded), half afterwards (Block Manager).
    INSERT INTO bil_refund (term_id, student_id, building_id, source_type, source_id, reason, rule_id, paid_amount, amount,
                            exception, status, note, decided_by, decided_at, created_at, student_name, student_code, gender,
                            invoice_id)
    SELECT a.term_id, a.uid, NULL, 'APPLICATION_CANCEL', a.app_id, 'Application cancelled',
           CASE WHEN a.finished < x.results THEN rule_before ELSE rule_after END, a.deposit,
           CASE WHEN a.finished < x.results THEN a.deposit ELSE round(a.deposit * 0.5) END, FALSE, 'PAID', NULL,
           CASE WHEN a.finished < x.results THEN NULL ELSE (SELECT manager FROM t_role WHERE block = CASE WHEN a.gender = 'M' THEN 'A' ELSE 'E' END) END,
           a.finished + interval '2 days', a.finished, u.display_name, st.student_code, a.gender, i.id
    FROM t_all_app a JOIN t_term x ON x.id = a.term_id JOIN auth_user u ON u.id = a.uid
    JOIN auth_student st ON st.user_id = a.uid
    JOIN bil_invoice i ON i.application_id = a.app_id AND i.type = 'DEPOSIT'
    WHERE a.outcome = 'CANCELLED';

    -- Damage charges at check-out.
    INSERT INTO bil_invoice (id, code, term_id, student_id, allocation_id, building_id, type, title, amount, status, lines,
                             transfer_content, issued_at, due_at, paid_at, payment_method, reference, student_name, student_code, gender,
                             created_at, updated_at)
    OVERRIDING SYSTEM VALUE
    SELECT x.id, 'INV-' || tm.code || '-' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.term_id, x.student_id,
           x.alloc, x.building_id, 'DAMAGE', 'Damage · Room ' || x.room, x.damage, 'PAID',
           jsonb_build_array(jsonb_build_object('label', 'Broken furniture · Room ' || x.room, 'amount', x.damage)),
           'CSTAY' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.ended_at, x.ended_at + interval '7 days',
           x.ended_at + interval '2 days', pg_temp.method(x.id, 'PAID'), 'Check-out · Room ' || x.room, u.display_name, st.student_code, st.gender,
           x.ended_at, x.ended_at + interval '2 days'
    FROM (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, c.term_id, c.student_id, c.alloc, c.building_id,
                 c.room, c.damage, c.ended_at
          FROM t_co c WHERE c.damage > 0) x
    JOIN t_term tm ON tm.id = x.term_id JOIN auth_user u ON u.id = x.student_id JOIN auth_student st ON st.user_id = x.student_id;

    -- Room-change price differences: charged or credited.
    INSERT INTO bil_invoice (id, code, term_id, student_id, allocation_id, building_id, type, title, amount, status, lines,
                             transfer_content, issued_at, due_at, paid_at, payment_method, reference, student_name, student_code, gender,
                             created_at, updated_at)
    OVERRIDING SYSTEM VALUE
    SELECT x.id, 'INV-' || x.term_code || '-' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.term_id, x.uid,
           x.new_alloc, b.building_id, 'ROOM_CHANGE', 'Room change · ' || x.code, x.price_difference,
           CASE WHEN x.phase = 'past' OR pg_temp.rnd('rcpaid' || x.id) < 0.7 THEN 'PAID' ELSE 'UNPAID' END,
           jsonb_build_array(jsonb_build_object('label', 'Price difference for the days left · Room ' || b.room, 'amount', x.price_difference)),
           'CSTAY' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.decided, x.decided + interval '7 days',
           CASE WHEN x.phase = 'past' OR pg_temp.rnd('rcpaid' || x.id) < 0.7 THEN x.decided + interval '2 days' END, pg_temp.method(x.id, CASE WHEN x.phase = 'past' OR pg_temp.rnd('rcpaid' || x.id) < 0.7 THEN 'PAID' END),
           x.code, u.display_name, st.student_code, st.gender, x.decided, x.decided
    FROM (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, c.term_id, c.term_code, c.phase, c.uid,
                 c.new_alloc, c.target_bed, c.decided, rc.code, rc.price_difference
          FROM t_rc c JOIN req_room_change rc ON rc.id = c.id
          WHERE c.status = 'APPROVED' AND rc.price_difference > 0) x
    JOIN t_bed b ON b.bed_id = x.target_bed JOIN auth_user u ON u.id = x.uid JOIN auth_student st ON st.user_id = x.uid;
    UPDATE req_room_change rc SET invoice_id = i.id FROM bil_invoice i WHERE i.type = 'ROOM_CHANGE' AND i.reference = rc.code;
    INSERT INTO bil_refund (term_id, student_id, building_id, source_type, source_id, reason, paid_amount, amount, exception,
                            status, decided_by, decided_at, created_at, student_name, student_code, gender, invoice_id)
    SELECT c.term_id, c.uid, c.building_id, 'ROOM_CHANGE', c.id, 'Cheaper Room after a room change', c.term_price,
           -rc.price_difference, FALSE,
           CASE WHEN c.phase = 'past' THEN 'PAID' WHEN c.decided < now_ts - interval '10 days' THEN 'APPROVED' ELSE 'PENDING' END,
           CASE WHEN c.phase = 'past' OR c.decided < now_ts - interval '10 days' THEN r.manager END,
           CASE WHEN c.phase = 'past' OR c.decided < now_ts - interval '10 days' THEN c.decided + interval '2 days' END,
           c.decided, u.display_name, st.student_code, st.gender,
           (SELECT bi.id FROM t_balance bi WHERE bi.allocation_id = c.alloc_id)
    FROM t_rc c JOIN req_room_change rc ON rc.id = c.id JOIN t_role r ON r.building_id = c.building_id
    JOIN auth_user u ON u.id = c.uid JOIN auth_student st ON st.user_id = c.uid
    WHERE c.status = 'APPROVED' AND rc.price_difference < 0;

    -- ================================================================ Maintenance Requests
    RAISE NOTICE 'Demo seed: %', 'Maintenance Requests';
    CREATE TEMP TABLE t_mr ON COMMIT DROP AS
    WITH base AS (
        SELECT al.id AS alloc, al.term_id, al.student_id, al.bed_id, al.checked_in_at,
               coalesce(al.ended_at, now_ts) AS until, x.code AS term_code, x.phase, k.k
        FROM asg_allocation al JOIN t_term x ON x.id = al.term_id CROSS JOIN generate_series(1, 2) AS k(k)
        WHERE al.checked_in_at IS NOT NULL AND al.status <> 'CANCELLED'
          AND pg_temp.rnd('mr' || al.id || k.k) < CASE WHEN k.k = 1 THEN 0.11 ELSE 0.025 END)
    SELECT nextval(pg_get_serial_sequence('mnt_request', 'id')) AS id, base.*, b.room_id, b.room, b.building_id, b.class_name,
           pg_temp.pick(CASE WHEN b.class_name = 'Basic'
                             THEN ARRAY['ELECTRICAL','ELECTRICAL','ELECTRICAL','PLUMBING','PLUMBING','PLUMBING','FURNITURE','FURNITURE','INTERNET','INTERNET','CLEANING','OTHER']
                             ELSE ARRAY['ELECTRICAL','ELECTRICAL','PLUMBING','PLUMBING','AIR_CONDITIONING','AIR_CONDITIONING','AIR_CONDITIONING','FURNITURE','INTERNET','INTERNET','CLEANING','OTHER'] END,
                        'mrcat' || base.alloc || base.k) AS category,
           pg_temp.rnd('mrurgent' || base.alloc || base.k) < 0.15 AS urgent,
           -- In the current Term the latest days have the most requests still open.
           base.checked_in_at + (base.until - base.checked_in_at)
               * CASE WHEN base.phase = 'current' THEN 0.02 + sqrt(pg_temp.rnd('mrwhen' || base.alloc || base.k)) * 0.975
                      ELSE 0.05 + pg_temp.rnd('mrwhen' || base.alloc || base.k) * 0.93 END AS reported,
           pg_temp.rnd('mrfix' || base.alloc || base.k) AS fx,
           pg_temp.rnd('mrstate' || base.alloc || base.k) AS st
    FROM base JOIN t_bed b ON b.bed_id = base.bed_id;
    ALTER TABLE t_mr ADD COLUMN limit_hours int, ADD COLUMN resolved timestamptz, ADD COLUMN status text,
                     ADD COLUMN assignee bigint, ADD COLUMN title text;
    UPDATE t_mr m SET limit_hours = CASE WHEN m.urgent THEN p.urgent_hours ELSE p.normal_hours END,
           assignee = CASE WHEN m.category = 'INTERNET' AND r.block IN ('A', 'E') THEN r.desk ELSE r.tech END,
           title = pg_temp.pick(CASE m.category
                WHEN 'ELECTRICAL' THEN ARRAY['Ceiling light flickers', 'Socket next to the desk is dead', 'Fan does not turn on', 'Bathroom light is broken']
                WHEN 'PLUMBING' THEN ARRAY['Shower drain is blocked', 'Tap drips all night', 'Toilet keeps running', 'Leak under the sink']
                WHEN 'AIR_CONDITIONING' THEN ARRAY['Air conditioner does not cool', 'Air conditioner drips water', 'Remote control lost', 'Air conditioner is noisy']
                WHEN 'FURNITURE' THEN ARRAY['Wardrobe door is off its hinge', 'Bed frame is cracked', 'Desk drawer is stuck', 'Chair is broken']
                WHEN 'INTERNET' THEN ARRAY['Wi-Fi drops every evening', 'LAN port does not work', 'Wi-Fi is very slow']
                WHEN 'CLEANING' THEN ARRAY['Mould on the bathroom ceiling', 'Bin in the corridor not emptied', 'Ants near the window']
                ELSE ARRAY['Door lock is stiff', 'Window does not close', 'Curtain rail fell down'] END, 'mrtitle' || m.id)
    FROM req_sla_policy p, t_role r WHERE p.building_id = m.building_id AND r.building_id = m.building_id;
    -- Most are fixed within the Block's timer; one in ten takes longer.
    UPDATE t_mr SET resolved = reported + make_interval(mins => (CASE
            WHEN fx < 0.88 THEN 30 + pg_temp.rnd('mrdur' || id) * (limit_hours * 60 - 45)
            ELSE limit_hours * 60 * (1.1 + pg_temp.rnd('mrdur' || id) * 1.5) END)::int);
    UPDATE t_mr SET status = CASE
            WHEN phase = 'past' THEN 'CLOSED'
            WHEN reported > now_ts - interval '3 hours' THEN CASE WHEN st < 0.5 THEN 'SUBMITTED' ELSE 'ASSIGNED' END
            WHEN reported > now_ts - interval '4 days' THEN CASE WHEN st < 0.30 THEN 'ASSIGNED' WHEN st < 0.65 THEN 'IN_PROGRESS'
                                                                 WHEN st < 0.85 THEN 'RESOLVED' ELSE 'CLOSED' END
            WHEN reported > now_ts - interval '10 days' THEN CASE WHEN st < 0.10 THEN 'IN_PROGRESS' WHEN st < 0.25 THEN 'RESOLVED'
                                                                  ELSE 'CLOSED' END
            ELSE CASE WHEN st < 0.04 THEN 'IN_PROGRESS' ELSE 'CLOSED' END END;
    UPDATE t_mr SET resolved = NULL WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS');
    UPDATE t_mr SET resolved = greatest(reported + interval '20 minutes', least(resolved, now_ts - interval '30 minutes'))
    WHERE status IN ('RESOLVED', 'CLOSED') AND phase = 'current';

    INSERT INTO mnt_request (id, code, term_id, room_id, bed_id, reporter_id, source, title, description, category, location,
                             urgency, priority, staff_may_enter, status, assignee_id, visit_window_start, visit_window_end,
                             sla_due_at, reported_at, resolved_at, closed_at, confirmed_fixed, reopen_count, building_id,
                             room_code)
    OVERRIDING SYSTEM VALUE
    SELECT m.id, 'MR-' || lpad(m.id::text, greatest(6, length(m.id::text)), '0'), m.term_id, m.room_id, m.bed_id,
           m.student_id, 'STUDENT', m.title, m.title || '. Please come when you can; I am in class most mornings.', m.category,
           CASE m.category WHEN 'PLUMBING' THEN 'BATHROOM' WHEN 'CLEANING' THEN pg_temp.pick(ARRAY['BATHROOM','CORRIDOR'], 'mrloc' || m.id)
                           ELSE 'ROOM' END,
           CASE WHEN m.urgent THEN 'URGENT' ELSE 'NORMAL' END,
           CASE WHEN m.urgent THEN 'HIGH' WHEN pg_temp.rnd('mrprio' || m.id) < 0.7 THEN 'MEDIUM' ELSE 'LOW' END,
           pg_temp.rnd('mrenter' || m.id) < 0.75, m.status, CASE WHEN m.status <> 'SUBMITTED' THEN m.assignee END,
           CASE WHEN m.status IN ('ASSIGNED', 'IN_PROGRESS') AND pg_temp.rnd('mrvisit' || m.id) < 0.5
                THEN pg_temp.at((now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 14) END,
           CASE WHEN m.status IN ('ASSIGNED', 'IN_PROGRESS') AND pg_temp.rnd('mrvisit' || m.id) < 0.5
                THEN pg_temp.at((now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 16) END,
           m.reported + make_interval(hours => m.limit_hours), m.reported, m.resolved,
           CASE WHEN m.status = 'CLOSED' THEN least(m.resolved + make_interval(hours => (2 + pg_temp.rnd('mrclose' || m.id) * 46)::int), now_ts - interval '5 minutes') END,
           CASE WHEN m.status = 'CLOSED' THEN TRUE END,
           CASE WHEN pg_temp.rnd('mrreopen' || m.id) < 0.03 THEN 1 ELSE 0 END, m.building_id, m.room
    FROM t_mr m;

    INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, message, internal, at)
    SELECT m.id, m.student_id, 'STUDENT', 'Request submitted', NULL, FALSE, m.reported FROM t_mr m
    UNION ALL
    SELECT m.id, NULL, NULL, 'Assigned to ' || u.display_name || ' (routing rule)', NULL, FALSE, m.reported + interval '1 minute'
    FROM t_mr m JOIN auth_user u ON u.id = m.assignee WHERE m.status <> 'SUBMITTED'
    UNION ALL
    SELECT m.id, m.assignee, 'STAFF', 'Status: In progress', NULL, FALSE,
           m.reported + (coalesce(m.resolved, now_ts) - m.reported) * 0.4
    FROM t_mr m WHERE m.status IN ('IN_PROGRESS', 'RESOLVED', 'CLOSED')
    UNION ALL
    SELECT m.id, m.assignee, 'STAFF', 'Status: Resolved', pg_temp.pick(ARRAY['Fixed and tested.', 'Part replaced.',
           'Cleaned and checked.', 'Adjusted; please tell us if it happens again.'], 'mrnote' || m.id), FALSE, m.resolved
    FROM t_mr m WHERE m.status IN ('RESOLVED', 'CLOSED')
    UNION ALL
    SELECT m.id, m.student_id, 'STUDENT', 'Confirmed fixed', NULL, FALSE,
           least(m.resolved + make_interval(hours => (2 + pg_temp.rnd('mrclose' || m.id) * 46)::int), now_ts - interval '5 minutes')
    FROM t_mr m WHERE m.status = 'CLOSED';

    -- ================================================================ inspections
    RAISE NOTICE 'Demo seed: %', 'inspections';
    -- Each Block inspects every Room at the start of each Term; failed items became Maintenance Requests.
    INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, repeat, assignee_id, due_within_days,
                                         create_requests, notify_residents, next_run_at, status, created_at)
    SELECT building_id, 'Start-of-term room check', 'CL-ROOM', 'ALL_ROOMS', 'TERMLY', tech, 7, TRUE, TRUE,
           pg_temp.at(DATE '2027-01-14', 6), 'ACTIVE', TIMESTAMPTZ '2022-08-25 09:00+07'
    FROM t_role
    UNION ALL
    SELECT building_id, 'Air-conditioner filters', 'CL-AC', 'OCCUPIED', 'MONTHLY', tech, 5, TRUE, FALSE,
           pg_temp.at(((now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 28), 6), 'ACTIVE', TIMESTAMPTZ '2025-03-05 09:00+07'
    FROM t_role WHERE block IN ('A', 'E')
    UNION ALL
    SELECT building_id, 'Fire extinguisher walk', 'CL-FIRE', 'ALL_ROOMS', 'MONTHLY', tech, 3, FALSE, FALSE, NULL, 'PAUSED',
           TIMESTAMPTZ '2023-01-12 09:00+07'
    FROM t_role WHERE block = 'C';

    CREATE TEMP TABLE t_run ON COMMIT DROP AS
    SELECT nextval(pg_get_serial_sequence('mnt_inspection_run', 'id')) AS id, s.id AS schedule, s.building_id,
           CASE WHEN x.idx < 7 THEN (SELECT id FROM mnt_checklist WHERE family_key = 'CL-ROOM' AND version = 1)
                ELSE (SELECT id FROM mnt_checklist WHERE family_key = 'CL-ROOM' AND version = 2) END AS checklist,
           x.stay_start + 10 AS day, x.id AS term_id, s.assignee_id AS inspector
    FROM mnt_inspection_schedule s CROSS JOIN t_term x
    WHERE s.name = 'Start-of-term room check' AND x.phase <> 'future'
    UNION ALL
    SELECT nextval(pg_get_serial_sequence('mnt_inspection_run', 'id')), s.id, s.building_id,
           (SELECT id FROM mnt_checklist WHERE family_key = 'CL-AC'), (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2,
           (SELECT id FROM t_term WHERE phase = 'current'), s.assignee_id
    FROM mnt_inspection_schedule s WHERE s.name = 'Air-conditioner filters';
    INSERT INTO mnt_inspection_run (id, schedule_id, building_id, checklist_id, run_date, due_at, inspector_id, status,
                                    submitted_at, created_at)
    OVERRIDING SYSTEM VALUE
    SELECT r.id, r.schedule, r.building_id, r.checklist, r.day, pg_temp.at(r.day + 8, 0), r.inspector,
           CASE WHEN r.day < (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 7 THEN 'SUBMITTED' ELSE 'IN_PROGRESS' END,
           CASE WHEN r.day < (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 7 THEN pg_temp.at(r.day + 5, 17) END,
           pg_temp.at(r.day, 6)
    FROM t_run r;

    CREATE TEMP TABLE t_iroom ON COMMIT DROP AS
    SELECT nextval(pg_get_serial_sequence('mnt_inspection_room', 'id')) AS id, r.id AS run, r.checklist, r.day,
           r.inspector, r.term_id, ro.id AS room_id, ro.code AS room, r.building_id,
           CASE WHEN r.day >= (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 7 AND pg_temp.rnd('ipend' || ro.id) < 0.55 THEN 'PENDING'
                WHEN pg_temp.rnd('iaway' || ro.id || r.id) < 0.03 THEN 'UNREACHABLE' ELSE 'INSPECTED' END AS status
    FROM t_run r JOIN inv_room ro ON ro.building_id = r.building_id AND ro.status = 'IN_SERVICE'
    JOIN mnt_inspection_schedule s ON s.id = r.schedule
    WHERE s.scope = 'ALL_ROOMS'
       OR EXISTS (SELECT 1 FROM asg_allocation al JOIN t_bed b ON b.bed_id = al.bed_id
                  WHERE b.room_id = ro.id AND al.status = 'ACTIVE' AND al.checked_in_at IS NOT NULL);
    INSERT INTO mnt_inspection_room (id, run_id, room_id, status, inspected_at)
    OVERRIDING SYSTEM VALUE
    SELECT id, run, room_id, status,
           CASE WHEN status <> 'PENDING' THEN pg_temp.at(day + (pg_temp.rnd('iday' || id) * 4)::int, 8 + pg_temp.rnd('ih' || id) * 9) END
    FROM t_iroom;

    CREATE TEMP TABLE t_ires ON COMMIT DROP AS
    SELECT ir.id AS iroom, ir.room_id, ir.room, ir.building_id, ir.term_id, ir.inspector, ir.day, i.id AS item, i.label,
           i.category, i.severity,
           CASE WHEN pg_temp.rnd('ires' || ir.id || i.id) < 0.015 THEN 'FAIL'
                WHEN pg_temp.rnd('ires' || ir.id || i.id) < 0.022 THEN 'NOT_CHECKED' ELSE 'PASS' END AS result,
           NULL::bigint AS request
    FROM t_iroom ir JOIN mnt_checklist_item i ON i.checklist_id = ir.checklist
    WHERE ir.status = 'INSPECTED';
    UPDATE t_ires SET request = nextval(pg_get_serial_sequence('mnt_request', 'id')) WHERE result = 'FAIL';
    INSERT INTO mnt_request (id, code, term_id, room_id, reporter_id, source, title, description, category, location, urgency,
                             priority, staff_may_enter, status, assignee_id, sla_due_at, reported_at, resolved_at, closed_at,
                             building_id, room_code)
    OVERRIDING SYSTEM VALUE
    SELECT r.request, 'MR-' || lpad(r.request::text, greatest(6, length(r.request::text)), '0'), r.term_id, r.room_id,
           r.inspector, 'INSPECTION', r.label, 'Failed in the start-of-term room check.', r.category, 'ROOM',
           CASE WHEN r.severity = 'CRITICAL' THEN 'URGENT' ELSE 'NORMAL' END,
           CASE r.severity WHEN 'CRITICAL' THEN 'HIGH' WHEN 'MAJOR' THEN 'MEDIUM' ELSE 'LOW' END, TRUE,
           CASE WHEN r.day < (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 20 THEN 'CLOSED' ELSE 'ASSIGNED' END, r.inspector,
           pg_temp.at(r.day, 14) + interval '48 hours', pg_temp.at(r.day, 14),
           CASE WHEN r.day < (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 20 THEN pg_temp.at(r.day + 1, 15) END,
           CASE WHEN r.day < (now_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 20 THEN pg_temp.at(r.day + 2, 10) END,
           r.building_id, r.room
    FROM t_ires r WHERE r.result = 'FAIL';
    INSERT INTO mnt_inspection_result (inspection_room_id, item_id, result, note, created_request_id)
    SELECT iroom, item, result, CASE WHEN result = 'FAIL' THEN 'Found during the room check' END, request FROM t_ires;

    -- ================================================================ escalations
    RAISE NOTICE 'Demo seed: %', 'escalations';
    -- Past breaches the Block Manager handled; open ones now (also opened by the SLA scan every 15 minutes).
    INSERT INTO req_escalation (building_id, term_id, kind, source_type, source_id, title, why, tone, owner_id, status,
                                opened_at, handled_action, handled_at, handled_by, handled_note, source_code, source_at,
                                subtitle, room_code, link)
    SELECT m.building_id, m.term_id, 'SLA_BREACH', 'MAINTENANCE', m.id, m.title,
           'Past the ' || m.limit_hours || '-hour limit', 'DANGER', m.assignee,
           CASE WHEN m.status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') THEN 'OPEN' ELSE 'HANDLED' END,
           m.reported + make_interval(hours => m.limit_hours) + interval '10 minutes',
           CASE WHEN m.status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') THEN NULL
                WHEN pg_temp.rnd('escact' || m.id) < 0.4 THEN 'REASSIGN' ELSE 'CLOSED' END,
           CASE WHEN m.status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') THEN NULL ELSE m.resolved END,
           CASE WHEN m.status NOT IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') AND pg_temp.rnd('escact' || m.id) < 0.4 THEN r.manager END,
           CASE WHEN m.status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') THEN NULL
                WHEN pg_temp.rnd('escact' || m.id) < 0.4 THEN 'Handed to the other technician to finish today.'
                ELSE 'The request was closed.' END,
           'MR-' || lpad(m.id::text, greatest(6, length(m.id::text)), '0'), m.reported,
           initcap(replace(lower(m.category), '_', ' ')) || ' · ' || CASE WHEN m.urgent THEN 'Urgent' ELSE 'Normal' END,
           m.room, '/manager/maintenance/MR-' || lpad(m.id::text, greatest(6, length(m.id::text)), '0')
    FROM t_mr m JOIN t_role r ON r.building_id = m.building_id
    WHERE (m.status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') AND m.reported + make_interval(hours => m.limit_hours) < now_ts)
       OR (m.status IN ('RESOLVED', 'CLOSED') AND m.fx >= 0.88 AND pg_temp.rnd('esc' || m.id) < 0.5);
    INSERT INTO req_escalation (building_id, term_id, kind, source_type, source_id, title, why, tone, owner_id, status,
                                opened_at, source_code, source_at, subtitle, room_code)
    SELECT c.building_id, c.term_id, 'SLA_BREACH', 'ROOM_CHANGE', c.id, u.display_name || ' asks for another Room',
           'Undecided after ' || p.room_change_hours || ' hours', 'DANGER', r.desk, 'OPEN',
           c.submitted + make_interval(hours => p.room_change_hours) + interval '10 minutes',
           'RC-' || c.term_code || '-' || lpad(c.id::text, greatest(6, length(c.id::text)), '0'), c.submitted,
           initcap(replace(lower(c.reason), '_', ' ')), b.room
    FROM t_rc c JOIN req_sla_policy p ON p.building_id = c.building_id JOIN t_role r ON r.building_id = c.building_id
    JOIN auth_user u ON u.id = c.uid JOIN t_bed b ON b.bed_id = c.bed_id
    WHERE c.status IN ('SUBMITTED', 'PENDING') AND c.submitted + make_interval(hours => p.room_change_hours) < now_ts;
    INSERT INTO req_escalation_event (escalation_id, text, at)
    SELECT id, 'Escalated: ' || why, opened_at FROM req_escalation
    UNION ALL
    SELECT id, CASE handled_action WHEN 'REASSIGN' THEN 'Reassigned' ELSE 'Closed automatically' END, handled_at
    FROM req_escalation WHERE status = 'HANDLED';

    -- ================================================================ Spring 2027: registration is open
    RAISE NOTICE 'Demo seed: %', 'Spring 2027: registration is open';
    SELECT * INTO t FROM t_term WHERE phase = 'future';
    TRUNCATE t_app;
    INSERT INTO t_app (term_id, app_id, uid, gender, created)
    SELECT t.id, nextval(pg_get_serial_sequence('app_application', 'id')), s.uid, s.gender,
           t.reg_open + (now_ts - t.reg_open) * pg_temp.rnd('spcreated' || s.uid)
    FROM t_stu s
    WHERE s.enrollment = 'ENROLLED' AND s.affinity * 0.7 + pg_temp.rnd(s.uid || t.code) * 0.3 > 0.80;
    UPDATE t_app SET outcome = CASE
            WHEN created > now_ts - interval '48 hours' AND pg_temp.rnd('spstate' || uid) < 0.55 THEN 'AWAITING_DEPOSIT'
            WHEN created <= now_ts - interval '48 hours' AND pg_temp.rnd('spstate' || uid) < 0.05 THEN 'EXPIRED'
            WHEN pg_temp.rnd('spstate2' || uid) < 0.03 THEN 'CANCELLED'
            WHEN created < now_ts - interval '4 days' AND pg_temp.rnd('spstate2' || uid) < 0.33 THEN 'UNDER_REVIEW'
            WHEN created < now_ts - interval '5 days' AND pg_temp.rnd('spstate2' || uid) < 0.43 THEN 'APPROVED'
            WHEN created < now_ts - interval '5 days' AND pg_temp.rnd('spstate2' || uid) < 0.45 THEN 'REJECTED'
            ELSE 'SUBMITTED' END;
    UPDATE t_app a SET type_id = (SELECT id FROM cfg_room_type WHERE name = pg_temp.pick(ARRAY['2-bed','4-bed','4-bed','4-bed','6-bed'], 'sptype' || a.uid)),
                       class_id = (SELECT id FROM cfg_room_class WHERE name = pg_temp.pick(ARRAY['Basic','Basic','Standard','Standard','Premium'], 'spclass' || a.uid)),
                       code = 'APP-' || t.code || '-' || lpad(a.app_id::text, greatest(6, length(a.app_id::text)), '0');
    UPDATE t_app a SET term_price = (round(rt.base_price * (1 + rc.surcharge_rate) / 1000) * 1000)::bigint
    FROM cfg_room_type rt, cfg_room_class rc WHERE rt.id = a.type_id AND rc.id = a.class_id;
    UPDATE t_app SET deposit = round(term_price * 0.20),
           paid = CASE WHEN outcome NOT IN ('AWAITING_DEPOSIT', 'EXPIRED')
                       THEN least(now_ts - interval '10 minutes',
                                  created + make_interval(mins => (15 + pg_temp.rnd('sppaid' || uid) * 2000)::int)) END;
    UPDATE t_app SET reviewed = CASE WHEN outcome IN ('UNDER_REVIEW', 'APPROVED', 'REJECTED')
                                     THEN least(now_ts - interval '1 hour', paid + interval '2 days') END,
           finished = CASE WHEN outcome = 'EXPIRED' THEN created + interval '48 hours'
                           WHEN outcome = 'CANCELLED' THEN least(now_ts - interval '1 hour', paid + interval '1 day') END;

    INSERT INTO app_application (id, code, term_id, student_id, room_type_id, room_class_id, term_price, surcharge_rate,
                                 deposit_amount, status, roommate_mode, contact, consent_matching, consent_rules, consented_at,
                                 deposit_due_at, submitted_at, reviewed_by, reviewed_at, decision_note, cancelled_at,
                                 cancel_reason, created_at, updated_at, student_name, student_code, gender)
    OVERRIDING SYSTEM VALUE
    SELECT a.app_id, a.code, t.id, a.uid, a.type_id, a.class_id, a.term_price, rc.surcharge_rate, a.deposit, a.outcome, 'AUTO',
           jsonb_build_object('phone', st.phone, 'email', u.email, 'emergencyName', st.emergency_name,
                              'relationship', initcap(lower(st.emergency_relationship)), 'emergencyPhone', st.emergency_phone),
           TRUE, TRUE, a.created, a.created + interval '48 hours', a.paid,
           CASE WHEN a.reviewed IS NOT NULL THEN (SELECT desk FROM t_role WHERE block = CASE WHEN a.gender = 'M' THEN 'A' ELSE 'E' END) END,
           a.reviewed, CASE WHEN a.outcome = 'REJECTED' THEN 'An Invoice from an earlier Term is still overdue.' END,
           CASE WHEN a.outcome = 'CANCELLED' THEN a.finished END,
           CASE WHEN a.outcome = 'CANCELLED' THEN 'Found a room near campus with friends' END,
           a.created, coalesce(a.finished, a.reviewed, a.paid, a.created), u.display_name, st.student_code, a.gender
    FROM t_app a JOIN auth_user u ON u.id = a.uid JOIN auth_student st ON st.user_id = a.uid
    JOIN cfg_room_class rc ON rc.id = a.class_id;

    INSERT INTO app_application_event (application_id, status, text, note, visible_to_student, actor_id, at)
    SELECT app_id, 'AWAITING_DEPOSIT', 'Application created', NULL, TRUE, uid, created FROM t_app
    UNION ALL
    SELECT app_id, 'SUBMITTED', 'Deposit paid', NULL, TRUE, NULL, paid FROM t_app WHERE paid IS NOT NULL
    UNION ALL
    SELECT app_id, 'UNDER_REVIEW', 'Under review by the dormitory office', NULL, TRUE, NULL, reviewed - interval '1 hour'
    FROM t_app WHERE reviewed IS NOT NULL
    UNION ALL
    SELECT app_id, outcome, CASE outcome WHEN 'APPROVED' THEN 'Approved by the dormitory office' ELSE 'Not approved' END,
           NULL, TRUE, NULL, reviewed
    FROM t_app WHERE outcome IN ('APPROVED', 'REJECTED')
    UNION ALL
    SELECT app_id, 'CANCELLED', 'Cancelled by the student', NULL, TRUE, uid, finished FROM t_app WHERE outcome = 'CANCELLED'
    UNION ALL
    SELECT app_id, 'EXPIRED', 'The Deposit window closed', NULL, TRUE, NULL, finished FROM t_app WHERE outcome = 'EXPIRED';

    INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, type, title, amount, utility_deposit, status, lines,
                             transfer_content, issued_at, due_at, paid_at, payment_method, voided_reason, reference, student_name,
                             student_code, gender, created_at, updated_at)
    OVERRIDING SYSTEM VALUE
    SELECT x.id, 'INV-' || t.code || '-' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), t.id, x.uid, x.app_id,
           'DEPOSIT', 'Deposit · ' || t.name, x.deposit, 0, x.status,
           jsonb_build_array(jsonb_build_object('label', 'Deposit · ' || rt.name || ' · ' || rc.name, 'amount', x.deposit)),
           'CSTAY' || lpad(x.id::text, greatest(6, length(x.id::text)), '0'), x.created, x.created + interval '48 hours',
           CASE WHEN x.status IN ('PAID', 'REFUNDED') THEN x.paid END, pg_temp.method(x.id, x.status),
           CASE WHEN x.status = 'VOID' THEN 'The Deposit window closed before payment.' END, 'Application ' || x.code,
           u.display_name, st.student_code, x.gender, x.created, coalesce(x.paid, x.created)
    FROM (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, a.uid, a.app_id, a.code, a.deposit, a.created,
                 a.paid, a.gender, a.type_id, a.class_id,
                 CASE a.outcome WHEN 'AWAITING_DEPOSIT' THEN 'UNPAID' WHEN 'EXPIRED' THEN 'VOID' WHEN 'CANCELLED' THEN 'REFUNDED'
                                ELSE 'PAID' END AS status
          FROM t_app a) x
    JOIN cfg_room_type rt ON rt.id = x.type_id JOIN cfg_room_class rc ON rc.id = x.class_id
    JOIN auth_user u ON u.id = x.uid JOIN auth_student st ON st.user_id = x.uid;
    INSERT INTO bil_refund (term_id, student_id, source_type, source_id, reason, rule_id, paid_amount, amount, exception, status,
                            decided_at, created_at, student_name, student_code, gender, invoice_id)
    SELECT t.id, a.uid, 'APPLICATION_CANCEL', a.app_id, 'Application cancelled', rule_before, a.deposit, a.deposit, FALSE, 'PAID',
           a.finished + interval '5 minutes', a.finished, u.display_name, st.student_code, a.gender, i.id
    FROM t_app a JOIN auth_user u ON u.id = a.uid JOIN auth_student st ON st.user_id = a.uid
    JOIN bil_invoice i ON i.application_id = a.app_id AND i.type = 'DEPOSIT'
    WHERE a.outcome = 'CANCELLED';
    INSERT INTO t_all_app SELECT * FROM t_app;

    -- ================================================================ payments and bank transfers
    RAISE NOTICE 'Demo seed: %', 'payments and bank transfers';
    -- Nine in ten transfers arrived through the SePay feed (VietQR); the rest were confirmed by hand.
    CREATE TEMP TABLE t_pay ON COMMIT DROP AS
    SELECT i.id AS invoice, i.amount, i.paid_at, i.transfer_content, i.building_id, i.gender,
           pg_temp.rnd('manual' || i.id) < 0.10 AS manual, NULL::bigint AS txn
    FROM bil_invoice i WHERE i.status IN ('PAID', 'REFUNDED');
    UPDATE t_pay SET txn = nextval(pg_get_serial_sequence('bil_bank_transaction', 'id')) WHERE NOT manual;
    INSERT INTO bil_bank_transaction (id, provider, provider_txn_id, gateway, account_number, transaction_at, transfer_type,
                                      amount, content, code, reference_code, raw, received_at, match_status, invoice_id,
                                      processed_at)
    OVERRIDING SYSTEM VALUE
    SELECT p.txn, 'SEPAY', (8000000 + p.txn)::text, 'MBBank', '0123456789', p.paid_at, 'in', p.amount,
           p.transfer_content || ' chuyen tien KTX', p.transfer_content,
           'FT' || to_char(p.paid_at, 'YYDDD') || lpad(p.txn::text, 7, '0'),
           jsonb_build_object('id', 8000000 + p.txn, 'gateway', 'MBBank', 'transferType', 'in', 'transferAmount', p.amount,
                              'content', p.transfer_content || ' chuyen tien KTX'),
           p.paid_at + interval '20 seconds', 'MATCHED', p.invoice, p.paid_at + interval '21 seconds'
    FROM t_pay p WHERE p.txn IS NOT NULL;
    INSERT INTO bil_payment (invoice_id, amount, method, status, bank_transaction_id, reference, paid_at, confirmed_by, created_at)
    SELECT p.invoice, p.amount, CASE WHEN p.manual THEN 'MANUAL' ELSE 'VIETQR' END, 'CONFIRMED', p.txn,
           CASE WHEN p.manual THEN 'FT' || to_char(p.paid_at, 'YYDDD') || lpad(p.invoice::text, 7, '0') END, p.paid_at,
           CASE WHEN p.manual THEN coalesce((SELECT finance FROM t_role WHERE building_id = p.building_id),
                                            (SELECT uid FROM t_staff WHERE account = CASE WHEN p.gender = 'M' THEN 'finance.1' ELSE 'finance.2' END)) END,
           p.paid_at
    FROM t_pay p;

    -- ================================================================ notifications
    RAISE NOTICE 'Demo seed: %', 'notifications';
    INSERT INTO ntf_notification (user_id, event_key, title, body, link, created_at, read_at)
    SELECT u.id, 'WELCOME', 'Welcome to CampusStay',
           CASE WHEN u.role = 'STUDENT' THEN 'Your account is ready. Updates on your Application, Invoices and requests appear here.'
                ELSE 'Your account is ready. Work that needs you appears here.' END,
           CASE WHEN u.role = 'STUDENT' THEN '/student' END, u.created_at, u.created_at + interval '1 day'
    FROM auth_user u;
    -- Fall 2026 residents: the Room, the Balance, September's utilities; Spring 2027 applicants: their Application.
    INSERT INTO ntf_notification (user_id, event_key, title, body, link, created_at, read_at)
    SELECT al.student_id, 'ALLOCATION_PUBLISHED', 'Your room is ready',
           'You are in Room ' || b.room || ', Bed ' || b.label || ' for Fall 2026. Pay the Balance before 25/08/2026 23:59.',
           '/student/room', x.results, x.results + interval '3 hours'
    FROM asg_allocation al JOIN t_bed b ON b.bed_id = al.bed_id JOIN t_term x ON x.id = al.term_id
    WHERE x.phase = 'current' AND al.source = 'ASSIGNMENT'
    UNION ALL
    SELECT i.student_id, 'PAYMENT_CONFIRMED', 'Payment received',
           'We received ' || to_char(i.amount, 'FM999,999,999,999') || ' VND for ' || i.title || '.', '/student/invoices',
           i.paid_at, i.paid_at + interval '2 hours'
    FROM bil_invoice i JOIN t_term x ON x.id = i.term_id
    WHERE x.phase IN ('current', 'future') AND i.status = 'PAID' AND i.type IN ('BALANCE', 'DEPOSIT')
    UNION ALL
    SELECT i.student_id, 'INVOICE_ISSUED', 'New Invoice',
           i.title || ': ' || to_char(i.amount, 'FM999,999,999') || ' VND, due ' || to_char(i.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '.',
           '/student/invoices/' || i.code || '/pay', i.issued_at, CASE WHEN i.status = 'PAID' THEN i.paid_at END
    FROM bil_invoice i JOIN t_term x ON x.id = i.term_id
    WHERE x.phase = 'current' AND i.type IN ('UTILITY', 'ROOM_CHANGE')
    UNION ALL
    SELECT i.student_id, 'INVOICE_OVERDUE', 'Invoice overdue',
           i.title || ' (' || to_char(i.amount, 'FM999,999,999') || ' VND) was due on '
               || to_char(i.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '.',
           '/student/invoices/' || i.code || '/pay', i.due_at + interval '1 day', NULL
    FROM bil_invoice i WHERE i.status = 'OVERDUE'
    UNION ALL
    SELECT m.reporter_id, 'MAINTENANCE_UPDATED', 'Maintenance update',
           m.title || ': ' || CASE m.status WHEN 'ASSIGNED' THEN 'Assigned' WHEN 'IN_PROGRESS' THEN 'In progress' ELSE 'Resolved' END || '.',
           '/student/requests', coalesce(m.resolved_at, m.reported_at + interval '1 minute'), NULL
    FROM mnt_request m JOIN t_term x ON x.id = m.term_id
    WHERE x.phase = 'current' AND m.source = 'STUDENT' AND m.status IN ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
    UNION ALL
    SELECT a.uid, CASE WHEN a.outcome = 'AWAITING_DEPOSIT' THEN 'DEPOSIT_DUE' ELSE 'APPLICATION_SUBMITTED' END,
           CASE WHEN a.outcome = 'AWAITING_DEPOSIT' THEN 'Pay your Deposit' ELSE 'Application submitted' END,
           CASE WHEN a.outcome = 'AWAITING_DEPOSIT'
                THEN 'Pay ' || to_char(a.deposit, 'FM999,999,999') || ' VND before '
                     || to_char((a.created + interval '48 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
                     || ' to submit your Application for Spring 2027.'
                ELSE 'Your Application for Spring 2027 is submitted. Results on 22/11/2026.' END,
           '/student/applications/' || a.code, coalesce(a.paid, a.created), NULL
    FROM t_app a WHERE a.outcome IN ('AWAITING_DEPOSIT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED');

    -- ================================================================ Audit Log (the main back-office actions)
    RAISE NOTICE 'Demo seed: %', 'Audit Log (the main back-office actions)';
    INSERT INTO shared_audit_log (at, actor_id, actor_label, action, tone, object_type, object_id, object_label, change)
    SELECT x.published, admin_id, 'Tran Minh Quan', 'TERM_PUBLISHED', 'SUCCESS', 'Term', x.id::text, x.name, NULL::jsonb
    FROM t_term x
    UNION ALL
    SELECT x.results - interval '2 days', r.manager, u.display_name, 'ASSIGNMENT_APPROVED', 'SUCCESS', 'Block', r.block,
           'Block ' || r.block || ' · ' || x.name, NULL
    FROM t_term x CROSS JOIN t_role r JOIN auth_user u ON u.id = r.manager WHERE x.phase <> 'future'
    UNION ALL
    SELECT p.closed_at, r.tech, u.display_name, 'METER_PERIOD_CLOSED', 'SUCCESS', 'Meter period', p.id::text, p.label,
           jsonb_build_object('invoices', coalesce(n.invoices, 0))
    FROM bil_meter_period p JOIN t_role r ON r.building_id = p.building_id JOIN auth_user u ON u.id = r.tech
    LEFT JOIN (SELECT building_id, title, count(*) AS invoices FROM bil_invoice WHERE type = 'UTILITY'
               GROUP BY building_id, title) n ON n.building_id = p.building_id AND n.title = 'Utility · ' || p.label
    WHERE p.closed_at IS NOT NULL
    UNION ALL
    SELECT f.decided_at, f.decided_by, u.display_name,
           CASE f.status WHEN 'REJECTED' THEN 'REFUND_REJECTED' ELSE 'REFUND_APPROVED' END,
           CASE f.status WHEN 'REJECTED' THEN 'WARNING' ELSE 'SUCCESS' END, 'Refund', f.id::text, f.reason,
           jsonb_build_object('amount', f.amount)
    FROM bil_refund f JOIN auth_user u ON u.id = f.decided_by
    WHERE f.rule_id IN (rule_early, rule_after) AND f.decided_at IS NOT NULL
    UNION ALL
    SELECT v.at, finance_admin_id, 'Nguyen Thi Thu Hien', v.action, 'INFO', v.object_type, NULL, v.label, v.change::jsonb
    FROM (VALUES (TIMESTAMPTZ '2024-08-01 10:00+07', 'UTILITY_UPDATED', 'Utility policy', 'Utility',
                  '{"monthsHeld": [1, 2]}'),
                 (TIMESTAMPTZ '2025-07-15 10:00+07', 'FEES_UPDATED', 'Fee policy', 'Fees',
                  '{"balanceDays": [10, 14]}')) AS v (at, action, object_type, label, change)
    UNION ALL
    SELECT c.published_at, admin_id, 'Tran Minh Quan', 'CHECKLIST_PUBLISHED', 'SUCCESS', 'Inspection checklist', c.family_key,
           c.name, jsonb_build_object('version', c.version)
    FROM mnt_checklist c WHERE c.published_at IS NOT NULL;

    -- ================================================================ emails sent to students
    RAISE NOTICE 'Demo seed: %', 'emails sent to students';
    INSERT INTO ntf_email_campaign (mode, term_id, recipient_group, template_key, subject, channel, send_at, status,
                                    queued_count, sent_count, created_by, created_at)
    SELECT 'GROUP', x.id, 'not-checked-in', 'CHECK_IN_REMINDER', 'Check-in for ' || x.name, 'EMAIL',
           pg_temp.at(x.ci_start - 5, 8), 'SENT',
           (SELECT count(*) FROM asg_allocation al WHERE al.term_id = x.id AND al.source = 'ASSIGNMENT'),
           (SELECT count(*) FROM asg_allocation al WHERE al.term_id = x.id AND al.source = 'ASSIGNMENT'),
           admin_id, pg_temp.at(x.ci_start - 6, 15)
    FROM t_term x WHERE x.phase <> 'future'
    UNION ALL
    SELECT 'GROUP', x.id, 'unpaid', 'PAYMENT_REMINDER', 'Payment reminder: {{title}}', 'EMAIL_PUSH',
           pg_temp.at(DATE '2026-10-10', 9), 'SENT',
           (SELECT count(DISTINCT student_id) FROM bil_invoice i WHERE i.term_id = x.id AND i.status = 'OVERDUE'),
           (SELECT count(DISTINCT student_id) FROM bil_invoice i WHERE i.term_id = x.id AND i.status = 'OVERDUE'),
           finance_admin_id, pg_temp.at(DATE '2026-10-10', 8.5)
    FROM t_term x WHERE x.phase = 'current'
    UNION ALL
    SELECT 'GROUP', x.id, 'applicants', 'ANNOUNCEMENT', 'Spring 2027 registration is open', 'EMAIL', x.reg_open, 'SENT',
           5400, 5400, admin_id, x.reg_open - interval '1 hour'
    FROM t_term x WHERE x.phase = 'future';
END
$seed$;
