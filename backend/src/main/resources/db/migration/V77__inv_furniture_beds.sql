-- =====================================================================
-- CampusStay FPT — V77: personal furniture belongs to a Bed. A personal
-- item (inv_furniture_type.use_scope = PERSONAL, V75: bed, wardrobe,
-- desk…) is linked to one Bed of its Room and is charged to that Bed's
-- student at check-out; a shared item (appliances, fixtures) belongs to
-- the Room and is charged only to a student who acknowledged the damage.
-- Prices are the type's unit_price and the share charged comes from the
-- condition levels (inv_furniture_condition), both of V75.
-- =====================================================================

ALTER TABLE inv_furniture_item
    ADD COLUMN bed_id BIGINT REFERENCES inv_bed (id);
CREATE INDEX ix_furniture_bed ON inv_furniture_item (bed_id) WHERE bed_id IS NOT NULL;

-- Personal items of a Room are shared out between its Beds in order (first item of a type → first Bed).
WITH personal AS (
    SELECT i.id, i.room_id,
           row_number() OVER (PARTITION BY i.room_id, i.furniture_type_id ORDER BY i.id) AS n
    FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
    WHERE t.use_scope = 'PERSONAL' AND i.room_id IS NOT NULL
), beds AS (
    SELECT b.id, b.room_id, row_number() OVER (PARTITION BY b.room_id ORDER BY b.label, b.id) AS n
    FROM inv_bed b
)
UPDATE inv_furniture_item f SET bed_id = beds.id
FROM personal JOIN beds ON beds.room_id = personal.room_id AND beds.n = personal.n
WHERE f.id = personal.id;
