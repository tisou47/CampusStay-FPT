-- =====================================================================
-- CampusStay FPT — V22: notification templates for S7
-- Residents hear about an inspection of their Room when its run starts;
-- an Admin email sent with push also appears in the app.
-- Admins can edit the texts later (Admin › Notification templates).
-- =====================================================================

INSERT INTO ntf_template (key, event, title_en, title_vi, body, variables) VALUES
  ('INSPECTION_SCHEDULED', 'An inspection run that includes the student''s Room starts',
     'Room inspection', 'Kiểm tra phòng',
     'Staff will inspect your Room between {{from}} and {{until}}. Please keep it accessible.', '{from,until}'),
  ('CAMPAIGN', 'An email the Admin sends to students (channel Email and push)',
     '{{subject}}', '{{subject}}',
     '{{message}}', '{subject,message}')
ON CONFLICT (key) DO NOTHING;
