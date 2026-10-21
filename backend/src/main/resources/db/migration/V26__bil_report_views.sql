-- =====================================================================
-- CampusStay FPT — V26: BIL read contract for reports (RPT reads views only)
-- =====================================================================

CREATE VIEW rpt_v_invoice AS
SELECT id, code, term_id, student_id, student_name, student_code, gender, building_id, type, title, amount, status,
       issued_at, due_at, paid_at
FROM bil_invoice;

CREATE VIEW rpt_v_refund AS
SELECT id, term_id, student_id, building_id, source_type, amount, status, decided_at
FROM bil_refund;
