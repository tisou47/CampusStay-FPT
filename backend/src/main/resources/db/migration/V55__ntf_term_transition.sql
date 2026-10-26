-- =====================================================================
-- CampusStay FPT — V55: notifications of the Term transition (Change
-- Specification v2 phase 6; spec §10). The requests window, the last Term of
-- a Stay, next-Term requests decided, consents asked, a next-Term Allocation
-- cancelled, the end-of-stay notice, next-Term fee reminders, an operational
-- move and the Managers' alert before the decision deadline. A cancelled
-- next-Term Allocation and the end-of-stay notice also go by email.
-- =====================================================================

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('REQUESTS_WINDOW_OPEN', 'The requests window of the next Term opened for a continuing resident', TRUE,
     'You stay in Room {{room}} in {{term}}', 'Bạn tiếp tục ở phòng {{room}} trong {{term}}',
     'Your Bed is kept for {{term}} (Terms left: {{left}}). Ask for a room change, a swap, a Room Class change or the end of your stay before {{closesAt}}.',
     'Giường của bạn được giữ cho {{term}} (còn {{left}} kỳ). Hãy gửi yêu cầu đổi phòng, đổi chéo, đổi hạng phòng hoặc kết thúc ở trước {{closesAt}}.',
     '{room,term,left,closesAt}'),
  ('STAY_LAST_TERM', 'The requests window opened for a resident in the last Term of the Stay', TRUE,
     'This is the last Term of your stay', 'Đây là kỳ cuối trong hợp đồng ở của bạn',
     'Ask for an extension before {{closesAt}} to keep your Bed in Room {{room}} for {{term}}.',
     'Hãy gửi yêu cầu gia hạn trước {{closesAt}} để giữ giường ở phòng {{room}} cho {{term}}.',
     '{room,term,closesAt}'),
  ('NEXT_TERM_CANCELLED', 'A next-Term Allocation was cancelled (end of stay, not extended, fee not paid, not enrolled)', TRUE,
     'No Bed for {{term}}', 'Không còn giường cho {{term}}',
     'Your Bed for {{term}} (Room {{room}}) is released: {{why}}. Check out at the desk by {{checkOutBy}}.',
     'Giường của bạn cho {{term}} (phòng {{room}}) đã được trả lại: {{why}}. Hãy trả phòng tại quầy trước {{checkOutBy}}.',
     '{term,room,why,checkOutBy}'),
  ('NEXT_TERM_REQUEST_DECIDED', 'A next-Term request (Room Class change, extension, end of stay) was decided', TRUE,
     '{{kind}}: {{decision}}', '{{kind}}: {{decision}}',
     '{{note}}', '{{note}}', '{kind,decision,note}'),
  ('ROOM_CLASS_CONSENT_ASKED', 'A Room Class change of the student''s Room needs their consent', TRUE,
     'Do you agree to change Room {{room}}?', 'Bạn có đồng ý đổi hạng phòng {{room}}?',
     '{{name}} asks to change Room {{room}} from {{from}} to {{to}} for {{term}}. The next-Term room fee follows the new class. Answer in Requests.',
     '{{name}} đề nghị đổi phòng {{room}} từ {{from}} sang {{to}} cho {{term}}. Tiền phòng kỳ sau tính theo hạng mới. Hãy trả lời trong mục Yêu cầu.',
     '{name,room,from,to,term}'),
  ('END_OF_STAY_NOTICE', 'The next-Term fees were issued and the student does not continue', TRUE,
     'Your stay ends after {{term}}', 'Hợp đồng ở của bạn kết thúc sau {{term}}',
     'Check out at the desk of Block {{block}} by {{checkOutBy}} ({{deskHours}}). The Utility Deposit ({{held}}) is settled then: the last Utility share, unpaid Utility and damage are taken from it.',
     'Hãy trả phòng tại quầy Block {{block}} trước {{checkOutBy}} ({{deskHours}}). Khi đó tiền cọc điện nước ({{held}}) được quyết toán: trừ phần điện nước cuối, điện nước chưa trả và hư hỏng.',
     '{term,block,checkOutBy,deskHours,held}'),
  ('NEXT_TERM_FEE_DUE_SOON', 'A next-Term room fee is due in a few days', TRUE,
     'Payment due soon · {{title}}', 'Sắp đến hạn thanh toán · {{title}}',
     'Pay {{title}} ({{amount}}) before {{dueAt}} to keep your Bed for next Term. Unpaid, the Bed is released (nothing is charged).',
     'Hãy thanh toán {{title}} ({{amount}}) trước {{dueAt}} để giữ giường cho kỳ sau. Nếu chưa thanh toán, giường sẽ được trả lại (không mất tiền).',
     '{title,amount,dueAt}'),
  ('RESIDENT_MOVED', 'Staff or a Manager moved the resident during the Term', TRUE,
     'You moved to Room {{room}}', 'Bạn đã được chuyển sang phòng {{room}}',
     'You now live in Room {{room}} · Bed {{bed}} ({{reason}}). Nothing is charged. Open My Room for the door code.',
     'Bạn hiện ở phòng {{room}} · giường {{bed}} ({{reason}}). Không phát sinh chi phí. Mở Phòng của tôi để xem mã cửa.',
     '{room,bed,reason}'),
  ('RENEWAL_UNDECIDED', 'Next-Term requests are undecided or reconciliation items open before the decision deadline', FALSE,
     'Next-Term work to finish · {{term}}', 'Việc kỳ sau cần hoàn tất · {{term}}',
     '{{requests}} next-Term requests are undecided and {{items}} reconciliation items are open. Finish them before {{dueAt}}: the next-Term fees wait for them.',
     'Còn {{requests}} yêu cầu kỳ sau chưa quyết định và {{items}} mục đối soát chưa xử lý. Hãy hoàn tất trước {{dueAt}}: tiền phòng kỳ sau đang chờ.',
     '{term,requests,items,dueAt}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ntf_email_template (key, name, subject, body_html, transactional, subject_vi, body_html_vi) VALUES
  ('NEXT_TERM_CANCELLED', 'Next-Term Bed released', 'Your Bed for {{term}} was released',
   '<p>Hello {{name}},</p><p>Your Bed for {{term}} (Room {{room}}) is released: {{why}}. Check out at the desk by {{checkOutBy}}.</p>',
   TRUE, 'Giường của bạn cho {{term}} đã được trả lại',
   '<p>Xin chào {{name}},</p><p>Giường của bạn cho {{term}} (phòng {{room}}) đã được trả lại: {{why}}. Hãy trả phòng tại quầy trước {{checkOutBy}}.</p>'),
  ('END_OF_STAY_NOTICE', 'End-of-stay notice', 'Your stay ends after {{term}}',
   '<p>Hello {{name}},</p><p>Your stay ends after {{term}}. Check out at the desk of Block {{block}} by {{checkOutBy}} ({{deskHours}}). The Utility Deposit ({{held}}) is settled at check-out: the last Utility share, unpaid Utility and damage are taken from it and the rest is refunded.</p>',
   TRUE, 'Hợp đồng ở của bạn kết thúc sau {{term}}',
   '<p>Xin chào {{name}},</p><p>Hợp đồng ở của bạn kết thúc sau {{term}}. Hãy trả phòng tại quầy Block {{block}} trước {{checkOutBy}} ({{deskHours}}). Tiền cọc điện nước ({{held}}) được quyết toán khi trả phòng: trừ phần điện nước cuối, điện nước chưa trả và hư hỏng, phần còn lại được hoàn.</p>')
ON CONFLICT (key) DO NOTHING;

-- Room-Change Requests and swaps now take effect in the next Term.
UPDATE ntf_template SET body = 'Your next-Term room change request was {{decision}}.',
       body_vi = 'Yêu cầu đổi phòng cho kỳ sau của bạn đã {{decision}}.'
WHERE key = 'ROOM_CHANGE_DECIDED';
UPDATE ntf_template SET body = 'Your next-Term Bed swap was {{decision}}.',
       body_vi = 'Yêu cầu đổi chéo giường cho kỳ sau của bạn đã {{decision}}.'
WHERE key = 'SWAP_DECIDED';
