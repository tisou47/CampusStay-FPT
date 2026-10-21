-- =====================================================================
-- CampusStay FPT — V13: student snapshot on Applications and Invoices (S3)
-- Staff lists search by name or student code and are scoped by Block. A
-- Block houses one gender, so an Application (no Bed yet) belongs to the
-- Blocks of its student's gender. APP and BIL keep these fields themselves
-- because they must not read AUTH tables; they are copied when the row is
-- created, like the contact snapshot.
-- =====================================================================

ALTER TABLE app_application
    ADD COLUMN student_name VARCHAR(150),
    ADD COLUMN student_code VARCHAR(20),
    ADD COLUMN gender       CHAR(1) CHECK (gender IN ('M', 'F'));

UPDATE app_application a
SET student_name = u.display_name, student_code = s.student_code, gender = s.gender
FROM auth_user u JOIN auth_student s ON s.user_id = u.id
WHERE u.id = a.student_id;

ALTER TABLE app_application
    ALTER COLUMN student_name SET NOT NULL,
    ALTER COLUMN student_code SET NOT NULL,
    ALTER COLUMN gender SET NOT NULL;
CREATE INDEX ix_app_term_gender_status ON app_application (term_id, gender, status);

-- Invoices: the Block is known once the student holds a Bed (Balance and
-- later Invoices); Deposits are scoped by gender like their Application.
ALTER TABLE bil_invoice
    ADD COLUMN student_name VARCHAR(150),
    ADD COLUMN student_code VARCHAR(20),
    ADD COLUMN gender       CHAR(1) CHECK (gender IN ('M', 'F')),
    ADD COLUMN building_id  BIGINT REFERENCES inv_building (id);

UPDATE bil_invoice i
SET student_name = u.display_name, student_code = s.student_code, gender = s.gender
FROM auth_user u JOIN auth_student s ON s.user_id = u.id
WHERE u.id = i.student_id;

ALTER TABLE bil_invoice
    ALTER COLUMN student_name SET NOT NULL,
    ALTER COLUMN student_code SET NOT NULL,
    ALTER COLUMN gender SET NOT NULL;
CREATE INDEX ix_invoice_term_gender ON bil_invoice (term_id, gender, status);
CREATE INDEX ix_invoice_building ON bil_invoice (building_id, status);
