-- =====================================================================
-- CampusStay FPT — V49: notifications of money and residence (Change
-- Specification v2 phase 5; spec §10). Payment claims (rejected, cancelled,
-- the Managers' hourly summary), payment reminders, forfeits, door code
-- ready, late check-ins to decide, Utility warnings and terminations. The
-- forfeit, the Utility warnings and the termination notice also go by email.
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('PAYMENT_CLAIM_REJECTED', 'A Manager rejected the student''s "I have transferred"', TRUE,
     'Transfer not confirmed · {{title}}', 'Chưa xác nhận chuyển khoản · {{title}}',
     'A Manager could not confirm your transfer of {{amount}}: {{reason}}. Pay before {{dueAt}}.',
     'Quản lý chưa xác nhận được khoản chuyển {{amount}} của bạn: {{reason}}. Hãy thanh toán trước {{dueAt}}.',
     '{title,amount,reason,dueAt}'),
  ('PAYMENT_CLAIM_CANCELLED', 'Payment claims were rejected too often, so the Invoice was cancelled', TRUE,
     '{{title}} cancelled', 'Đã hủy {{title}}',
     'Your transfer for {{title}} was rejected {{count}} times, so the Invoice is cancelled.',
     'Khoản chuyển cho {{title}} của bạn đã bị từ chối {{count}} lần, nên hóa đơn đã bị hủy.', '{title,count}'),
  ('PAYMENT_CLAIMS_WAITING', 'Payment claims wait for confirmation (one summary per hour)', FALSE,
     'Payment claims to confirm', 'Khoản chuyển khoản chờ xác nhận',
     '{{count}} payment claims are waiting for confirmation, {{total}} in all.',
     'Có {{count}} khoản báo đã chuyển khoản đang chờ xác nhận, tổng cộng {{total}}.', '{count,total}'),
  ('PAYMENT_DUE_SOON', 'A Balance is due in a few days', TRUE,
     'Payment due soon · {{title}}', 'Sắp đến hạn thanh toán · {{title}}',
     'Pay {{title}} ({{amount}}) before {{dueAt}}. If it is not paid by then, the Bed is released and the Deposit is kept.',
     'Hãy thanh toán {{title}} ({{amount}}) trước {{dueAt}}. Nếu chưa thanh toán, chỗ ở sẽ bị hủy và tiền cọc không được hoàn.',
     '{title,amount,dueAt}'),
  ('BALANCE_FORFEITED', 'The Balance was not paid in time: the Bed is released and the Deposit kept', TRUE,
     'Bed released · Room {{room}}', 'Đã hủy chỗ ở · Phòng {{room}}',
     'The Balance for Room {{room}} was not paid by {{dueAt}}, so the Bed is released. The Deposit is kept (refund: {{refund}}).',
     'Phần tiền còn lại của phòng {{room}} chưa được thanh toán trước {{dueAt}}, nên chỗ ở đã bị hủy. Tiền cọc không được hoàn (hoàn lại: {{refund}}).',
     '{room,dueAt,refund}'),
  ('DOOR_CODE_READY', 'The door code was released to a paid resident', TRUE,
     'Your door code is ready · Room {{room}}', 'Mã cửa của bạn đã sẵn sàng · Phòng {{room}}',
     'You are now a resident of Room {{room}}. Open My Room to see the door code.',
     'Bạn đã là cư dân phòng {{room}}. Mở Phòng của tôi để xem mã cửa.', '{room}'),
  ('LATE_CHECK_IN_REQUESTED', 'A student asked online for a late check-in', FALSE,
     'Late check-in to decide', 'Yêu cầu nhận phòng muộn cần duyệt',
     '{{name}} ({{studentCode}}) asks to arrive on {{requestedFor}} (Room {{room}}).',
     '{{name}} ({{studentCode}}) xin đến nhận phòng ngày {{requestedFor}} (phòng {{room}}).',
     '{name,studentCode,requestedFor,room}'),
  ('UTILITY_WARNING', 'A Utility Invoice became overdue (warning 1)', TRUE,
     'Utility overdue · {{title}}', 'Tiền điện nước quá hạn · {{title}}',
     '{{title}} ({{amount}}) is overdue. Pay it now: unpaid Utility for {{months}} months ends your stay.',
     '{{title}} ({{amount}}) đã quá hạn. Hãy thanh toán ngay: nợ tiền điện nước {{months}} tháng sẽ chấm dứt hợp đồng ở của bạn.',
     '{title,amount,months}'),
  ('UTILITY_FINAL_WARNING', 'Utility is overdue while a new Invoice is issued, or the debt reached the Utility Deposit', TRUE,
     'Final warning: Utility debt', 'Cảnh báo cuối: nợ tiền điện nước',
     'You owe {{debt}} for Utility. Pay everything before {{terminateOn}}, or your stay will be terminated.',
     'Bạn đang nợ {{debt}} tiền điện nước. Hãy thanh toán hết trước {{terminateOn}}, nếu không hợp đồng ở sẽ bị chấm dứt.',
     '{debt,terminateOn}'),
  ('TERMINATION_NOTICE', 'The student''s stay is terminated (Utility debt, not enrolled or a Manager''s decision)', TRUE,
     'Your stay is terminated · Room {{room}}', 'Chấm dứt hợp đồng ở · Phòng {{room}}',
     'Your stay in Room {{room}} is terminated. Check out at the desk by {{moveOutBy}}; My Room shows the reason.',
     'Hợp đồng ở phòng {{room}} của bạn bị chấm dứt. Hãy trả phòng tại quầy trước {{moveOutBy}}; lý do có trong Phòng của tôi.',
     '{room,moveOutBy}'),
  ('TERMINATION_CANCELLED', 'A Manager cancelled a termination', TRUE,
     'Termination cancelled · Room {{room}}', 'Đã hủy chấm dứt hợp đồng ở · Phòng {{room}}',
     'A Manager cancelled the termination of your stay in Room {{room}}. You may stay.',
     'Quản lý đã hủy việc chấm dứt hợp đồng ở phòng {{room}} của bạn. Bạn có thể tiếp tục ở.', '{room}'),
  ('TERMINATION_OVERDUE', 'A terminated resident has not checked out by the move-out date', FALSE,
     'Overdue check-out · Room {{room}}', 'Quá hạn trả phòng · Phòng {{room}}',
     '{{name}} has not checked out of Room {{room}} by {{moveOutBy}}. The door code of the Room must be changed.',
     '{{name}} chưa trả phòng {{room}} trước {{moveOutBy}}. Cần đổi mã cửa của phòng.', '{name,room,moveOutBy}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ntf_email_template (key, name, subject, body_html, transactional, subject_vi, body_html_vi) VALUES
  ('BALANCE_FORFEITED', 'Bed released (Balance not paid)', 'Your Bed in Room {{room}} was released',
   '<p>Hello {{name}},</p><p>The Balance for Room {{room}} was not paid by {{dueAt}}, so the Bed is released. The Deposit is kept (refund: {{refund}}).</p>',
   TRUE, 'Chỗ ở phòng {{room}} của bạn đã bị hủy',
   '<p>Xin chào {{name}},</p><p>Phần tiền còn lại của phòng {{room}} chưa được thanh toán trước {{dueAt}}, nên chỗ ở đã bị hủy. Tiền cọc không được hoàn (hoàn lại: {{refund}}).</p>'),
  ('UTILITY_WARNING', 'Utility overdue (warning 1)', 'Utility overdue: {{title}}',
   '<p>Hello {{name}},</p><p>{{title}} ({{amount}}) is overdue. Pay it now in CampusStay: unpaid Utility for {{months}} months ends your stay.</p>',
   TRUE, 'Tiền điện nước quá hạn: {{title}}',
   '<p>Xin chào {{name}},</p><p>{{title}} ({{amount}}) đã quá hạn. Hãy thanh toán ngay trên CampusStay: nợ tiền điện nước {{months}} tháng sẽ chấm dứt hợp đồng ở của bạn.</p>'),
  ('UTILITY_FINAL_WARNING', 'Utility debt (final warning)', 'Final warning: Utility debt',
   '<p>Hello {{name}},</p><p>You owe {{debt}} for Utility. Pay everything before {{terminateOn}}, or your stay will be terminated.</p>',
   TRUE, 'Cảnh báo cuối: nợ tiền điện nước',
   '<p>Xin chào {{name}},</p><p>Bạn đang nợ {{debt}} tiền điện nước. Hãy thanh toán hết trước {{terminateOn}}, nếu không hợp đồng ở sẽ bị chấm dứt.</p>'),
  ('TERMINATION_NOTICE', 'Stay terminated', 'Your stay in Room {{room}} is terminated',
   '<p>Hello {{name}},</p><p>Your stay in Room {{room}} is terminated. Check out at the desk by {{moveOutBy}}. Open My Room in CampusStay for the reason and the settlement.</p>',
   TRUE, 'Hợp đồng ở phòng {{room}} của bạn bị chấm dứt',
   '<p>Xin chào {{name}},</p><p>Hợp đồng ở phòng {{room}} của bạn bị chấm dứt. Hãy trả phòng tại quầy trước {{moveOutBy}}. Mở Phòng của tôi trên CampusStay để xem lý do và quyết toán.</p>')
ON CONFLICT (key) DO NOTHING;

-- Payment reminders now say "Pay in CampusStay" (the claim), not "Pay with VietQR".
UPDATE ntf_email_template
SET body_html = '<p>Hello {{name}},</p><p>{{title}} ({{amount}}) is due on {{dueAt}}. Transfer it and press "I have transferred" in CampusStay.</p>',
    body_html_vi = '<p>Xin chào {{name}},</p><p>{{title}} ({{amount}}) đến hạn vào {{dueAt}}. Hãy chuyển khoản và bấm "Tôi đã chuyển khoản" trên CampusStay.</p>'
WHERE key = 'PAYMENT_REMINDER';
