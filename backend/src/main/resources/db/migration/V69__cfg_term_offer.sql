-- Review 30/10/2026 (R-03): a Term may offer only some Room Types and Room Classes. No line = every active one
-- (like cfg_term_block). The assignment, Round 2, the Application wizard and the Term's price table use only what
-- the Term offers.
CREATE TABLE cfg_term_room_type (
    term_id      BIGINT NOT NULL REFERENCES cfg_term (id) ON DELETE CASCADE,
    room_type_id BIGINT NOT NULL REFERENCES cfg_room_type (id),
    PRIMARY KEY (term_id, room_type_id)
);

CREATE TABLE cfg_term_room_class (
    term_id       BIGINT NOT NULL REFERENCES cfg_term (id) ON DELETE CASCADE,
    room_class_id BIGINT NOT NULL REFERENCES cfg_room_class (id),
    PRIMARY KEY (term_id, room_class_id)
);

CREATE OR REPLACE VIEW rpt_v_term_room AS
SELECT t.id AS term_id, r.id AS room_id,
       (NOT EXISTS (SELECT 1 FROM cfg_term_block b WHERE b.term_id = t.id)
        OR EXISTS (SELECT 1 FROM cfg_term_block b WHERE b.term_id = t.id AND b.building_id = r.building_id))
       AND NOT EXISTS (SELECT 1 FROM cfg_term_room_excluded x WHERE x.term_id = t.id AND x.room_id = r.id)
       AND (NOT EXISTS (SELECT 1 FROM cfg_term_room_type y WHERE y.term_id = t.id)
            OR EXISTS (SELECT 1 FROM cfg_term_room_type y WHERE y.term_id = t.id AND y.room_type_id = r.room_type_id))
       AND (NOT EXISTS (SELECT 1 FROM cfg_term_room_class c WHERE c.term_id = t.id)
            OR EXISTS (SELECT 1 FROM cfg_term_room_class c
                       WHERE c.term_id = t.id AND c.room_class_id = inv_room_class_in(r.id, t.id))) AS used
FROM cfg_term t CROSS JOIN inv_room r;
