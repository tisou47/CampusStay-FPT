-- =====================================================================
-- CampusStay FPT — V14: check-out settlement snapshot (S4)
-- A completed check-out keeps the figures it was settled with: once its
-- meter reading is recorded, a new estimate would start from that reading.
-- =====================================================================

ALTER TABLE asg_check_out
    ADD COLUMN deposit_held   BIGINT      CHECK (deposit_held >= 0),
    ADD COLUMN utility_share  BIGINT      CHECK (utility_share >= 0),
    ADD COLUMN unpaid_utility BIGINT      CHECK (unpaid_utility >= 0),
    ADD COLUMN share_period   VARCHAR(40),
    ADD COLUMN settled_amount BIGINT,                 -- refund (>= 0) or, negative, what the student still owes
    ADD COLUMN draft_by       BIGINT REFERENCES auth_user (id),
    ADD COLUMN updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();
