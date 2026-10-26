-- =====================================================================
-- CampusStay FPT — V51: next-Term requests (Change Specification v2 phase 6;
-- D-04, D-10, D-14, D-30, spec §6.10, §6.11, §12, §13).
--   * Room-Change Requests and swaps now act on next-Term Allocations: their
--     term_id is the next Term and they take effect there. Prices never differ
--     any more (the prorated charges and credits are removed); price_difference
--     stays 0 for new rows.
--   * A Room Class change of a whole Room for the next Term, asked by one of its
--     continuing residents (or a Manager), needs the consent of every other
--     continuing resident; Staff then check the furniture and decide.
--   * Extension (+k Terms on the Stay) and end of stay after this Term.
-- =====================================================================

CREATE TABLE req_room_class_change (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code             VARCHAR(24)   NOT NULL UNIQUE,                     -- CC-SU31-000004
    term_id          BIGINT        NOT NULL REFERENCES cfg_term (id),   -- the Term it takes effect in
    room_id          BIGINT        NOT NULL REFERENCES inv_room (id),
    building_id      BIGINT        NOT NULL REFERENCES inv_building (id),
    room_code        VARCHAR(20)   NOT NULL,
    from_class_id    BIGINT        NOT NULL REFERENCES cfg_room_class (id),
    to_class_id      BIGINT        NOT NULL REFERENCES cfg_room_class (id),
    requested_by     BIGINT        NOT NULL REFERENCES auth_user (id),
    requester_role   VARCHAR(8)    NOT NULL CHECK (requester_role IN ('STUDENT', 'MANAGER')),
    reason           VARCHAR(500),
    status           VARCHAR(16)   NOT NULL CHECK (status IN ('AWAITING_CONSENT', 'SUBMITTED', 'APPROVED', 'REJECTED',
                                                              'CANCELLED', 'SET_BACK')),
    sla_due_at       TIMESTAMPTZ,
    -- What the decision found: furniture missing and reserved from a store, extra items to remove.
    furniture        JSONB,
    decided_by       BIGINT        REFERENCES auth_user (id),
    decided_at       TIMESTAMPTZ,
    decision_note    VARCHAR(1000),
    submitted_at     TIMESTAMPTZ   NOT NULL,
    version          BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_class_change_classes CHECK (from_class_id <> to_class_id),
    CONSTRAINT ck_class_change_decided CHECK (status NOT IN ('APPROVED', 'REJECTED', 'SET_BACK') OR decided_at IS NOT NULL)
);
-- One open change per Room and Term.
CREATE UNIQUE INDEX ux_class_change_open ON req_room_class_change (room_id, term_id)
    WHERE status IN ('AWAITING_CONSENT', 'SUBMITTED');
CREATE INDEX ix_class_change_term ON req_room_class_change (term_id, status);

CREATE TABLE req_room_class_consent (
    change_id     BIGINT       NOT NULL REFERENCES req_room_class_change (id) ON DELETE CASCADE,
    student_id    BIGINT       NOT NULL REFERENCES auth_user (id),
    allocation_id BIGINT       NOT NULL REFERENCES asg_allocation (id),  -- the student's next-Term Allocation
    status        VARCHAR(8)   NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AGREED', 'DECLINED')),
    asked_at      TIMESTAMPTZ  NOT NULL,
    answered_at   TIMESTAMPTZ,
    PRIMARY KEY (change_id, student_id),
    CONSTRAINT ck_consent_answered CHECK ((status = 'PENDING') = (answered_at IS NULL))
);
CREATE INDEX ix_consent_student ON req_room_class_consent (student_id, status);

CREATE TABLE req_stay_request (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code           VARCHAR(24)   NOT NULL UNIQUE,                       -- ST-SU31-000007
    term_id        BIGINT        NOT NULL REFERENCES cfg_term (id),     -- the next Term
    student_id     BIGINT        NOT NULL REFERENCES auth_user (id),
    allocation_id  BIGINT        NOT NULL REFERENCES asg_allocation (id),
    building_id    BIGINT        NOT NULL REFERENCES inv_building (id),
    kind           VARCHAR(12)   NOT NULL CHECK (kind IN ('EXTENSION', 'END_OF_STAY')),
    extra_terms    SMALLINT      CHECK (extra_terms BETWEEN 1 AND 9),
    reason         VARCHAR(500),
    status         VARCHAR(10)   NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    automatic      BOOLEAN       NOT NULL DEFAULT FALSE,
    sla_due_at     TIMESTAMPTZ,
    decided_by     BIGINT        REFERENCES auth_user (id),
    decided_at     TIMESTAMPTZ,
    decision_note  VARCHAR(1000),
    submitted_at   TIMESTAMPTZ   NOT NULL,
    version        BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_stay_request_extension CHECK ((kind = 'EXTENSION') = (extra_terms IS NOT NULL)),
    CONSTRAINT ck_stay_request_rejected CHECK (status <> 'REJECTED' OR decision_note IS NOT NULL)
);
-- One open extension request per student and Term.
CREATE UNIQUE INDEX ux_stay_request_open ON req_stay_request (student_id, term_id) WHERE status = 'SUBMITTED';
CREATE INDEX ix_stay_request_term ON req_stay_request (term_id, status);

-- Requests made under the old rules (a move during the Term with a prorated price) are closed: from now on
-- every student request takes effect in the next Term (D-14).
UPDATE req_room_change SET status = 'CANCELLED', decided_at = now(), version = version + 1,
       decision_note = 'Closed: room changes now take effect in the next Term. Ask again in the requests window.'
WHERE status IN ('SUBMITTED', 'PENDING');
UPDATE req_swap SET status = 'CANCELLED', decided_at = now(), version = version + 1,
       decision_reason = 'Closed: swaps now take effect in the next Term. Ask again in the requests window.'
WHERE status IN ('INVITED', 'PENDING', 'TO_MANAGER');
UPDATE req_swap_post SET status = 'CLOSED', updated_at = now() WHERE status = 'ACTIVE';

-- ---------- read contract for reports ----------
CREATE VIEW rpt_v_room_change AS
SELECT id, code, term_id, student_id, building_id, kind, status, submitted_at, decided_at
FROM req_room_change;

CREATE OR REPLACE VIEW rpt_v_swap AS
SELECT id, term_id, a_building_id, b_building_id, status, created_at, decided_at
FROM req_swap;

CREATE VIEW rpt_v_room_class_change AS
SELECT id, code, term_id, room_id, building_id, from_class_id, to_class_id, status, submitted_at, decided_at
FROM req_room_class_change;

CREATE VIEW rpt_v_stay_request AS
SELECT id, code, term_id, student_id, building_id, kind, extra_terms, status, automatic, submitted_at, decided_at
FROM req_stay_request;
