-- =====================================================================
-- CampusStay FPT — V75: what a furniture type is worth (user decision
-- 19/11/2026). Each type is personal (one per Bed: Bed, Wardrobe, Desk) or
-- shared by the Room (fan, air conditioner, water heater, fridge) and has a
-- real price; four condition levels give the share of that price an item
-- in that condition is still worth. Admin › Furniture types sets them.
-- =====================================================================

ALTER TABLE inv_furniture_type
    ADD COLUMN use_scope  VARCHAR(8) NOT NULL DEFAULT 'PERSONAL' CHECK (use_scope IN ('PERSONAL', 'SHARED')),
    ADD COLUMN unit_price BIGINT CHECK (unit_price IS NULL OR unit_price BETWEEN 0 AND 1000000000);

-- Appliances and fixtures serve the whole Room; furniture belongs to a Bed.
UPDATE inv_furniture_type SET use_scope = 'SHARED' WHERE category IN ('APPLIANCE', 'FIXTURE');

CREATE TABLE inv_furniture_condition (
    code          VARCHAR(16)  PRIMARY KEY,
    name          VARCHAR(60)  NOT NULL,
    name_vi       VARCHAR(60)  NOT NULL,
    value_percent SMALLINT     NOT NULL CHECK (value_percent BETWEEN 0 AND 100),
    sort_order    SMALLINT     NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO inv_furniture_condition (code, name, name_vi, value_percent, sort_order) VALUES
    ('INTACT',         'Intact',                   'Nguyên vẹn',          100, 1),
    ('PARTLY_DAMAGED', 'Partly damaged',           'Hư một phần',          75, 2),
    ('MOSTLY_DAMAGED', 'More than half damaged',   'Hư hơn một nửa',       50, 3),
    ('DESTROYED',      'Completely damaged',       'Hư hoàn toàn',          0, 4);
