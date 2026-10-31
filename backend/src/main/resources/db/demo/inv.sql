-- =====================================================================
-- Demo data — Inventory (INV): Room A-509 is set to Premium for N+1 but
-- has no fridge (a Room not matching its Room Class), and door codes wait
-- to be changed where someone left: A-803 always, in the turnover week also
-- every Room a leaver checked out of. The door codes themselves are set by
-- InventoryDemoData (they are stored encrypted).
-- =====================================================================

INSERT INTO inv_room_class_term (room_id, term_id, room_class_id, set_by, set_at)
SELECT r.id, t.x_id, (SELECT id FROM cfg_room_class WHERE name = 'Premium'),
       (SELECT id FROM demo_staff WHERE account = 'manager01'), t.x_m1 - interval '5 days'
FROM inv_room r CROSS JOIN demo_t t WHERE r.code = 'A-509';

INSERT INTO inv_door_code_task (room_id, reason, created_at)
SELECT r.id, 'CHECK_OUT', t.now - interval '20 hours' FROM inv_room r CROSS JOIN demo_t t WHERE r.code = 'A-803';

INSERT INTO inv_door_code_task (room_id, reason, created_at)
SELECT DISTINCT ON (d.room_id) d.room_id, 'CHECK_OUT', ((t.today - (1 + d.h % 3)) + TIME '08:30' + interval '13 minutes' * (d.h % 37)) AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM demo_res d CROSS JOIN demo_t t
WHERE d.leave = 'CHECKED_OUT' AND d.room_code <> 'A-803'
ORDER BY d.room_id, d.h;
