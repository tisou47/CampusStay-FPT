-- =====================================================================
-- CampusStay FPT — V48: door-code rotation after a termination (Change
-- Specification v2 phase 5; spec §6.8, §6.15). When a terminated resident
-- has not left by the move-out date, the Room's code is changed so that the
-- student can no longer open the door.
-- =====================================================================

ALTER TABLE inv_door_code_task ALTER COLUMN reason TYPE VARCHAR(12);
ALTER TABLE inv_door_code_task DROP CONSTRAINT inv_door_code_task_reason_check;
ALTER TABLE inv_door_code_task ADD CONSTRAINT ck_door_task_reason
    CHECK (reason IN ('CHECK_OUT', 'MOVE_OUT', 'TERMINATION'));
