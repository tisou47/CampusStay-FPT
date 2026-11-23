-- A Manager records that an approved refund was transferred (review finding BE-APP-BIL-03).
ALTER TABLE bil_refund
    ADD COLUMN paid_reference VARCHAR(100),
    ADD COLUMN paid_at        TIMESTAMPTZ,
    ADD COLUMN paid_by        BIGINT REFERENCES auth_user (id);
