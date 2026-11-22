-- A resident whose Bed was already given to someone else in the next Term is told when the requests window opens,
-- and so are the Managers (review finding BE-ASG-09).
INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('NEXT_TERM_BED_TAKEN', 'A resident''s Bed is already taken in the next Term', TRUE,
     'Your Bed for {{term}} is not available', 'Giường của bạn cho {{term}} không còn trống',
     'Your Bed in Room {{room}} is already given to someone else for {{term}}. The dormitory office will place you again; you will be told.',
     'Giường của bạn tại phòng {{room}} đã được xếp cho người khác trong {{term}}. Ban quản lý sẽ xếp lại chỗ cho bạn và thông báo cho bạn.',
     '{room,term}'),
  ('NEXT_TERM_BED_TAKEN_MANAGER', 'A continuing resident has no Bed in the next Term', FALSE,
     'Place {{name}} for {{term}}', 'Xếp chỗ cho {{name}} trong {{term}}',
     '{{name}} lives in Room {{room}}, but that Bed is already given to someone else for {{term}}. Place them in another Bed.',
     '{{name}} đang ở phòng {{room}}, nhưng giường đó đã được xếp cho người khác trong {{term}}. Hãy xếp sinh viên vào giường khác.',
     '{name,room,term}')
ON CONFLICT (key) DO NOTHING;
