-- =====================================================================
-- CampusStay FPT — V27: MNT read contract for reports (RPT reads views only)
-- =====================================================================

CREATE VIEW rpt_v_maintenance AS
SELECT id, code, term_id, building_id, room_code, category, priority, urgency, source, status, assignee_id,
       reported_at, resolved_at, closed_at
FROM mnt_request;

CREATE VIEW rpt_v_checklist AS
SELECT id, family_key, name, version, status
FROM mnt_checklist;
