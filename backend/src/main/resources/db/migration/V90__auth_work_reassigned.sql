-- =====================================================================
-- CampusStay FPT — V90: Manager › Staff and workload. A person holding more
-- open work than the limit is shown as overloaded (display only: routing is
-- unchanged), and a Manager may move open work from one person to another;
-- the receiver is told in the app.
-- =====================================================================

INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, sort_order, settings_group, used_in) VALUES
  ('workload.max_open_per_staff', 'Staff', 'Open items a staff member may hold before they show as overloaded',
     'INT', '8', 'Shown on Manager › Staff and workload only; routing does not use it.', 70, NULL,
     'Manager › Staff and workload')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('WORK_REASSIGNED', 'A Manager moved open work to a staff member', FALSE,
     'Work moved to you · {{code}}', 'Công việc được chuyển cho bạn · {{code}}',
     '{{code}} · {{title}} was moved to you from {{from}} by {{by}}. Note: {{note}}',
     '{{code}} · {{title}} đã được {{by}} chuyển từ {{from}} sang cho bạn. Ghi chú: {{note}}',
     '{code,title,from,by,note}')
ON CONFLICT (key) DO NOTHING;
