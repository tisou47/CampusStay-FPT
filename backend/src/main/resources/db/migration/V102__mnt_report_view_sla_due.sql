-- Reports read the deadline stored when a request was routed (review finding BE-PLT-01).
CREATE OR REPLACE VIEW rpt_v_maintenance AS
SELECT id, code, term_id, building_id, room_code, category, priority, urgency, source, status, assignee_id,
       reported_at, resolved_at, closed_at, sla_due_at
FROM mnt_request;
