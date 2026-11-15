-- =====================================================================
-- CampusStay FPT — V76: the ERD's "recording" (User Account 1 : M Audit
-- Log) as a foreign key. actor_id stays nullable: system jobs write
-- entries without a user. Users are never deleted, so every past actor
-- exists; the check below still keeps a deployment from failing if one
-- did not (new entries are checked either way).
-- =====================================================================

ALTER TABLE shared_audit_log
    ADD CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES auth_user (id) NOT VALID;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM shared_audit_log l
                   WHERE l.actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth_user u WHERE u.id = l.actor_id)) THEN
        ALTER TABLE shared_audit_log VALIDATE CONSTRAINT fk_audit_actor;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_audit_actor ON shared_audit_log (actor_id) WHERE actor_id IS NOT NULL;
