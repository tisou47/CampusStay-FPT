-- =====================================================================
-- CampusStay FPT — V72: Family Day guests who stay past their time slot
-- (ADR-29, contract A-70). The desk reminds, in one batch, every student
-- whose guests are still inside after their time slot; the student asks
-- their family to leave and confirms that they are safe; only then do
-- Staff close the visit (a Manager may close it without the confirmation,
-- with a note saying why).
-- =====================================================================

ALTER TABLE vis_visitor
    ADD COLUMN overdue_reminded_at TIMESTAMPTZ,                  -- the last reminder sent to the student
    ADD COLUMN overdue_reminders   INT          NOT NULL DEFAULT 0,
    ADD COLUMN safety_confirmed_at TIMESTAMPTZ,                  -- the student confirmed the guest is safe
    ADD COLUMN safety_note         VARCHAR(500);                 -- what the student wrote with it

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('FAMILY_DAY_GUESTS_OVERDUE', 'The visitor desk reminded a student whose Family Day guests stayed past their time slot', TRUE,
     'Your guests are still inside · {{title}}', 'Người thân của bạn vẫn còn trong ký túc xá · {{title}}',
     'The time slot of {{guests}} ended at {{ends}}. Ask them to leave through the visitor desk, then confirm in CampusStay that they are safe.',
     'Khung giờ thăm của {{guests}} đã kết thúc lúc {{ends}}. Hãy nhắc người thân ra về qua quầy tiếp đón, rồi xác nhận trên CampusStay rằng họ an toàn.',
     '{title,guests,ends}')
ON CONFLICT (key) DO NOTHING;
