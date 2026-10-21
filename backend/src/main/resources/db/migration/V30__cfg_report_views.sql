-- =====================================================================
-- CampusStay FPT — V30: CFG read contract for reports (RPT reads views only)
-- =====================================================================

CREATE VIEW rpt_v_fee_policy AS
SELECT policy_confirmed
FROM cfg_fee_policy WHERE id = 1;
