-- =====================================================================
-- CampusStay FPT — V106: the meter readings a student enters at check-out
-- (with photos of the meters), shown to Staff next to their own reading.
-- A declaration photo without an item is a photo of the meters.
-- =====================================================================

CREATE TABLE asg_check_out_meter_report (
    allocation_id BIGINT        PRIMARY KEY REFERENCES asg_allocation (id) ON DELETE CASCADE,
    electricity   NUMERIC(10,1) CHECK (electricity >= 0),
    water         NUMERIC(10,1) CHECK (water >= 0),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE asg_furniture_report_photo ALTER COLUMN furniture_item_id DROP NOT NULL;
