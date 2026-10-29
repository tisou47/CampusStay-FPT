-- =====================================================================
-- CampusStay FPT — V63: what a waitlisted student is told (29/10/2026).
-- WAITLISTED when Round 1 found no Bed of the chosen kind (the choices and
-- the date the waitlist ends); WAITLIST_ENDED when check-in started before
-- a Bed was found (the Application is cancelled, the Deposit refunded).
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('WAITLISTED', 'Round 1 found no Bed of the chosen kind',
     TRUE, 'You are on the waitlist', 'Bạn đang trong danh sách chờ',
     'No Bed of the kind you chose was free in {{term}}. Choose a Room from the Round 2 options when you get them, or withdraw and get your Deposit back in full. If no Bed is found by {{until}}, the Application is cancelled and the Deposit refunded in full.',
     'Không còn giường đúng loại bạn chọn trong {{term}}. Hãy chọn phòng khi có đề nghị vòng 2, hoặc rút đơn để được hoàn đủ tiền cọc. Nếu đến {{until}} vẫn chưa có giường, đơn sẽ bị hủy và tiền cọc được hoàn đủ.',
     '{term,until}'),
  ('WAITLIST_ENDED', 'Check-in started before a Bed was found for a waitlisted student',
     TRUE, 'Your Application is cancelled', 'Đơn đăng ký đã bị hủy',
     'No Bed was found for you in {{term}} before check-in. Your Deposit of {{amount}} is refunded in full to your bank account after a Manager approves.',
     'Không tìm được giường cho bạn trong {{term}} trước ngày nhận phòng. Tiền cọc {{amount}} được hoàn đủ vào tài khoản ngân hàng của bạn sau khi Quản lý duyệt.',
     '{term,amount}')
ON CONFLICT (key) DO NOTHING;
