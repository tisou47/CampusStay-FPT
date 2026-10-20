-- =====================================================================
-- CampusStay FPT — V5: ASG (assignment runs, proposals, Allocation,
-- Check-in, Check-out, late check-ins)
-- =====================================================================

CREATE TABLE asg_run (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id               BIGINT       NOT NULL REFERENCES cfg_term (id),
    kind                  VARCHAR(8)   NOT NULL CHECK (kind IN ('DRY_RUN', 'REAL', 'ROUND2')),
    status                VARCHAR(12)  NOT NULL DEFAULT 'RUNNING'
                          CHECK (status IN ('RUNNING', 'PROPOSED', 'IN_REVIEW', 'COMMITTED',
                                            'FAILED', 'DISCARDED')),
    stage                 SMALLINT     NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
    matching_snapshot_id  BIGINT       NOT NULL REFERENCES cfg_matching_snapshot (id),
    started_by            BIGINT       NOT NULL REFERENCES auth_user (id),
    started_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at           TIMESTAMPTZ,
    input_count           INT          NOT NULL DEFAULT 0,
    proposed_count        INT          NOT NULL DEFAULT 0,
    conflict_count        INT          NOT NULL DEFAULT 0,
    waitlisted_count      INT          NOT NULL DEFAULT 0,
    average_fit           NUMERIC(5,4),
    error_message         VARCHAR(1000),
    version               BIGINT       NOT NULL DEFAULT 0
);
-- At most one live (non-dry) run per Term: protects against two Staff
-- starting the engine at the same time.
CREATE UNIQUE INDEX ux_asg_one_live_run ON asg_run (term_id)
    WHERE kind <> 'DRY_RUN' AND status IN ('RUNNING', 'PROPOSED', 'IN_REVIEW');
CREATE INDEX ix_asg_run_term ON asg_run (term_id, started_at DESC);

-- Per-Block review and approval of a run's proposal.
CREATE TABLE asg_run_block (
    run_id        BIGINT      NOT NULL REFERENCES asg_run (id) ON DELETE CASCADE,
    building_id   BIGINT      NOT NULL REFERENCES inv_building (id),
    status        VARCHAR(10) NOT NULL DEFAULT 'REVIEW'
                  CHECK (status IN ('REVIEW', 'SUBMITTED', 'APPROVED', 'RETURNED', 'COMMITTED')),
    submitted_by  BIGINT REFERENCES auth_user (id),
    submitted_at  TIMESTAMPTZ,
    decided_by    BIGINT REFERENCES auth_user (id),
    decided_at    TIMESTAMPTZ,
    comment       VARCHAR(1000),
    committed_at  TIMESTAMPTZ,
    version       BIGINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, building_id),
    CONSTRAINT ck_run_block_returned CHECK (status <> 'RETURNED' OR comment IS NOT NULL)
);

CREATE TABLE asg_proposal_item (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id          BIGINT       NOT NULL REFERENCES asg_run (id) ON DELETE CASCADE,
    application_id  BIGINT       NOT NULL REFERENCES app_application (id),
    building_id     BIGINT       REFERENCES inv_building (id),
    bed_id          BIGINT       REFERENCES inv_bed (id),
    fit             NUMERIC(5,4),                         -- 0..1 matching score
    issue_code      VARCHAR(40),                          -- NULL = no conflict
    issue_tone      VARCHAR(10)  CHECK (issue_tone IN ('INFO', 'WARNING', 'DANGER')),
    resolved        BOOLEAN      NOT NULL DEFAULT FALSE,
    resolution_key  VARCHAR(40),
    waitlisted      BOOLEAN      NOT NULL DEFAULT FALSE,
    reason          VARCHAR(500),
    CONSTRAINT ux_proposal_app UNIQUE (run_id, application_id),
    CONSTRAINT ck_proposal_waitlist CHECK (NOT waitlisted OR bed_id IS NULL)
);
-- A run never proposes the same Bed twice.
CREATE UNIQUE INDEX ux_proposal_bed ON asg_proposal_item (run_id, bed_id) WHERE bed_id IS NOT NULL;
CREATE INDEX ix_proposal_block ON asg_proposal_item (run_id, building_id);

-- Allocation = a student holds a Bed for a Term.
CREATE TABLE asg_allocation (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id          BIGINT       NOT NULL REFERENCES cfg_term (id),
    application_id   BIGINT       REFERENCES app_application (id),
    student_id       BIGINT       NOT NULL REFERENCES auth_user (id),
    bed_id           BIGINT       NOT NULL REFERENCES inv_bed (id),
    status           VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED', 'CANCELLED')),
    source           VARCHAR(12)  NOT NULL
                     CHECK (source IN ('ASSIGNMENT', 'ROUND2', 'ROOM_CHANGE', 'SWAP', 'TEMPORARY', 'MANUAL')),
    run_id           BIGINT       REFERENCES asg_run (id),
    previous_allocation_id BIGINT REFERENCES asg_allocation (id),
    allocated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    allocated_by     BIGINT REFERENCES auth_user (id),
    checked_in_at    TIMESTAMPTZ,
    checked_in_by    BIGINT REFERENCES auth_user (id),
    hand_over_items  TEXT[]       NOT NULL DEFAULT '{}',
    check_in_note    VARCHAR(500),
    ended_at         TIMESTAMPTZ,
    end_reason       VARCHAR(20)  CHECK (end_reason IN ('CHECK_OUT', 'ROOM_CHANGE', 'SWAP', 'CANCELLED', 'TERM_END')),
    version          BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_alloc_ended CHECK ((status = 'ACTIVE') = (ended_at IS NULL))
);
-- Core double-booking guarantees (DB level, not only code):
CREATE UNIQUE INDEX ux_alloc_bed_term     ON asg_allocation (bed_id, term_id)     WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX ux_alloc_student_term ON asg_allocation (student_id, term_id) WHERE status = 'ACTIVE';
CREATE INDEX ix_alloc_term ON asg_allocation (term_id, status);

CREATE TABLE asg_check_out (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id   BIGINT       NOT NULL UNIQUE REFERENCES asg_allocation (id),
    reason          VARCHAR(40)  NOT NULL,              -- cfg_lookup CHECK_OUT_REASON
    status          VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DRAFT', 'COMPLETED')),
    electricity     NUMERIC(10,1),
    water           NUMERIC(10,1),
    condition_good  BOOLEAN,
    key_returned    BOOLEAN,
    damage_charge   BIGINT       NOT NULL DEFAULT 0 CHECK (damage_charge >= 0),
    refund_amount   BIGINT       CHECK (refund_amount >= 0),
    refund_status   VARCHAR(12)  CHECK (refund_status IN ('NONE', 'PENDING', 'APPROVED', 'PAID', 'REJECTED')),
    requested_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    completed_by    BIGINT REFERENCES auth_user (id),
    version         BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_checkout_completed CHECK (status <> 'COMPLETED'
        OR (completed_at IS NOT NULL AND electricity IS NOT NULL AND water IS NOT NULL
            AND condition_good IS NOT NULL AND key_returned IS NOT NULL))
);

CREATE TABLE asg_late_check_in (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id      BIGINT       NOT NULL REFERENCES asg_allocation (id),
    reason             VARCHAR(500) NOT NULL,
    received_by        BIGINT REFERENCES auth_user (id),
    requested_for      DATE         NOT NULL,
    evidence_file_id   BIGINT REFERENCES shared_file (id),
    window_closed_at   TIMESTAMPTZ  NOT NULL,
    suggested_deadline DATE,
    status             VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    deadline           DATE,
    decision_reason    VARCHAR(500),
    decided_by         BIGINT REFERENCES auth_user (id),
    decided_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version            BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_late_approved CHECK (status <> 'APPROVED' OR deadline IS NOT NULL),
    CONSTRAINT ck_late_rejected CHECK (status <> 'REJECTED' OR decision_reason IS NOT NULL)
);
CREATE UNIQUE INDEX ux_late_one_pending ON asg_late_check_in (allocation_id) WHERE status = 'PENDING';
