-- =====================================================================
-- CampusStay FPT — V45: residence, forfeits, late check-ins requested
-- online and terminations (Change Specification v2 phase 5; ADR-23,
-- spec §6.6, §6.8, §6.9, §6.15, §7, §12).
--   * A student becomes a resident when the Room's door code is released to
--     them (Balance paid, check-in start reached, the Room's code confirmed)
--     or, if the Room has no code yet, when the desk checks them in: the
--     earlier of the two is resident_at. Utility is shared from then on.
--     Students already checked in become residents with their code.
--   * An Allocation whose Balance was not paid in time is cancelled with
--     end reason FORFEIT (the Deposit is kept by the refund rule).
--   * Late check-ins can be requested online by the student (source ONLINE).
--   * Terminations: Notice sent → Checked out / Cancelled / Overdue, one open
--     per Allocation.
-- =====================================================================

ALTER TABLE asg_allocation
    ADD COLUMN resident_at      TIMESTAMPTZ,
    ADD COLUMN code_released_at TIMESTAMPTZ;
UPDATE asg_allocation SET resident_at = checked_in_at, code_released_at = checked_in_at WHERE checked_in_at IS NOT NULL;
ALTER TABLE asg_allocation ADD CONSTRAINT ck_alloc_code_resident
    CHECK (code_released_at IS NULL OR resident_at IS NOT NULL);
ALTER TABLE asg_allocation DROP CONSTRAINT asg_allocation_end_reason_check;
ALTER TABLE asg_allocation ADD CONSTRAINT ck_alloc_end_reason
    CHECK (end_reason IN ('CHECK_OUT', 'ROOM_CHANGE', 'SWAP', 'CANCELLED', 'TERM_END', 'FORFEIT'));
-- The release job looks only at paid-or-not Allocations still waiting for their code.
CREATE INDEX ix_alloc_waiting_code ON asg_allocation (term_id) WHERE status = 'ACTIVE' AND code_released_at IS NULL;

ALTER TABLE asg_late_check_in
    ADD COLUMN source VARCHAR(6) NOT NULL DEFAULT 'DESK' CHECK (source IN ('DESK', 'ONLINE'));

CREATE TABLE asg_termination (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id BIGINT       NOT NULL REFERENCES asg_allocation (id),
    term_id       BIGINT       NOT NULL REFERENCES cfg_term (id),
    student_id    BIGINT       NOT NULL REFERENCES auth_user (id),
    reason        VARCHAR(12)  NOT NULL CHECK (reason IN ('UTILITY_DEBT', 'NOT_ENROLLED', 'MANAGER')),
    note          VARCHAR(500),
    debt          BIGINT       CHECK (debt >= 0),                    -- Utility debt when it was triggered
    status        VARCHAR(12)  NOT NULL DEFAULT 'NOTICE_SENT'
                  CHECK (status IN ('NOTICE_SENT', 'OVERDUE', 'CHECKED_OUT', 'CANCELLED')),
    started_at    TIMESTAMPTZ  NOT NULL,
    started_by    BIGINT       REFERENCES auth_user (id),            -- null = the system (Utility debt)
    move_out_by   DATE         NOT NULL,
    overdue_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ,
    ended_by      BIGINT       REFERENCES auth_user (id),
    cancel_reason VARCHAR(500),
    version       BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_termination_note CHECK (reason <> 'MANAGER' OR note IS NOT NULL),
    CONSTRAINT ck_termination_cancel CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
    CONSTRAINT ck_termination_ended CHECK ((status IN ('CHECKED_OUT', 'CANCELLED')) = (ended_at IS NOT NULL)),
    CONSTRAINT ck_termination_overdue CHECK (status <> 'OVERDUE' OR overdue_at IS NOT NULL)
);
-- At most one live termination per Allocation.
CREATE UNIQUE INDEX ux_termination_open ON asg_termination (allocation_id) WHERE status IN ('NOTICE_SENT', 'OVERDUE');
CREATE INDEX ix_termination_term ON asg_termination (term_id, status);

-- ---------- read contract for reports ----------
CREATE OR REPLACE VIEW rpt_v_allocation AS
SELECT id, term_id, student_id, bed_id, status, allocated_at, checked_in_at, ended_at, end_reason, resident_at,
       code_released_at
FROM asg_allocation;

CREATE OR REPLACE VIEW rpt_v_late_check_in AS
SELECT id, allocation_id, status, created_at, source
FROM asg_late_check_in;

CREATE VIEW rpt_v_termination AS
SELECT id, allocation_id, term_id, student_id, reason, status, started_at, move_out_by, ended_at
FROM asg_termination;
