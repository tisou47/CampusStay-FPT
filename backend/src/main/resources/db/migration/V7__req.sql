-- =====================================================================
-- CampusStay FPT — V7: REQ (Room-Change Requests, swaps, swap board,
-- routing rules, SLA timers, escalations)
-- =====================================================================

CREATE TABLE req_room_change (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                  VARCHAR(24)  NOT NULL UNIQUE,      -- e.g. RC-SP27-000045
    term_id               BIGINT       NOT NULL REFERENCES cfg_term (id),
    student_id            BIGINT       NOT NULL REFERENCES auth_user (id),
    allocation_id         BIGINT       NOT NULL REFERENCES asg_allocation (id),
    kind                  VARCHAR(6)   NOT NULL CHECK (kind IN ('SAME', 'CLASS', 'TYPE')),
    target_room_type_id   BIGINT       NOT NULL REFERENCES cfg_room_type (id),
    target_room_class_id  BIGINT       NOT NULL REFERENCES cfg_room_class (id),
    reason_code           VARCHAR(40)  NOT NULL,             -- cfg_lookup ROOM_CHANGE_REASON
    details               VARCHAR(1000),
    price_difference      BIGINT       NOT NULL DEFAULT 0,   -- prorated; >0 = student pays
    status                VARCHAR(10)  NOT NULL DEFAULT 'SUBMITTED'
                          CHECK (status IN ('SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    assignee_id           BIGINT REFERENCES auth_user (id),
    sla_due_at            TIMESTAMPTZ,
    target_bed_id         BIGINT REFERENCES inv_bed (id),
    decided_by            BIGINT REFERENCES auth_user (id),
    decided_at            TIMESTAMPTZ,
    decision_reason       VARCHAR(40),                       -- cfg_lookup ROOM_CHANGE_REJECT_REASON
    decision_note         VARCHAR(1000),
    invoice_id            BIGINT REFERENCES bil_invoice (id),
    submitted_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version               BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_rc_approved CHECK (status <> 'APPROVED' OR target_bed_id IS NOT NULL),
    CONSTRAINT ck_rc_rejected CHECK (status <> 'REJECTED' OR decision_reason IS NOT NULL)
);
-- One open Room-Change Request per student per Term.
CREATE UNIQUE INDEX ux_rc_one_open ON req_room_change (student_id, term_id)
    WHERE status IN ('SUBMITTED', 'PENDING');
CREATE INDEX ix_rc_term_status ON req_room_change (term_id, status);

CREATE TABLE req_swap_post (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id               BIGINT      NOT NULL REFERENCES cfg_term (id),
    allocation_id         BIGINT      NOT NULL REFERENCES asg_allocation (id),
    wanted_building_id    BIGINT      REFERENCES inv_building (id),     -- NULL = any Block
    wanted_room_type_id   BIGINT      NOT NULL REFERENCES cfg_room_type (id),
    wanted_room_class_id  BIGINT      NOT NULL REFERENCES cfg_room_class (id),
    status                VARCHAR(8)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    expires_at            TIMESTAMPTZ NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_swap_post_one_active ON req_swap_post (allocation_id) WHERE status = 'ACTIVE';

-- A swap starts as an invitation (A → B); after B accepts it waits for Staff
-- (and the Manager when it crosses Blocks).
CREATE TABLE req_swap (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id              BIGINT       NOT NULL REFERENCES cfg_term (id),
    kind                 VARCHAR(6)   NOT NULL CHECK (kind IN ('DIRECT', 'BOARD')),
    post_id              BIGINT       REFERENCES req_swap_post (id),
    a_allocation_id      BIGINT       NOT NULL REFERENCES asg_allocation (id),
    b_allocation_id      BIGINT       NOT NULL REFERENCES asg_allocation (id),
    status               VARCHAR(10)  NOT NULL DEFAULT 'INVITED'
                         CHECK (status IN ('INVITED', 'DECLINED', 'EXPIRED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    cross_block          BOOLEAN      NOT NULL,
    price_difference     BIGINT       NOT NULL DEFAULT 0,
    reason               VARCHAR(500),
    expires_at           TIMESTAMPTZ  NOT NULL,
    agreed_at            TIMESTAMPTZ,
    decided_by           BIGINT REFERENCES auth_user (id),
    decided_at           TIMESTAMPTZ,
    decision_reason      VARCHAR(500),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version              BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_swap_distinct CHECK (a_allocation_id <> b_allocation_id),
    CONSTRAINT ck_swap_rejected CHECK (status <> 'REJECTED' OR decision_reason IS NOT NULL)
);
CREATE INDEX ix_swap_term_status ON req_swap (term_id, status);
CREATE UNIQUE INDEX ux_swap_one_open_a ON req_swap (a_allocation_id) WHERE status IN ('INVITED', 'PENDING');

CREATE TABLE req_routing_rule (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id  BIGINT      NOT NULL REFERENCES inv_building (id),
    request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('MAINTENANCE', 'ROOM_CHANGE', 'SWAP', 'PAYMENT', 'LATE_CHECK_IN')),
    scope        VARCHAR(100) NOT NULL DEFAULT 'ALL',     -- e.g. floors "1-5" or ALL
    condition    VARCHAR(100),                             -- e.g. maintenance category code
    assignee_id  BIGINT      NOT NULL REFERENCES auth_user (id),
    fallback_id  BIGINT      REFERENCES auth_user (id),
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order   SMALLINT    NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    version      BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_routing_fallback CHECK (fallback_id IS NULL OR fallback_id <> assignee_id)
);
CREATE INDEX ix_routing_block ON req_routing_rule (building_id, request_type) WHERE active;

-- SLA timers per Block (hours).
CREATE TABLE req_sla_policy (
    building_id       BIGINT   PRIMARY KEY REFERENCES inv_building (id),
    urgent_hours      SMALLINT NOT NULL CHECK (urgent_hours > 0),
    normal_hours      SMALLINT NOT NULL CHECK (normal_hours > 0),
    room_change_hours SMALLINT NOT NULL CHECK (room_change_hours > 0),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by        BIGINT REFERENCES auth_user (id)
);

CREATE TABLE req_escalation (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id           BIGINT       NOT NULL REFERENCES inv_building (id),
    term_id               BIGINT       REFERENCES cfg_term (id),
    kind                  VARCHAR(20)  NOT NULL CHECK (kind IN ('SLA_BREACH', 'NO_ASSIGNEE', 'REOPENED', 'NO_BED', 'MANUAL')),
    source_type           VARCHAR(20)  NOT NULL CHECK (source_type IN ('MAINTENANCE', 'ROOM_CHANGE', 'SWAP', 'APPLICATION')),
    source_id             BIGINT       NOT NULL,
    title                 VARCHAR(200) NOT NULL,
    why                   VARCHAR(500) NOT NULL,
    tone                  VARCHAR(10)  NOT NULL DEFAULT 'WARNING' CHECK (tone IN ('INFO', 'WARNING', 'DANGER')),
    owner_id              BIGINT REFERENCES auth_user (id),
    status                VARCHAR(8)   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'HANDLED')),
    opened_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    handled_action        VARCHAR(20)  CHECK (handled_action IN ('REASSIGN', 'TEMPORARY_BED', 'CLOSED')),
    handled_at            TIMESTAMPTZ,
    handled_by            BIGINT REFERENCES auth_user (id),
    handled_note          VARCHAR(1000),
    version               BIGINT       NOT NULL DEFAULT 0
);
-- One open escalation per source item.
CREATE UNIQUE INDEX ux_escalation_open ON req_escalation (source_type, source_id) WHERE status = 'OPEN';
CREATE INDEX ix_escalation_block ON req_escalation (building_id, status);

CREATE TABLE req_escalation_event (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    escalation_id BIGINT       NOT NULL REFERENCES req_escalation (id) ON DELETE CASCADE,
    text          VARCHAR(300) NOT NULL,
    at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
