-- =====================================================================
-- CampusStay FPT — V75: inspections record the condition of each furniture
-- item (Good, Worn, Damaged, Missing) and the Room's meters; a schedule is
-- either periodic (Rooms in use) or a pre-arrival check (Rooms that new
-- residents will receive). The condition is the baseline a student's
-- check-in inventory is compared with; students never read it.
-- =====================================================================

ALTER TABLE mnt_inspection_room_check
    ADD COLUMN condition VARCHAR(10) CHECK (condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING'));

-- Results recorded before: Pass was a Good item, Fail a Damaged one.
UPDATE mnt_inspection_room_check SET condition = CASE result WHEN 'PASS' THEN 'GOOD' ELSE 'DAMAGED' END
WHERE check_key LIKE 'FURNITURE:%' AND result IN ('PASS', 'FAIL');

ALTER TABLE mnt_inspection_room
    ADD COLUMN electricity    NUMERIC(10,1) CHECK (electricity >= 0),
    ADD COLUMN water          NUMERIC(10,1) CHECK (water >= 0),
    ADD COLUMN meter_replaced BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN inspected_by   BIGINT REFERENCES auth_user (id);

ALTER TABLE mnt_inspection_schedule
    ADD COLUMN kind VARCHAR(12) NOT NULL DEFAULT 'PERIODIC' CHECK (kind IN ('PERIODIC', 'PRE_ARRIVAL'));

-- The latest recorded condition of each furniture item (the baseline of the check-in inventory).
CREATE INDEX ix_inspection_check_key ON mnt_inspection_room_check (check_key);
