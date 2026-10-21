-- =====================================================================
-- CampusStay FPT — V17: student snapshot on refunds (S5)
-- The Manager's refund list is searched by name or student code and scoped
-- by Block: a refund for a student without a Bed (cancelled Application)
-- belongs to the Blocks of the student's gender, like their Invoices (V13).
-- BIL copies these fields because it must not read AUTH tables.
-- =====================================================================

ALTER TABLE bil_refund
    ADD COLUMN student_name VARCHAR(150),
    ADD COLUMN student_code VARCHAR(20),
    ADD COLUMN gender       CHAR(1) CHECK (gender IN ('M', 'F')),
    ADD COLUMN invoice_id   BIGINT REFERENCES bil_invoice (id);   -- the paid Invoice a rule refund comes from

UPDATE bil_refund r
SET student_name = u.display_name, student_code = s.student_code, gender = s.gender
FROM auth_user u JOIN auth_student s ON s.user_id = u.id
WHERE u.id = r.student_id;

ALTER TABLE bil_refund
    ALTER COLUMN student_name SET NOT NULL,
    ALTER COLUMN student_code SET NOT NULL,
    ALTER COLUMN gender SET NOT NULL;
CREATE INDEX ix_refund_term_gender ON bil_refund (term_id, gender, status);
