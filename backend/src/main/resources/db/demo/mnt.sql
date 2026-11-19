-- =====================================================================
-- Demo data — Maintenance (MNT): S28's urgent request (air conditioner,
-- named on the request) is an hour from its SLA deadline, S29's is a day
-- overdue and unassigned; residents of every Block reported and closed
-- requests during Term N, and a few are open now.
-- =====================================================================

INSERT INTO mnt_request (code, term_id, room_id, bed_id, building_id, room_code, reporter_id, source, title, description,
                         category, location, urgency, priority, staff_may_enter, status, assignee_id, sla_due_at,
                         reported_at, furniture_item_id)
SELECT 'MR-DEMO-S' || v.n, t.n_id, d.room_id, d.bed_id, d.building_id, d.room_code, d.student_id, 'STUDENT', v.title,
       v.description, v.category, v.location, v.urgency, CASE v.urgency WHEN 'URGENT' THEN 'HIGH' ELSE 'MEDIUM' END,
       TRUE, v.status, (SELECT id FROM demo_staff WHERE account = v.assignee), t.now + v.due, t.now - v.ago,
       CASE WHEN v.furniture THEN (SELECT i.id FROM inv_furniture_item i JOIN inv_furniture_type ft
                                     ON ft.id = i.furniture_type_id
                                   WHERE i.room_id = d.room_id AND ft.code = 'AC' ORDER BY i.asset_code LIMIT 1) END
FROM (VALUES (1, 'S28', 'Air conditioner leaks water onto the desk',
              'Water drips from the indoor unit since last night; we put a bucket under it.', 'AIR_CONDITIONING',
              'ROOM', 'URGENT', 'ASSIGNED', 'staffa02', interval '7 hours', interval '1 hour', TRUE),
             (2, 'S29', 'Bathroom light flickers and goes off',
              'The light over the mirror flickers for a few minutes and then goes off.', 'ELECTRICAL', 'BATHROOM',
              'NORMAL', 'SUBMITTED', NULL, interval '4 days', interval '-1 day', FALSE)) v
     (n, scenario, title, description, category, location, urgency, status, assignee, ago, due, furniture)
JOIN demo_res d ON d.scenario = v.scenario CROSS JOIN demo_t t;

-- History of Term N in every Block (closed), and six still open.
INSERT INTO mnt_request (code, term_id, room_id, bed_id, building_id, room_code, reporter_id, source, title, description,
                         category, location, urgency, priority, staff_may_enter, status, assignee_id, sla_due_at,
                         reported_at, resolved_at, closed_at, confirmed_fixed)
SELECT 'MR-DEMO-H' || x.n, t.n_id, x.room_id, x.bed_id, x.building_id, x.room_code, x.student_id, 'STUDENT', p.title,
       p.description, p.category, p.location, 'NORMAL', 'MEDIUM', TRUE,
       CASE WHEN x.n <= 6 THEN CASE WHEN x.n % 2 = 0 THEN 'IN_PROGRESS' ELSE 'ASSIGNED' END ELSE 'CLOSED' END,
       (SELECT id FROM demo_staff WHERE account = 'staff' || lower(x.block) || '02'),
       x.reported + interval '72 hours', x.reported,
       CASE WHEN x.n > 6 THEN x.reported + interval '1 day' END, CASE WHEN x.n > 6 THEN x.reported + interval '2 days' END,
       CASE WHEN x.n > 6 THEN TRUE END
FROM (SELECT d.*, row_number() OVER (ORDER BY d.h, d.student_id) AS n,
             CASE WHEN row_number() OVER (ORDER BY d.h, d.student_id) <= 6
                  THEN t.now - interval '1 hour' * (5 + d.h % 40)
                  ELSE least(t.n_start + interval '1 day' * (3 + d.h % 90), t.now - interval '3 days') END AS reported
      FROM demo_res d CROSS JOIN demo_t t WHERE d.scenario IS NULL AND d.h % 37 = 0) x
CROSS JOIN demo_t t
JOIN (VALUES (0, 'Desk lamp does not turn on', 'The lamp on the desk of Bed A stopped working.', 'ELECTRICAL', 'ROOM'),
             (1, 'Shower drains slowly', 'Water stays in the shower for a long time.', 'PLUMBING', 'BATHROOM'),
             (2, 'Wardrobe door hinge broken', 'The left door of the wardrobe hangs loose.', 'FURNITURE', 'ROOM'),
             (3, 'Wi-Fi drops every evening', 'The connection drops between 20:00 and 23:00.', 'INTERNET', 'ROOM'),
             (4, 'Air conditioner is noisy', 'The unit makes a loud rattling noise at night.', 'AIR_CONDITIONING', 'ROOM'),
             (5, 'Balcony door does not lock', 'The lock of the balcony door does not catch.', 'OTHER', 'BALCONY'))
     p (k, title, description, category, location) ON p.k = x.n % 6
LIMIT 40;

UPDATE mnt_request SET code = 'MR-' || lpad(id::text, greatest(6, length(id::text)), '0') WHERE code LIKE 'MR-DEMO-%';

INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, internal, at)
SELECT id, reporter_id, 'STUDENT', 'Request submitted', FALSE, reported_at FROM mnt_request;

INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, internal, at)
SELECT r.id, NULL, NULL, 'Assigned to ' || u.display_name || ' (routing rule)', FALSE, r.reported_at + interval '5 minutes'
FROM mnt_request r JOIN auth_user u ON u.id = r.assignee_id;

INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, internal, at)
SELECT r.id, r.assignee_id, 'STAFF', 'Status: In progress', FALSE, r.reported_at + interval '2 hours'
FROM mnt_request r WHERE r.status = 'IN_PROGRESS' OR r.resolved_at IS NOT NULL;

INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, internal, at)
SELECT r.id, r.assignee_id, 'STAFF', 'Status: Resolved', FALSE, r.resolved_at FROM mnt_request r WHERE r.resolved_at IS NOT NULL;

INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, message, internal, at)
SELECT r.id, r.reporter_id, 'STUDENT', 'Status: Closed', 'Fixed, thank you!', FALSE, r.closed_at
FROM mnt_request r WHERE r.closed_at IS NOT NULL;

-- ---------- pre-arrival inspection of Block A, floor 9 (S40–S45) ----------
-- Published dormitory checklists and a pre-arrival schedule of manager01 for Block A; its run is assigned to
-- staffa01: A-902 … A-905 were inspected three days ago (every item Good, meters read), A-901 (S40's Room) is still
-- to do. The meters are the record the students' inventories are compared with.
INSERT INTO mnt_checklist (family_key, name, version, status, published_at, updated_at)
SELECT v.family_key, v.name, 1, 'PUBLISHED', t.now - interval '30 days', t.now - interval '30 days'
FROM demo_t t
CROSS JOIN (VALUES ('DEMO_TURNOVER',        'Kiểm tra bàn giao & chuyển kỳ'),
                   ('CL_FIRE_SAFETY',       'Kiểm tra an toàn PCCC & điện'),
                   ('CL_PLUMBING_AC',       'Kiểm tra điện lạnh & cấp thoát nước'),
                   ('CL_HYGIENE_FURNITURE', 'Kiểm tra nội thất & vệ sinh định kỳ')) v (family_key, name)
WHERE NOT EXISTS (SELECT 1 FROM mnt_checklist c WHERE c.family_key = v.family_key);

INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
SELECT c.id, v.label, v.category, v.severity, v.n
FROM mnt_checklist c
JOIN (VALUES ('DEMO_TURNOVER', 1, 'Đèn chiếu sáng và ổ cắm điện hoạt động tốt', 'ELECTRICAL', 'MAJOR'),
             ('DEMO_TURNOVER', 2, 'Vòi nước, vòi sen và bồn cầu hoạt động tốt, không rò rỉ', 'PLUMBING', 'MAJOR'),
             ('DEMO_TURNOVER', 3, 'Khóa cửa chính và cửa sổ đóng mở chắc chắn', 'OTHER', 'MINOR'),
             ('CL_FIRE_SAFETY', 1, 'Đầu báo khói và thiết bị báo cháy hoạt động tốt', 'ELECTRICAL', 'CRITICAL'),
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

INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, repeat, assignee_id, due_within_days,
                                     create_requests, notify_residents, next_run_at, status, created_at, kind)
SELECT b.id, 'Kiểm tra phòng trước nhận phòng · Tòa A', 'DEMO_TURNOVER', 'INCOMING', 'ONCE',
       (SELECT id FROM demo_staff WHERE account = 'staffa02'), 4, TRUE, FALSE, NULL, 'ACTIVE', t.now - interval '3 days',
       'PRE_ARRIVAL'
FROM inv_building b CROSS JOIN demo_t t WHERE b.code = 'A' AND t.stage <> 'D';

INSERT INTO mnt_inspection_run (schedule_id, building_id, checklist_id, run_date, due_at, inspector_id, status,
                                created_at)
SELECT s.id, s.building_id, c.id, t.today - 3, ((t.today + 2) + TIME '00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       s.assignee_id, 'IN_PROGRESS', t.now - interval '3 days'
FROM mnt_inspection_schedule s CROSS JOIN demo_t t
JOIN mnt_checklist c ON c.family_key = 'DEMO_TURNOVER' AND c.status = 'PUBLISHED'
WHERE s.name = 'Kiểm tra phòng trước nhận phòng · Tòa A';

INSERT INTO mnt_inspection_room (run_id, room_id, status, inspected_at, electricity, water, inspected_by)
SELECT ru.id, r.room_id, CASE WHEN r.code = 'A-901' THEN 'PENDING' ELSE 'INSPECTED' END,
       CASE WHEN r.code <> 'A-901' THEN t.now - interval '3 days' END,
       CASE WHEN r.code <> 'A-901' THEN h.meter_e END, CASE WHEN r.code <> 'A-901' THEN h.meter_w END,
       CASE WHEN r.code <> 'A-901' THEN ru.inspector_id END
FROM mnt_inspection_run ru JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id
CROSS JOIN demo_t t
JOIN demo_rooms r ON r.code IN ('A-901', 'A-902', 'A-903', 'A-904', 'A-905')
JOIN (SELECT DISTINCT room_id, meter_e, meter_w FROM demo_handover) h ON h.room_id = r.room_id
WHERE s.name = 'Kiểm tra phòng trước nhận phòng · Tòa A';

INSERT INTO mnt_inspection_result (inspection_room_id, item_id, result)
SELECT ir.id, ci.id, 'PASS'
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_checklist_item ci ON ci.checklist_id = ru.checklist_id
WHERE ir.status = 'INSPECTED';

INSERT INTO mnt_inspection_room_check (inspection_room_id, check_key, result, condition)
SELECT ir.id, 'PEOPLE', 'PASS', NULL FROM mnt_inspection_room ir WHERE ir.status = 'INSPECTED'
UNION ALL
SELECT ir.id, 'FURNITURE:' || i.id, 'PASS', 'GOOD'
FROM mnt_inspection_room ir JOIN inv_furniture_item i ON i.room_id = ir.room_id AND i.status <> 'DISPOSED'
WHERE ir.status = 'INSPECTED';

-- ---------- check-in week (D): the pre-arrival inspection of every Block ----------
-- Between Term N's check-out deadline and Term N+1's check-in start, each Block's Maintenance Technician (staff<block>02)
-- inspected the Rooms new residents receive (Managers scheduled it once, scope "Rooms new residents will receive") and sent
-- the results the day before check-in opened. The Room of D9 was not reachable: its new residents have no record.
INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, repeat, assignee_id, due_within_days,
                                     create_requests, notify_residents, next_run_at, status, created_at, kind)
SELECT b.id, 'Kiểm tra phòng trước nhận phòng · Tòa ' || b.code, 'DEMO_TURNOVER', 'INCOMING', 'ONCE',
       CASE WHEN b.code = 'A' THEN NULL
            ELSE (SELECT id FROM demo_staff WHERE account = 'staff' || lower(b.code) || '02') END,
       2, TRUE, FALSE, NULL, 'ACTIVE',
       ((t.n_end - 5) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'PRE_ARRIVAL'
FROM inv_building b CROSS JOIN demo_t t
WHERE t.stage = 'D' AND b.id IN (SELECT DISTINCT building_id FROM demo_checkin);

-- Recurring monthly electrical & fire safety inspection schedule for every Block (assigned to the second Maintenance Technician, staff<block>04),
-- so the "Next run" (Đợt tới) column always shows the upcoming scheduled date.
INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, repeat, assignee_id, due_within_days,
                                     create_requests, notify_residents, next_run_at, status, created_at, kind)
SELECT b.id, 'Kiểm tra định kỳ điện nước & PCCC · Tòa ' || b.code, 'CL_FIRE_SAFETY', 'OCCUPIED', 'MONTHLY',
       (SELECT id FROM demo_staff WHERE account = 'staff' || lower(b.code) || '04'), 5, TRUE, TRUE,
       ((t.today + 7) + TIME '06:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'ACTIVE', t.now - interval '2 days', 'PERIODIC'
FROM inv_building b CROSS JOIN demo_t t
WHERE b.code BETWEEN 'A' AND 'H';

INSERT INTO mnt_inspection_run (schedule_id, building_id, checklist_id, run_date, due_at, inspector_id, status,
                                submitted_at, created_at)
SELECT s.id, s.building_id, c.id, t.n_end + 1, ((t.today + 2) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       s.assignee_id, 'IN_PROGRESS', NULL,
       ((t.n_end + 1) + TIME '06:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM mnt_inspection_schedule s CROSS JOIN demo_t t
JOIN mnt_checklist c ON c.family_key = 'DEMO_TURNOVER' AND c.status = 'PUBLISHED'
WHERE t.stage = 'D' AND s.name LIKE 'Kiểm tra phòng trước nhận phòng · Tòa %';

INSERT INTO mnt_inspection_room (run_id, room_id, status, inspected_at, electricity, water, inspected_by)
SELECT ru.id, r.room_id,
       CASE WHEN r.room_id IN (
                SELECT room_id FROM demo_checkin WHERE named = 1 OR scenario = 'S12'
                UNION
                (SELECT room_id FROM demo_checkin
                 WHERE block = 'A' AND state = 'READY' AND named IS DISTINCT FROM 1 AND scenario IS DISTINCT FROM 'S12'
                 ORDER BY room_code LIMIT 1)
            ) THEN 'PENDING'
            ELSE 'INSPECTED' END,
       CASE WHEN r.room_id NOT IN (
                SELECT room_id FROM demo_checkin WHERE named = 1 OR scenario = 'S12'
                UNION
                (SELECT room_id FROM demo_checkin
                 WHERE block = 'A' AND state = 'READY' AND named IS DISTINCT FROM 1 AND scenario IS DISTINCT FROM 'S12'
                 ORDER BY room_code LIMIT 1)
            )
            THEN ((t.n_end + 1 + abs(hashtext('day' || r.room_id)) % 2) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                 + interval '4 minutes' * (abs(hashtext('min' || r.room_id)) % 120) END,
       CASE WHEN r.room_id NOT IN (
                SELECT room_id FROM demo_checkin WHERE named = 1 OR scenario = 'S12'
                UNION
                (SELECT room_id FROM demo_checkin
                 WHERE block = 'A' AND state = 'READY' AND named IS DISTINCT FROM 1 AND scenario IS DISTINCT FROM 'S12'
                 ORDER BY room_code LIMIT 1)
            ) THEN m.e END,
       CASE WHEN r.room_id NOT IN (
                SELECT room_id FROM demo_checkin WHERE named = 1 OR scenario = 'S12'
                UNION
                (SELECT room_id FROM demo_checkin
                 WHERE block = 'A' AND state = 'READY' AND named IS DISTINCT FROM 1 AND scenario IS DISTINCT FROM 'S12'
                 ORDER BY room_code LIMIT 1)
            ) THEN m.w END,
       CASE WHEN r.room_id NOT IN (
                SELECT room_id FROM demo_checkin WHERE named = 1 OR scenario = 'S12'
                UNION
                (SELECT room_id FROM demo_checkin
                 WHERE block = 'A' AND state = 'READY' AND named IS DISTINCT FROM 1 AND scenario IS DISTINCT FROM 'S12'
                 ORDER BY room_code LIMIT 1)
            )
            THEN coalesce(ru.inspector_id,
                 (SELECT id FROM demo_staff WHERE account = 'staff' || lower((SELECT code FROM inv_building WHERE id = ru.building_id)) || '02')) END
FROM (SELECT DISTINCT room_id, building_id FROM demo_checkin) r CROSS JOIN demo_t t
JOIN mnt_inspection_run ru ON ru.building_id = r.building_id AND ru.run_date = t.n_end + 1
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id AND s.name LIKE 'Kiểm tra phòng trước nhận phòng · Tòa %'
JOIN demo_room_meter m ON m.room_id = r.room_id
WHERE t.stage = 'D';

INSERT INTO mnt_inspection_result (inspection_room_id, item_id, result)
SELECT ir.id, ci.id, 'PASS'
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id AND s.name LIKE 'Kiểm tra phòng trước nhận phòng · Tòa %'
JOIN mnt_checklist_item ci ON ci.checklist_id = ru.checklist_id
WHERE ir.status = 'INSPECTED';

INSERT INTO mnt_inspection_room_check (inspection_room_id, check_key, result, condition, note)
SELECT ir.id, 'PEOPLE', 'PASS', NULL, NULL
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id AND s.name LIKE 'Kiểm tra phòng trước nhận phòng · Tòa %'
WHERE ir.status = 'INSPECTED'
UNION ALL
SELECT ir.id, 'FURNITURE:' || i.item_id,
       CASE WHEN i.condition IN ('GOOD', 'WORN') THEN 'PASS' ELSE 'FAIL' END, i.condition,
       CASE i.condition WHEN 'DAMAGED' THEN 'Đã báo sửa trước khi nhận phòng.' WHEN 'WORN' THEN 'Hao mòn bình thường.' END
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id AND s.name LIKE 'Kiểm tra phòng trước nhận phòng · Tòa %'
JOIN demo_checkin_item i ON i.room_id = ir.room_id
WHERE ir.status = 'INSPECTED';

-- ---------- open runs of the Block's first Staff (every stage) ----------
-- Two weekly checks started by the Managers and assigned to staff<block>01, still in progress, so the Staff page lists
-- several runs to switch between: security and door codes (started today) and bathrooms (started yesterday). Six
-- occupied Rooms each, the first two already inspected (every item passed, furniture Good).
INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, repeat, assignee_id, due_within_days,
                                     create_requests, notify_residents, next_run_at, status, created_at, kind)
SELECT b.id, v.name || ' · Tòa ' || b.code, v.family, 'OCCUPIED', 'WEEKLY',
       (SELECT id FROM demo_staff WHERE account = 'staff' || lower(b.code) || '01'), v.due, TRUE, FALSE,
       ((t.today + 7 - v.started) + TIME '07:00') AT TIME ZONE 'Asia/Ho_Chi_Minh', 'ACTIVE',
       t.now - interval '10 days', 'PERIODIC'
FROM inv_building b CROSS JOIN demo_t t
CROSS JOIN (VALUES ('Kiểm tra an ninh & khóa mã cửa', 'CL_SECURITY', 3, 0),
                   ('Kiểm tra nhà vệ sinh & nhà tắm', 'CL_BATHROOM', 4, 1)) v (name, family, due, started)
WHERE b.code BETWEEN 'A' AND 'H'
  AND EXISTS (SELECT 1 FROM demo_staff WHERE account = 'staff' || lower(b.code) || '01');

INSERT INTO mnt_inspection_run (schedule_id, building_id, checklist_id, run_date, due_at, inspector_id, status,
                                created_at)
SELECT s.id, s.building_id, c.id, t.today - v.started,
       ((t.today - v.started + s.due_within_days) + TIME '23:59') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       s.assignee_id, 'IN_PROGRESS', t.now - interval '1 hour' * (1 + 24 * v.started)
FROM mnt_inspection_schedule s CROSS JOIN demo_t t
JOIN (VALUES ('Kiểm tra an ninh & khóa mã cửa', 'CL_SECURITY', 0),
             ('Kiểm tra nhà vệ sinh & nhà tắm', 'CL_BATHROOM', 1)) v (name, family, started)
  ON s.name LIKE v.name || ' · Tòa %'
JOIN mnt_checklist c ON c.family_key = v.family AND c.status = 'PUBLISHED';

INSERT INTO mnt_inspection_room (run_id, room_id, status, inspected_at, inspected_by)
SELECT x.run_id, x.room_id, CASE WHEN x.n <= 2 THEN 'INSPECTED' ELSE 'PENDING' END,
       CASE WHEN x.n <= 2 THEN t.now - interval '30 minutes' * x.n END,
       CASE WHEN x.n <= 2 THEN x.inspector_id END
FROM demo_t t CROSS JOIN LATERAL (
    SELECT ru.id AS run_id, ru.inspector_id, r.id AS room_id,
           row_number() OVER (PARTITION BY ru.id ORDER BY r.code) AS n
    FROM mnt_inspection_run ru JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id
    JOIN inv_room r ON r.building_id = ru.building_id AND r.status = 'IN_SERVICE'
    WHERE s.name LIKE 'Kiểm tra an ninh & khóa mã cửa · Tòa %' OR s.name LIKE 'Kiểm tra nhà vệ sinh & nhà tắm · Tòa %') x
WHERE x.n <= 6;

INSERT INTO mnt_inspection_result (inspection_room_id, item_id, result)
SELECT ir.id, ci.id, 'PASS'
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id
JOIN mnt_checklist_item ci ON ci.checklist_id = ru.checklist_id
WHERE ir.status = 'INSPECTED'
  AND (s.name LIKE 'Kiểm tra an ninh & khóa mã cửa · Tòa %' OR s.name LIKE 'Kiểm tra nhà vệ sinh & nhà tắm · Tòa %');

INSERT INTO mnt_inspection_room_check (inspection_room_id, check_key, result, condition)
SELECT ir.id, 'PEOPLE', 'PASS', NULL
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id
WHERE ir.status = 'INSPECTED'
  AND (s.name LIKE 'Kiểm tra an ninh & khóa mã cửa · Tòa %' OR s.name LIKE 'Kiểm tra nhà vệ sinh & nhà tắm · Tòa %')
UNION ALL
SELECT ir.id, 'FURNITURE:' || i.id, 'PASS', 'GOOD'
FROM mnt_inspection_room ir JOIN mnt_inspection_run ru ON ru.id = ir.run_id
JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id
JOIN inv_furniture_item i ON i.room_id = ir.room_id AND i.status <> 'DISPOSED'
WHERE ir.status = 'INSPECTED'
  AND (s.name LIKE 'Kiểm tra an ninh & khóa mã cửa · Tòa %' OR s.name LIKE 'Kiểm tra nhà vệ sinh & nhà tắm · Tòa %');
