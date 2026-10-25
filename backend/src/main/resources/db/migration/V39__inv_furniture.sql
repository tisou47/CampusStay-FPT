-- =====================================================================
-- CampusStay FPT — V39: furniture (Change Specification v2 phase 3, ADR-24,
-- spec D-21, §6.19).
--   * Furniture types (Admin): name in English and Vietnamese, category, and
--     whether the type defines a Room Class (air conditioner, fridge …) or is
--     standard (bed, wardrobe …).
--   * Room Class requirements (Admin): how many items of each class-defining
--     type a Room of the class must have. INV owns them (spec §12 named them
--     cfg_…): they join furniture types and are checked against the items of
--     each Room, which only INV may read.
--   * Items: one row per physical piece with its printable asset code, status
--     and location (a Room or the store of a Block).
--   * Moves: planned (tasks) and done; events: the history of each item.
-- =====================================================================

CREATE TABLE inv_furniture_type (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          VARCHAR(10)  NOT NULL UNIQUE,     -- prefix of the asset codes, e.g. AC
    name          VARCHAR(80)  NOT NULL UNIQUE,     -- English
    name_vi       VARCHAR(80)  NOT NULL,
    category      VARCHAR(10)  NOT NULL CHECK (category IN ('APPLIANCE', 'FURNITURE', 'FIXTURE', 'OTHER')),
    defines_class BOOLEAN      NOT NULL DEFAULT FALSE,
    status        VARCHAR(8)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    sort_order    SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version       BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_furniture_type_code CHECK (code ~ '^[A-Z][A-Z0-9]{0,9}$')
);

CREATE TABLE inv_room_class_requirement (
    room_class_id     BIGINT   NOT NULL REFERENCES cfg_room_class (id),
    furniture_type_id BIGINT   NOT NULL REFERENCES inv_furniture_type (id),
    quantity          SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    PRIMARY KEY (room_class_id, furniture_type_id)
);

CREATE SEQUENCE inv_asset_seq;

CREATE TABLE inv_furniture_item (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_code        VARCHAR(30)  NOT NULL UNIQUE,  -- printed on the item's label, e.g. AC-000123
    furniture_type_id BIGINT       NOT NULL REFERENCES inv_furniture_type (id),
    status            VARCHAR(10)  NOT NULL
                      CHECK (status IN ('IN_USE', 'BROKEN', 'IN_REPAIR', 'IN_STORE', 'DISPOSED')),
    room_id           BIGINT       REFERENCES inv_room (id),
    store_building_id BIGINT       REFERENCES inv_building (id),   -- in the Block's store
    note              VARCHAR(500),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version           BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_furniture_location CHECK ((room_id IS NULL) <> (store_building_id IS NULL)),
    CONSTRAINT ck_furniture_in_store CHECK (status <> 'IN_STORE' OR store_building_id IS NOT NULL),
    CONSTRAINT ck_furniture_in_use   CHECK (status <> 'IN_USE' OR room_id IS NOT NULL)
);
CREATE INDEX ix_furniture_room ON inv_furniture_item (room_id) WHERE room_id IS NOT NULL;
CREATE INDEX ix_furniture_store ON inv_furniture_item (store_building_id) WHERE store_building_id IS NOT NULL;
CREATE INDEX ix_furniture_type ON inv_furniture_item (furniture_type_id);

CREATE TABLE inv_furniture_move (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id                BIGINT       NOT NULL REFERENCES inv_furniture_item (id),
    from_room_id           BIGINT       REFERENCES inv_room (id),
    from_store_building_id BIGINT       REFERENCES inv_building (id),
    to_room_id             BIGINT       REFERENCES inv_room (id),
    to_store_building_id   BIGINT       REFERENCES inv_building (id),
    reason                 VARCHAR(300) NOT NULL,
    status                 VARCHAR(10)  NOT NULL CHECK (status IN ('PLANNED', 'DONE', 'CANCELLED')),
    created_by             BIGINT       NOT NULL REFERENCES auth_user (id),
    created_at             TIMESTAMPTZ  NOT NULL,
    closed_by              BIGINT       REFERENCES auth_user (id),
    closed_at              TIMESTAMPTZ,
    CONSTRAINT ck_move_from   CHECK ((from_room_id IS NULL) <> (from_store_building_id IS NULL)),
    CONSTRAINT ck_move_to     CHECK ((to_room_id IS NULL) <> (to_store_building_id IS NULL)),
    CONSTRAINT ck_move_closed CHECK ((status = 'PLANNED') = (closed_at IS NULL))
);
-- One planned move per item at a time.
CREATE UNIQUE INDEX ux_furniture_planned_move ON inv_furniture_move (item_id) WHERE status = 'PLANNED';
CREATE INDEX ix_furniture_move_status ON inv_furniture_move (status, created_at);

-- History of an item: REGISTERED (to = location), STATUS (from → to statuses), MOVED (from → to locations).
CREATE TABLE inv_furniture_event (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id    BIGINT       NOT NULL REFERENCES inv_furniture_item (id),
    kind       VARCHAR(10)  NOT NULL CHECK (kind IN ('REGISTERED', 'STATUS', 'MOVED')),
    from_value VARCHAR(40),
    to_value   VARCHAR(40)  NOT NULL,
    reason     VARCHAR(500),
    by_user    BIGINT       NOT NULL REFERENCES auth_user (id),
    at         TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_furniture_event_item ON inv_furniture_event (item_id, at DESC);

-- Furniture types every dormitory has; the Admin edits them in Admin › Furniture.
INSERT INTO inv_furniture_type (code, name, name_vi, category, defines_class, sort_order) VALUES
  ('BED',  'Bed',             'Giường',          'FURNITURE', FALSE, 1),
  ('WRD',  'Wardrobe',        'Tủ quần áo',      'FURNITURE', FALSE, 2),
  ('DESK', 'Desk',            'Bàn học',         'FURNITURE', FALSE, 3),
  ('FAN',  'Ceiling fan',     'Quạt trần',       'APPLIANCE', TRUE,  4),
  ('AC',   'Air conditioner', 'Máy lạnh',        'APPLIANCE', TRUE,  5),
  ('WH',   'Water heater',    'Máy nước nóng',   'FIXTURE',   TRUE,  6),
  ('FRG',  'Fridge',          'Tủ lạnh',         'APPLIANCE', TRUE,  7)
ON CONFLICT (code) DO NOTHING;
