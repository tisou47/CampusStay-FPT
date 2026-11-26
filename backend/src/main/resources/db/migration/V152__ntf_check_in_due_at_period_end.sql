-- =====================================================================
-- CampusStay FPT — V152: the check-in inventory is due at the end of the
-- Term's check-in period ("check-in until", set by the Admin), not 48 hours
-- after the door code (user decision 25/11/2026). Not filed by then, the
-- Room's report 1 is its final report and Utility counts from the code.
-- =====================================================================

UPDATE ntf_template
SET body      = 'Open My Room to see the door code and go into the Room. You may file the check-in inventory until {{dueAt}}; if you do not, the Room''s recorded condition is used and Utility counts from when you received the code.',
    body_vi   = 'Mở Phòng của tôi để xem mã cửa và vào phòng. Bạn có thể nộp biên bản kiểm kê nhận phòng đến {{dueAt}}; nếu không nộp, hệ thống dùng tình trạng phòng đã ghi nhận và tính điện nước từ lúc bạn nhận mã cửa.',
    variables = '{room,dueAt}'
WHERE key = 'CHECK_IN_AVAILABLE';
