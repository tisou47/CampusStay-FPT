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
              'ROOM', 'URGENT', 'ASSIGNED', 'staff.a2', interval '7 hours', interval '1 hour', TRUE),
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
       (SELECT id FROM demo_staff WHERE account = 'staff.' || lower(x.block) || '2'),
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
