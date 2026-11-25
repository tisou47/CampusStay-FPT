-- =====================================================================
-- CampusStay FPT — V108: a student submits their check-out declaration
-- (every item with a photo, the meter readings with a photo); after that
-- it can no longer be changed and Staff check the Room against it.
-- =====================================================================

CREATE TABLE asg_check_out_declaration (
    allocation_id BIGINT      PRIMARY KEY REFERENCES asg_allocation (id) ON DELETE CASCADE,
    submitted_at  TIMESTAMPTZ NOT NULL
);
