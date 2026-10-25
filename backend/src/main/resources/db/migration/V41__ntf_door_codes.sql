-- =====================================================================
-- CampusStay FPT — V41: door code notifications (Change Specification v2
-- phase 3, spec §10). The texts never contain the code: residents open it
-- on My Room, where every view is written to the Audit Log.
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('DOOR_CODE_TO_SET', 'A resident left a Room, so its door code must be changed', FALSE,
     'Door code to change · Room {{room}}', 'Cần đổi mã cửa · Phòng {{room}}',
     'A resident left Room {{room}}. Set a new door code on the lock and confirm it in Door codes.',
     'Một sinh viên đã rời phòng {{room}}. Hãy đặt mã cửa mới trên khóa và xác nhận trong mục Mã cửa.', '{room}'),
  ('DOOR_CODE_CHANGED', 'The door code of the resident''s Room was changed', TRUE,
     'New door code · Room {{room}}', 'Mã cửa mới · Phòng {{room}}',
     'The door code of Room {{room}} has changed. Open My Room to see it.',
     'Mã cửa của phòng {{room}} đã thay đổi. Mở Phòng của tôi để xem mã.', '{room}')
ON CONFLICT (key) DO NOTHING;
