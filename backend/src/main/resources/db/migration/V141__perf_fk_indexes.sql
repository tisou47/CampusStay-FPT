-- =====================================================================
-- CampusStay FPT — V141: indexes on the foreign keys read by student and
-- list screens (BE-PLT-22). Audit "*_by" columns stay unindexed.
-- =====================================================================

CREATE INDEX IF NOT EXISTS ix_mnt_reporter ON mnt_request (reporter_id);
CREATE INDEX IF NOT EXISTS ix_alloc_application ON asg_allocation (application_id);
CREATE INDEX IF NOT EXISTS ix_email_outbox_campaign ON ntf_email_outbox (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_rc_allocation ON req_room_change (allocation_id);
CREATE INDEX IF NOT EXISTS ix_claim_student ON bil_payment_claim (student_id);
CREATE INDEX IF NOT EXISTS ix_vis_registration_student ON vis_registration (student_id);
CREATE INDEX IF NOT EXISTS ix_move_student ON asg_move (student_id);
CREATE INDEX IF NOT EXISTS ix_announcement_read_user ON ntf_announcement_read (user_id);
