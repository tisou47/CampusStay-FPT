-- =====================================================================
-- CampusStay FPT — V35: texts for system-wide Managers (ADR-19)
-- Managers work for every Block, so the template descriptions and the Admin
-- limits no longer speak of "the Block Manager". Texts an Admin has already
-- edited are left as they are.
-- =====================================================================

UPDATE ntf_template SET event = 'Application rejected by a Manager'
WHERE key = 'APPLICATION_REJECTED' AND event = 'Application rejected by Staff';

UPDATE ntf_template SET event = 'Late check-in decided by a Manager'
WHERE key = 'LATE_CHECK_IN_DECIDED' AND event = 'Late check-in decided by the Block Manager';

UPDATE ntf_template SET event = 'Refund decided by a Manager'
WHERE key = 'REFUND_DECIDED' AND event = 'Refund decided by the Block Manager';

UPDATE ntf_template SET event = 'A Manager assigned an escalated request'
WHERE key = 'ESCALATION_ASSIGNED' AND event = 'The Block Manager assigned an escalated request';

UPDATE ntf_template SET body = '{{code}} · {{title}} was assigned to you by a Manager.'
WHERE key = 'ESCALATION_ASSIGNED' AND body = '{{code}} · {{title}} was assigned to you by the Block Manager.';

UPDATE cfg_parameter SET helper = 'Managers may only choose a shorter timer'
WHERE key IN ('sla.urgent_max_hours', 'sla.normal_max_hours') AND helper = 'Block Managers may only choose a shorter timer';

UPDATE cfg_parameter SET helper = 'Managers may only choose a shorter time'
WHERE key = 'sla.room_change_max_hours' AND helper = 'Block Managers may only choose a shorter time';
