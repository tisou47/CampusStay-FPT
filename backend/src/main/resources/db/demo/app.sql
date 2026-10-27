-- =====================================================================
-- Demo data — Applications (APP): every resident of Term N was assigned
-- through an Application; the new students of N+1 apply, pay their
-- Deposit, are reviewed and (from stage B) assigned, waitlisted or, in C,
-- forfeited. Prices and the Deposit come from each Term's price table.
-- =====================================================================

-- Term N: the residents' Applications (Allocated).
INSERT INTO app_application (id, code, term_id, student_id, room_type_id, room_class_id, term_price, surcharge_rate,
                             deposit_amount, status, roommate_mode, contact, consent_matching, consent_rules,
                             consented_at, deposit_due_at, submitted_at, reviewed_by, reviewed_at, created_at, updated_at,
                             student_name, student_code, gender, stay_terms)
OVERRIDING SYSTEM VALUE
WITH src AS (
    SELECT nextval(pg_get_serial_sequence('app_application', 'id')) AS id, d.*,
           t.n_reg_open + interval '1 hour' * (d.h * 3) AS created
    FROM demo_res d CROSS JOIN demo_t t)
SELECT s.id, 'APP-' || t.n_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.n_id, s.student_id,
       s.room_type_id, s.room_class_id, p.price, rc.surcharge_rate,
       round(p.price * cfg.deposit_percent / 100 / 1000) * 1000, 'ALLOCATED', 'NONE',
       jsonb_build_object('phone', st.phone, 'email', NULL, 'emergencyName', st.emergency_name,
                          'relationship', st.emergency_relationship, 'emergencyPhone', st.emergency_phone),
       TRUE, TRUE, s.created, s.created + interval '48 hours', s.created + interval '2 hours',
       (SELECT id FROM demo_staff WHERE account = 'manager.' || lower(s.block)), t.n_results - interval '3 days',
       s.created, t.n_results, s.name, s.code, s.gender, s.committed
FROM src s CROSS JOIN demo_t t CROSS JOIN cfg_term cfg
JOIN cfg_term_price p ON p.term_id = cfg.id AND p.room_type_id = s.room_type_id AND p.room_class_id = s.room_class_id
JOIN cfg_room_class rc ON rc.id = s.room_class_id
JOIN auth_student st ON st.user_id = s.student_id
WHERE cfg.id = t.n_id;

-- Term N+1: the new students. Awaiting Deposit ones applied in the last day (S05 a little earlier: its first claim
-- was rejected).
INSERT INTO app_application (id, code, term_id, student_id, room_type_id, room_class_id, term_price, surcharge_rate,
                             deposit_amount, status, roommate_mode, contact, consent_matching, consent_rules,
                             consented_at, deposit_due_at, submitted_at, reviewed_by, reviewed_at, created_at, updated_at,
                             student_name, student_code, gender, stay_terms)
OVERRIDING SYSTEM VALUE
WITH src AS (
    SELECT nextval(pg_get_serial_sequence('app_application', 'id')) AS id, a.*,
           CASE WHEN a.status = 'AWAITING_DEPOSIT' AND a.scenario = 'S05' THEN t.now - interval '30 hours'
                WHEN a.status = 'AWAITING_DEPOSIT' THEN t.now - interval '1 hour' * (2 + a.h % 18)
                ELSE least(t.x_reg_open + interval '1 hour' * (a.h * 2 + 1), t.now - interval '2 days') END AS created
    FROM demo_app a CROSS JOIN demo_t t)
SELECT s.id, 'APP-' || t.x_code || '-' || lpad(s.id::text, greatest(6, length(s.id::text)), '0'), t.x_id, s.student_id,
       s.room_type_id, s.room_class_id, p.price, rc.surcharge_rate,
       round(p.price * cfg.deposit_percent / 100 / 1000) * 1000, s.status, 'NONE',
       jsonb_build_object('phone', st.phone, 'email', NULL, 'emergencyName', st.emergency_name,
                          'relationship', st.emergency_relationship, 'emergencyPhone', st.emergency_phone),
       TRUE, TRUE, s.created, s.created + interval '48 hours',
       CASE WHEN s.status <> 'AWAITING_DEPOSIT' THEN s.created + interval '3 hours' END,
       CASE WHEN s.status IN ('APPROVED', 'ALLOCATED', 'WAITLISTED', 'FORFEITED')
            THEN (SELECT id FROM demo_staff WHERE account = 'manager.a') END,
       CASE WHEN s.status IN ('APPROVED', 'ALLOCATED', 'WAITLISTED', 'FORFEITED')
            THEN least(s.created + interval '1 day', t.now - interval '1 hour') END,
       s.created, s.created + interval '3 hours', s.name, s.code, s.gender, 1 + s.h % 2
FROM src s CROSS JOIN demo_t t CROSS JOIN cfg_term cfg
JOIN cfg_term_price p ON p.term_id = cfg.id AND p.room_type_id = s.room_type_id AND p.room_class_id = s.room_class_id
JOIN cfg_room_class rc ON rc.id = s.room_class_id
JOIN auth_student st ON st.user_id = s.student_id
WHERE cfg.id = t.x_id;

-- Their history, as the student's Application page shows it.
INSERT INTO app_application_event (application_id, status, text, actor_id, at)
SELECT a.id, 'AWAITING_DEPOSIT', 'Application created; the Deposit is due within 48 hours', a.student_id, a.created_at
FROM app_application a;

INSERT INTO app_application_event (application_id, status, text, actor_id, at)
SELECT a.id, 'SUBMITTED', 'Deposit paid; the Application is submitted', a.student_id, a.submitted_at
FROM app_application a WHERE a.submitted_at IS NOT NULL;

INSERT INTO app_application_event (application_id, status, text, actor_id, at)
SELECT a.id, CASE WHEN a.status = 'WAITLISTED' THEN 'WAITLISTED' ELSE 'APPROVED' END,
       CASE WHEN a.status = 'WAITLISTED' THEN 'Approved; no Bed of this kind was left in Round 1 (waitlisted)'
            ELSE 'Application approved' END,
       a.reviewed_by, a.reviewed_at
FROM app_application a WHERE a.reviewed_at IS NOT NULL;

INSERT INTO app_application_event (application_id, status, text, at)
SELECT a.id, 'FORFEITED', 'The Balance was not paid by its deadline: the Bed was released and the Deposit kept',
       t.x_balance_due + interval '10 minutes'
FROM app_application a CROSS JOIN demo_t t WHERE a.status = 'FORFEITED';
