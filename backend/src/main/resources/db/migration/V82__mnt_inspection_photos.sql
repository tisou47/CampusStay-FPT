-- =====================================================================
-- CampusStay FPT — V82: photos of a Room inspection, like those of a
-- student's check-in inventory (asg_handover_photo): each one shows a
-- furniture item of the Room ("FURNITURE:<item id>") or, without a
-- check key, the meters. The inspection is Report 1 (the Room's record)
-- a new resident's inventory is compared with.
-- =====================================================================

CREATE TABLE mnt_inspection_photo (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inspection_room_id BIGINT      NOT NULL REFERENCES mnt_inspection_room (id) ON DELETE CASCADE,
    check_key          VARCHAR(30) CHECK (check_key IS NULL OR check_key ~ '^FURNITURE:[0-9]+$'),
    file_id            BIGINT      NOT NULL REFERENCES shared_file (id),
    taken_by           BIGINT      NOT NULL REFERENCES auth_user (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_inspection_photo ON mnt_inspection_photo (inspection_room_id);
