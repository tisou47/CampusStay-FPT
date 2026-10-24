-- =====================================================================
-- CampusStay FPT — V36: accounts (Change Specification v2 phase 2;
-- ADR-26, spec §6.1, §6.2, O-3).
--   * auth_user.demo marks the fictional accounts of the base data and the
--     demo scenarios: only their emails go to the demo mailbox
--     (MAIL_REDIRECT_TO); real accounts receive their own email (O-3). The
--     base data marks its accounts in db/seed.
--   * Students sign up with Google. A directory record (auth_student) found
--     in the imported student list is Verified at once; a student who fills
--     the sign-up form waits for a Manager (Pending verification) and may be
--     Rejected (the account is then disabled and the reason is shown at
--     sign-in). Records of the base directory are Verified.
--   * A student list imported by a Manager is kept as a batch with one row
--     per line of the file: previewed first, applied on confirmation.
--   * "Not enrolled" is the enrollment status the import gives to students
--     missing from the file when the Manager asks for it.
-- =====================================================================

ALTER TABLE auth_user ADD COLUMN demo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE auth_student
    ADD COLUMN verification VARCHAR(10) NOT NULL DEFAULT 'VERIFIED'
        CONSTRAINT ck_student_verification CHECK (verification IN ('VERIFIED', 'PENDING', 'REJECTED')),
    ADD COLUMN verification_note VARCHAR(500),
    ADD COLUMN verified_at TIMESTAMPTZ,
    ADD COLUMN verified_by BIGINT REFERENCES auth_user (id),
    ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'DIRECTORY'
        CONSTRAINT ck_student_source CHECK (source IN ('DIRECTORY', 'IMPORT', 'SIGN_UP'));
CREATE INDEX ix_auth_student_pending ON auth_student (verification) WHERE verification <> 'VERIFIED';

ALTER TABLE auth_student DROP CONSTRAINT auth_student_enrollment_status_check;
ALTER TABLE auth_student ADD CONSTRAINT ck_student_enrollment
    CHECK (enrollment_status IN ('ENROLLED', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN', 'NOT_ENROLLED'));

CREATE TABLE auth_student_import (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name     VARCHAR(255) NOT NULL,
    uploaded_by   BIGINT       NOT NULL REFERENCES auth_user (id),
    uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status        VARCHAR(10)  NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'APPLIED')),
    fields        TEXT[]       NOT NULL,             -- the fields the file has; the others are kept as they are
    mark_missing  BOOLEAN,                           -- set when applied
    applied_by    BIGINT REFERENCES auth_user (id),
    applied_at    TIMESTAMPTZ,
    created_count INT,
    updated_count INT,
    unchanged_count INT,
    error_count   INT,
    verified_count INT,
    marked_count  INT
);
CREATE INDEX ix_student_import_uploaded ON auth_student_import (uploaded_at DESC);

CREATE TABLE auth_student_import_row (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_id    BIGINT       NOT NULL REFERENCES auth_student_import (id) ON DELETE CASCADE,
    line_no      INT          NOT NULL,
    student_code VARCHAR(20),
    data         JSONB        NOT NULL,              -- the parsed values of the line, by field
    outcome      VARCHAR(10)  NOT NULL CHECK (outcome IN ('NEW', 'UPDATE', 'UNCHANGED', 'ERROR')),
    message      VARCHAR(500),                       -- the error, or the fields that change
    user_id      BIGINT REFERENCES auth_user (id),   -- the account it matched or created
    UNIQUE (import_id, line_no)
);
CREATE INDEX ix_student_import_row_outcome ON auth_student_import_row (import_id, outcome);
