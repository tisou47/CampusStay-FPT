-- =====================================================================
-- CampusStay FPT — V56: the SLA deadline and the furniture item of a
-- Maintenance Request (Change Specification v2 phase 7; spec §6.18).
-- A new request gets its deadline from the Block's timers when it is routed
-- (urgent or normal hours after it was reported); requests reported before
-- this version get the deadline the timers give now. A request may name one
-- furniture item of its Room, whose history then lists the repair.
-- =====================================================================

ALTER TABLE mnt_request ADD COLUMN furniture_item_id BIGINT REFERENCES inv_furniture_item (id);
CREATE INDEX ix_mnt_furniture_item ON mnt_request (furniture_item_id) WHERE furniture_item_id IS NOT NULL;
CREATE INDEX ix_mnt_sla_due ON mnt_request (sla_due_at) WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS');

UPDATE mnt_request m
SET sla_due_at = m.reported_at + make_interval(hours => CASE WHEN m.urgency = 'URGENT'
        THEN coalesce(p.urgent_hours, (SELECT value::int FROM cfg_parameter WHERE key = 'sla.urgent_max_hours'))
        ELSE coalesce(p.normal_hours, (SELECT value::int FROM cfg_parameter WHERE key = 'sla.normal_max_hours')) END)
FROM mnt_request r LEFT JOIN req_sla_policy p ON p.building_id = r.building_id
WHERE r.id = m.id AND m.sla_due_at IS NULL;
