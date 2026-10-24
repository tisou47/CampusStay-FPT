-- =====================================================================
-- CampusStay FPT — V34: notifications and emails in Vietnamese and English
-- (ADR-25). Templates get a Vietnamese body (and email subject and body);
-- every in-app notification keeps both texts, so changing the language later
-- shows earlier notifications in the new language too. Rows written before
-- this migration have no Vietnamese text and show the English one.
-- =====================================================================

ALTER TABLE ntf_template ADD COLUMN body_vi VARCHAR(1000);

UPDATE ntf_template t SET body_vi = v.body_vi
FROM (VALUES
  ('DEPOSIT_DUE',           'Thanh toán {{amount}} trước {{dueAt}} để nộp đơn đăng ký {{term}}.'),
  ('ROOMMATE_INVITATION',   '{{fromName}} mời bạn ở chung phòng {{roomType}} trong {{term}}. Hãy trả lời trước {{expiresAt}}.'),
  ('APPLICATION_SUBMITTED', 'Đơn đăng ký {{term}} của bạn đã được nộp. Kết quả có vào {{resultsAt}}.'),
  ('APPLICATION_REJECTED',  'Đơn đăng ký {{term}} của bạn không được duyệt: {{note}}'),
  ('ALLOCATION_PUBLISHED',  'Bạn được xếp vào phòng {{room}}, giường {{bed}} cho {{term}}. Hãy thanh toán tiền phòng còn lại trước {{dueAt}}.'),
  ('ROUND2_OFFER',          'Hãy chọn một trong các phòng được đề nghị trước {{expiresAt}}.'),
  ('INVOICE_ISSUED',        '{{title}}: {{amount}}, hạn {{dueAt}}.'),
  ('PAYMENT_CONFIRMED',     'Đã nhận {{amount}} cho {{title}}.'),
  ('INVOICE_OVERDUE',       '{{title}} ({{amount}}) đã quá hạn từ {{dueAt}}.'),
  ('MAINTENANCE_UPDATED',   '{{title}}: {{status}}.'),
  ('ROOM_CHANGE_DECIDED',   'Yêu cầu đổi phòng của bạn đã {{decision}}.'),
  ('SWAP_INVITATION',       '{{fromName}} muốn đổi chéo giường với bạn. Hãy trả lời trước {{expiresAt}}.'),
  ('CHECK_IN_REMINDER',     'Nhận phòng cho {{term}} từ {{start}} đến {{end}} tại {{location}}.'),
  ('SWAP_DECIDED',          'Yêu cầu đổi chéo giường của bạn đã {{decision}}.'),
  ('LATE_CHECK_IN_DECIDED', 'Yêu cầu nhận phòng muộn của bạn đã {{decision}}.'),
  ('REFUND_DECIDED',        'Khoản hoàn tiền {{amount}} của bạn đã {{decision}}.'),
  ('ESCALATION_ASSIGNED',   '{{code}} · {{title}} đã được Quản lý giao cho bạn.'),
  ('INSPECTION_SCHEDULED',  'Nhân viên sẽ kiểm tra phòng của bạn từ {{from}} đến {{until}}. Hãy để phòng có thể vào được.'),
  ('CAMPAIGN',              '{{message}}')) AS v (key, body_vi)
WHERE t.key = v.key;

-- Templates added by hand keep their English body until the Admin writes the Vietnamese one.
UPDATE ntf_template SET body_vi = body WHERE body_vi IS NULL;
ALTER TABLE ntf_template ALTER COLUMN body_vi SET NOT NULL;

ALTER TABLE ntf_notification ADD COLUMN title_vi VARCHAR(200);
ALTER TABLE ntf_notification ADD COLUMN body_vi VARCHAR(1000);

ALTER TABLE ntf_email_template ADD COLUMN subject_vi VARCHAR(200);
ALTER TABLE ntf_email_template ADD COLUMN body_html_vi TEXT;

UPDATE ntf_email_template t SET subject_vi = v.subject_vi, body_html_vi = v.body_vi
FROM (VALUES
  ('ACCOUNT_INVITE', 'Tài khoản CampusStay của bạn',
   '<p>Xin chào {{name}},</p><p>Bạn đã được tạo tài khoản trên CampusStay FPT. Hãy đặt mật khẩu tại đây: <a href="{{link}}">{{link}}</a>. Liên kết hết hạn lúc {{expiresAt}}.</p>'),
  ('PASSWORD_RESET', 'Đặt lại mật khẩu CampusStay',
   '<p>Xin chào {{name}},</p><p>Hãy đặt lại mật khẩu tại đây: <a href="{{link}}">{{link}}</a>. Liên kết hết hạn lúc {{expiresAt}}. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>'),
  ('CHECK_IN_REMINDER', 'Nhận phòng {{term}}',
   '<p>Xin chào {{name}},</p><p>Nhận phòng cho {{term}} từ {{start}} đến {{end}} tại {{location}}. Hãy mang theo thẻ sinh viên.</p>'),
  ('PAYMENT_REMINDER', 'Nhắc thanh toán: {{title}}',
   '<p>Xin chào {{name}},</p><p>{{title}} ({{amount}}) đến hạn vào {{dueAt}}. Hãy thanh toán bằng VietQR trên CampusStay.</p>'),
  ('ANNOUNCEMENT', '{{subject}}',
   '<p>Xin chào {{name}},</p><p>{{message}}</p>')) AS v (key, subject_vi, body_vi)
WHERE t.key = v.key;
