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
-- A published turnover checklist and a pre-arrival schedule of manager01 for Block A; its run is assigned to
-- staffa01: A-902 … A-905 were inspected three days ago (every item Good, meters read), A-901 (S40's Room) is still
-- to do. The meters are the record the students' inventories are compared with.
INSERT INTO mnt_checklist (family_key, name, version, status, published_at, updated_at)
SELECT 'DEMO_TURNOVER', 'Room turnover check', 1, 'PUBLISHED', t.now - interval '30 days', t.now - interval '30 days'
FROM demo_t t;

INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
SELECT c.id, v.label, v.category, v.severity, v.n
FROM mnt_checklist c
CROSS JOIN (VALUES (1, 'Lights and sockets work', 'ELECTRICAL', 'MAJOR'),
                   (2, 'Taps, shower and toilet work without leaks', 'PLUMBING', 'MAJOR'),
                   (3, 'Door lock and windows close properly', 'OTHER', 'MINOR')) v (n, label, category, severity)
WHERE c.family_key = 'DEMO_TURNOVER';

INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, repeat, assignee_id, due_within_days,
                                     create_requests, notify_residents, next_run_at, status, created_at, kind)
SELECT b.id, 'Pre-arrival check (demo)', 'DEMO_TURNOVER', 'INCOMING', 'ONCE',
       (SELECT id FROM demo_staff WHERE account = 'staffa01'), 4, TRUE, FALSE, NULL, 'ACTIVE', t.now - interval '3 days',
       'PRE_ARRIVAL'
FROM inv_building b CROSS JOIN demo_t t WHERE b.code = 'A';

INSERT INTO mnt_inspection_run (schedule_id, building_id, checklist_id, run_date, due_at, inspector_id, status,
                                created_at)
SELECT s.id, s.building_id, c.id, t.today - 3, ((t.today + 2) + TIME '00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       s.assignee_id, 'IN_PROGRESS', t.now - interval '3 days'
FROM mnt_inspection_schedule s CROSS JOIN demo_t t
JOIN mnt_checklist c ON c.family_key = 'DEMO_TURNOVER' AND c.status = 'PUBLISHED'
WHERE s.name = 'Pre-arrival check (demo)';

INSERT INTO mnt_inspection_room (run_id, room_id, status, inspected_at, electricity, water, inspected_by)
SELECT ru.id, r.room_id, CASE WHEN r.code = 'A-901' THEN 'PENDING' ELSE 'INSPECTED' END,
       CASE WHEN r.code <> 'A-901' THEN t.now - interval '3 days' END,
       CASE WHEN r.code <> 'A-901' THEN h.meter_e END, CASE WHEN r.code <> 'A-901' THEN h.meter_w END,
       CASE WHEN r.code <> 'A-901' THEN ru.inspector_id END
FROM mnt_inspection_run ru JOIN mnt_inspection_schedule s ON s.id = ru.schedule_id
CROSS JOIN demo_t t
JOIN demo_rooms r ON r.code IN ('A-901', 'A-902', 'A-903', 'A-904', 'A-905')
JOIN (SELECT DISTINCT room_id, meter_e, meter_w FROM demo_handover) h ON h.room_id = r.room_id
WHERE s.name = 'Pre-arrival check (demo)';

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
