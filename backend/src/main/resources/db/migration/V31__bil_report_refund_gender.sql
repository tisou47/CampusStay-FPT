-- =====================================================================
-- CampusStay FPT — V31: the student's gender on the refund report view
-- A refund without a Bed (cancelled Application) belongs to the Blocks of the
-- student's gender, like its Invoice (V17), so reports and dashboards count it
-- in the right Blocks.
-- =====================================================================

CREATE OR REPLACE VIEW rpt_v_refund AS
SELECT id, term_id, student_id, building_id, source_type, amount, status, decided_at, gender
FROM bil_refund;
