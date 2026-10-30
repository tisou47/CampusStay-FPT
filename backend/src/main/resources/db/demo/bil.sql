-- =====================================================================
-- Demo data — Billing (BIL): Deposits and Balances of Term N (paid), the
-- meter periods and readings of every month of Term N with their Utility
-- Invoices (paid but by three debtors, with their warnings; plan.sql
-- works them out), the new students' Deposits and Balances, the next-Term
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

-- Meter periods per Block: every month of Term N before this one closed by the Block's second Staff, this month open.
INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at, closed_at, closed_by)
SELECT b.id, m.label, m.period_start, m.period_end, m.due_at, m.closed_at,
       (SELECT id FROM demo_staff WHERE account = 'staff.' || lower(b.code) || '2')
FROM inv_building b CROSS JOIN demo_util_month m;

INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at)
SELECT b.id, to_char(t.today, 'MM/YYYY'), date_trunc('month', t.today::timestamp)::date,
       (date_trunc('month', t.today::timestamp) + interval '1 month' - interval '1 day')::date,
       (((date_trunc('month', t.today::timestamp) + interval '1 month')::date + u.payment_due_days) + TIME '00:00')
           AT TIME ZONE 'Asia/Ho_Chi_Minh'
FROM inv_building b CROSS JOIN demo_t t CROSS JOIN cfg_utility_policy u;

INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, electricity_curr, water_prev, water_curr, status,
                               entered_by, entered_at, confirmed_by, confirmed_at)
SELECT p.id, r.room_id, r.electricity_prev, r.electricity_prev + r.kwh, r.water_prev, r.water_prev + r.m3, 'CONFIRMED',
       p.closed_by, p.closed_at - interval '1 day', p.closed_by, p.closed_at
FROM demo_util_room r JOIN bil_meter_period p ON p.building_id = r.building_id AND p.label = r.label;

INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, water_prev, status)
SELECT p.id, r.room_id, r.electricity_prev + r.kwh, r.water_prev + r.m3, 'MISSING'
FROM demo_util_room r JOIN bil_meter_period p ON p.building_id = r.building_id AND p.closed_at IS NULL
WHERE r.age = 1;

-- The Utility Invoices of those months, issued when each period was closed, with the breakdown the student sees.
-- Paid within days, except the debtors' (S19 last month, S20 and S21 the two last months).
INSERT INTO bil_invoice (id, code, term_id, student_id, allocation_id, building_id, type, title, amount, status, lines,
                         breakdown, transfer_content, issued_at, due_at, paid_at, payment_method, reference,
                         student_name, student_code, gender)
OVERRIDING SYSTEM VALUE
WITH src AS (
    SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id, al.id AS allocation_id, d.building_id, d.name,
           d.code, d.gender, u.*, m.period_start, m.period_end, m.closed_at, m.due_at
    FROM demo_util_share u CROSS JOIN demo_t t
    JOIN demo_res d ON d.student_id = u.student_id
    JOIN asg_allocation al ON al.term_id = t.n_id AND al.student_id = u.student_id
    JOIN demo_util_month m ON m.label = u.label
    WHERE u.amount > 0)
SELECT s.id, 'INV-' || t.n_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.n_id,
       s.student_id, s.allocation_id, s.building_id, 'UTILITY', 'Utility · ' || s.label, s.amount,
       CASE WHEN s.overdue THEN 'OVERDUE' ELSE 'PAID' END,
       jsonb_build_array(jsonb_build_object('label', 'Electricity and water · Room ' || s.room_code, 'amount', s.amount)),
       jsonb_build_object(
           'room', s.room_code,
           'segments', jsonb_build_array(jsonb_build_object(
               'from', s.period_start::text, 'to', s.period_end::text,
               'note', to_char(s.period_start, 'DD/MM') || ' – ' || to_char(s.period_end, 'DD/MM'),
               'residents', s.residents, 'kwh', s.kwh, 'm3', s.m3, 'electricityCost', s.electricity_cost,
               'waterCost', s.water_cost, 'share', s.share)),
           'subtotal', s.share,
           'roundingNote', CASE WHEN s.step <= 1 THEN 'Shares are not rounded.'
                                ELSE 'Each share is rounded up to ' || to_char(s.step, 'FM999,999,999') || ' VND.' END,
           'priceKwh', s.price_kwh, 'priceM3', s.price_m3),
       'CSTAY' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), s.closed_at, s.due_at,
       CASE WHEN NOT s.overdue THEN least(s.closed_at + interval '1 hour' * (6 + s.h), s.due_at - interval '1 hour',
                                          t.now - interval '1 hour') END,
       CASE WHEN NOT s.overdue THEN 'TRANSFER' END, 'Room ' || s.room_code || ' · ' || s.label, s.name, s.code, s.gender
FROM src s CROSS JOIN demo_t t;

-- Their warnings: the first one after the oldest overdue Invoice; S20 and S21 also the final one, with its date.
INSERT INTO bil_utility_warning (allocation_id, student_id, term_id, building_id, level, invoice_id, overdue_count, debt,
                                 terminate_on, issued_at)
SELECT i.allocation_id, i.student_id, i.term_id, i.building_id, 'FIRST', i.id, 1, i.amount, NULL,
       i.due_at + interval '1 day'
FROM demo_res d
JOIN demo_util_month m ON m.age = CASE WHEN d.scenario = 'S19' THEN 1 ELSE 2 END
JOIN bil_invoice i ON i.student_id = d.student_id AND i.type = 'UTILITY' AND i.title = 'Utility · ' || m.label
WHERE d.scenario IN ('S19', 'S20', 'S21');

INSERT INTO bil_utility_warning (allocation_id, student_id, term_id, building_id, level, invoice_id, overdue_count, debt,
                                 terminate_on, issued_at)
SELECT i.allocation_id, i.student_id, i.term_id, i.building_id, 'FINAL', i.id, 2,
       (SELECT sum(u.amount) FROM demo_util_share u WHERE u.student_id = d.student_id AND u.overdue),
       CASE WHEN d.scenario = 'S21' THEN t.today - 2 ELSE t.today + 7 END, t.now - interval '3 days'
FROM demo_res d CROSS JOIN demo_t t
JOIN demo_util_month m ON m.age = 1
JOIN bil_invoice i ON i.student_id = d.student_id AND i.type = 'UTILITY' AND i.title = 'Utility · ' || m.label
WHERE d.scenario IN ('S20', 'S21');

-- S21's final warning ran out two days ago: the termination started and closed its warnings.
UPDATE bil_utility_warning w SET closed_at = t.now - interval '2 days', closed_reason = 'TERMINATED'
FROM demo_res d CROSS JOIN demo_t t WHERE d.scenario = 'S21' AND w.student_id = d.student_id;

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

-- Their Balances (B, C): paid, unpaid until the deadline (S17's moved to its approved arrival day), or void when forfeited.
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
