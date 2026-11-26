-- Owner decision 25/11/2026: shared damage a student declined goes to a Manager, who keeps it (charged as if
-- acknowledged) or drops it (nobody pays). Until then it waits on Decisions › Check-out charges.
ALTER TABLE asg_damage_claim
    ADD COLUMN manager_review VARCHAR(10) CHECK (manager_review IN ('KEPT', 'DROPPED')),
    ADD COLUMN reviewed_by    BIGINT REFERENCES auth_user (id),
    ADD COLUMN reviewed_at    TIMESTAMPTZ,
    ADD COLUMN review_note    VARCHAR(300),
    ADD CONSTRAINT ck_damage_claim_review CHECK (manager_review IS NULL OR status = 'DECLINED');

CREATE INDEX ix_damage_claim_declined ON asg_damage_claim (id) WHERE status = 'DECLINED' AND manager_review IS NULL;
