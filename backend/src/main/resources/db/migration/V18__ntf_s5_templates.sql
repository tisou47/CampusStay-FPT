-- =====================================================================
-- CampusStay FPT — V18: notification templates for S5
-- Swaps, late check-ins and refunds tell the student what was decided.
-- Admins can edit the texts later (Admin › Notification templates).
-- =====================================================================

INSERT INTO ntf_template (key, event, title_en, title_vi, body, variables) VALUES
  ('SWAP_DECIDED', 'A Bed swap was accepted, declined or decided',
     'Swap update', 'Cập nhật đổi chỗ',
     'Your Bed swap was {{decision}}.', '{decision}'),
  ('LATE_CHECK_IN_DECIDED', 'Late check-in decided by the Block Manager',
     'Late check-in decision', 'Kết quả nhận phòng muộn',
     'Your late check-in was {{decision}}.', '{decision}'),
  ('REFUND_DECIDED', 'Refund decided by the Block Manager',
     'Refund decision', 'Kết quả hoàn tiền',
     'Your refund of {{amount}} was {{decision}}.', '{amount,decision}')
ON CONFLICT (key) DO NOTHING;
