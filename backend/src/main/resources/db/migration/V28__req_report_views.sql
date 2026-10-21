-- =====================================================================
-- CampusStay FPT — V28: REQ read contract for reports (RPT reads views only)
-- =====================================================================

CREATE VIEW rpt_v_escalation AS
SELECT id, building_id, term_id, kind, source_type, source_code, title, why, tone, status, opened_at, link
FROM req_escalation;

CREATE VIEW rpt_v_sla_policy AS
SELECT building_id, urgent_hours, normal_hours, room_change_hours
FROM req_sla_policy;

CREATE VIEW rpt_v_routing_rule AS
SELECT building_id, request_type, scope, active
FROM req_routing_rule;

CREATE VIEW rpt_v_swap AS
SELECT id, term_id, a_building_id, b_building_id, status
FROM req_swap;
