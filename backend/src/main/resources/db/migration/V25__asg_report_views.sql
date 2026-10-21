-- =====================================================================
-- CampusStay FPT — V25: ASG read contract for reports (RPT reads views only)
-- Allocations, assignment runs with their per-Block review, proposals and
-- late check-ins.
-- =====================================================================

CREATE VIEW rpt_v_allocation AS
SELECT id, term_id, student_id, bed_id, status, allocated_at, checked_in_at, ended_at, end_reason
FROM asg_allocation;

CREATE VIEW rpt_v_assignment_run AS
SELECT id, term_id, kind, status, started_at, input_count, proposed_count, conflict_count, waitlisted_count
FROM asg_run;

CREATE VIEW rpt_v_assignment_run_block AS
SELECT run_id, building_id, status, submitted_at
FROM asg_run_block;

CREATE VIEW rpt_v_proposal AS
SELECT run_id, building_id, bed_id, issue_code IS NOT NULL AND NOT resolved AS open_conflict, waitlisted
FROM asg_proposal_item;

CREATE VIEW rpt_v_late_check_in AS
SELECT id, allocation_id, status, created_at
FROM asg_late_check_in;
