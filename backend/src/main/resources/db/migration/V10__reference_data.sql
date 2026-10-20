-- =====================================================================
-- CampusStay FPT — V10: reference data (initial Admin configuration).
-- Every value below is editable from the Admin screens; nothing here is
-- read as a constant by the code. Amounts are sample defaults.
-- =====================================================================

-- ---------- option lists ----------
INSERT INTO cfg_lookup (list_key, code, label, sort_order) VALUES
  ('REGION', 'NORTH',     'Northern Vietnam', 1),
  ('REGION', 'CENTRAL',   'Central Vietnam', 2),
  ('REGION', 'HIGHLANDS', 'Central Highlands', 3),
  ('REGION', 'SOUTHEAST', 'Southeast', 4),
  ('REGION', 'MEKONG',    'Mekong Delta', 5),
  ('SEMESTER', 'S1', 'Semester 1', 1), ('SEMESTER', 'S2', 'Semester 2', 2),
  ('SEMESTER', 'S3', 'Semester 3', 3), ('SEMESTER', 'S4', 'Semester 4', 4),
  ('SEMESTER', 'S5', 'Semester 5', 5), ('SEMESTER', 'S6', 'Semester 6', 6),
  ('SEMESTER', 'S7', 'Semester 7', 7), ('SEMESTER', 'S8', 'Semester 8', 8),
  ('SEMESTER', 'S9', 'Semester 9', 9),
  ('MAJOR', 'SE', 'Software Engineering', 1),
  ('MAJOR', 'AI', 'Artificial Intelligence', 2),
  ('MAJOR', 'IA', 'Information Assurance', 3),
  ('MAJOR', 'GD', 'Graphic Design', 4),
  ('MAJOR', 'BA', 'Business Administration', 5),
  ('MAJOR', 'MC', 'Multimedia Communications', 6),
  ('MAJOR', 'EN', 'English Language', 7),
  ('MAJOR', 'JP', 'Japanese Language', 8),
  ('RELATIONSHIP', 'FATHER', 'Father', 1),
  ('RELATIONSHIP', 'MOTHER', 'Mother', 2),
  ('RELATIONSHIP', 'GUARDIAN', 'Guardian', 3),
  ('RELATIONSHIP', 'SIBLING', 'Sibling', 4),
  ('RELATIONSHIP', 'OTHER', 'Other', 5),
  ('OOS_REASON', 'MAINTENANCE', 'Maintenance', 1),
  ('OOS_REASON', 'RENOVATION', 'Renovation', 2),
  ('OOS_REASON', 'SAFETY', 'Safety issue', 3),
  ('OOS_REASON', 'OTHER', 'Other', 4),
  ('MAINTENANCE_CATEGORY', 'ELECTRICAL', 'Electrical', 1),
  ('MAINTENANCE_CATEGORY', 'PLUMBING', 'Plumbing', 2),
  ('MAINTENANCE_CATEGORY', 'AIR_CONDITIONING', 'Air conditioning', 3),
  ('MAINTENANCE_CATEGORY', 'FURNITURE', 'Furniture', 4),
  ('MAINTENANCE_CATEGORY', 'INTERNET', 'Internet', 5),
  ('MAINTENANCE_CATEGORY', 'CLEANING', 'Cleaning', 6),
  ('MAINTENANCE_CATEGORY', 'OTHER', 'Other', 7),
  ('MAINTENANCE_LOCATION', 'ROOM', 'Room', 1),
  ('MAINTENANCE_LOCATION', 'BATHROOM', 'Bathroom', 2),
  ('MAINTENANCE_LOCATION', 'BALCONY', 'Balcony', 3),
  ('MAINTENANCE_LOCATION', 'CORRIDOR', 'Corridor', 4),
  ('MAINTENANCE_LOCATION', 'COMMON_AREA', 'Common area', 5),
  ('ROOM_CHANGE_REASON', 'ROOMMATE_CONFLICT', 'Roommate conflict', 1),
  ('ROOM_CHANGE_REASON', 'HEALTH', 'Health', 2),
  ('ROOM_CHANGE_REASON', 'STUDY_ENVIRONMENT', 'Study environment', 3),
  ('ROOM_CHANGE_REASON', 'PRICE', 'Price', 4),
  ('ROOM_CHANGE_REASON', 'OTHER', 'Other', 5),
  ('ROOM_CHANGE_REJECT_REASON', 'NO_MATCHING_BED', 'No matching Bed available', 1),
  ('ROOM_CHANGE_REJECT_REASON', 'OUTSTANDING_INVOICE', 'Outstanding Invoice', 2),
  ('ROOM_CHANGE_REJECT_REASON', 'OUTSIDE_WINDOW', 'Outside the change window', 3),
  ('ROOM_CHANGE_REJECT_REASON', 'INSUFFICIENT_REASON', 'Reason not sufficient', 4),
  ('CHECK_OUT_REASON', 'TERM_END', 'End of Term', 1),
  ('CHECK_OUT_REASON', 'EARLY_LEAVE', 'Early leave', 2),
  ('CHECK_OUT_REASON', 'WITHDRAWAL', 'Withdrawal from university', 3),
  ('HAND_OVER_ITEM', 'ROOM_KEY', 'Room key', 1),
  ('HAND_OVER_ITEM', 'ACCESS_CARD', 'Access card', 2),
  ('HAND_OVER_ITEM', 'WARDROBE_KEY', 'Wardrobe key', 3),
  ('HAND_OVER_ITEM', 'MATTRESS_COVER', 'Mattress cover', 4),
  ('STAFF_HANDLE', 'DESK', 'Desk (Check-in / Check-out)', 1),
  ('STAFF_HANDLE', 'APPLICATIONS', 'Applications', 2),
  ('STAFF_HANDLE', 'PAYMENTS', 'Payments', 3),
  ('STAFF_HANDLE', 'MAINTENANCE', 'Maintenance', 4),
  ('STAFF_HANDLE', 'ROOM_CHANGES', 'Room changes and swaps', 5),
  ('STAFF_HANDLE', 'INSPECTIONS', 'Inspections', 6),
  ('STAFF_HANDLE', 'METER_READINGS', 'Meter readings', 7),
  ('INSPECTION_CATEGORY', 'SAFETY', 'Safety', 1),
  ('INSPECTION_CATEGORY', 'ELECTRICAL', 'Electrical', 2),
  ('INSPECTION_CATEGORY', 'PLUMBING', 'Plumbing', 3),
  ('INSPECTION_CATEGORY', 'FURNITURE', 'Furniture', 4),
  ('INSPECTION_CATEGORY', 'HYGIENE', 'Hygiene', 5);

-- ---------- fees, refunds, utility ----------
INSERT INTO cfg_fee_policy (id, deposit_percent, deposit_hours, balance_days, block_check_in_if_unpaid,
                            allow_manual_confirm, policy_confirmed)
VALUES (1, 20.00, 48, 14, TRUE, TRUE, FALSE);

INSERT INTO cfg_refund_rule (trigger_code, description, refund_percent, approver_role, sort_order) VALUES
  ('CANCEL_BEFORE_RESULTS', 'Application cancelled before results are published', 100, 'SYSTEM', 1),
  ('CANCEL_AFTER_RESULTS',  'Application cancelled after results, before Check-in', 50, 'MANAGER', 2),
  ('EARLY_CHECK_OUT',       'Check-out before the end of the Term (unused days)', 30, 'MANAGER', 3),
  ('UTILITY_DEPOSIT',       'Utility Deposit at Check-out, minus unpaid Utility and damage', 100, 'STAFF', 4);

INSERT INTO cfg_utility_policy (id, price_kwh, price_m3, reading_day, payment_due_days, rounding,
                                overdue_reminder, estimate_monthly, months_held, block_changes_when_overdue)
VALUES (1, 3500, 15000, 25, 7, 'ROUND_UP_1000', 'DAILY_AFTER_DUE', 300000, 2, TRUE);

-- ---------- eligibility ----------
INSERT INTO cfg_eligibility_criterion (key, title, note, enabled, sort_order) VALUES
  ('ENROLLED',             'Currently enrolled', 'Enrollment status from the student directory is Enrolled', TRUE, 1),
  ('ONE_APPLICATION',      'No other live Application this Term', 'Cancelled, rejected or expired Applications do not count', TRUE, 2),
  ('NO_OVERDUE_INVOICE',   'No overdue dormitory Invoice', 'Any overdue Invoice from earlier Terms blocks a new Application', TRUE, 3),
  ('GENDER_CAPACITY',      'Beds exist for the student''s gender', 'At least one active Block matches the student''s gender', TRUE, 4),
  ('CONTACT_COMPLETE',     'Contact details complete', 'Phone and emergency contact are filled in', TRUE, 5);

INSERT INTO cfg_priority_group (key, title, note, applied, sort_order) VALUES
  ('FIRST_YEAR',         'First-year students', 'Students in their first two semesters', TRUE, 1),
  ('FAR_FROM_CAMPUS',    'Hometown far from campus', 'Hometown outside the Southeast region', TRUE, 2),
  ('SCHOLARSHIP',        'Scholarship holders', 'Flag from the student directory', TRUE, 3),
  ('POLICY_BENEFICIARY', 'Policy beneficiaries', 'Flag from the student directory', TRUE, 4);

-- ---------- matching criteria v1 ----------
INSERT INTO cfg_matching_snapshot (label, hard_constraints, criteria_order, weights, boost, active) VALUES
  ('v1',
   '["Block gender matches the student''s gender", "Room Type and Room Class as applied", "Invited roommate pairs share a Room", "Only in-service Beds", "No Bed held by an open Round-2 offer"]',
   '[{"key":"PRIORITY_GROUP","title":"Priority group","note":"Students in an applied priority group first"},
     {"key":"SUBMITTED_AT","title":"Submission time","note":"Earlier Deposit payment first"}]',
   '[{"key":"MAJOR","label":"Same major","note":"Room-mates study the same major","on":true,"value":0.40},
     {"key":"COHORT","label":"Same cohort","note":"Room-mates are in the same cohort","on":true,"value":0.30},
     {"key":"REGION","label":"Same region","note":"Room-mates come from the same region","on":true,"value":0.30}]',
   1.20, TRUE);

-- ---------- system parameters ----------
INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, options, sort_order) VALUES
  ('pricing.rounding_vnd', 'Pricing', 'Round term prices to (VND)', 'INT', '1000', 'Prices are rounded up to this step', NULL, 1),
  ('application.roommate_check_attempts', 'Applications', 'Roommate code checks per Term', 'INT', '5',
     'Each student may check this many roommate codes per Term', NULL, 2),
  ('application.cancel_until', 'Applications', 'Students may cancel until', 'CHOICE', 'RESULTS_PUBLISHED', NULL,
     '[{"value":"RESULTS_PUBLISHED","label":"Results are published"},{"value":"CHECK_IN_START","label":"Check-in starts"}]', 3),
  ('round2.offer_hours', 'Assignment', 'Round-2 offer valid for (hours)', 'INT', '48', NULL, NULL, 4),
  ('swap.invitation_hours', 'Requests', 'Swap invitation valid for (hours)', 'INT', '48', NULL, NULL, 5),
  ('swap.post_days', 'Requests', 'Swap board post valid for (days)', 'INT', '14', NULL, NULL, 6),
  ('upload.max_photo_mb', 'Uploads', 'Max photo size (MB)', 'INT', '5', NULL, NULL, 7),
  ('upload.max_photos', 'Uploads', 'Max photos per Maintenance Request', 'INT', '5', NULL, NULL, 8),
  ('payment.qr_minutes', 'Payments', 'VietQR code valid for (minutes)', 'INT', '15',
     'A transfer that arrives after the QR expires is still accepted', NULL, 9),
  ('audit.retention_months', 'Audit', 'Audit Log retention (months)', 'INT', '24', NULL, NULL, 10),
  ('maintenance.sla_target_percent', 'Maintenance', 'SLA target (%)', 'INT', '90', NULL, NULL, 11);

-- ---------- notification templates ----------
INSERT INTO ntf_template (key, event, title_en, title_vi, body, variables) VALUES
  ('DEPOSIT_DUE', 'Application created, Deposit not yet paid',
     'Pay your Deposit', 'Thanh toán tiền cọc',
     'Pay {{amount}} before {{dueAt}} to submit your Application for {{term}}.', '{amount,dueAt,term}'),
  ('ROOMMATE_INVITATION', 'A student invites you as roommate',
     'Roommate invitation', 'Lời mời ở ghép',
     '{{fromName}} invited you to share a {{roomType}} room in {{term}}. Answer before {{expiresAt}}.', '{fromName,roomType,term,expiresAt}'),
  ('APPLICATION_SUBMITTED', 'Deposit paid, Application submitted',
     'Application submitted', 'Đã nộp đơn',
     'Your Application for {{term}} is submitted. Results on {{resultsAt}}.', '{term,resultsAt}'),
  ('APPLICATION_REJECTED', 'Application rejected by Staff',
     'Application not approved', 'Đơn không được duyệt',
     'Your Application for {{term}} was not approved: {{note}}', '{term,note}'),
  ('ALLOCATION_PUBLISHED', 'Allocation committed and results published',
     'Your room is ready', 'Đã xếp phòng',
     'You are in Room {{room}}, Bed {{bed}} for {{term}}. Pay the Balance before {{dueAt}}.', '{room,bed,term,dueAt}'),
  ('ROUND2_OFFER', 'Waitlisted student receives Round-2 options',
     'New room options', 'Có lựa chọn phòng mới',
     'Choose one of the offered rooms before {{expiresAt}}.', '{expiresAt}'),
  ('INVOICE_ISSUED', 'New Invoice issued',
     'New Invoice', 'Hóa đơn mới',
     '{{title}}: {{amount}}, due {{dueAt}}.', '{title,amount,dueAt}'),
  ('PAYMENT_CONFIRMED', 'Payment confirmed',
     'Payment received', 'Đã nhận thanh toán',
     'We received {{amount}} for {{title}}.', '{amount,title}'),
  ('INVOICE_OVERDUE', 'Invoice overdue reminder',
     'Invoice overdue', 'Hóa đơn quá hạn',
     '{{title}} ({{amount}}) was due on {{dueAt}}.', '{title,amount,dueAt}'),
  ('MAINTENANCE_UPDATED', 'Maintenance Request status or public update',
     'Maintenance update', 'Cập nhật sửa chữa',
     '{{title}}: {{status}}.', '{title,status}'),
  ('ROOM_CHANGE_DECIDED', 'Room-Change Request decided',
     'Room change decision', 'Kết quả đổi phòng',
     'Your Room-Change Request was {{decision}}.', '{decision}'),
  ('SWAP_INVITATION', 'A student proposes a swap',
     'Swap request', 'Yêu cầu đổi chỗ',
     '{{fromName}} wants to swap Beds with you. Answer before {{expiresAt}}.', '{fromName,expiresAt}'),
  ('CHECK_IN_REMINDER', 'Check-in window opens',
     'Check-in opens soon', 'Sắp đến ngày nhận phòng',
     'Check-in for {{term}} runs {{start}} – {{end}} at {{location}}.', '{term,start,end,location}');

INSERT INTO ntf_email_template (key, name, subject, body_html, transactional) VALUES
  ('ACCOUNT_INVITE', 'Account invitation', 'Your CampusStay account',
   '<p>Hello {{name}},</p><p>An account was created for you on CampusStay FPT. Set your password here: <a href="{{link}}">{{link}}</a>. The link expires on {{expiresAt}}.</p>', TRUE),
  ('PASSWORD_RESET', 'Password reset', 'Reset your CampusStay password',
   '<p>Hello {{name}},</p><p>Reset your password here: <a href="{{link}}">{{link}}</a>. The link expires on {{expiresAt}}. If you did not ask for this, ignore this email.</p>', TRUE),
  ('CHECK_IN_REMINDER', 'Check-in reminder', 'Check-in for {{term}}',
   '<p>Hello {{name}},</p><p>Check-in for {{term}} runs {{start}} – {{end}} at {{location}}. Bring your student card.</p>', FALSE),
  ('PAYMENT_REMINDER', 'Payment reminder', 'Payment reminder: {{title}}',
   '<p>Hello {{name}},</p><p>{{title}} ({{amount}}) is due on {{dueAt}}. Pay with VietQR from CampusStay.</p>', FALSE),
  ('ANNOUNCEMENT', 'General announcement', '{{subject}}',
   '<p>Hello {{name}},</p><p>{{message}}</p>', FALSE);
