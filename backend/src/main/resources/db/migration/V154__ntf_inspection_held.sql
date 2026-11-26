-- =====================================================================
-- CampusStay FPT — V154: pausing an inspection schedule holds its open run
-- (user decision 26/11/2026): Staff can no longer save it, and its
-- inspector is told when a Manager pauses or resumes the schedule.
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('INSPECTION_PAUSED', 'A Manager paused the schedule of an inspection run in progress', TRUE,
     'Inspection paused · {{schedule}}', 'Đợt kiểm tra bị tạm dừng · {{schedule}}',
     'A Manager paused {{schedule}}. Inspection {{run}} is on hold: stop inspecting its Rooms until it is resumed. What you saved is kept.',
     'Quản lý đã tạm dừng {{schedule}}. Đợt kiểm tra {{run}} đang bị giữ lại: hãy ngừng kiểm tra các phòng cho đến khi đợt được tiếp tục. Những gì bạn đã lưu vẫn được giữ.',
     '{schedule,run}'),
  ('INSPECTION_RESUMED', 'A Manager resumed the schedule of an inspection run', TRUE,
     'Inspection resumed · {{schedule}}', 'Đợt kiểm tra được tiếp tục · {{schedule}}',
     'A Manager resumed {{schedule}}. You can continue inspection {{run}}.',
     'Quản lý đã cho tiếp tục {{schedule}}. Bạn có thể tiếp tục đợt kiểm tra {{run}}.',
     '{schedule,run}')
ON CONFLICT (key) DO NOTHING;
