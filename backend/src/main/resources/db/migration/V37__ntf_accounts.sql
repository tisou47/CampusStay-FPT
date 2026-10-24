-- =====================================================================
-- CampusStay FPT — V37: notifications for student accounts and the email
-- redirect of demo accounts (Change Specification v2 phase 2; spec §10, O-3).
--   * Each queued email says whether its recipient is a fictional account
--     (auth_user.demo, V36). Only those go to the demo mailbox when
--     MAIL_REDIRECT_TO is set; real accounts receive their own email. Emails
--     still waiting were queued when every recipient was fictional.
--   * Managers hear about a student account waiting for verification; the
--     student hears when it is verified.
-- =====================================================================

ALTER TABLE ntf_email_outbox ADD COLUMN demo_recipient BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE ntf_email_outbox SET demo_recipient = TRUE WHERE status = 'PENDING';

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('STUDENT_VERIFICATION_REQUESTED', 'A student who signed up asks a Manager to verify the account', FALSE,
     'Student account to verify', 'Tài khoản sinh viên cần xác minh',
     '{{name}} ({{studentCode}}) signed up and is waiting for verification.',
     '{{name}} ({{studentCode}}) đã đăng ký và đang chờ được xác minh.', '{name,studentCode}'),
  ('STUDENT_VERIFIED', 'A Manager or the student list verified a student account', TRUE,
     'Your account is verified', 'Tài khoản của bạn đã được xác minh',
     'Your student account is verified. You can now apply for a Bed.',
     'Tài khoản sinh viên của bạn đã được xác minh. Bây giờ bạn có thể đăng ký chỗ ở.', '{}')
ON CONFLICT (key) DO NOTHING;
