-- =====================================================================
-- CampusStay FPT — V38: Room Class per Room per Term (Change Specification
-- v2 phase 3, ADR-24, spec D-03; revises OI-04 "Room Class per Floor").
--   * Every Room keeps the class it was built with (inv_room.room_class_id,
--     taken from its Floor). The Floor's class is now only the default that
--     bulk generation gives new Rooms, so it becomes optional.
--   * inv_room_class_term sets a Room's class from a Term on. The class of a
--     Room in a Term is the one set for the latest published Term that starts
--     on or before it (a Draft Term's own setting counts only for itself),
--     else the class the Room was built with (inv_room_class_in). Classes are
--     set only for Terms whose stay has not started and whose Beds nobody
--     holds yet, so a Room's class never changes during a Term and no price
--     already charged changes.
--   * Reports read the class of every Room in every Term from
--     rpt_v_room_class; rpt_v_bed.room_class_id is the class a Room was built
--     with.
-- =====================================================================

ALTER TABLE inv_room ADD COLUMN room_class_id BIGINT REFERENCES cfg_room_class (id);
UPDATE inv_room r SET room_class_id = f.room_class_id FROM inv_floor f WHERE f.id = r.floor_id;
ALTER TABLE inv_room ALTER COLUMN room_class_id SET NOT NULL;
CREATE INDEX ix_room_class ON inv_room (room_class_id);

ALTER TABLE inv_floor ALTER COLUMN room_class_id DROP NOT NULL;

CREATE TABLE inv_room_class_term (
    room_id       BIGINT      NOT NULL REFERENCES inv_room (id),
    term_id       BIGINT      NOT NULL REFERENCES cfg_term (id),
    room_class_id BIGINT      NOT NULL REFERENCES cfg_room_class (id),
    set_by        BIGINT      NOT NULL REFERENCES auth_user (id),
    set_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, term_id)
);
CREATE INDEX ix_room_class_term_term ON inv_room_class_term (term_id);

-- The Room Class of a Room in a Term (NULL Term: the class the Room was built with).
CREATE FUNCTION inv_room_class_in(p_room BIGINT, p_term BIGINT) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        (SELECT rc.room_class_id
         FROM inv_room_class_term rc
         JOIN cfg_term s ON s.id = rc.term_id
         JOIN cfg_term t ON t.id = p_term
         WHERE rc.room_id = p_room AND s.stay_start <= t.stay_start AND (s.status <> 'DRAFT' OR s.id = t.id)
         ORDER BY s.stay_start DESC, (s.id = t.id) DESC
         LIMIT 1),
        (SELECT r.room_class_id FROM inv_room r WHERE r.id = p_room))
$$;

CREATE OR REPLACE VIEW rpt_v_bed AS
SELECT b.id AS bed_id, b.label AS bed, b.status AS bed_status, r.id AS room_id, r.code AS room,
       r.status AS room_status, r.oos_since, r.room_type_id, r.room_class_id, f.floor_no AS floor,
       bl.id AS building_id, bl.code AS block, bl.gender, bl.status AS block_status
FROM inv_bed b
JOIN inv_room r ON r.id = b.room_id
JOIN inv_floor f ON f.id = r.floor_id
JOIN inv_building bl ON bl.id = r.building_id;

-- One row per Room and Term: the Room Class of the Room in that Term.
CREATE VIEW rpt_v_room_class AS
SELECT r.id AS room_id, t.id AS term_id, inv_room_class_in(r.id, t.id) AS room_class_id
FROM inv_room r CROSS JOIN cfg_term t;
