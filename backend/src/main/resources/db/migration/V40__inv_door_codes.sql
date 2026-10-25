-- =====================================================================
-- CampusStay FPT — V40: door codes (Change Specification v2 phase 3, ADR-23,
-- spec D-18, §6.8).
--   * One current code per Room (6 digits), stored encrypted (AES-GCM with the
--     server's DOOR_CODE_KEY; the database never holds a readable code).
--     Proposed (entered, imported or drawn at random by the Block's Staff) →
--     Active (confirmed on the lock; the previous one is Retired) — or
--     Cancelled when a proposal is dropped.
--   * A rotation task opens for a Room whenever a resident leaves it
--     (check-out, a move to another Room) and closes when a new code is
--     confirmed.
-- =====================================================================

CREATE TABLE inv_door_code (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id      BIGINT       NOT NULL REFERENCES inv_room (id),
    code_cipher  VARCHAR(100) NOT NULL,          -- base64(iv ‖ ciphertext ‖ tag)
    status       VARCHAR(10)  NOT NULL CHECK (status IN ('PROPOSED', 'ACTIVE', 'RETIRED', 'CANCELLED')),
    source       VARCHAR(8)   NOT NULL CHECK (source IN ('MANUAL', 'RANDOM', 'IMPORT')),
    proposed_by  BIGINT       NOT NULL REFERENCES auth_user (id),
    proposed_at  TIMESTAMPTZ  NOT NULL,
    confirmed_by BIGINT       REFERENCES auth_user (id),
    confirmed_at TIMESTAMPTZ,
    ended_at     TIMESTAMPTZ,
    CONSTRAINT ck_door_code_confirmed CHECK ((status IN ('ACTIVE', 'RETIRED')) = (confirmed_at IS NOT NULL)),
    CONSTRAINT ck_door_code_ended CHECK ((status IN ('RETIRED', 'CANCELLED')) = (ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_door_code_active ON inv_door_code (room_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX ux_door_code_proposed ON inv_door_code (room_id) WHERE status = 'PROPOSED';
CREATE INDEX ix_door_code_room ON inv_door_code (room_id, proposed_at DESC);

CREATE TABLE inv_door_code_task (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id      BIGINT      NOT NULL REFERENCES inv_room (id),
    reason       VARCHAR(10) NOT NULL CHECK (reason IN ('CHECK_OUT', 'MOVE_OUT')),
    created_at   TIMESTAMPTZ NOT NULL,
    done_at      TIMESTAMPTZ,
    door_code_id BIGINT      REFERENCES inv_door_code (id),
    CONSTRAINT ck_door_task_done CHECK ((done_at IS NULL) = (door_code_id IS NULL))
);
-- One open rotation task per Room: a second departure before the new code joins the same task.
CREATE UNIQUE INDEX ux_door_task_open ON inv_door_code_task (room_id) WHERE done_at IS NULL;
