-- =====================================================================
-- CampusStay FPT — V29: AUTH read contract for reports (RPT reads views only)
-- No names, emails or credentials: dashboards only count accounts.
-- =====================================================================

CREATE VIEW rpt_v_user AS
SELECT id, role, status, last_sign_in_at
FROM auth_user;

CREATE VIEW rpt_v_user_block AS
SELECT user_id, building_id
FROM auth_user_block;
