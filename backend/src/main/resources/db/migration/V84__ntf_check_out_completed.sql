-- =====================================================================
-- CampusStay FPT — V84: student notifications when check-out completes
-- (with or without a pending deposit refund).
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('CHECK_OUT_REFUND_PENDING', 'A resident completed check-out with a pending refund', TRUE,
     'Check-out completed · Refund pending · Room {{room}}',
     'Hoàn tất trả phòng · Chờ duyệt hoàn tiền · Phòng {{room}}',
     'Your check-out from Room {{room}} is complete. Expected refund: {{amount}}, pending Manager approval.',
     'Bạn đã hoàn tất trả phòng {{room}}. Khoản hoàn tiền dự kiến {{amount}} đang chờ Manager duyệt.',
     '{room,amount}'),
  ('CHECK_OUT_COMPLETED', 'A resident completed check-out', TRUE,
     'Check-out completed · Room {{room}}',
     'Hoàn tất trả phòng · Phòng {{room}}',
     'Your check-out from Room {{room}} and final settlement are complete.',
     'Bạn đã hoàn tất trả phòng {{room}} và quyết toán điện nước.',
     '{room}')
ON CONFLICT (key) DO NOTHING;
