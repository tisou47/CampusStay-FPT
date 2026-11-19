-- =====================================================================
-- CampusStay FPT — V79: the check-in inventory (one per Allocation that
-- starts living in a Room), its items and photos, the moment Utility is
-- counted from, furniture conditions at check-out, and damage to shared
-- items that a student acknowledged.
--
-- Lifecycle: DRAFT (door code received) → SUBMITTED (the student filed it)
-- → FINAL (Staff confirmed it), or SUBMITTED → VERIFYING (Staff visit the
-- Room) → FINAL (the student agreed on the spot), or DRAFT → FINAL by the
-- deadline job (source AUTO). Staff may cancel it before it is final.
-- =====================================================================

CREATE TABLE asg_handover (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id         BIGINT        NOT NULL REFERENCES asg_allocation (id),
    room_id               BIGINT        NOT NULL REFERENCES inv_room (id),
    status                VARCHAR(10)   NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'SUBMITTED', 'VERIFYING', 'FINAL', 'CANCELLED')),
    source                VARCHAR(10)   CHECK (source IN ('STUDENT', 'VERIFIED', 'AUTO')),
    opened_at             TIMESTAMPTZ   NOT NULL,
    due_at                TIMESTAMPTZ   NOT NULL,
    submitted_at          TIMESTAMPTZ,
    electricity           NUMERIC(10,1) CHECK (electricity >= 0),
    water                 NUMERIC(10,1) CHECK (water >= 0),
    -- The Room's meters before the inventory (the latest recorded reading) and when they were read.
    baseline_electricity  NUMERIC(10,1),
    baseline_water        NUMERIC(10,1),
    baseline_at           TIMESTAMPTZ,
    comparison            VARCHAR(8)    CHECK (comparison IN ('MATCHED', 'MINOR', 'MAJOR')),
    comparison_note       VARCHAR(500),
    verify_requested_at   TIMESTAMPTZ,
    verify_requested_by   BIGINT REFERENCES auth_user (id),
    visit_at              TIMESTAMPTZ,
    verified_at           TIMESTAMPTZ,
    verified_by           BIGINT REFERENCES auth_user (id),
    verified_electricity  NUMERIC(10,1) CHECK (verified_electricity >= 0),
    verified_water        NUMERIC(10,1) CHECK (verified_water >= 0),
    student_comment       VARCHAR(500),
    confirm_reason        VARCHAR(500),
    finalized_at          TIMESTAMPTZ,
    finalized_by          BIGINT REFERENCES auth_user (id),
    utility_from          TIMESTAMPTZ,
    cancelled_reason      VARCHAR(300),
    late_note             VARCHAR(500),
    late_submitted_at     TIMESTAMPTZ,
    reminders_sent        SMALLINT      NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version               BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_handover_final CHECK (status <> 'FINAL' OR (finalized_at IS NOT NULL AND source IS NOT NULL))
);
CREATE UNIQUE INDEX ux_handover_allocation ON asg_handover (allocation_id) WHERE status <> 'CANCELLED';
CREATE INDEX ix_handover_status ON asg_handover (status, due_at);
CREATE INDEX ix_handover_room ON asg_handover (room_id, status);

-- One line per furniture item the student answers for: the items of their Bed and the Room's shared items.
CREATE TABLE asg_handover_item (
    handover_id        BIGINT       NOT NULL REFERENCES asg_handover (id) ON DELETE CASCADE,
    furniture_item_id  BIGINT       NOT NULL REFERENCES inv_furniture_item (id),
    condition          VARCHAR(10)  CHECK (condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING')),
    note               VARCHAR(300),
    -- What the Room's record said before (an inspection, another inventory or a check-out); null = none.
    baseline_condition VARCHAR(10)  CHECK (baseline_condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING')),
    baseline_source    VARCHAR(12)  CHECK (baseline_source IN ('INSPECTION', 'HANDOVER', 'CHECK_OUT')),
    -- Staff's answer after a visit; the final condition is this or, without a visit, the student's.
    verified_condition VARCHAR(10)  CHECK (verified_condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING')),
    verified_note      VARCHAR(300),
    -- The condition was there before the student moved in: never charged to them.
    pre_existing       BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (handover_id, furniture_item_id)
);

-- Photos: of an item, or of the meters (furniture_item_id null).
CREATE TABLE asg_handover_photo (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    handover_id       BIGINT      NOT NULL REFERENCES asg_handover (id) ON DELETE CASCADE,
    furniture_item_id BIGINT      REFERENCES inv_furniture_item (id),
    file_id           BIGINT      NOT NULL REFERENCES shared_file (id),
    taken_by          BIGINT      NOT NULL REFERENCES auth_user (id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_handover_photo ON asg_handover_photo (handover_id);

-- Utility is counted from the inventory's meter reading, not from the door code.
ALTER TABLE asg_allocation
    ADD COLUMN utility_from    TIMESTAMPTZ,
    ADD COLUMN eligible_at     TIMESTAMPTZ,
    ADD COLUMN handover_needed BOOLEAN NOT NULL DEFAULT FALSE;

-- The condition of each item at check-out and how its charge was computed.
ALTER TABLE asg_check_out_damage
    ADD COLUMN condition          VARCHAR(10) CHECK (condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING')),
    ADD COLUMN baseline_condition VARCHAR(10) CHECK (baseline_condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING')),
    ADD COLUMN unit_price         BIGINT CHECK (unit_price >= 0),
    ADD COLUMN percent            SMALLINT CHECK (percent BETWEEN 0 AND 100),
    ADD COLUMN source             VARCHAR(12) CHECK (source IN ('PERSONAL', 'ACKNOWLEDGED', 'OVERRIDE')),
    ADD COLUMN override_reason    VARCHAR(300),
    ADD COLUMN manager_review     VARCHAR(10) CHECK (manager_review IN ('PENDING', 'KEPT', 'DROPPED')),
    ADD COLUMN reviewed_by        BIGINT REFERENCES auth_user (id),
    ADD COLUMN reviewed_at        TIMESTAMPTZ,
    ADD COLUMN review_note        VARCHAR(300);

ALTER TABLE asg_check_out
    ADD COLUMN student_agreed_at TIMESTAMPTZ,
    ADD COLUMN student_present   BOOLEAN;

-- Damage to a shared item that Staff attribute to one student; charged only once the student acknowledges it.
CREATE TABLE asg_damage_claim (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id     BIGINT       NOT NULL REFERENCES asg_allocation (id),
    furniture_item_id BIGINT       NOT NULL REFERENCES inv_furniture_item (id),
    condition         VARCHAR(10)  NOT NULL CHECK (condition IN ('DAMAGED', 'MISSING')),
    note              VARCHAR(300),
    status            VARCHAR(12)  NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'ACKNOWLEDGED', 'DECLINED', 'EXPIRED', 'SETTLED')),
    amount            BIGINT       CHECK (amount >= 0),
    created_by        BIGINT       NOT NULL REFERENCES auth_user (id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    due_at            TIMESTAMPTZ  NOT NULL,
    answered_at       TIMESTAMPTZ
);
CREATE INDEX ix_damage_claim_allocation ON asg_damage_claim (allocation_id, status);
