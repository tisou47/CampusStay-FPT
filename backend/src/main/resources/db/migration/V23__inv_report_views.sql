-- =====================================================================
-- CampusStay FPT — V23: INV read contract for reports (RPT reads views only)
-- One row per Bed with its Room, floor, Room Type and Room Class and Block.
-- =====================================================================

CREATE VIEW rpt_v_bed AS
SELECT b.id AS bed_id, b.label AS bed, b.status AS bed_status, r.id AS room_id, r.code AS room,
       r.status AS room_status, r.oos_since, r.room_type_id, f.room_class_id, f.floor_no AS floor,
       bl.id AS building_id, bl.code AS block, bl.gender, bl.status AS block_status
FROM inv_bed b
JOIN inv_room r ON r.id = b.room_id
JOIN inv_floor f ON f.id = r.floor_id
JOIN inv_building bl ON bl.id = r.building_id;
