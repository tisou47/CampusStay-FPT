-- =====================================================================
-- CampusStay FPT — V15: Block and Room code on Maintenance Requests (S4)
-- The queue is scoped by Block and searched by Room code; MNT keeps both
-- because it must not read INV tables. Copied when the request is created.
-- =====================================================================

ALTER TABLE mnt_request
    ADD COLUMN building_id BIGINT REFERENCES inv_building (id),
    ADD COLUMN room_code   VARCHAR(20);

UPDATE mnt_request m SET building_id = r.building_id, room_code = r.code
FROM inv_room r WHERE r.id = m.room_id;

ALTER TABLE mnt_request
    ALTER COLUMN building_id SET NOT NULL,
    ALTER COLUMN room_code SET NOT NULL;
CREATE INDEX ix_mnt_block_status ON mnt_request (building_id, status);
