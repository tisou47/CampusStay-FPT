-- =====================================================================
-- CampusStay FPT — V153: the check-in desk reminds students who have not
-- filed the check-in inventory (user decision 26/11/2026): Staff send the
-- standard reminder with the Term's check-in period, or their own text, to
-- one student or to many at once. Staff no longer confirm a check-in at
-- the desk: the student's inventory (or report 1 after the period) does.
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('CHECK_IN_REPORT_REMINDER', 'The check-in desk reminded a student to file the check-in inventory', TRUE,
     'File your check-in inventory by {{end}}', 'Hãy nộp biên bản kiểm kê nhận phòng trước hết ngày {{end}}',
     'The check-in period of {{term}} runs from {{start}} to {{end}}. Open My Room › Check-in inventory for Room {{room}}, answer every item and enter the meters, then submit. If nothing is filed by the end of {{end}}, the Room''s inspection by Staff (report 1) becomes your final report and Utility counts from when you received the door code.',
     'Đợt nhận phòng {{term}} từ ngày {{start}} đến hết ngày {{end}}. Hãy mở Phòng của tôi › Kiểm kê nhận phòng của phòng {{room}}, khai tình trạng từng món và chỉ số công tơ rồi nộp. Nếu đến hết ngày {{end}} bạn chưa nộp, biên bản kiểm tra phòng của nhân viên (report 1) sẽ là biên bản final của bạn và điện nước được tính từ lúc bạn nhận mã cửa.',
     '{room,term,start,end}'),
  ('CHECK_IN_REPORT_MESSAGE', 'The check-in desk sent a student its own message about the check-in inventory', TRUE,
     'A message from the dormitory about your check-in · Room {{room}}', 'Ký túc xá nhắc bạn về việc nhận phòng · Phòng {{room}}',
     '{{message}}', '{{message}}', '{room,message}')
ON CONFLICT (key) DO NOTHING;
