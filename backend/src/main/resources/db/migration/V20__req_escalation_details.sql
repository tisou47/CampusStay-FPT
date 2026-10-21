-- =====================================================================
-- CampusStay FPT — V20: what an escalation shows (S6)
-- The escalation keeps the request's code, when it started, the line under
-- its title, the Room and the link to the request as they were when it
-- opened: REQ must not read the MNT tables of a request that has closed since.
-- =====================================================================

ALTER TABLE req_escalation
    ADD COLUMN source_code VARCHAR(30),
    ADD COLUMN source_at   TIMESTAMPTZ,
    ADD COLUMN subtitle    VARCHAR(200),
    ADD COLUMN room_code   VARCHAR(20),
    ADD COLUMN link        VARCHAR(200);

CREATE INDEX ix_escalation_source_code ON req_escalation (source_code);
