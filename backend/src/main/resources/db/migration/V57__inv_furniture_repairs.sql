-- =====================================================================
-- CampusStay FPT — V57: repairs in a furniture item's history (Change
-- Specification v2 phase 7; spec §6.18). When a Maintenance Request names an
-- item, the item's history gets a REPAIR entry when it is reported and when
-- it is resolved (from_value = the request's code, reason = its title).
-- =====================================================================

ALTER TABLE inv_furniture_event DROP CONSTRAINT inv_furniture_event_kind_check;
ALTER TABLE inv_furniture_event
    ADD CONSTRAINT inv_furniture_event_kind_check CHECK (kind IN ('REGISTERED', 'STATUS', 'MOVED', 'REPAIR'));
