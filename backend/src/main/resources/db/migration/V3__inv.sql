-- =====================================================================
-- CampusStay FPT — V3: INV (Building/Block, Floor, Room, Bed) and the
-- Block-scoped tables of AUTH and CFG that depend on Buildings.
-- =====================================================================

CREATE TABLE inv_building (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       VARCHAR(10)  NOT NULL UNIQUE,     -- Block code used by the API ("A", "B" ...)
    name       VARCHAR(100) NOT NULL,
    gender     CHAR(1)      NOT NULL CHECK (gender IN ('M', 'F')),
    status     VARCHAR(8)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version    BIGINT       NOT NULL DEFAULT 0
);

-- The Room Class is a property of the Floor (all Rooms on a Floor share it).
CREATE TABLE inv_floor (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id   BIGINT   NOT NULL REFERENCES inv_building (id),
    floor_no      SMALLINT NOT NULL CHECK (floor_no BETWEEN 0 AND 60),
    room_class_id BIGINT   NOT NULL REFERENCES cfg_room_class (id),
    CONSTRAINT ux_floor UNIQUE (building_id, floor_no)
);

-- Planned layout used by "bulk create rooms" (rooms per Room Type per Floor).
CREATE TABLE inv_floor_layout (
    floor_id     BIGINT   NOT NULL REFERENCES inv_floor (id) ON DELETE CASCADE,
    room_type_id BIGINT   NOT NULL REFERENCES cfg_room_type (id),
    room_count   SMALLINT NOT NULL CHECK (room_count BETWEEN 0 AND 200),
    PRIMARY KEY (floor_id, room_type_id)
);

CREATE TABLE inv_room (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code         VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. A-305
    building_id  BIGINT       NOT NULL REFERENCES inv_building (id),
    floor_id     BIGINT       NOT NULL REFERENCES inv_floor (id),
    room_type_id BIGINT       NOT NULL REFERENCES cfg_room_type (id),
    status       VARCHAR(16)  NOT NULL DEFAULT 'IN_SERVICE'
                 CHECK (status IN ('IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED')),
    oos_since    TIMESTAMPTZ,
    oos_reason   VARCHAR(40),
    oos_note     VARCHAR(500),
    oos_by       BIGINT REFERENCES auth_user (id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version      BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_room_oos CHECK (
        (status = 'OUT_OF_SERVICE') = (oos_since IS NOT NULL AND oos_reason IS NOT NULL)
    )
);
CREATE INDEX ix_room_building_floor ON inv_room (building_id, floor_id);
CREATE INDEX ix_room_type ON inv_room (room_type_id);

-- Keeps inv_room.building_id consistent with its Floor.
CREATE FUNCTION inv_room_building_matches_floor() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM inv_floor f WHERE f.id = NEW.floor_id AND f.building_id = NEW.building_id) THEN
        RAISE EXCEPTION 'Room % floor % does not belong to building %', NEW.code, NEW.floor_id, NEW.building_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inv_room_building
    BEFORE INSERT OR UPDATE OF floor_id, building_id ON inv_room
    FOR EACH ROW EXECUTE FUNCTION inv_room_building_matches_floor();

CREATE TABLE inv_bed (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT     NOT NULL REFERENCES inv_room (id),
    label   VARCHAR(4) NOT NULL,                 -- A, B, C ...
    status  VARCHAR(16) NOT NULL DEFAULT 'IN_SERVICE'
            CHECK (status IN ('IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED')),
    CONSTRAINT ux_bed UNIQUE (room_id, label)
);

-- ---------- Block scope for back-office users (AUTH) ----------
CREATE TABLE auth_user_block (
    user_id     BIGINT NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
    building_id BIGINT NOT NULL REFERENCES inv_building (id),
    PRIMARY KEY (user_id, building_id)
);
CREATE INDEX ix_user_block_building ON auth_user_block (building_id);

CREATE TABLE auth_staff_account_request (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id  BIGINT       NOT NULL REFERENCES inv_building (id),
    requested_by BIGINT       NOT NULL REFERENCES auth_user (id),
    name         VARCHAR(150) NOT NULL,
    email        VARCHAR(254) NOT NULL,
    role         VARCHAR(10)  NOT NULL CHECK (role IN ('STAFF', 'MANAGER')),
    status       VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    decided_by   BIGINT REFERENCES auth_user (id),
    decided_at   TIMESTAMPTZ
);

-- ---------- Block settings (CFG, edited by the Manager) ----------
CREATE TABLE cfg_block_settings (
    building_id BIGINT      PRIMARY KEY REFERENCES inv_building (id),
    desk_opens  TIME        NOT NULL,
    desk_closes TIME        NOT NULL,
    visit_from  TIME        NOT NULL,
    visit_until TIME        NOT NULL,
    quiet_from  TIME        NOT NULL,
    house_rules TEXT        NOT NULL DEFAULT '',
    edited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_by   BIGINT REFERENCES auth_user (id),
    version     BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_block_desk  CHECK (desk_opens < desk_closes),
    CONSTRAINT ck_block_visit CHECK (visit_from < visit_until)
);
