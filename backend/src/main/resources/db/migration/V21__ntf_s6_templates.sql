-- =====================================================================
-- CampusStay FPT — V21: notification templates for S6
-- The Block Manager hands an escalated request to a staff member.
-- Admins can edit the texts later (Admin › Notification templates).
-- =====================================================================

INSERT INTO ntf_template (key, event, title_en, title_vi, body, variables) VALUES
  ('ESCALATION_ASSIGNED', 'The Block Manager assigned an escalated request',
     'Escalated request assigned to you', 'Yêu cầu khẩn được giao cho bạn',
     '{{code}} · {{title}} was assigned to you by the Block Manager.', '{code,title}')
ON CONFLICT (key) DO NOTHING;
