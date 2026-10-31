-- =====================================================================
-- Demo data — Requests (REQ): the next-Term requests of the scenarios,
-- open in stage A (decided by M4) and decided from stage B: room changes
-- in the same Block (S12, approved: moves to A-603) and to another Room
-- Class (S13, rejected), a swap pair (S14), a Room Class change with 2 of
-- 4 consents (S15), an extension (S10) and an end of stay (S11).
-- =====================================================================

INSERT INTO req_room_change (code, term_id, student_id, allocation_id, building_id, kind, target_room_type_id,
                             target_room_class_id, reason_code, details, status, sla_due_at, target_bed_id, decided_by,
                             decided_at, decision_reason, decision_note, submitted_at)
SELECT 'RC-DEMO-' || v.scenario, t.x_id, d.student_id, x.id, d.building_id, v.kind, d.room_type_id,
       CASE WHEN v.kind = 'CLASS' THEN (SELECT id FROM cfg_room_class WHERE name = 'Basic') ELSE d.room_class_id END,
       v.reason, v.details,
       CASE WHEN t.stage = 'A' THEN 'SUBMITTED' WHEN v.scenario = 'S12' THEN 'APPROVED' ELSE 'REJECTED' END, t.x_m4,
       CASE WHEN t.stage <> 'A' AND v.scenario = 'S12'
            THEN (SELECT b.id FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE r.code = 'A-603' AND b.label = 'A') END,
       CASE WHEN t.stage <> 'A' THEN (SELECT id FROM demo_staff WHERE account = 'staffa01') END,
       CASE WHEN t.stage <> 'A' THEN t.x_m3 + interval '1 day' END,
       CASE WHEN t.stage <> 'A' AND v.scenario = 'S13' THEN 'NO_MATCHING_BED' END,
       CASE WHEN t.stage <> 'A' AND v.scenario = 'S12' THEN 'Moves to A-603 Bed A next Term.'
            WHEN t.stage <> 'A' THEN 'No Basic Bed is free in Block B next Term; ask again in Round 2.' END,
       t.x_m2 + interval '1 day' + interval '3 hours'
FROM (VALUES ('S12', 'SAME', 'ROOMMATE_CONFLICT', 'We study at different hours; I would like a quieter Room on this floor.'),
             ('S13', 'CLASS', 'PRICE', 'I would like a Basic Room in Block B next Term, closer to the canteen.')) v
     (scenario, kind, reason, details)
JOIN demo_res d ON d.scenario = v.scenario CROSS JOIN demo_t t
JOIN asg_allocation x ON x.term_id = t.x_id AND x.student_id = d.student_id;

UPDATE req_room_change r SET code = 'RC-' || t.x_code || '-' || lpad(r.id::text, greatest(6, length(r.id::text)), '0')
FROM demo_t t WHERE r.code LIKE 'RC-DEMO-%';

INSERT INTO req_swap (term_id, kind, a_allocation_id, b_allocation_id, status, cross_block, reason, expires_at, agreed_at,
                      created_at, a_building_id, b_building_id)
SELECT t.x_id, 'DIRECT', xa.id, xb.id, CASE WHEN t.stage = 'A' THEN 'PENDING' ELSE 'CANCELLED' END, FALSE,
       'We are friends from the same class and would like to share a floor.', t.x_m4, t.x_m2 + interval '2 days 2 hours',
       t.x_m2 + interval '2 days', da.building_id, db.building_id
FROM demo_res da JOIN demo_res db ON db.code = 'SE210013' CROSS JOIN demo_t t
JOIN asg_allocation xa ON xa.term_id = t.x_id AND xa.student_id = da.student_id
JOIN asg_allocation xb ON xb.term_id = t.x_id AND xb.student_id = db.student_id
WHERE da.code = 'SE210012';

INSERT INTO req_room_class_change (code, term_id, room_id, building_id, room_code, from_class_id, to_class_id,
                                   requested_by, requester_role, reason, status, sla_due_at, decided_by, decided_at,
                                   decision_note, submitted_at)
SELECT 'CC-DEMO-S15', t.x_id, d.room_id, d.building_id, d.room_code, d.room_class_id,
       (SELECT id FROM cfg_room_class WHERE name = 'Premium'), d.student_id, 'STUDENT',
       'All four of us stay next Term and would like a fridge and a balcony.',
       CASE WHEN t.stage = 'A' THEN 'AWAITING_CONSENT' ELSE 'REJECTED' END, t.x_m4,
       CASE WHEN t.stage <> 'A' THEN (SELECT id FROM demo_staff WHERE account = 'staffa01') END,
       CASE WHEN t.stage <> 'A' THEN t.x_m3 + interval '1 day' END,
       CASE WHEN t.stage <> 'A' THEN 'Not every continuing resident agreed by the request deadline.' END,
       t.x_m2 + interval '1 day'
FROM demo_res d CROSS JOIN demo_t t WHERE d.code = 'SE210014';

UPDATE req_room_class_change r SET code = 'CC-' || t.x_code || '-' || lpad(r.id::text, greatest(6, length(r.id::text)), '0')
FROM demo_t t WHERE r.code LIKE 'CC-DEMO-%';

INSERT INTO req_room_class_consent (change_id, student_id, allocation_id, status, asked_at, answered_at)
SELECT c.id, d.student_id, x.id, v.status, c.submitted_at, CASE WHEN v.status <> 'PENDING' THEN c.submitted_at + v.wait END
FROM req_room_class_change c CROSS JOIN demo_t t
JOIN (VALUES ('SE210014', 'AGREED', 'AGREED', interval '0 minutes'),
             ('SE210019', 'AGREED', 'AGREED', interval '5 hours'),
             ('SE210024', 'PENDING', 'DECLINED', interval '2 days'),
             ('SE210026', 'PENDING', 'PENDING', interval '0 minutes')) v0 (code, in_a, later, wait) ON TRUE
JOIN LATERAL (SELECT CASE WHEN t.stage = 'A' THEN v0.in_a ELSE v0.later END AS status, v0.wait) v ON TRUE
JOIN demo_res d ON d.code = v0.code
JOIN asg_allocation x ON x.term_id = t.x_id AND x.student_id = d.student_id;

INSERT INTO req_stay_request (code, term_id, student_id, allocation_id, building_id, kind, extra_terms, reason, status,
                              sla_due_at, decided_by, decided_at, decision_note, submitted_at)
SELECT 'ST-DEMO-' || v.scenario, t.x_id, d.student_id, x.id, d.building_id, v.kind, v.extra, v.reason,
       CASE WHEN t.stage = 'A' THEN 'SUBMITTED' ELSE 'APPROVED' END, t.x_m4,
       CASE WHEN t.stage <> 'A' THEN (SELECT id FROM demo_staff WHERE account = 'staff' || lower(d.block) || '01') END,
       CASE WHEN t.stage <> 'A' THEN t.x_m3 - interval '2 days' END, NULL, t.x_m2 + interval '6 hours'
FROM (VALUES ('S10', 'EXTENSION', 2, 'I stay two more Terms for my internship and graduation project.'),
             ('S11', 'END_OF_STAY', NULL, 'I move to my family''s apartment next Term.')) v (scenario, kind, extra, reason)
JOIN demo_res d ON d.scenario = v.scenario CROSS JOIN demo_t t
JOIN asg_allocation x ON x.term_id = t.x_id AND x.student_id = d.student_id;

UPDATE req_stay_request r SET code = 'ST-' || t.x_code || '-' || lpad(r.id::text, greatest(6, length(r.id::text)), '0')
FROM demo_t t WHERE r.code LIKE 'ST-DEMO-%';
