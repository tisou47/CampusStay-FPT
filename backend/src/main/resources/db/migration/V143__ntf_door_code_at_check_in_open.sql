-- The door code is released to every paid resident when check-in opens (owner decision 25/11/2026): the check-in
-- inventory no longer hands out the code. Only the template text that was never edited by an Admin is replaced.
UPDATE ntf_template
SET event   = 'A new resident received the door code and may file the check-in inventory',
    title_en = 'Your door code is ready · Room {{room}}',
    title_vi = 'Mã cửa của bạn đã sẵn sàng · Phòng {{room}}',
    body    = 'Your door code is on My Room. File the check-in inventory within {{hours}} hours (by the last check-in day): '
              || 'you then pay Utility from your own meter reading. Without it, the Room''s recorded condition is used and '
              || 'Utility counts from the day check-in opened.',
    body_vi = 'Mã cửa của bạn nằm ở Phòng của tôi. Hãy nộp biên bản kiểm kê nhận phòng trong {{hours}} giờ (trước ngày cuối '
              || 'nhận phòng): khi đó điện nước tính từ chỉ số bạn ghi. Nếu không nộp, tình trạng phòng theo biên bản của '
              || 'ký túc xá được dùng và điện nước tính từ ngày mở nhận phòng.'
WHERE key = 'CHECK_IN_AVAILABLE'
  AND body = 'Open My Room and press "Start check-in inventory" when you are at the Room: you receive the door code and have {{hours}} hours to file the inventory.';
