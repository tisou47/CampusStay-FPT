-- =====================================================================
-- Demo data — Assignment (ASG): the Round-1 runs, Stays (stay length), the
-- residents of Term N with their door code released, the requests window
-- of N+1 with its next-Term Allocations, the new students' Allocations
-- (B, C), late check-ins, a termination and, in the turnover week, the
-- leavers who already checked out.
-- =====================================================================

INSERT INTO asg_run (term_id, kind, status, stage, matching_snapshot_id, started_by, started_at, finished_at, input_count,
                     proposed_count, conflict_count, waitlisted_count, average_fit)
SELECT t.n_id, 'REAL', 'COMMITTED', 5, (SELECT max(id) FROM cfg_matching_snapshot),
       (SELECT id FROM demo_staff WHERE account = 'manager01'), t.n_results - interval '4 days',
       t.n_results - interval '1 day', (SELECT count(*) FROM demo_res), (SELECT count(*) FROM demo_res), 0, 0, 0.8420
FROM demo_t t;

INSERT INTO asg_run (term_id, kind, status, stage, matching_snapshot_id, started_by, started_at, finished_at, input_count,
                     proposed_count, conflict_count, waitlisted_count, average_fit)
SELECT t.x_id, 'REAL', 'COMMITTED', 5, (SELECT max(id) FROM cfg_matching_snapshot),
       (SELECT id FROM demo_staff WHERE account = 'manager01'), t.x_results - interval '3 days',
       t.x_results - interval '1 day', (SELECT count(*) FROM demo_app WHERE status <> 'AWAITING_DEPOSIT'),
       (SELECT count(*) FROM demo_app WHERE status IN ('ALLOCATED', 'FORFEITED')), 0,
       (SELECT count(*) FROM demo_app WHERE status = 'WAITLISTED'), 0.8130
FROM demo_t t WHERE t.stage IN ('B', 'C', 'D');

-- Stays: the Terms committed (stay length, grown by an approved extension) and used.
INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, status, end_kind, started_at,
                      ended_at)
SELECT d.student_id, t.n_id, t.n_id,
       d.committed + CASE WHEN d.fate = 'LAST' AND d.x_state IN ('CONTINUING', 'FEE_NOT_PAID')
                          THEN CASE WHEN d.scenario = 'S10' THEN 2 ELSE 1 END ELSE 0 END,
       1, CASE WHEN d.leave = 'CHECKED_OUT' THEN 'ENDED' ELSE 'ACTIVE' END,
       CASE WHEN d.leave = 'CHECKED_OUT' THEN 'COMPLETED' END, (t.n_start + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       CASE WHEN d.leave = 'CHECKED_OUT' THEN ((t.out_base - (1 + d.h % 3)) + TIME '08:30' + interval '13 minutes' * (d.h % 37)) AT TIME ZONE 'Asia/Ho_Chi_Minh' END
FROM demo_res d CROSS JOIN demo_t t;

INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, started_at)
SELECT a.student_id, t.x_id, t.x_id, ap.stay_terms, 1, t.x_results
FROM demo_app a CROSS JOIN demo_t t JOIN app_application ap ON ap.term_id = t.x_id AND ap.student_id = a.student_id
WHERE a.status = 'ALLOCATED';

-- Term N: every resident holds the door code (released from the check-in start); about half came to the desk.
INSERT INTO asg_allocation (term_id, application_id, student_id, bed_id, status, source, run_id, allocated_at,
                            allocated_by, checked_in_at, checked_in_by, ended_at, end_reason, resident_at,
                            code_released_at, stay_id)
SELECT t.n_id, ap.id, d.student_id, d.bed_id, CASE WHEN d.leave = 'CHECKED_OUT' THEN 'ENDED' ELSE 'ACTIVE' END,
       'ASSIGNMENT', (SELECT id FROM asg_run WHERE term_id = t.n_id), t.n_results,
       (SELECT id FROM demo_staff WHERE account = 'manager01'),
       CASE WHEN d.h % 2 = 0 THEN ((t.n_start + d.h % 5) + TIME '14:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       CASE WHEN d.h % 2 = 0 THEN (SELECT id FROM demo_staff WHERE account = 'staff' || lower(d.block) || '01') END,
       CASE WHEN d.leave = 'CHECKED_OUT' THEN ((t.out_base - (1 + d.h % 3)) + TIME '08:30' + interval '13 minutes' * (d.h % 37)) AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       CASE WHEN d.leave = 'CHECKED_OUT' THEN 'CHECK_OUT' END,
       ((t.n_start + d.h % 5) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       ((t.n_start + d.h % 5) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       s.id
FROM demo_res d CROSS JOIN demo_t t
JOIN app_application ap ON ap.term_id = t.n_id AND ap.student_id = d.student_id
JOIN asg_stay s ON s.student_id = d.student_id AND s.first_term_id = t.n_id;

-- The requests window of N+1 (opened at M2; closed at M3, Managers alerted, fees issued at M6 and closed at M7).
INSERT INTO asg_renewal (term_id, previous_term_id, opened_at, continuing, awaiting, closed_at, escalated_at,
                         fees_issued_at, fees_issued_by, fees_closed_at)
SELECT t.x_id, t.n_id, t.x_m2,
       (SELECT count(*) FROM demo_res WHERE fate = 'CONTINUING'), (SELECT count(*) FROM demo_res WHERE fate = 'LAST'),
       CASE WHEN t.stage IN ('B', 'C', 'D') THEN t.x_m3 + interval '5 minutes' END,
       CASE WHEN t.stage IN ('B', 'C', 'D') THEN t.x_m4 - interval '48 hours' END,
       CASE WHEN t.stage IN ('B', 'C', 'D') THEN t.x_m6 END,
       CASE WHEN t.stage IN ('B', 'C', 'D') THEN (SELECT id FROM demo_staff WHERE account = 'manager01') END,
       CASE WHEN t.stage IN ('C', 'D') THEN t.x_m7 + interval '5 minutes' END
FROM demo_t t;

-- Next-Term Allocations: the same Bed (S12 moved by its approved room change), Continuing or Awaiting extension;
-- released ones are cancelled with the reason.
INSERT INTO asg_allocation (term_id, student_id, bed_id, status, source, previous_allocation_id, allocated_at,
                            ended_at, end_reason, stay_id, renewal, fee_paid_at)
SELECT t.x_id, d.student_id, d.x_bed_id,
       CASE WHEN d.x_state IN ('CONTINUING', 'AWAITING') THEN 'ACTIVE' ELSE 'CANCELLED' END,
       CASE WHEN d.x_bed_id <> d.bed_id THEN 'ROOM_CHANGE' ELSE 'RENEWAL' END, n.id, t.x_m2,
       CASE d.x_state WHEN 'NOT_EXTENDED' THEN t.x_m3 + interval '5 minutes'
                      WHEN 'END_OF_STAY' THEN t.x_m3 - interval '2 days'
                      WHEN 'FEE_NOT_PAID' THEN t.x_m7 + interval '5 minutes' END,
       CASE WHEN d.x_state IN ('NOT_EXTENDED', 'END_OF_STAY', 'FEE_NOT_PAID') THEN d.x_state END,
       n.stay_id,
       CASE WHEN d.x_state IN ('AWAITING', 'NOT_EXTENDED') THEN 'AWAITING_EXTENSION' ELSE 'CONTINUING' END,
       CASE WHEN d.fee = 'PAID' THEN least(t.x_m6 + interval '1 hour' * (2 + d.h), t.now - interval '1 hour') END
FROM demo_res d CROSS JOIN demo_t t
JOIN asg_allocation n ON n.term_id = t.n_id AND n.student_id = d.student_id
WHERE d.x_state IS NOT NULL;

-- New students (B, C): Round-1 Beds; Balances not paid in time forfeited the Bed (C).
INSERT INTO asg_allocation (term_id, application_id, student_id, bed_id, status, source, run_id, allocated_at,
                            allocated_by, ended_at, end_reason, stay_id)
SELECT t.x_id, ap.id, a.student_id, a.x_bed_id, CASE WHEN a.status = 'FORFEITED' THEN 'CANCELLED' ELSE 'ACTIVE' END,
       'ASSIGNMENT', (SELECT id FROM asg_run WHERE term_id = t.x_id), t.x_results,
       (SELECT id FROM demo_staff WHERE account = 'manager01'),
       CASE WHEN a.status = 'FORFEITED' THEN t.x_balance_due + interval '10 minutes' END,
       CASE WHEN a.status = 'FORFEITED' THEN 'FORFEIT' END,
       (SELECT id FROM asg_stay s WHERE s.student_id = a.student_id AND s.status = 'ACTIVE')
FROM demo_app a CROSS JOIN demo_t t JOIN app_application ap ON ap.term_id = t.x_id AND ap.student_id = a.student_id
WHERE a.x_bed_id IS NOT NULL;

-- Late check-ins asked online (B: S16 waiting for a Manager; S17 approved, its Balance deadline moved up to the arrival day).
INSERT INTO asg_late_check_in (allocation_id, reason, requested_for, window_closed_at, suggested_deadline, status,
                               deadline, decided_by, decided_at, created_at, source)
SELECT al.id,
       CASE a.scenario WHEN 'S16' THEN 'My flight from Da Nang is booked for after the check-in window (family wedding).'
                       ELSE 'Internship in Ha Noi until the end of the month; the company letter is attached.' END,
       t.x_ci_end + 5, ((t.x_ci_end) + TIME '23:59') AT TIME ZONE 'Asia/Ho_Chi_Minh', t.x_ci_end + 5,
       a.late, CASE WHEN a.late = 'APPROVED' THEN t.x_ci_end + 6 END,
       CASE WHEN a.late = 'APPROVED' THEN (SELECT id FROM demo_staff WHERE account = 'manager01') END,
       CASE WHEN a.late = 'APPROVED' THEN least(t.x_results + interval '2 days', t.now - interval '1 day') END,
       least(t.x_results + interval '1 day', t.now - interval '2 days'), 'ONLINE'
FROM demo_app a CROSS JOIN demo_t t JOIN asg_allocation al ON al.term_id = t.x_id AND al.student_id = a.student_id
WHERE a.late IS NOT NULL;

-- A termination for Utility debt (S21): notice sent, move out within days.
INSERT INTO asg_termination (allocation_id, term_id, student_id, reason, note, debt, status, started_at, started_by,
                             move_out_by)
SELECT al.id, t.n_id, d.student_id, 'UTILITY_DEBT', 'Two Utility Invoices overdue after the final warning.',
       (SELECT sum(u.amount) FROM demo_util_share u WHERE u.student_id = d.student_id AND u.overdue),
       'NOTICE_SENT', t.now - interval '2 days', (SELECT id FROM demo_staff WHERE account = 'manager01'),
       least(t.today + 5, t.n_end)
FROM demo_res d CROSS JOIN demo_t t JOIN asg_allocation al ON al.term_id = t.n_id AND al.student_id = d.student_id
WHERE d.scenario = 'S21';

-- Turnover week (C): the leavers who already checked out at the desk.
INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water, condition_good, key_returned, damage_charge,
                           refund_status, requested_at, completed_at, completed_by, updated_at)
SELECT al.id, 'TERM_END', 'COMPLETED', 1200 + d.h * 7 + 95, 40 + d.h % 30 + 6, TRUE, TRUE, 0, 'NONE', al.ended_at,
       al.ended_at, (SELECT id FROM demo_staff WHERE account = 'staff' || lower(d.block) || '01'), al.ended_at
FROM demo_res d CROSS JOIN demo_t t JOIN asg_allocation al ON al.term_id = t.n_id AND al.student_id = d.student_id
WHERE d.leave = 'CHECKED_OUT';

-- The Round-1 runs' proposals, read back by Assignment › a run: each placed Application on the Bed it was allocated,
-- the waitlisted ones (B, C) in a Block of their gender, every Block committed by the Manager on results day.
INSERT INTO asg_proposal_item (run_id, application_id, building_id, bed_id, fit)
SELECT al.run_id, al.application_id, r.building_id, al.bed_id, 0.6500 + (abs(hashtext('fit' || al.application_id)) % 31) / 100.0
FROM asg_allocation al JOIN inv_bed b ON b.id = al.bed_id JOIN inv_room r ON r.id = b.room_id
WHERE al.source = 'ASSIGNMENT' AND al.run_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO asg_proposal_item (run_id, application_id, building_id, waitlisted, issue_code, issue_tone, resolved, reason)
SELECT ru.id, ap.id, (SELECT min(bl.id) FROM inv_building bl WHERE bl.gender = a.gender), TRUE, 'NO_BED', 'DANGER', TRUE,
       'No free Bed of the chosen Room Type and Room Class in a Block for this gender.'
FROM demo_app a CROSS JOIN demo_t t JOIN app_application ap ON ap.term_id = t.x_id AND ap.student_id = a.student_id
JOIN asg_run ru ON ru.term_id = t.x_id AND ru.kind = 'REAL'
WHERE a.status = 'WAITLISTED'
ON CONFLICT DO NOTHING;

INSERT INTO asg_run_block (run_id, building_id, status, submitted_by, submitted_at, decided_by, decided_at, committed_at)
SELECT DISTINCT p.run_id, p.building_id, 'COMMITTED', ru.started_by, ru.finished_at - interval '6 hours', ru.started_by,
       ru.finished_at, ru.finished_at
FROM asg_proposal_item p JOIN asg_run ru ON ru.id = p.run_id
WHERE p.building_id IS NOT NULL;

-- ---------- check-in inventories (S40–S45, every stage) ----------
-- Term N places on floor 9 of Block A. S40 paid and has an approved late arrival: they may start the inventory
-- (staffa01 has still to inspect A-901). S41 started it 6 hours ago; S42 filed it with a missing wardrobe and a
-- meter far above the Room's record (Major difference, for Staff to review); S43 is S42's roommate whose
-- inventory is final (it prefills S42's shared items); S44's inventory waits for Staff's visit today; S45 has lived
-- in A-905 since the start of the Term and is asked to confirm damage to a shared item.
INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, started_at)
SELECT h.student_id, t.n_id, t.n_id, 1, 1, t.now - interval '20 days' FROM demo_handover h CROSS JOIN demo_t t;

INSERT INTO asg_allocation (term_id, application_id, student_id, bed_id, status, source, allocated_at, allocated_by, resident_at,
                            code_released_at, eligible_at, handover_needed, utility_from, checked_in_at, stay_id)
SELECT t.n_id, (SELECT ap.id FROM app_application ap WHERE ap.term_id = t.n_id AND ap.student_id = h.student_id),
       h.student_id, h.bed_id, 'ACTIVE', 'MANUAL', t.now - interval '20 days',
       (SELECT id FROM demo_staff WHERE account = 'manager01'), w.since, w.since,
       coalesce(w.since, t.now - interval '2 hours'), TRUE, w.final, w.final, s.id
FROM demo_handover h CROSS JOIN demo_t t
JOIN asg_stay s ON s.student_id = h.student_id AND s.first_term_id = t.n_id
JOIN (SELECT d.student_id,
             CASE d.scenario WHEN 'S40' THEN NULL WHEN 'S41' THEN t2.now - interval '6 hours'
                             WHEN 'S42' THEN t2.now - interval '30 hours' WHEN 'S43' THEN t2.now - interval '10 days'
                             WHEN 'S44' THEN t2.now - interval '2 days'
                             ELSE ((t2.n_start) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END AS since,
             CASE d.scenario WHEN 'S43' THEN t2.now - interval '10 days' + interval '1 hour'
                             WHEN 'S45' THEN ((t2.n_start) + TIME '11:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END AS final
      FROM demo_handover d CROSS JOIN demo_t t2) w ON w.student_id = h.student_id;

-- S40 asked online for a late arrival; a Manager approved it until the day after tomorrow.
INSERT INTO asg_late_check_in (allocation_id, reason, requested_for, window_closed_at, suggested_deadline, status,
                               deadline, decided_by, decided_at, created_at, source)
SELECT al.id, 'Được xếp chỗ sau đợt nhận phòng: tuần này em từ Cần Thơ lên.', t.today + 1,
       ((t.n_start + 4) + TIME '23:59') AT TIME ZONE 'Asia/Ho_Chi_Minh', t.today + 2, 'APPROVED', t.today + 2,
       (SELECT id FROM demo_staff WHERE account = 'manager01'), t.now - interval '1 day', t.now - interval '2 days',
       'ONLINE'
FROM demo_handover h CROSS JOIN demo_t t JOIN asg_allocation al ON al.student_id = h.student_id AND al.term_id = t.n_id
WHERE h.scenario = 'S40';

INSERT INTO asg_handover (allocation_id, room_id, status, source, opened_at, due_at, submitted_at, electricity, water,
                          baseline_electricity, baseline_water, baseline_at, comparison, comparison_note,
                          verify_requested_at, verify_requested_by, visit_at, verified_electricity, verified_water,
                          finalized_at, utility_from, reminders_sent)
SELECT al.id, h.room_id,
       CASE h.scenario WHEN 'S41' THEN 'DRAFT' WHEN 'S42' THEN 'SUBMITTED' WHEN 'S44' THEN 'VERIFYING' ELSE 'FINAL' END,
       CASE WHEN h.scenario IN ('S43', 'S45') THEN 'STUDENT' END,
       al.code_released_at, al.code_released_at + interval '48 hours',
       CASE h.scenario WHEN 'S42' THEN t.now - interval '3 hours' WHEN 'S44' THEN t.now - interval '1 day'
                       WHEN 'S41' THEN NULL ELSE al.utility_from END,
       CASE h.scenario WHEN 'S41' THEN NULL WHEN 'S42' THEN h.meter_e + 43.5 ELSE h.meter_e + 0.8 END,
       CASE h.scenario WHEN 'S41' THEN NULL ELSE h.meter_w + 0.1 END,
       h.meter_e, h.meter_w,
       CASE WHEN h.scenario = 'S45' THEN al.utility_from - interval '1 day' ELSE t.now - interval '3 days' END,
       CASE h.scenario WHEN 'S42' THEN 'MAJOR' WHEN 'S44' THEN 'MINOR' WHEN 'S43' THEN 'MATCHED'
                       WHEN 'S45' THEN 'MATCHED' END,
       CASE h.scenario WHEN 'S42' THEN 'Wardrobe: Good → Missing' || chr(10) || 'Electricity +43.5 kWh (allowed 13.5 kWh)'
                       WHEN 'S44' THEN 'Desk: Good → Damaged' END,
       CASE WHEN h.scenario = 'S44' THEN t.now - interval '20 hours' END,
       CASE WHEN h.scenario = 'S44' THEN (SELECT id FROM demo_staff WHERE account = 'staffa01') END,
       CASE WHEN h.scenario = 'S44' THEN (t.today + TIME '16:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       NULL, NULL, -- Staff record their own readings only in the Room (none before the visit)
       al.utility_from, al.utility_from, CASE WHEN h.scenario = 'S41' THEN 0 ELSE 2 END
FROM demo_handover h CROSS JOIN demo_t t JOIN asg_allocation al ON al.student_id = h.student_id AND al.term_id = t.n_id
WHERE h.scenario <> 'S40';

-- The items each student answers for: their Bed's and the Room's shared items, inspected Good before.
INSERT INTO asg_handover_item (handover_id, furniture_item_id, condition, note, baseline_condition, baseline_source,
                               verified_condition, pre_existing)
SELECT ho.id, i.id,
       CASE h.scenario
            WHEN 'S41' THEN CASE WHEN i.bed_id IS NOT NULL AND ft.code <> 'DESK' THEN 'GOOD' END
            WHEN 'S42' THEN CASE WHEN ft.code = 'WRD' THEN 'MISSING' WHEN i.bed_id IS NULL THEN 'WORN' ELSE 'GOOD' END
            WHEN 'S44' THEN CASE WHEN ft.code = 'DESK' THEN 'DAMAGED' ELSE 'GOOD' END
            ELSE 'GOOD' END,
       CASE WHEN h.scenario = 'S42' AND ft.code = 'WRD' THEN 'Không có tủ quần áo cạnh giường em.'
            WHEN h.scenario = 'S44' AND ft.code = 'DESK' THEN 'Ngăn kéo bàn học bị hỏng.' END,
       'GOOD', 'INSPECTION',
       NULL, FALSE
FROM asg_handover ho JOIN asg_allocation al ON al.id = ho.allocation_id
JOIN demo_handover h ON h.student_id = al.student_id
JOIN inv_furniture_item i ON i.room_id = h.room_id AND i.status <> 'DISPOSED'
                         AND (i.bed_id IS NULL OR i.bed_id = h.bed_id)
JOIN inv_furniture_type ft ON ft.id = i.furniture_type_id;

-- S45: staffa01 records that S45 broke a shared appliance of A-905; S45 has two days to confirm it (then it is
-- charged at check-out) or decline it (nobody is charged).
INSERT INTO asg_damage_claim (allocation_id, furniture_item_id, condition, note, status, amount, created_by, created_at,
                              due_at)
SELECT al.id, i.id, 'DAMAGED', 'Vỏ máy bị nứt do va đập.', 'PENDING',
       coalesce((SELECT ft.unit_price FROM inv_furniture_type ft WHERE ft.id = i.furniture_type_id), 0)
           * (100 - coalesce((SELECT value_percent FROM inv_furniture_condition WHERE code = 'MOSTLY_DAMAGED'), 50)) / 100,
       (SELECT id FROM demo_staff WHERE account = 'staffa01'), t.now - interval '4 hours', t.now + interval '44 hours'
FROM demo_handover h CROSS JOIN demo_t t JOIN asg_allocation al ON al.student_id = h.student_id AND al.term_id = t.n_id
JOIN LATERAL (SELECT f.* FROM inv_furniture_item f WHERE f.room_id = h.room_id AND f.bed_id IS NULL
              AND f.status = 'IN_USE' ORDER BY f.asset_code LIMIT 1) i ON TRUE
WHERE h.scenario = 'S45';

-- ---------- check-in week (D): Term N+1 receives its residents ----------
-- Continuing residents on the same Bed live in N+1 from the check-in start (code released automatically, no
-- inventory) and their Term N Allocation ended then; S12 moves to A-603 and files an inventory there (READY).
UPDATE asg_allocation n SET status = 'ENDED', ended_at = (t.x_ci_start + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                            end_reason = 'TERM_END'
FROM demo_res d CROSS JOIN demo_t t
WHERE t.stage = 'D' AND n.term_id = t.n_id AND n.student_id = d.student_id AND d.x_state = 'CONTINUING'
  AND n.status = 'ACTIVE';

UPDATE asg_allocation x SET code_released_at = ((t.x_ci_start + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')
                                               + interval '1 minute' * (d.h % 60),
                            resident_at = ((t.x_ci_start + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')
                                          + interval '1 minute' * (d.h % 60)
FROM demo_res d CROSS JOIN demo_t t
WHERE t.stage = 'D' AND x.term_id = t.x_id AND x.student_id = d.student_id AND d.x_state = 'CONTINUING'
  AND d.scenario IS DISTINCT FROM 'S12' AND x.status = 'ACTIVE';

-- When each new resident opened, filed and closed the inventory (see demo_checkin in plan.sql for the states).
CREATE TEMP TABLE demo_checkin_time ON COMMIT DROP AS
WITH b AS (
    SELECT c.*, t.now, t.today, (t.x_ci_start + TIME '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS ci_open
    FROM demo_checkin c CROSS JOIN demo_t t),
o AS (
    SELECT b.*, CASE
        WHEN b.state IN ('MATCHED', 'NO_RECORD') THEN b.ci_open + interval '1 day' * (b.h % 3) + interval '7 minutes' * b.h
        WHEN b.state = 'DRAFT' AND b.named = 2 THEN b.now - interval '30 hours'
        WHEN b.state = 'DRAFT' THEN b.now - interval '1 hour' * (2 + b.h % 18)
        WHEN b.state IN ('MINOR', 'MAJOR') THEN b.now - interval '1 hour' * (10 + b.h % 14)
        WHEN b.state = 'VERIFYING' THEN b.now - interval '30 hours'
        WHEN b.state = 'AUTO' THEN b.ci_open + interval '1 minute' * (b.h % 50) END AS opened
    FROM b)
SELECT o.*, o.opened + interval '48 hours' AS due,
       CASE WHEN o.state IN ('MATCHED', 'NO_RECORD') THEN o.opened + interval '2 hours'
            WHEN o.state IN ('MINOR', 'MAJOR') THEN o.now - interval '1 hour' * (1 + o.h % 8)
            WHEN o.state = 'VERIFYING' THEN o.now - interval '26 hours' END AS submitted,
       CASE WHEN o.state IN ('MATCHED', 'NO_RECORD') THEN o.opened + interval '2 hours'
            WHEN o.state = 'AUTO' THEN o.opened + interval '48 hours 10 minutes' END AS finalized,
       CASE WHEN o.state IN ('MATCHED', 'NO_RECORD') THEN o.opened + interval '2 hours'
            WHEN o.state = 'AUTO' THEN o.opened END AS utility_from
FROM o;

UPDATE asg_allocation x SET eligible_at = CASE WHEN c.state = 'WAITING' THEN NULL ELSE c.ci_open END,
                            handover_needed = c.state <> 'WAITING',
                            code_released_at = c.opened, resident_at = c.opened,
                            utility_from = c.utility_from, checked_in_at = c.finalized
FROM demo_checkin_time c CROSS JOIN demo_t t
WHERE x.term_id = t.x_id AND x.student_id = c.student_id AND x.status = 'ACTIVE';

INSERT INTO asg_handover (allocation_id, room_id, status, source, opened_at, due_at, submitted_at, electricity, water,
                          baseline_electricity, baseline_water, baseline_at, comparison, comparison_note,
                          verify_requested_at, verify_requested_by, visit_at, verified_electricity, verified_water,
                          finalized_at, utility_from, reminders_sent)
SELECT x.id, c.room_id,
       CASE c.state WHEN 'DRAFT' THEN 'DRAFT' WHEN 'MINOR' THEN 'SUBMITTED' WHEN 'MAJOR' THEN 'SUBMITTED'
                    WHEN 'VERIFYING' THEN 'VERIFYING' ELSE 'FINAL' END,
       CASE c.state WHEN 'AUTO' THEN 'AUTO' WHEN 'MATCHED' THEN 'STUDENT' WHEN 'NO_RECORD' THEN 'STUDENT' END,
       c.opened, c.due, c.submitted,
       CASE c.state WHEN 'MATCHED' THEN m.e + 1.5 WHEN 'NO_RECORD' THEN m.e + 1.5 WHEN 'MINOR' THEN m.e + 2
                    WHEN 'MAJOR' THEN m.e + 45 WHEN 'VERIFYING' THEN m.e + 38 END,
       CASE WHEN c.state IN ('MATCHED', 'NO_RECORD', 'MINOR', 'MAJOR', 'VERIFYING') THEN m.w + 0.1 END,
       CASE WHEN c.state = 'NO_RECORD' THEN m.e - 12 ELSE m.e END,
       CASE WHEN c.state = 'NO_RECORD' THEN m.w - 1 ELSE m.w END,
       CASE WHEN c.state = 'NO_RECORD' THEN NULL
            ELSE ((t.n_end + 2) + TIME '15:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       CASE c.state WHEN 'MINOR' THEN 'MINOR' WHEN 'MAJOR' THEN 'MAJOR' WHEN 'VERIFYING' THEN 'MAJOR'
                    WHEN 'MATCHED' THEN 'MATCHED' WHEN 'NO_RECORD' THEN 'MATCHED' END,
       CASE c.state WHEN 'MINOR' THEN 'Desk: Good → Damaged'
                    WHEN 'MAJOR' THEN 'Wardrobe: Good → Missing' || chr(10) || 'Electricity +45 kWh (allowed 6 kWh)'
                    WHEN 'VERIFYING' THEN 'Electricity +38 kWh (allowed 7.5 kWh)' END,
       CASE WHEN c.state = 'VERIFYING' THEN c.now - interval '20 hours' END,
       CASE WHEN c.state = 'VERIFYING' THEN (SELECT id FROM demo_staff WHERE account = 'staff' || lower(c.block) || '01') END,
       CASE WHEN c.state = 'VERIFYING' AND c.named = 5 THEN (c.today + TIME '16:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
            WHEN c.state = 'VERIFYING' THEN ((c.today + 1) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       NULL, NULL, -- nothing recorded by Staff before the visit
       c.finalized, c.utility_from,
       CASE WHEN c.state = 'DRAFT' AND c.due < c.now + interval '24 hours' THEN 1 ELSE 0 END
FROM demo_checkin_time c CROSS JOIN demo_t t
JOIN asg_allocation x ON x.term_id = t.x_id AND x.student_id = c.student_id AND x.status = 'ACTIVE'
JOIN demo_room_meter m ON m.room_id = c.room_id
WHERE c.opened IS NOT NULL;

-- Each inventory's items: the student's Bed and the Room's shared items, with what the inspection recorded.
INSERT INTO asg_handover_item (handover_id, furniture_item_id, condition, note, baseline_condition, baseline_source,
                               verified_condition, pre_existing)
SELECT ho.id, i.item_id, a.answer,
       CASE WHEN c.state = 'MINOR' AND i.type_code = 'DESK' THEN 'Ngăn kéo bàn học bị hỏng.'
            WHEN c.state = 'MAJOR' AND i.type_code = 'WRD' THEN 'Không có tủ quần áo cạnh giường em.' END,
       CASE WHEN c.state = 'NO_RECORD' THEN NULL ELSE i.condition END,
       CASE WHEN c.state = 'NO_RECORD' THEN NULL ELSE 'INSPECTION' END,
       NULL,
       ho.status = 'FINAL' AND coalesce(a.answer, i.condition) IN ('DAMAGED', 'MISSING')
FROM asg_handover ho JOIN asg_allocation x ON x.id = ho.allocation_id
JOIN demo_checkin_time c ON c.student_id = x.student_id
JOIN demo_checkin_item i ON i.room_id = c.room_id AND (i.bed_id IS NULL OR i.bed_id = c.bed_id)
CROSS JOIN LATERAL (SELECT CASE
        WHEN c.state = 'AUTO' THEN NULL
        WHEN c.state = 'DRAFT' THEN CASE WHEN i.bed_id IS NOT NULL THEN i.condition END
        WHEN c.state = 'MINOR' AND i.type_code = 'DESK' THEN 'DAMAGED'
        WHEN c.state = 'MAJOR' AND i.type_code = 'WRD' THEN 'MISSING'
        ELSE i.condition END AS answer) a
JOIN demo_t t ON t.stage = 'D';

-- The difference notes name the condition the inspection really recorded (Good or Worn).
UPDATE asg_handover ho
SET comparison_note = replace(ho.comparison_note, ft.name || ': Good →', ft.name || ': ' || initcap(hi.baseline_condition) || ' →')
FROM asg_handover_item hi JOIN inv_furniture_item f ON f.id = hi.furniture_item_id
JOIN inv_furniture_type ft ON ft.id = f.furniture_type_id
WHERE hi.handover_id = ho.id AND ho.comparison_note LIKE '%' || ft.name || ': Good →%'
  AND hi.condition IN ('DAMAGED', 'MISSING') AND hi.baseline_condition IS NOT NULL;
