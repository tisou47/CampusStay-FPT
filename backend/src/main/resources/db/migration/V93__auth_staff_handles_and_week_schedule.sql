-- =====================================================================
-- CampusStay FPT — V93: what Staff handle follows the Staff portal, and the
-- weekly schedule handover.
-- 1. Applications and Payments are Manager work (ADR-19): they leave the
--    Staff handle list. Family Day guests, Rooms (door codes, furniture) and
--    Term-transition requests join it, in the order of the Staff menu.
-- 2. On Sunday a Manager sends next week's schedule to the Staff of their
--    Blocks; the system reminds the Managers on Sunday until it is sent.
-- =====================================================================

UPDATE cfg_lookup SET active = FALSE WHERE list_key = 'STAFF_HANDLE' AND code IN ('APPLICATIONS', 'PAYMENTS');

INSERT INTO cfg_lookup (list_key, code, label, sort_order, active) VALUES
  ('STAFF_HANDLE', 'DESK',           'Check-in and check-out desk',      1, TRUE),
  ('STAFF_HANDLE', 'FAMILY_DAY',     'Family Day guests',                2, TRUE),
  ('STAFF_HANDLE', 'ROOM_CHANGES',   'Room changes, swaps and moves',    3, TRUE),
  ('STAFF_HANDLE', 'NEXT_TERM',      'Term transition requests',         4, TRUE),
  ('STAFF_HANDLE', 'ROOMS',          'Rooms, door codes and furniture',  5, TRUE),
  ('STAFF_HANDLE', 'MAINTENANCE',    'Maintenance',                      6, TRUE),
  ('STAFF_HANDLE', 'INSPECTIONS',    'Inspections',                      7, TRUE),
  ('STAFF_HANDLE', 'METER_READINGS', 'Meter readings',                   8, TRUE)
ON CONFLICT (list_key, code) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, active = TRUE;

UPDATE auth_staff_profile SET handles = array_remove(array_remove(handles, 'APPLICATIONS'), 'PAYMENTS')
WHERE handles && ARRAY['APPLICATIONS', 'PAYMENTS']::text[];

-- One line per week (its Monday): when the Managers were reminded on the Sunday before.
CREATE TABLE auth_schedule_week (
    week_start   DATE        PRIMARY KEY,
    reminded_at  TIMESTAMPTZ
);

-- One line per week and Block: when a Manager sent that week's schedule to the Block's Staff.
CREATE TABLE auth_schedule_send (
    week_start   DATE        NOT NULL,
    building_id  BIGINT      NOT NULL,
    sent_at      TIMESTAMPTZ NOT NULL,
    sent_by      BIGINT      NOT NULL REFERENCES auth_user (id),
    PRIMARY KEY (week_start, building_id)
);

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('workload.schedule_reminder_hour', 'Staff', 'Hour on Sunday when Managers are reminded to send next week''s schedule',
     'INT', '9', 'Campus time, 0–23. Sent once on Sunday when some Block''s schedule is not sent yet.', 72,
     NULL, 'Manager › Staff and workload')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('WEEK_SCHEDULE_REMINDER', 'Sunday: next week''s staff schedule is not sent yet', FALSE,
     'Send next week''s schedule · {{week}}', 'Gửi lịch làm việc tuần tới · {{week}}',
     'Check the shifts and work of your Staff for the week of {{week}} and send the schedule. Not sent yet: Blocks {{blocks}}.',
     'Hãy kiểm tra ca làm và phân việc của nhân viên cho tuần {{week}} rồi gửi lịch. Chưa gửi: Tòa {{blocks}}.',
     '{week,blocks}'),
  ('WEEK_SCHEDULE_SENT', 'A Manager sent a Staff member next week''s schedule', TRUE,
     'Your schedule for the week of {{week}}', 'Lịch làm việc tuần {{week}} của bạn',
     'Shifts: {{shifts}}. Sent by {{by}}. Open My schedule for your shifts and work.',
     'Ca làm: {{shifts}}. Người gửi: {{by}}. Mở Lịch làm việc của tôi để xem ca và công việc.',
     '{week,shifts,by}')
ON CONFLICT (key) DO NOTHING;
