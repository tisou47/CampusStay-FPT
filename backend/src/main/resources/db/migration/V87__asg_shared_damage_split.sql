-- Damage to a shared item found at a check-out is split evenly among the Room's residents (the leaver and the
-- roommates still living there): the leaver's line keeps their share in amount, the full charge and the number of
-- residents it was split among are kept here, and each roommate gets a DAMAGE Invoice for their share when the
-- check-out is completed (or when a Manager keeps the line afterwards).
ALTER TABLE asg_check_out_damage
    ADD COLUMN shared_with INT CHECK (shared_with >= 1),
    ADD COLUMN full_amount BIGINT CHECK (full_amount >= 0);
