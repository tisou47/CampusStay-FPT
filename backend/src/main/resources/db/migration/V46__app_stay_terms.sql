-- =====================================================================
-- CampusStay FPT — V46: Gia hạn on the Application and forfeited
-- Applications (Change Specification v2 phase 5; D-13, spec §6.6, §12).
--   * stay_terms: the number of Terms (1–9) the student wants to stay,
--     chosen on the wizard (capped by stay.max_terms and the semesters left).
--     Existing Applications keep 1.
--   * FORFEITED: the Bed was allocated but the Balance was not paid in time
--     (or two payment claims were rejected); the Deposit is kept. It still
--     counts as the student's Application of the Term.
-- =====================================================================

ALTER TABLE app_application ADD COLUMN stay_terms SMALLINT NOT NULL DEFAULT 1 CHECK (stay_terms BETWEEN 1 AND 9);

ALTER TABLE app_application DROP CONSTRAINT app_application_status_check;
ALTER TABLE app_application ADD CONSTRAINT ck_app_status CHECK (status IN ('DRAFT', 'AWAITING_ROOMMATE',
    'AWAITING_DEPOSIT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'WAITLISTED', 'ALLOCATED', 'REJECTED', 'CANCELLED',
    'EXPIRED', 'FORFEITED'));

CREATE OR REPLACE VIEW rpt_v_application AS
SELECT id, code, term_id, student_id, student_name, student_code, gender, room_type_id, room_class_id, status,
       created_at, submitted_at, deposit_due_at, stay_terms
FROM app_application;
