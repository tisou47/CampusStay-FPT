-- =====================================================================
-- CampusStay FPT — demo stage E (Family Day): stage A plus five Family
-- Days of Block A, so a Family Day can be shown at once after a reset,
-- with no waiting for a time slot to start or end (ADR-29, A-69, A-71):
--   past     its time slots ended an hour ago: one guest is still
--            inside (overdue), two never came; the Manager closes it
--   live     its first time slot is on now: the desk checks guests in
--   open     registration is open: students register their guests
--   draft    a Draft the Manager edits and publishes
--   history  completed last month (statistics)
-- Times of past and live follow the hour of the reset; the others are
-- campus days. The guests are fictional; residents of Term N register.
-- =====================================================================

CREATE TEMP TABLE demo_vis_day ON COMMIT DROP AS
SELECT x.kind, x.title, x.description, x.area, x.opens, x.closes, x.max_guests, x.status, x.created
FROM demo_t t
CROSS JOIN LATERAL (SELECT date_trunc('hour', t.now) AS h) n
CROSS JOIN LATERAL (VALUES
    ('past', 'Ngày gia đình · sáng nay',
     'Gia đình thăm sinh viên tại sảnh Tòa A. Khung giờ đã kết thúc: kiểm tra khách còn ở trong rồi kết thúc sự kiện.',
     'Sảnh tầng 1 Tòa A', n.h - interval '7 days', n.h - interval '1 day', 4, 'PUBLISHED', n.h - interval '8 days'),
    ('live', 'Ngày gia đình · đang diễn ra',
     'Khung giờ đầu đang diễn ra: nhân viên quét vé của khách tại quầy tiếp đón.',
     'Sân sinh hoạt chung Tòa A', n.h - interval '5 days', n.h - interval '1 hour', 4, 'PUBLISHED', n.h - interval '6 days'),
    ('open', 'Ngày gia đình cuối tuần',
     'Sinh viên đang ở Tòa A đăng ký người thân theo khung giờ; mỗi người thân nhận một vé QR.',
     'Sảnh tầng 1 Tòa A', n.h - interval '1 day', ((t.today + 3) + TIME '20:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
     4, 'PUBLISHED', n.h - interval '2 days'),
    ('draft', 'Ngày gia đình tháng sau',
     'Bản nháp: chỉnh khung giờ và sức chứa rồi công bố.',
     'Sân sinh hoạt chung Tòa A', ((t.today + 10) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
     ((t.today + 19) + TIME '20:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 3, 'DRAFT', n.h - interval '1 day'),
    ('history', 'Ngày gia đình tháng trước',
     'Đã kết thúc: số liệu đã chốt.',
     'Sảnh tầng 1 Tòa A', ((t.today - 40) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
     ((t.today - 31) + TIME '20:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 4, 'COMPLETED',
     ((t.today - 41) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')
) AS x (kind, title, description, area, opens, closes, max_guests, status, created);

INSERT INTO vis_family_day (building_id, title, description, area, registration_opens_at, registration_closes_at,
                            max_guests, status, created_by, created_at, published_at, closed_at, closed_by, close_note)
SELECT b.id, d.title, d.description, d.area, d.opens, d.closes, d.max_guests, d.status,
       (SELECT id FROM demo_staff WHERE account = 'manager01'), d.created,
       CASE WHEN d.status <> 'DRAFT' THEN d.created + interval '1 hour' END,
       CASE WHEN d.status = 'COMPLETED' THEN ((t.today - 30) + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       CASE WHEN d.status = 'COMPLETED' THEN (SELECT id FROM demo_staff WHERE account = 'manager01') END,
       CASE WHEN d.status = 'COMPLETED' THEN 'Mọi khách đã ra về đúng giờ.' END
FROM demo_vis_day d CROSS JOIN demo_t t JOIN inv_building b ON b.code = 'A';

-- Time slots: n is the slot's number within its Family Day.
CREATE TEMP TABLE demo_vis_slot ON COMMIT DROP AS
SELECT x.kind, x.n, x.starts, x.ends, x.capacity
FROM demo_t t
CROSS JOIN LATERAL (SELECT date_trunc('hour', t.now) AS h) n
CROSS JOIN LATERAL (VALUES
    ('past', 1, n.h - interval '5 hours', n.h - interval '3 hours', 40),
    ('past', 2, n.h - interval '3 hours', n.h - interval '1 hour', 40),
    ('live', 1, n.h, n.h + interval '2 hours', 30),
    ('live', 2, n.h + interval '2 hours', n.h + interval '4 hours', 30),
    ('open', 1, ((t.today + 4) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', ((t.today + 4) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 20),
    ('open', 2, ((t.today + 4) + TIME '14:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', ((t.today + 4) + TIME '16:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 20),
    ('draft', 1, ((t.today + 20) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', ((t.today + 20) + TIME '11:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 50),
    ('history', 1, ((t.today - 30) + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', ((t.today - 30) + TIME '11:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 40)
) AS x (kind, n, starts, ends, capacity);

INSERT INTO vis_time_slot (family_day_id, starts_at, ends_at, capacity)
SELECT f.id, s.starts, s.ends, s.capacity
FROM demo_vis_slot s JOIN demo_vis_day d ON d.kind = s.kind JOIN vis_family_day f ON f.title = d.title
ORDER BY f.id, s.n;

-- Guests (fictional) of scenario residents of Block A. state: NOT_ARRIVED, IN (checked in), OUT (came and left),
-- NO_SHOW. in_min / out_min: minutes after the slot's start.
CREATE TEMP TABLE demo_vis_guest ON COMMIT DROP AS
SELECT * FROM (VALUES
    ('past', 1, 'SE210001', 'Nguyễn Văn Hùng', 'Father', 1972, 'OUT', 10, 95),
    ('past', 1, 'SE210001', 'Trần Thị Mai', 'Mother', 1975, 'OUT', 10, 95),
    ('past', 1, 'SE210004', 'Lê Văn Phúc', 'Father', 1970, 'OUT', 25, 110),
    ('past', 1, 'SE210004', 'Lê Thị Ngọc', 'Sister', 1999, 'NOT_ARRIVED', NULL, NULL),
    ('past', 2, 'SE210006', 'Phạm Thị Lan', 'Mother', 1976, 'IN', 15, NULL),
    ('past', 2, 'SE210007', 'Võ Minh Tâm', 'Brother', 1998, 'NOT_ARRIVED', NULL, NULL),
    ('live', 1, 'SE200001', 'Đỗ Văn Long', 'Father', 1971, 'NOT_ARRIVED', NULL, NULL),
    ('live', 1, 'SE200001', 'Đỗ Thị Hạnh', 'Mother', 1974, 'NOT_ARRIVED', NULL, NULL),
    ('live', 1, 'SE200003', 'Hoàng Thị Thu', 'Mother', 1973, 'IN', 0, NULL),
    ('live', 2, 'SE200005', 'Bùi Văn Sơn', 'Grandparent', 1955, 'NOT_ARRIVED', NULL, NULL),
    ('live', 2, 'SE200005', 'Bùi Thị Hoa', 'Grandparent', 1958, 'NOT_ARRIVED', NULL, NULL),
    ('live', 2, 'SE200005', 'Bùi Gia Huy', 'Brother', 2012, 'NOT_ARRIVED', NULL, NULL),
    ('open', 1, 'SE200007', 'Ngô Thị Bích', 'Mother', 1977, 'NOT_ARRIVED', NULL, NULL),
    ('open', 2, 'SE210001', 'Nguyễn Văn Hùng', 'Father', 1972, 'NOT_ARRIVED', NULL, NULL),
    ('history', 1, 'SE210001', 'Trần Thị Mai', 'Mother', 1975, 'OUT', 20, 140),
    ('history', 1, 'SE210004', 'Lê Văn Phúc', 'Father', 1970, 'OUT', 35, 150),
    ('history', 1, 'SE210006', 'Phạm Văn Đức', 'Father', 1974, 'OUT', 5, 120),
    ('history', 1, 'SE210007', 'Võ Thị Hằng', 'Mother', 1978, 'NO_SHOW', NULL, NULL)
) AS g (kind, n, code, full_name, relationship, birth_year, state, in_min, out_min);

-- One registration per student and Family Day, made a day after registration opened.
INSERT INTO vis_registration (family_day_id, time_slot_id, student_id, status, created_at)
SELECT DISTINCT f.id, ts.id, s.user_id, 'APPROVED', least(d.opens + interval '1 day', d.closes - interval '1 hour')
FROM demo_vis_guest g JOIN demo_vis_day d ON d.kind = g.kind JOIN vis_family_day f ON f.title = d.title
JOIN demo_vis_slot sl ON sl.kind = g.kind AND sl.n = g.n
JOIN vis_time_slot ts ON ts.family_day_id = f.id AND ts.starts_at = sl.starts
JOIN auth_student s ON s.student_code = g.code;

-- Passes as the API makes them (Tokens.newToken: 32 random bytes, base64url without padding).
INSERT INTO vis_visitor (registration_id, full_name, relationship, birth_year, pass_token, status, checked_in_at,
                         checked_in_by, checked_out_at, checked_out_by)
SELECT r.id, g.full_name, g.relationship, g.birth_year,
       rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '='),
       CASE g.state WHEN 'IN' THEN 'CHECKED_IN' WHEN 'OUT' THEN 'CHECKED_OUT' ELSE g.state END,
       CASE WHEN g.state IN ('IN', 'OUT') THEN least(ts.starts_at + make_interval(mins => g.in_min), t.now) END,
       CASE WHEN g.state IN ('IN', 'OUT') THEN (SELECT id FROM demo_staff WHERE account = 'staffa01') END,
       CASE WHEN g.state = 'OUT' THEN ts.starts_at + make_interval(mins => g.out_min) END,
       CASE WHEN g.state = 'OUT' THEN (SELECT id FROM demo_staff WHERE account = 'staffa01') END
FROM demo_vis_guest g CROSS JOIN demo_t t
JOIN demo_vis_day d ON d.kind = g.kind JOIN vis_family_day f ON f.title = d.title
JOIN auth_student s ON s.student_code = g.code
JOIN vis_registration r ON r.family_day_id = f.id AND r.student_id = s.user_id
JOIN vis_time_slot ts ON ts.id = r.time_slot_id
ORDER BY r.id, g.birth_year;

UPDATE vis_time_slot ts SET booked = (
    SELECT count(*) FROM vis_visitor v JOIN vis_registration r ON r.id = v.registration_id
    WHERE r.time_slot_id = ts.id AND r.status = 'APPROVED');
