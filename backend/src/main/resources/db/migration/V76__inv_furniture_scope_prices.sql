-- =====================================================================
-- CampusStay FPT — V76: personal and shared furniture, and replacement
-- prices per Room Class. A personal item (bed, wardrobe, desk, chair…)
-- belongs to one Bed of its Room and is charged to that Bed's student at
-- check-out; a shared item (fan, air conditioner, lights…) belongs to the
-- Room and is charged only to a student who acknowledged the damage.
-- =====================================================================

ALTER TABLE inv_furniture_type
    ADD COLUMN scope VARCHAR(8) NOT NULL DEFAULT 'SHARED' CHECK (scope IN ('PERSONAL', 'SHARED'));

UPDATE inv_furniture_type SET scope = 'PERSONAL'
WHERE code IN ('BED', 'WRD', 'DESK');

ALTER TABLE inv_furniture_item
    ADD COLUMN bed_id BIGINT REFERENCES inv_bed (id);
CREATE INDEX ix_furniture_bed ON inv_furniture_item (bed_id) WHERE bed_id IS NOT NULL;

-- Personal items of a Room are shared out between its Beds in order (first item of a type → first Bed).
WITH personal AS (
    SELECT i.id, i.room_id,
           row_number() OVER (PARTITION BY i.room_id, i.furniture_type_id ORDER BY i.id) AS n
    FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
    WHERE t.scope = 'PERSONAL' AND i.room_id IS NOT NULL
), beds AS (
    SELECT b.id, b.room_id, row_number() OVER (PARTITION BY b.room_id ORDER BY b.label, b.id) AS n
    FROM inv_bed b
)
UPDATE inv_furniture_item f SET bed_id = beds.id
FROM personal JOIN beds ON beds.room_id = personal.room_id AND beds.n = personal.n
WHERE f.id = personal.id;

-- What an item costs to replace, by Room Class (the class of the Room it is in).
CREATE TABLE inv_furniture_price (
    furniture_type_id BIGINT      NOT NULL REFERENCES inv_furniture_type (id),
    room_class_id     BIGINT      NOT NULL REFERENCES cfg_room_class (id),
    price             BIGINT      NOT NULL CHECK (price >= 0),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by        BIGINT REFERENCES auth_user (id),
    PRIMARY KEY (furniture_type_id, room_class_id)
);

-- Starting prices, so that check-out works before an Admin sets them: by category.
INSERT INTO inv_furniture_price (furniture_type_id, room_class_id, price)
SELECT t.id, c.id, CASE t.category WHEN 'APPLIANCE' THEN 2000000 WHEN 'FURNITURE' THEN 800000
                                   WHEN 'FIXTURE' THEN 300000 ELSE 200000 END
FROM inv_furniture_type t CROSS JOIN cfg_room_class c
ON CONFLICT DO NOTHING;
