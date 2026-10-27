-- =====================================================================
-- Demo data — Billing (BIL): Deposits and Balances of Term N (paid), last
-- month's Utility (paid but by three debtors, with their warnings), the
-- meter periods, the new students' Deposits and Balances, the next-Term
-- fees (B, C) and the claims and payments behind every paid Invoice. A
-- payment is always a claim confirmed by a Manager (ADR-22).
-- =====================================================================

-- Term N: Deposits (no Block yet) and Balances (with the Utility Deposit), paid before the stay.
INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, type, title, amount, status, transfer_content,
                         issued_at, due_at, paid_at, payment_method, student_name, student_code, gender)
OVERRIDING SYSTEM VALUE
WITH src AS (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, ap.id AS application_id, ap.term_id,
                    ap.student_id, ap.deposit_amount, ap.created_at, ap.deposit_due_at, ap.student_name,
                    ap.student_code, ap.gender
             FROM app_application ap CROSS JOIN demo_t t WHERE ap.term_id = t.n_id)
SELECT s.id, 'INV-' || t.n_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), s.term_id,
       s.student_id, s.application_id, 'DEPOSIT', 'Deposit · ' || t.n_name, s.deposit_amount, 'PAID',
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), s.created_at, s.deposit_due_at,
       s.created_at + interval '2 hours', 'TRANSFER', s.student_name, s.student_code, s.gender
FROM src s CROSS JOIN demo_t t;

INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, allocation_id, building_id, type, title, amount,
                         utility_deposit, status, transfer_content, issued_at, due_at, paid_at, payment_method,
                         student_name, student_code, gender)
OVERRIDING SYSTEM VALUE
WITH src AS (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, al.id AS allocation_id,
                    al.application_id, d.*
             FROM demo_res d CROSS JOIN demo_t t
             JOIN asg_allocation al ON al.term_id = t.n_id AND al.student_id = d.student_id)
SELECT s.id, 'INV-' || t.n_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.n_id,
       s.student_id, s.application_id, s.allocation_id, s.building_id, 'BALANCE', 'Balance · ' || t.n_name,
       ap.term_price - ap.deposit_amount + cfg.utility_deposit, cfg.utility_deposit, 'PAID',
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.n_results, t.n_balance_due,
       t.n_balance_due - interval '1 day' * (1 + s.h % 9), 'TRANSFER', s.name, s.code, s.gender
FROM src s CROSS JOIN demo_t t JOIN cfg_term cfg ON cfg.id = t.n_id JOIN app_application ap ON ap.id = s.application_id;

-- Last month's Utility for every resident; S19 owes it, S20 and S21 also the month before.
INSERT INTO bil_invoice (id, code, term_id, student_id, allocation_id, building_id, type, title, amount, status,
                         transfer_content, issued_at, due_at, paid_at, payment_method, student_name, student_code,
                         gender)
OVERRIDING SYSTEM VALUE
WITH src AS (
    SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, al.id AS allocation_id, d.*, m.label, m.due,
           m.overdue
    FROM demo_res d CROSS JOIN demo_t t
    JOIN asg_allocation al ON al.term_id = t.n_id AND al.student_id = d.student_id
    JOIN LATERAL (VALUES (t.util_label, t.util_due, coalesce(d.scenario IN ('S19', 'S20', 'S21'), FALSE)),
                         (t.util_label_2, t.util_due_2, TRUE)) m (label, due, overdue)
         ON m.label = t.util_label OR d.scenario IN ('S20', 'S21'))
SELECT s.id, 'INV-' || t.n_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.n_id,
       s.student_id, s.allocation_id, s.building_id, 'UTILITY', 'Utility · ' || s.label,
       CASE WHEN s.overdue THEN 306000 ELSE 120000 + (s.h * 2700 / 1000) * 1000 END,
       CASE WHEN s.overdue THEN 'OVERDUE' ELSE 'PAID' END,
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), s.due - interval '10 days', s.due,
       CASE WHEN NOT s.overdue THEN s.due - interval '1 day' * (1 + s.h % 7) END,
       CASE WHEN NOT s.overdue THEN 'TRANSFER' END, s.name, s.code, s.gender
FROM src s CROSS JOIN demo_t t;

INSERT INTO bil_utility_warning (allocation_id, student_id, term_id, building_id, level, invoice_id, overdue_count, debt,
                                 terminate_on, issued_at)
SELECT i.allocation_id, i.student_id, i.term_id, i.building_id, w.level, i.id, w.overdue, w.debt, w.terminate_on,
       w.issued_at
FROM demo_res d CROSS JOIN demo_t t
JOIN bil_invoice i ON i.student_id = d.student_id AND i.type = 'UTILITY' AND i.title = 'Utility · ' || t.util_label
JOIN LATERAL (VALUES ('FIRST', 1, 306000, NULL::date, t.util_due + interval '1 day', d.scenario IN ('S19', 'S20', 'S21')),
                     ('FINAL', 2, 612000, CASE WHEN d.scenario = 'S21' THEN t.today - 2 ELSE t.today + 7 END,
                      t.now - interval '3 days', d.scenario IN ('S20', 'S21'))) w
     (level, overdue, debt, terminate_on, issued_at, applies) ON w.applies
WHERE d.scenario IN ('S19', 'S20', 'S21');

-- S21's final warning ran out two days ago: the termination started and closed its warnings.
UPDATE bil_utility_warning w SET closed_at = t.now - interval '2 days', closed_reason = 'TERMINATED'
FROM demo_res d CROSS JOIN demo_t t WHERE d.scenario = 'S21' AND w.student_id = d.student_id;

-- Meter periods per Block: last month confirmed, this month open for the readings.
INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at, closed_at, closed_by)
SELECT b.id, t.util_label, t.util_start, t.util_end, ((t.util_end + 3) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       ((t.util_end + 2) + TIME '16:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
       (SELECT id FROM demo_staff WHERE account = 'staff.' || lower(b.code) || '2')
FROM inv_building b CROSS JOIN demo_t t;

INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at)
SELECT b.id, to_char(t.today, 'MM/YYYY'), date_trunc('month', t.today)::date,
       (date_trunc('month', t.today) + interval '1 month' - interval '1 day')::date,
       ((date_trunc('month', t.today) + interval '1 month' + interval '2 days')::date + TIME '17:00')
           AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM inv_building b CROSS JOIN demo_t t;

INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, electricity_curr, water_prev, water_curr, status,
                               entered_by, entered_at, confirmed_by, confirmed_at)
SELECT p.id, r.id, 1000 + (r.id % 97) * 7, 1000 + (r.id % 97) * 7 + 80 + r.id % 60, 30 + r.id % 40,
       30 + r.id % 40 + 5 + r.id % 6, 'CONFIRMED', p.closed_by, p.closed_at - interval '1 day', p.closed_by, p.closed_at
FROM bil_meter_period p JOIN inv_room r ON r.building_id = p.building_id
WHERE p.closed_at IS NOT NULL AND r.status = 'IN_SERVICE';

INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, water_prev, status)
SELECT p.id, r.id, prev.electricity_curr, prev.water_curr, 'MISSING'
FROM bil_meter_period p JOIN inv_room r ON r.building_id = p.building_id
JOIN bil_meter_reading prev ON prev.room_id = r.id
JOIN bil_meter_period pp ON pp.id = prev.period_id AND pp.closed_at IS NOT NULL
WHERE p.closed_at IS NULL;

-- Term N+1: the new students' Deposits. Awaiting Deposit: unpaid; S04 claimed it; S05's first claim was rejected.
INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, type, title, amount, status, transfer_content,
                         issued_at, due_at, paid_at, payment_method, student_name, student_code, gender)
OVERRIDING SYSTEM VALUE
WITH src AS (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, ap.id AS application_id,
                    ap.student_id, ap.status, ap.deposit_amount, ap.created_at, ap.deposit_due_at, ap.student_name,
                    ap.student_code, ap.gender, a.scenario
             FROM app_application ap CROSS JOIN demo_t t JOIN demo_app a ON a.student_id = ap.student_id
             WHERE ap.term_id = t.x_id)
SELECT s.id, 'INV-' || t.x_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.x_id,
       s.student_id, s.application_id, 'DEPOSIT', 'Deposit · ' || t.x_name, s.deposit_amount,
       CASE WHEN s.status <> 'AWAITING_DEPOSIT' THEN 'PAID' WHEN s.scenario = 'S04' THEN 'AWAITING_CONFIRMATION'
            ELSE 'UNPAID' END,
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), s.created_at, s.deposit_due_at,
       CASE WHEN s.status <> 'AWAITING_DEPOSIT' THEN s.created_at + interval '2 hours' END,
       CASE WHEN s.status <> 'AWAITING_DEPOSIT' THEN 'TRANSFER' END, s.student_name, s.student_code, s.gender
FROM src s CROSS JOIN demo_t t;

-- Their Balances (B, C): paid, unpaid until the deadline (S17's moved by its late check-in), or void when forfeited.
INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, allocation_id, building_id, type, title, amount,
                         utility_deposit, status, transfer_content, issued_at, due_at, paid_at, payment_method,
                         voided_reason, student_name, student_code, gender)
OVERRIDING SYSTEM VALUE
WITH src AS (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, al.id AS allocation_id,
                    al.application_id, r.building_id, a.*
             FROM demo_app a CROSS JOIN demo_t t
             JOIN asg_allocation al ON al.term_id = t.x_id AND al.student_id = a.student_id AND al.source = 'ASSIGNMENT'
             JOIN inv_bed b ON b.id = al.bed_id JOIN inv_room r ON r.id = b.room_id)
SELECT s.id, 'INV-' || t.x_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.x_id,
       s.student_id, s.application_id, s.allocation_id, s.building_id, 'BALANCE', 'Balance · ' || t.x_name,
       ap.term_price - ap.deposit_amount + cfg.utility_deposit, cfg.utility_deposit,
       CASE WHEN s.status = 'FORFEITED' THEN 'VOID' WHEN s.balance = 'PAID' THEN 'PAID' ELSE 'UNPAID' END,
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.x_results,
       CASE WHEN s.late = 'APPROVED' THEN ((t.x_start + 10) + TIME '17:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
            ELSE t.x_balance_due END,
       CASE WHEN s.balance = 'PAID' THEN least(t.x_results + interval '1 hour' * (5 + s.h * 2), t.now - interval '1 hour') END,
       CASE WHEN s.balance = 'PAID' THEN 'TRANSFER' END,
       CASE WHEN s.status = 'FORFEITED' THEN 'Balance not paid by its deadline' END, s.name, s.code, s.gender
FROM src s CROSS JOIN demo_t t JOIN cfg_term cfg ON cfg.id = t.x_id JOIN app_application ap ON ap.id = s.application_id;

-- Next-Term room fees (B, C): 100 % of N+1's price of the Bed held, for every Continuing resident.
INSERT INTO bil_invoice (id, code, term_id, student_id, allocation_id, building_id, type, title, amount, status,
                         transfer_content, issued_at, due_at, paid_at, payment_method, voided_reason, student_name,
                         student_code, gender)
OVERRIDING SYSTEM VALUE
WITH src AS (
    SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, al.id AS allocation_id, r.code AS room,
           r.building_id AS x_building, p.price, d.*
    FROM demo_res d CROSS JOIN demo_t t
    JOIN asg_allocation al ON al.term_id = t.x_id AND al.student_id = d.student_id AND al.bed_id = d.x_bed_id
    JOIN inv_bed b ON b.id = al.bed_id JOIN inv_room r ON r.id = b.room_id
    JOIN cfg_term_price p ON p.term_id = t.x_id AND p.room_type_id = r.room_type_id
                         AND p.room_class_id = inv_room_class_in(r.id, t.x_id)
    WHERE d.fee IS NOT NULL OR d.x_state = 'FEE_NOT_PAID')
SELECT s.id, 'INV-' || t.x_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.x_id,
       s.student_id, s.allocation_id, s.x_building, 'TERM_FEE', 'Room fee · ' || t.x_name || ' · Room ' || s.room,
       s.price,
       CASE WHEN s.x_state = 'FEE_NOT_PAID' THEN 'VOID' WHEN s.fee = 'PAID' THEN 'PAID'
            WHEN s.fee = 'CLAIMED' THEN 'AWAITING_CONFIRMATION' ELSE 'UNPAID' END,
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.x_m6, t.x_m7,
       CASE WHEN s.fee = 'PAID' THEN least(t.x_m6 + interval '1 hour' * (2 + s.h), t.now - interval '1 hour') END,
       CASE WHEN s.fee = 'PAID' THEN 'TRANSFER' END,
       CASE WHEN s.x_state = 'FEE_NOT_PAID' THEN 'Next-Term fee not paid by its deadline' END, s.name, s.code, s.gender
FROM src s CROSS JOIN demo_t t;

-- Claims: confirmed for every paid Invoice (by a Manager), waiting for the claimed ones, one rejected for S05.
INSERT INTO bil_payment_claim (invoice_id, student_id, claimed_at, claimed_by, reference, time_left_seconds, status,
                               decided_by, decided_at)
SELECT i.id, i.student_id, i.paid_at - interval '3 hours', i.student_id, 'FT' || lpad(i.id::text, 10, '0'),
       greatest(0, extract(epoch FROM i.due_at - (i.paid_at - interval '3 hours')))::bigint, 'CONFIRMED',
       m.id, i.paid_at
FROM bil_invoice i LEFT JOIN inv_building b ON b.id = i.building_id
JOIN demo_staff m ON m.account = 'manager.' || lower(coalesce(b.code, 'a'))
WHERE i.status = 'PAID';

INSERT INTO bil_payment_claim (invoice_id, student_id, claimed_at, claimed_by, reference, time_left_seconds, status)
SELECT i.id, i.student_id, t.now - interval '5 hours', i.student_id, 'FT' || lpad(i.id::text, 10, '0'),
       greatest(0, extract(epoch FROM i.due_at - (t.now - interval '5 hours')))::bigint, 'CLAIMED'
FROM bil_invoice i CROSS JOIN demo_t t WHERE i.status = 'AWAITING_CONFIRMATION';

INSERT INTO bil_payment_claim (invoice_id, student_id, claimed_at, claimed_by, reference, time_left_seconds, status,
                               decided_by, decided_at, reason)
SELECT i.id, i.student_id, i.created_at + interval '2 hours', i.student_id, 'FT0000000001',
       extract(epoch FROM interval '46 hours')::bigint, 'REJECTED', (SELECT id FROM demo_staff WHERE account = 'manager.a'),
       i.created_at + interval '6 hours', 'No transfer with this content reached the account; check the content CSTAY… and send it again.'
FROM bil_invoice i JOIN demo_app a ON a.student_id = i.student_id CROSS JOIN demo_t t
WHERE a.scenario = 'S05' AND i.type = 'DEPOSIT' AND i.term_id = t.x_id;

INSERT INTO bil_payment (invoice_id, amount, method, status, reference, paid_at, confirmed_by, claim_id)
SELECT c.invoice_id, i.amount, 'TRANSFER', 'CONFIRMED', c.reference, i.paid_at, c.decided_by, c.id
FROM bil_payment_claim c JOIN bil_invoice i ON i.id = c.invoice_id WHERE c.status = 'CONFIRMED';

-- Payment reminders already sent for the unpaid Balances and next-Term fees, as the hourly job would have (so a
-- reset does not send them all at once).
UPDATE bil_invoice i SET reminders_sent = CASE
        WHEN p.second_days > 0 AND i.due_at - t.now <= make_interval(days => p.second_days) THEN 2
        WHEN p.first_days > 0 AND i.due_at - t.now <= make_interval(days => p.first_days) THEN 1 ELSE 0 END
FROM demo_t t,
     (SELECT (SELECT value::int FROM cfg_parameter WHERE key = 'payment.reminder_first_days') AS first_days,
             (SELECT value::int FROM cfg_parameter WHERE key = 'payment.reminder_second_days') AS second_days) p
WHERE i.type IN ('BALANCE', 'TERM_FEE') AND i.status = 'UNPAID' AND i.due_at > t.now;
