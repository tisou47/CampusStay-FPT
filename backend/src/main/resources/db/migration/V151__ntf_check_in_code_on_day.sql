-- =====================================================================
-- CampusStay FPT — V151: on the Term's check-in day a paid new resident
-- receives the door code at once and their check-in inventory opens
-- (user decision 25/11/2026): the notice no longer asks them to press
-- "Start check-in inventory".
-- =====================================================================

UPDATE ntf_template
SET title_en = 'Your door code is ready · Room {{room}}',
    title_vi = 'Bạn đã có mã cửa · Phòng {{room}}',
    body     = 'Open My Room to see the door code, go into the Room and file the check-in inventory within {{hours}} hours. Staff then review it.',
    body_vi  = 'Mở Phòng của tôi để xem mã cửa, vào phòng và nộp biên bản kiểm kê nhận phòng trong vòng {{hours}} giờ. Sau đó nhân viên sẽ duyệt biên bản.'
WHERE key = 'CHECK_IN_AVAILABLE';
