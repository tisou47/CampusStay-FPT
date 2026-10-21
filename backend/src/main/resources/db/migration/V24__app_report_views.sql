-- =====================================================================
-- CampusStay FPT — V24: APP read contract for reports (RPT reads views only)
-- =====================================================================

CREATE VIEW rpt_v_application AS
SELECT id, code, term_id, student_id, student_name, student_code, gender, room_type_id, room_class_id, status,
       created_at, submitted_at, deposit_due_at
FROM app_application;
