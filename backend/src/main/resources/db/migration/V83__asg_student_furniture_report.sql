-- =====================================================================
-- CampusStay FPT — V83: Student furniture damage/missing declarations
-- made during their stay, shown at check-out for Staff verification.
-- =====================================================================

CREATE TABLE asg_furniture_report (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id     BIGINT       NOT NULL REFERENCES asg_allocation (id) ON DELETE CASCADE,
    furniture_item_id BIGINT       NOT NULL REFERENCES inv_furniture_item (id),
    condition         VARCHAR(10)  NOT NULL CHECK (condition IN ('WORN', 'DAMAGED', 'MISSING')),
    note              VARCHAR(300),
    reported_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (allocation_id, furniture_item_id)
);
CREATE INDEX ix_furniture_report_alloc ON asg_furniture_report (allocation_id);
