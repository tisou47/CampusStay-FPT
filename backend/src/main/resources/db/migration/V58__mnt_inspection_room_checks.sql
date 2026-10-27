-- =====================================================================
-- CampusStay FPT — V58: the Room's own checks in an inspection (Change
-- Specification v2 §6.19). Besides the checklist items, every Room of a run
-- is checked for "the number of people matches the residents" (key PEOPLE)
-- and for each furniture item in it (key FURNITURE:<item id>). A failed
-- furniture item creates a Maintenance Request that names the item.
-- =====================================================================

CREATE TABLE mnt_inspection_room_check (
    inspection_room_id BIGINT       NOT NULL REFERENCES mnt_inspection_room (id) ON DELETE CASCADE,
    check_key          VARCHAR(30)  NOT NULL,
    result             VARCHAR(12)  NOT NULL CHECK (result IN ('PASS', 'FAIL', 'NOT_CHECKED')),
    note               VARCHAR(500),
    created_request_id BIGINT       REFERENCES mnt_request (id),
    PRIMARY KEY (inspection_room_id, check_key),
    CONSTRAINT ck_inspection_check_key CHECK (check_key = 'PEOPLE' OR check_key ~ '^FURNITURE:[0-9]+$')
);
