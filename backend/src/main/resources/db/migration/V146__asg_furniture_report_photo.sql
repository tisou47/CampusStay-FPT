-- =====================================================================
-- CampusStay FPT — V146: photos of a student's furniture declaration
-- (worn, damaged or missing), taken in the app and shown at check-out.
-- =====================================================================

CREATE TABLE asg_furniture_report_photo (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id     BIGINT      NOT NULL REFERENCES asg_allocation (id) ON DELETE CASCADE,
    furniture_item_id BIGINT      NOT NULL REFERENCES inv_furniture_item (id),
    file_id           BIGINT      NOT NULL REFERENCES shared_file (id),
    taken_by          BIGINT      NOT NULL REFERENCES auth_user (id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_furniture_report_photo ON asg_furniture_report_photo (allocation_id, furniture_item_id);
