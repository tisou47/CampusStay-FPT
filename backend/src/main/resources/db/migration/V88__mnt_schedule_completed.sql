-- =====================================================================
-- CampusStay FPT — V87: allow COMPLETED status on inspection schedules
-- =====================================================================

ALTER TABLE mnt_inspection_schedule
  ALTER COLUMN status TYPE VARCHAR(12);

ALTER TABLE mnt_inspection_schedule
  DROP CONSTRAINT IF EXISTS mnt_inspection_schedule_status_check;

ALTER TABLE mnt_inspection_schedule
  ADD CONSTRAINT mnt_inspection_schedule_status_check
  CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED'));
