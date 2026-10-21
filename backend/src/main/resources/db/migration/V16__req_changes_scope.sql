-- =====================================================================
-- CampusStay FPT — V16: Block scope and the Manager step for swaps (S5)
-- Staff lists of Room-Change Requests, swaps and the swap board are scoped
-- by Block; REQ keeps the Block of each Bed involved because it must not
-- read INV or ASG tables. A swap across Blocks goes from Staff to the Block
-- Manager (status TO_MANAGER) before it is carried out.
-- =====================================================================

ALTER TABLE req_room_change ADD COLUMN building_id BIGINT REFERENCES inv_building (id);
UPDATE req_room_change r SET building_id = ro.building_id
FROM asg_allocation a JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room ro ON ro.id = b.room_id
WHERE a.id = r.allocation_id;
ALTER TABLE req_room_change ALTER COLUMN building_id SET NOT NULL;
CREATE INDEX ix_rc_block_status ON req_room_change (building_id, status);

ALTER TABLE req_swap
    ADD COLUMN a_building_id    BIGINT REFERENCES inv_building (id),
    ADD COLUMN b_building_id    BIGINT REFERENCES inv_building (id),
    ADD COLUMN staff_decided_by BIGINT REFERENCES auth_user (id),
    ADD COLUMN staff_decided_at TIMESTAMPTZ;
UPDATE req_swap s SET a_building_id = ra.building_id, b_building_id = rb.building_id
FROM asg_allocation aa JOIN inv_bed ba ON ba.id = aa.bed_id JOIN inv_room ra ON ra.id = ba.room_id,
     asg_allocation ab JOIN inv_bed bb ON bb.id = ab.bed_id JOIN inv_room rb ON rb.id = bb.room_id
WHERE aa.id = s.a_allocation_id AND ab.id = s.b_allocation_id;
ALTER TABLE req_swap
    ALTER COLUMN a_building_id SET NOT NULL,
    ALTER COLUMN b_building_id SET NOT NULL;
ALTER TABLE req_swap DROP CONSTRAINT req_swap_status_check;
ALTER TABLE req_swap ADD CONSTRAINT ck_swap_status CHECK (status IN
    ('INVITED', 'DECLINED', 'EXPIRED', 'PENDING', 'TO_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED'));
DROP INDEX ux_swap_one_open_a;
CREATE UNIQUE INDEX ux_swap_one_open_a ON req_swap (a_allocation_id) WHERE status IN ('INVITED', 'PENDING', 'TO_MANAGER');
CREATE INDEX ix_swap_blocks ON req_swap (a_building_id, b_building_id, status);

-- The Block of the Bed a swap-board post offers.
ALTER TABLE req_swap_post ADD COLUMN building_id BIGINT REFERENCES inv_building (id);
UPDATE req_swap_post p SET building_id = ro.building_id
FROM asg_allocation a JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room ro ON ro.id = b.room_id
WHERE a.id = p.allocation_id;
ALTER TABLE req_swap_post ALTER COLUMN building_id SET NOT NULL;
