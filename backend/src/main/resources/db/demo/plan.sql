-- =====================================================================
-- CampusStay FPT — demo plan (spec §15). Read-only: builds the temporary
-- tables every feature's script reads, then each feature writes its own
-- tables from them.
--   demo_t   the timeline of the stage: Term N (in stay) and N+1 ("x"),
--            every date relative to {{today}}
--   demo_res the residents of Term N and what happens to their next-Term
--            Allocation at this stage
--   demo_app the new students who apply for N+1 and where they stand
-- Scenario accounts (db/demo/scenarios.csv) are placed by code; everyone
-- else is chosen deterministically from the base data (db/seed).
-- =====================================================================

-- ---------- timeline ----------
-- k: days of the cycle already gone (A 0, B 25, C 42); e: days left in Term N.
CREATE TEMP TABLE demo_t ON COMMIT DROP AS
WITH p AS (
    SELECT {{stage}}::text AS stage, {{now}} AS now, {{today}} AS today,
           CASE {{stage}} WHEN 'A' THEN 0 WHEN 'B' THEN 25 ELSE 42 END AS k,
           CASE {{stage}} WHEN 'A' THEN 45 WHEN 'B' THEN 20 ELSE 3 END AS e),
d AS (
    SELECT p.*, p.today + p.e - 111 AS n_start, p.today + p.e AS n_end, p.today + p.e + 1 AS x_start,
           p.today + p.e + 112 AS x_end
    FROM p),
s AS (
    SELECT d.*, extract(month FROM d.n_start + 55)::int AS m, extract(year FROM d.n_start + 55)::int AS y FROM d),
c AS (
    SELECT s.*,
           CASE WHEN m <= 4 THEN 'SP' WHEN m <= 8 THEN 'SU' ELSE 'FA' END AS n_season,
           CASE WHEN m <= 4 THEN 'SU' WHEN m <= 8 THEN 'FA' ELSE 'SP' END AS x_season,
           CASE WHEN m <= 4 THEN 'FA' WHEN m <= 8 THEN 'SP' ELSE 'SU' END AS f_season,
           CASE WHEN m > 8 THEN y + 1 ELSE y END AS x_year,
           CASE WHEN m > 4 THEN y + 1 ELSE y END AS f_year
    FROM s)
SELECT c.stage, c.now, c.today, c.n_start, c.n_end, c.x_start, c.x_end,
       c.n_season || lpad((c.y % 100)::text, 2, '0') AS n_code,
       CASE c.n_season WHEN 'SP' THEN 'Spring ' WHEN 'SU' THEN 'Summer ' ELSE 'Fall ' END || c.y AS n_name,
       c.x_season || lpad((c.x_year % 100)::text, 2, '0') AS x_code,
       CASE c.x_season WHEN 'SP' THEN 'Spring ' WHEN 'SU' THEN 'Summer ' ELSE 'Fall ' END || c.x_year AS x_name,
       CASE c.f_season WHEN 'SP' THEN 'Spring ' WHEN 'SU' THEN 'Summer ' ELSE 'Fall ' END || c.f_year AS f_name,
       c.x_end + 8 AS f_start, c.x_end + 120 AS f_end,
       -- Term N: registered, assigned and paid before its stay
       ((c.n_start - 60) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS n_reg_open,
       ((c.n_start - 45) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS n_reg_close,
       ((c.n_start - 40) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS n_results,
       ((c.n_start - 30) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS n_balance_due,
       -- Term N+1: renewal milestones M1–M7 and its registration
       ((c.today - 6 - c.k) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m1,
       ((c.today - 5 - c.k) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m2,
       ((c.today + 6 - c.k) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m3,
       ((c.today + 13 - c.k) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m4,
       ((c.today + 17 - c.k) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m5,
       ((c.today + 19 - c.k) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m6,
       ((c.today + 30 - c.k) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_m7,
       ((c.today - 4 - c.k) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_reg_open,
       ((c.today + 9 - c.k) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_reg_close,
       ((c.today + 15 - c.k) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_results,
       ((c.today + 28 - c.k) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS x_balance_due,
       NULL::bigint AS n_id, NULL::bigint AS x_id
FROM c;

-- ---------- accounts used by the scenarios ----------
CREATE TEMP TABLE demo_staff ON COMMIT DROP AS
SELECT u.id, split_part(u.email, '@', 1) AS account, u.role FROM auth_user u
WHERE u.demo AND u.email ~ '^(admin|manager\.[a-h]|staff\.[a-h][12])@fpt\.edu\.vn$';

-- Students of the scenarios (also kept out of the bulk residents and applicants).
CREATE TEMP TABLE demo_reserved ON COMMIT DROP AS
SELECT s.user_id AS student_id, s.student_code AS code FROM auth_student s
WHERE s.student_code IN ('SE210001', 'SE210002', 'SE210003', 'SE210004', 'SE210006', 'SE210007', 'SE210012',
                         'SE210013', 'SE210014', 'SE210019', 'SE210024', 'SE210026', 'SE200001', 'SE200003',
                         'SE200004', 'SE200005', 'SE200007', 'SE200009', 'SE200010', 'SE220001', 'SE220002',
                         'SE220003', 'SE220004', 'SE220005', 'SE220006', 'SE220007', 'SE220008', 'SE220009',
                         'SE220011', 'SE220012', 'SE220013');

-- Rooms the scenarios use: nobody else lives there in Term N, and no new student gets them in N+1.
CREATE TEMP TABLE demo_rooms ON COMMIT DROP AS
SELECT r.id AS room_id, r.code FROM inv_room r
WHERE r.code IN ('A-501', 'A-502', 'A-503', 'A-505', 'A-506', 'A-507', 'A-508', 'A-509', 'A-603', 'A-605', 'A-701',
                 'A-702', 'A-703', 'A-704', 'A-705', 'A-801', 'A-802', 'A-803', 'E-501');

-- ---------- residents of Term N ----------
-- fate at the start of the requests window: CONTINUING (stay length left), LAST (last Term of the Stay), NONE.
CREATE TEMP TABLE demo_res ON COMMIT DROP AS
WITH scen (code, room, bed, scenario, committed, fate) AS (VALUES
    ('SE210001', 'A-501', 'A', 'S08', 3, 'CONTINUING'),
    ('SE210003', 'A-502', 'A', 'S09', 1, 'LAST'),
    ('SE210002', 'E-501', 'A', 'S10', 1, 'LAST'),
    ('SE210004', 'A-503', 'A', 'S11', 2, 'CONTINUING'),
    ('SE210006', 'A-505', 'A', 'S12', 2, 'CONTINUING'),
    ('SE210007', 'A-506', 'A', 'S13', 2, 'CONTINUING'),
    ('SE210012', 'A-507', 'A', 'S14', 2, 'CONTINUING'),
    ('SE210013', 'A-605', 'A', 'S14', 2, 'CONTINUING'),
    ('SE210014', 'A-508', 'A', 'S15', 2, 'CONTINUING'),
    ('SE210019', 'A-508', 'B', 'S15', 2, 'CONTINUING'),
    ('SE210024', 'A-508', 'C', 'S15', 3, 'CONTINUING'),
    ('SE210026', 'A-508', 'D', 'S15', 2, 'CONTINUING'),
    ('SE200001', 'A-701', 'A', 'S19', 2, 'CONTINUING'),
    ('SE200003', 'A-702', 'A', 'S20', 2, 'CONTINUING'),
    ('SE200004', 'A-703', 'A', 'S21', 2, 'NONE'),
    ('SE200005', 'A-704', 'A', 'S22', 2, 'CONTINUING'),
    ('SE200007', 'A-705', 'A', 'S23', 2, 'CONTINUING'),
    ('SE200009', 'A-801', 'A', 'S28', 2, 'CONTINUING'),
    ('SE200010', 'A-802', 'A', 'S29', 2, 'CONTINUING')),
placed AS (
    SELECT s.user_id AS student_id, b.id AS bed_id, sc.scenario, sc.committed, sc.fate
    FROM scen sc JOIN auth_student s ON s.student_code = sc.code
    JOIN inv_room r ON r.code = sc.room JOIN inv_bed b ON b.room_id = r.id AND b.label = sc.bed),
beds AS (
    SELECT b.id AS bed_id, bl.gender,
           row_number() OVER (PARTITION BY bl.gender ORDER BY md5('bed' || b.id)) AS n
    FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_building bl ON bl.id = r.building_id
    WHERE r.status = 'IN_SERVICE' AND b.status = 'IN_SERVICE' AND r.id NOT IN (SELECT room_id FROM demo_rooms)
      AND abs(hashtext('occupied' || b.id)) % 100 < 70),
students AS (
    SELECT s.user_id AS student_id, s.gender,
           row_number() OVER (PARTITION BY s.gender ORDER BY md5('resident' || s.student_code)) AS n
    FROM auth_student s JOIN auth_user u ON u.id = s.user_id
    WHERE u.demo AND u.status = 'ACTIVE' AND s.cohort <> 'K22'
      AND s.user_id NOT IN (SELECT student_id FROM demo_reserved)),
bulk AS (
    SELECT st.student_id, be.bed_id, NULL::text AS scenario,
           1 + abs(hashtext('gia-han' || st.student_id)) % 3 AS committed
    FROM beds be JOIN students st ON st.gender = be.gender AND st.n = be.n),
everyone AS (
    SELECT student_id, bed_id, scenario, committed, fate FROM placed
    UNION ALL
    SELECT student_id, bed_id, scenario, committed, CASE WHEN committed = 1 THEN 'LAST' ELSE 'CONTINUING' END FROM bulk)
SELECT e.student_id, s.student_code AS code, u.display_name AS name, s.gender, e.bed_id, b.label AS bed_label,
       r.id AS room_id, r.code AS room_code, r.building_id, bl.code AS block, r.room_type_id, r.room_class_id,
       e.committed, e.fate, e.scenario, abs(hashtext('fate' || e.student_id)) % 100 AS h,
       NULL::text AS x_state, NULL::text AS fee, NULL::text AS leave, NULL::bigint AS x_bed_id
FROM everyone e JOIN auth_student s ON s.user_id = e.student_id JOIN auth_user u ON u.id = e.student_id
JOIN inv_bed b ON b.id = e.bed_id JOIN inv_room r ON r.id = b.room_id JOIN inv_building bl ON bl.id = r.building_id;

-- What the next-Term Allocation is at this stage:
--   AWAITING (A only), CONTINUING, NOT_EXTENDED (released at M3), END_OF_STAY (approved), FEE_NOT_PAID (C, at M7).
UPDATE demo_res r SET x_state = CASE
    WHEN r.fate = 'NONE' THEN NULL
    WHEN t.stage = 'A' THEN CASE WHEN r.fate = 'LAST' THEN 'AWAITING' ELSE 'CONTINUING' END
    WHEN r.scenario = 'S11' THEN 'END_OF_STAY'
    WHEN r.fate = 'LAST' AND (r.scenario = 'S10' OR (r.scenario IS NULL AND r.h % 2 = 0)) THEN 'CONTINUING'
    WHEN r.fate = 'LAST' THEN 'NOT_EXTENDED'
    ELSE 'CONTINUING' END
FROM demo_t t;

-- The next-Term fee (B and C): PAID, CLAIMED (awaiting confirmation) or UNPAID. B is before M7 (60 % paid, 10 %
-- claimed); by C 90 % paid and the rest released their Bed at M7.
UPDATE demo_res r SET fee = CASE
    WHEN r.scenario IN ('S08') THEN 'PAID'
    WHEN r.scenario IN ('S19', 'S20', 'S22') THEN 'UNPAID'
    WHEN r.scenario = 'S23' THEN 'CLAIMED'
    WHEN t.stage = 'B' AND r.h < 60 THEN 'PAID' WHEN t.stage = 'B' AND r.h < 70 THEN 'CLAIMED'
    WHEN t.stage = 'C' AND r.h < 90 THEN 'PAID' ELSE 'UNPAID' END
FROM demo_t t WHERE t.stage IN ('B', 'C') AND r.x_state = 'CONTINUING';

UPDATE demo_res r SET x_state = 'FEE_NOT_PAID'
FROM demo_t t WHERE t.stage = 'C' AND r.fee = 'UNPAID';

UPDATE demo_res r SET fee = 'PAID' FROM demo_t t WHERE t.stage = 'C' AND r.fee = 'CLAIMED';

-- The next-Term Bed: the same one, except the approved room change of S12 (B, C) to A-603.
UPDATE demo_res r SET x_bed_id = CASE
    WHEN r.scenario = 'S12' AND t.stage IN ('B', 'C')
        THEN (SELECT b.id FROM inv_bed b JOIN inv_room ro ON ro.id = b.room_id WHERE ro.code = 'A-603' AND b.label = 'A')
    ELSE r.bed_id END
FROM demo_t t WHERE r.x_state IS NOT NULL;

-- Leavers in the turnover week (C): checked out already (about 40 %) or still to check out (the scenarios).
UPDATE demo_res r SET leave = CASE WHEN r.scenario IS NULL AND r.h % 5 < 2 THEN 'CHECKED_OUT' ELSE 'TO_CHECK_OUT' END
FROM demo_t t WHERE t.stage = 'C' AND (r.x_state IS NULL OR r.x_state <> 'CONTINUING') AND r.scenario IS DISTINCT FROM 'S21';

-- ---------- new students applying for Term N+1 ----------
-- status at this stage; balance (B, C) PAID or UNPAID; late check-in PENDING or APPROVED.
CREATE TEMP TABLE demo_app ON COMMIT DROP AS
WITH scen (code, scenario) AS (VALUES
    ('SE220002', 'S03'), ('SE220008', 'S04'), ('SE220003', 'S05'), ('SE220009', 'S06'), ('SE220004', 'S07'),
    ('SE220005', 'S16'), ('SE220007', 'S17'), ('SE220011', 'S18'), ('SE220012', 'S34'), ('SE220013', 'S34')),
bulk AS (
    SELECT s.user_id AS student_id, NULL::text AS scenario,
           row_number() OVER (PARTITION BY s.gender ORDER BY md5('applicant' || s.student_code)) AS n
    FROM auth_student s JOIN auth_user u ON u.id = s.user_id
    WHERE u.demo AND u.status = 'ACTIVE' AND s.cohort IN ('K21', 'K22')
      AND s.user_id NOT IN (SELECT student_id FROM demo_reserved)
      AND s.user_id NOT IN (SELECT student_id FROM demo_res)),
everyone AS (
    SELECT s.user_id AS student_id, sc.scenario FROM scen sc JOIN auth_student s ON s.student_code = sc.code
    UNION ALL
    SELECT student_id, scenario FROM bulk WHERE n <= 260)
SELECT e.student_id, s.student_code AS code, u.display_name AS name, s.gender, e.scenario,
       abs(hashtext('apply' || e.student_id)) % 100 AS h,
       NULL::text AS status, NULL::text AS balance, NULL::text AS late, NULL::bigint AS x_bed_id,
       NULL::bigint AS room_type_id, NULL::bigint AS room_class_id
FROM everyone e JOIN auth_student s ON s.user_id = e.student_id JOIN auth_user u ON u.id = e.student_id;

UPDATE demo_app a SET status = CASE
    WHEN t.stage = 'A' THEN CASE
        WHEN a.scenario IN ('S03', 'S04', 'S05') THEN 'AWAITING_DEPOSIT'
        WHEN a.scenario IN ('S06', 'S07', 'S18', 'S34') THEN 'APPROVED'
        WHEN a.scenario = 'S16' THEN 'UNDER_REVIEW'
        WHEN a.scenario = 'S17' THEN 'SUBMITTED'
        WHEN a.h < 15 THEN 'AWAITING_DEPOSIT' WHEN a.h < 50 THEN 'SUBMITTED' WHEN a.h < 70 THEN 'UNDER_REVIEW'
        ELSE 'APPROVED' END
    WHEN a.scenario = 'S34' THEN 'WAITLISTED'
    WHEN a.scenario IS NULL AND a.h >= 80 THEN 'WAITLISTED'
    ELSE 'ALLOCATED' END
FROM demo_t t;

UPDATE demo_app a SET balance = CASE
    WHEN a.scenario IN ('S07', 'S16', 'S17', 'S18') THEN 'UNPAID'
    WHEN a.scenario IS NOT NULL OR a.h % 10 < 7 THEN 'PAID' ELSE 'UNPAID' END,
    late = CASE WHEN a.scenario = 'S16' AND t.stage = 'B' THEN 'PENDING'
                WHEN a.scenario = 'S17' THEN 'APPROVED' END
FROM demo_t t WHERE a.status = 'ALLOCATED';

-- C: Balances not paid by their deadline were forfeited (the approved late check-in moved S17's deadline).
UPDATE demo_app a SET status = 'FORFEITED'
FROM demo_t t WHERE t.stage = 'C' AND a.status = 'ALLOCATED' AND a.balance = 'UNPAID' AND a.late IS DISTINCT FROM 'APPROVED';

-- Beds for the Round-1 assignment: free in N+1 once the requests window closed (not held by a continuing
-- resident, not a scenario Room), matched by gender. Forfeited Allocations had a Bed too.
WITH held AS (
    SELECT x_bed_id AS bed_id FROM demo_res WHERE x_state IN ('CONTINUING', 'FEE_NOT_PAID')),
free AS (
    SELECT b.id AS bed_id, bl.gender, row_number() OVER (PARTITION BY bl.gender ORDER BY md5('free' || b.id)) AS n
    FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_building bl ON bl.id = r.building_id
    WHERE r.status = 'IN_SERVICE' AND b.status = 'IN_SERVICE' AND r.id NOT IN (SELECT room_id FROM demo_rooms)
      AND b.id NOT IN (SELECT bed_id FROM held)),
assigned AS (
    SELECT a.student_id, a.gender, row_number() OVER (PARTITION BY a.gender ORDER BY a.scenario NULLS LAST, a.h, a.student_id) AS n
    FROM demo_app a WHERE a.status IN ('ALLOCATED', 'FORFEITED'))
UPDATE demo_app a SET x_bed_id = f.bed_id
FROM assigned s JOIN free f ON f.gender = s.gender AND f.n = s.n
WHERE a.student_id = s.student_id;

-- What each applicant asked for: the Room Type and Room Class of the Bed they got, else a choice by hash.
UPDATE demo_app a SET room_type_id = coalesce(r.room_type_id, (SELECT x.id FROM (SELECT id, row_number() OVER
                                   (ORDER BY sort_order) - 1 AS i FROM cfg_room_type) x WHERE x.i = a.h % 3)),
                      room_class_id = coalesce(r.room_class_id, (SELECT x.id FROM (SELECT id, row_number() OVER
                                   (ORDER BY sort_order) - 1 AS i FROM cfg_room_class) x WHERE x.i = (a.h / 3) % 3))
FROM (SELECT a2.student_id, ro.room_type_id, ro.room_class_id FROM demo_app a2
      LEFT JOIN inv_bed b ON b.id = a2.x_bed_id LEFT JOIN inv_room ro ON ro.id = b.room_id) r
WHERE r.student_id = a.student_id;

-- ---------- monthly Utility of Term N ----------
-- Every calendar month of Term N before this one was closed by its Block's Staff: a reading for every Room and a
-- Utility Invoice for every resident, split as Meter readings › Close period does (no meter cut in these months, so
-- one segment; shares by the time each resident lived in the Room since the door code). This month stays open.
CREATE TEMP TABLE demo_util_month ON COMMIT DROP AS
WITH m AS (
    SELECT (date_trunc('month', t.today::timestamp) - interval '1 month' * g)::date AS period_start, g AS age, t.n_start,
           t.now
    FROM demo_t t CROSS JOIN generate_series(1, 12) g),
e AS (
    SELECT m.*, (m.period_start + interval '1 month' - interval '1 day')::date AS period_end FROM m)
SELECT e.period_start, e.period_end, to_char(e.period_start, 'MM/YYYY') AS label, e.age,
       least(((e.period_end + 2) + TIME '16:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', e.now - interval '3 hours') AS closed_at,
       ((e.period_end + 1 + u.payment_due_days) + TIME '00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS due_at
FROM e CROSS JOIN cfg_utility_policy u
WHERE e.period_end >= e.n_start - 3;

-- Residence starts with the door code (asg.sql: resident_at = Term start - 3 + h % 5, 10:00): hours in each month.
CREATE TEMP TABLE demo_util_stay ON COMMIT DROP AS
SELECT d.student_id, d.room_id, d.room_code, d.scenario, d.h, m.label, m.age,
       (m.period_end + 1 - greatest(m.period_start, t.n_start - 3 + d.h % 5)) * 24
           - CASE WHEN t.n_start - 3 + d.h % 5 >= m.period_start THEN 10 ELSE 0 END AS hours
FROM demo_res d CROSS JOIN demo_t t JOIN demo_util_month m ON m.period_end >= t.n_start - 3 + d.h % 5;

-- Each lived-in Room's use (only those get a reading, as Close period does): about 1.2–1.6 kWh and 0.1 m³ per
-- resident a day; readings chained from month to month.
CREATE TEMP TABLE demo_util_room ON COMMIT DROP AS
WITH u AS (
    SELECT r.id AS room_id, r.code AS room_code, r.building_id, m.label, m.age, m.period_start,
           o.hours, o.residents, 5 + o.hours * (12 + r.id % 5) / 240 AS kwh, 1 + o.hours / 240 AS m3
    FROM inv_room r CROSS JOIN demo_util_month m
    JOIN (SELECT room_id, label, sum(hours) AS hours, count(*) AS residents FROM demo_util_stay
          GROUP BY room_id, label) o ON o.room_id = r.id AND o.label = m.label)
SELECT u.*,
       1000 + (u.room_id % 97) * 7 + coalesce(sum(u.kwh) OVER w, 0) AS electricity_prev,
       30 + u.room_id % 40 + coalesce(sum(u.m3) OVER w, 0) AS water_prev
FROM u
WINDOW w AS (PARTITION BY u.room_id ORDER BY u.period_start ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING);

-- Each resident's share, rounded as Admin › Utility says; S19 owes last month, S20 and S21 also the month before.
CREATE TEMP TABLE demo_util_share ON COMMIT DROP AS
WITH p AS (
    SELECT price_kwh, price_m3,
           CASE WHEN rounding LIKE 'ROUND\_UP\_%' THEN greatest(1, substring(rounding FROM 10)::bigint) ELSE 1 END AS step
    FROM cfg_utility_policy),
x AS (
    SELECT s.student_id, s.room_id, s.room_code, s.scenario, s.h, s.label, s.age, r.residents, r.kwh, r.m3,
           r.kwh * p.price_kwh AS electricity_cost, r.m3 * p.price_m3 AS water_cost, p.price_kwh, p.price_m3, p.step,
           (r.kwh * p.price_kwh + r.m3 * p.price_m3)::numeric * s.hours / r.hours AS exact
    FROM demo_util_stay s CROSS JOIN p JOIN demo_util_room r ON r.room_id = s.room_id AND r.label = s.label)
SELECT x.*, round(x.exact)::bigint AS share, (ceil(ceil(x.exact) / x.step) * x.step)::bigint AS amount,
       coalesce((x.scenario IN ('S19', 'S20', 'S21') AND x.age = 1) OR (x.scenario IN ('S20', 'S21') AND x.age = 2),
                FALSE) AS overdue
FROM x;
