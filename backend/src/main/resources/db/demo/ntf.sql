-- =====================================================================
-- Demo data — Notifications (NTF): the announcements students see on
-- the dormitory board: N+1 published, its prices (5 % higher), a water
-- cut in Block A and, in the turnover week, the check-out reminder.
-- =====================================================================

INSERT INTO ntf_announcement (category, audience, term_id, title, title_vi, body, body_vi, link, pinned, shown_from,
                              source, created_by, created_at)
SELECT 'REGISTRATION', 'ALL_STUDENTS', t.x_id, 'Registration period: ' || t.x_name, 'Đợt đăng ký: ' || t.x_name,
       t.x_name || ' (stay ' || to_char(t.x_start, 'DD/MM/YYYY') || ' – ' || to_char(t.x_end, 'DD/MM/YYYY')
           || '): registration opens on ' || to_char(t.x_reg_open AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
           || ' and closes on ' || to_char(t.x_reg_close AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
           || '. Continuing residents keep their Bed and file their requests by '
           || to_char(t.x_m3 AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || '.',
       t.x_name || ' (ở từ ' || to_char(t.x_start, 'DD/MM/YYYY') || ' đến ' || to_char(t.x_end, 'DD/MM/YYYY')
           || '): đăng ký mở lúc ' || to_char(t.x_reg_open AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
           || ' và đóng lúc ' || to_char(t.x_reg_close AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
           || '. Sinh viên tiếp tục ở giữ giường và gửi yêu cầu trước '
           || to_char(t.x_m3 AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || '.',
       '/student/registration-periods/' || t.x_id, t.stage = 'A', t.x_m1, 'TERM_PUBLISHED',
       (SELECT id FROM demo_staff WHERE account = 'admin'), t.x_m1
FROM demo_t t;

INSERT INTO ntf_announcement (category, audience, term_id, title, title_vi, body, body_vi, changes, pinned, shown_from,
                              source, created_by, created_at)
SELECT 'FINANCE', 'ALL_STUDENTS', t.x_id, 'Room prices of ' || t.x_name, 'Giá phòng ' || t.x_name,
       'Room prices of ' || t.x_name || ' are 5 % higher than this Term (new air conditioners in Blocks A and E).',
       'Giá phòng ' || t.x_name || ' cao hơn kỳ này 5 % (máy lạnh mới ở Block A và E).',
       (SELECT jsonb_agg(jsonb_build_object('field', rt.name || ' · ' || rc.name, 'type', 'MONEY',
                                            'before', pn.price::text, 'after', px.price::text)
                         ORDER BY rt.sort_order, rc.sort_order)
        FROM cfg_term_price pn JOIN cfg_term_price px ON px.room_type_id = pn.room_type_id
                                                     AND px.room_class_id = pn.room_class_id AND px.term_id = t.x_id
        JOIN cfg_room_type rt ON rt.id = pn.room_type_id JOIN cfg_room_class rc ON rc.id = pn.room_class_id
        WHERE pn.term_id = t.n_id),
       FALSE, t.x_m1 + interval '1 hour', 'POLICY_CHANGED', (SELECT id FROM demo_staff WHERE account = 'admin'),
       t.x_m1 + interval '1 hour'
FROM demo_t t;

INSERT INTO ntf_announcement (category, audience, title, title_vi, body, body_vi, shown_from, shown_until, source,
                              created_by, created_at)
SELECT 'OPERATIONS', 'BLOCK_RESIDENTS', 'Water cut in Block A on Saturday morning',
       'Cắt nước Block A sáng thứ Bảy',
       'The water tanks of Block A are cleaned on Saturday from 07:00 to 11:00. Please store some water the night before.',
       'Bồn nước Block A được vệ sinh vào thứ Bảy từ 07:00 đến 11:00. Các bạn hãy trữ nước từ tối hôm trước.',
       t.now - interval '1 day', t.now + interval '6 days', 'MANUAL',
       (SELECT id FROM demo_staff WHERE account = 'staff.a1'), t.now - interval '1 day'
FROM demo_t t;

INSERT INTO ntf_announcement_block (announcement_id, building_id)
SELECT a.id, b.id FROM ntf_announcement a JOIN inv_building b ON b.code = 'A' WHERE a.audience = 'BLOCK_RESIDENTS';

INSERT INTO ntf_announcement (category, audience, term_id, title, title_vi, body, body_vi, pinned, shown_from, source,
                              created_by, created_at)
SELECT 'OPERATIONS', 'RESIDENTS', t.n_id, 'Check-out before ' || to_char(t.n_end + 1, 'DD/MM/YYYY'),
       'Trả phòng trước ' || to_char(t.n_end + 1, 'DD/MM/YYYY'),
       'Residents who leave at the end of ' || t.n_name || ' check out at the desk of their Block by '
           || to_char(t.n_end + 1, 'DD/MM/YYYY') || '. Continuing residents keep their Room or move on the first day of '
           || t.x_name || '.',
       'Sinh viên rời KTX cuối ' || t.n_name || ' làm thủ tục trả phòng tại quầy của Block trước '
           || to_char(t.n_end + 1, 'DD/MM/YYYY') || '. Sinh viên tiếp tục ở giữ phòng hoặc chuyển phòng vào ngày đầu '
           || t.x_name || '.',
       TRUE, t.now - interval '2 days', 'MANUAL', (SELECT id FROM demo_staff WHERE account = 'manager.a'),
       t.now - interval '2 days'
FROM demo_t t WHERE t.stage = 'C';
