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
       (SELECT id FROM demo_staff WHERE account = 'manager.a'), t.n_results - interval '4 days',
       t.n_results - interval '1 day', (SELECT count(*) FROM demo_res), (SELECT count(*) FROM demo_res), 0, 0, 0.8420
FROM demo_t t;

INSERT INTO asg_run (term_id, kind, status, stage, matching_snapshot_id, started_by, started_at, finished_at, input_count,
                     proposed_count, conflict_count, waitlisted_count, average_fit)
SELECT t.x_id, 'REAL', 'COMMITTED', 5, (SELECT max(id) FROM cfg_matching_snapshot),
       (SELECT id FROM demo_staff WHERE account = 'manager.a'), t.x_results - interval '3 days',
       t.x_results - interval '1 day', (SELECT count(*) FROM demo_app WHERE status <> 'AWAITING_DEPOSIT'),
       (SELECT count(*) FROM demo_app WHERE status IN ('ALLOCATED', 'FORFEITED')), 0,
       (SELECT count(*) FROM demo_app WHERE status = 'WAITLISTED'), 0.8130
FROM demo_t t WHERE t.stage IN ('B', 'C');

-- Stays: the Terms committed (stay length, grown by an approved extension) and used.
INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, status, end_kind, started_at,
                      ended_at)
SELECT d.student_id, t.n_id, t.n_id,
       d.committed + CASE WHEN d.fate = 'LAST' AND d.x_state IN ('CONTINUING', 'FEE_NOT_PAID')
                          THEN CASE WHEN d.scenario = 'S10' THEN 2 ELSE 1 END ELSE 0 END,
       1, CASE WHEN d.leave = 'CHECKED_OUT' THEN 'ENDED' ELSE 'ACTIVE' END,
       CASE WHEN d.leave = 'CHECKED_OUT' THEN 'COMPLETED' END, (t.n_start - 2 + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       CASE WHEN d.leave = 'CHECKED_OUT' THEN ((t.today - (1 + d.h % 3)) + TIME '08:30' + interval '13 minutes' * (d.h % 37)) AT TIME ZONE 'Asia/Ho_Chi_Minh' END
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
       (SELECT id FROM demo_staff WHERE account = 'manager.a'),
       CASE WHEN d.h % 2 = 0 THEN ((t.n_start - 3 + d.h % 5) + TIME '14:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       CASE WHEN d.h % 2 = 0 THEN (SELECT id FROM demo_staff WHERE account = 'staff.' || lower(d.block) || '1') END,
       CASE WHEN d.leave = 'CHECKED_OUT' THEN ((t.today - (1 + d.h % 3)) + TIME '08:30' + interval '13 minutes' * (d.h % 37)) AT TIME ZONE 'Asia/Ho_Chi_Minh' END,
       CASE WHEN d.leave = 'CHECKED_OUT' THEN 'CHECK_OUT' END,
       ((t.n_start - 3 + d.h % 5) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       ((t.n_start - 3 + d.h % 5) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       s.id
FROM demo_res d CROSS JOIN demo_t t
JOIN app_application ap ON ap.term_id = t.n_id AND ap.student_id = d.student_id
JOIN asg_stay s ON s.student_id = d.student_id AND s.first_term_id = t.n_id;

-- The requests window of N+1 (opened at M2; closed at M3, Managers alerted, fees issued at M6 and closed at M7).
INSERT INTO asg_renewal (term_id, previous_term_id, opened_at, continuing, awaiting, closed_at, escalated_at,
                         fees_issued_at, fees_issued_by, fees_closed_at)
SELECT t.x_id, t.n_id, t.x_m2,
       (SELECT count(*) FROM demo_res WHERE fate = 'CONTINUING'), (SELECT count(*) FROM demo_res WHERE fate = 'LAST'),
       CASE WHEN t.stage IN ('B', 'C') THEN t.x_m3 + interval '5 minutes' END,
       CASE WHEN t.stage IN ('B', 'C') THEN t.x_m4 - interval '48 hours' END,
       CASE WHEN t.stage IN ('B', 'C') THEN t.x_m6 END,
       CASE WHEN t.stage IN ('B', 'C') THEN (SELECT id FROM demo_staff WHERE account = 'manager.a') END,
       CASE WHEN t.stage = 'C' THEN t.x_m7 + interval '5 minutes' END
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
       (SELECT id FROM demo_staff WHERE account = 'manager.a'),
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
       t.x_start + 9, ((t.x_start + 4) + TIME '23:59') AT TIME ZONE 'Asia/Ho_Chi_Minh', t.x_start + 9,
       a.late, CASE WHEN a.late = 'APPROVED' THEN t.x_start + 10 END,
       CASE WHEN a.late = 'APPROVED' THEN (SELECT id FROM demo_staff WHERE account = 'manager.a') END,
       CASE WHEN a.late = 'APPROVED' THEN least(t.x_results + interval '2 days', t.now - interval '1 day') END,
       least(t.x_results + interval '1 day', t.now - interval '2 days'), 'ONLINE'
FROM demo_app a CROSS JOIN demo_t t JOIN asg_allocation al ON al.term_id = t.x_id AND al.student_id = a.student_id
WHERE a.late IS NOT NULL;

-- A termination for Utility debt (S21): notice sent, move out within days.
INSERT INTO asg_termination (allocation_id, term_id, student_id, reason, note, debt, status, started_at, started_by,
                             move_out_by)
SELECT al.id, t.n_id, d.student_id, 'UTILITY_DEBT', 'Two Utility Invoices overdue after the final warning.', 612000,
       'NOTICE_SENT', t.now - interval '2 days', (SELECT id FROM demo_staff WHERE account = 'manager.a'),
       least(t.today + 5, t.n_end)
FROM demo_res d CROSS JOIN demo_t t JOIN asg_allocation al ON al.term_id = t.n_id AND al.student_id = d.student_id
WHERE d.scenario = 'S21';

-- Turnover week (C): the leavers who already checked out at the desk.
INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water, condition_good, key_returned, damage_charge,
                           refund_status, requested_at, completed_at, completed_by, updated_at)
SELECT al.id, 'TERM_END', 'COMPLETED', 1200 + d.h * 7 + 95, 40 + d.h % 30 + 6, TRUE, TRUE, 0, 'NONE', al.ended_at,
       al.ended_at, (SELECT id FROM demo_staff WHERE account = 'staff.' || lower(d.block) || '1'), al.ended_at
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
