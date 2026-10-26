-- =====================================================================
-- CampusStay FPT — V52: enrollment reconciliation (Change Specification v2
-- phase 6; D-28, spec §6.12, §12). A Manager uploads the enrolled list (or a
-- list of leavers) for a Term; it is compared with the residents, continuing
-- residents and applicants of the Term:
--   1 a resident, continuing resident or applicant who is not enrolled (or is
--     on the leavers list) — resolved with a note; "not enrolled" cancels the
--     next-Term Allocation, rejects the Application or terminates the stay;
--   2 a resident not found on the enrolled list — the Manager checks it;
--   3 a student code of the file that does not exist — for information;
--   4 an enrollment status that changed — the directory is updated.
-- The next-Term fees wait until no item of groups 1–2 is open.
-- =====================================================================

CREATE TABLE auth_reconciliation (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id     BIGINT        NOT NULL REFERENCES cfg_term (id),
    kind        VARCHAR(8)    NOT NULL CHECK (kind IN ('ENROLLED', 'LEAVERS')),
    file_name   VARCHAR(200)  NOT NULL,
    rows_read   INT           NOT NULL CHECK (rows_read >= 0),
    created_by  BIGINT        NOT NULL REFERENCES auth_user (id),
    created_at  TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ix_reconciliation_term ON auth_reconciliation (term_id, created_at DESC);

CREATE TABLE auth_reconciliation_item (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reconciliation_id BIGINT        NOT NULL REFERENCES auth_reconciliation (id) ON DELETE CASCADE,
    grp               SMALLINT      NOT NULL CHECK (grp BETWEEN 1 AND 4),
    student_id        BIGINT        REFERENCES auth_user (id),           -- null in group 3
    student_code      VARCHAR(20)   NOT NULL,
    student_name      VARCHAR(150),
    roles             VARCHAR(60),                                       -- RESIDENT, CONTINUING, APPLICANT
    file_status       VARCHAR(12),                                       -- the enrollment the file gives
    directory_status  VARCHAR(12),                                       -- the directory's before the file
    line_no           INT,
    status            VARCHAR(8)    NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'INFO')),
    outcome           VARCHAR(12)   CHECK (outcome IN ('NOT_ENROLLED', 'ENROLLED')),
    note              VARCHAR(500),
    resolved_by       BIGINT        REFERENCES auth_user (id),
    resolved_at       TIMESTAMPTZ,
    CONSTRAINT ck_reconciliation_open CHECK ((status = 'OPEN') = (grp IN (1, 2) AND resolved_at IS NULL)),
    CONSTRAINT ck_reconciliation_resolved CHECK (status <> 'RESOLVED'
        OR (outcome IS NOT NULL AND note IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE INDEX ix_reconciliation_item ON auth_reconciliation_item (reconciliation_id, grp, status);

-- ---------- read contract for reports ----------
CREATE VIEW rpt_v_reconciliation_item AS
SELECT i.id, r.term_id, r.kind, i.grp, i.status, i.outcome, r.created_at, i.resolved_at
FROM auth_reconciliation_item i JOIN auth_reconciliation r ON r.id = i.reconciliation_id;
