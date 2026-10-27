-- =====================================================================
-- Demo data — Accounts (AUTH): fictional students are back to verified,
-- enrolled and unlocked (AuthDemoData.clear); SE220006 signed up with Google and waits for
-- verification. From stage B the enrolled list of N+1 is reconciled
-- (groups 1–2 resolved, 3–4 for information).
-- =====================================================================

UPDATE auth_student SET verification = 'PENDING', verified_at = NULL, verified_by = NULL
WHERE student_code = 'SE220006';

INSERT INTO auth_reconciliation (term_id, kind, file_name, rows_read, created_by, created_at)
SELECT t.x_id, 'ENROLLED', 'enrolled-' || lower(t.x_code) || '.csv',
       (SELECT count(*) FROM demo_res) + (SELECT count(*) FROM demo_app) + 1,
       (SELECT id FROM demo_staff WHERE account = 'manager.a'), t.x_m5 - interval '2 days'
FROM demo_t t WHERE t.stage IN ('B', 'C');

INSERT INTO auth_reconciliation_item (reconciliation_id, grp, student_id, student_code, student_name, roles,
                                      file_status, directory_status, line_no, status, outcome, note, resolved_by,
                                      resolved_at)
SELECT rc.id, i.grp, d.student_id, d.code, d.name, i.roles, i.file_status, 'ENROLLED', i.line, i.status, i.outcome,
       i.note, CASE WHEN i.status = 'RESOLVED' THEN rc.created_by END,
       CASE WHEN i.status = 'RESOLVED' THEN rc.created_at + interval '3 hours' END
FROM auth_reconciliation rc
JOIN (VALUES (1, 'RESIDENT,CONTINUING', 'SUSPENDED', 12, 'RESOLVED', 'ENROLLED',
              'The Academic Office confirmed the suspension ended; keeps the Bed.', 7),
             (2, 'RESIDENT,CONTINUING', NULL, NULL, 'RESOLVED', 'ENROLLED',
              'Missing from the file by mistake; confirmed by phone with the Academic Office.', 8),
             (4, 'RESIDENT,CONTINUING', 'ENROLLED', 31, 'INFO', NULL, NULL, 9)) i
     (grp, roles, file_status, line, status, outcome, note, pick) ON TRUE
JOIN (SELECT r.*, row_number() OVER (ORDER BY r.h, r.student_id) AS rn FROM demo_res r
      WHERE r.scenario IS NULL AND r.x_state = 'CONTINUING') d ON d.rn = i.pick;

INSERT INTO auth_reconciliation_item (reconciliation_id, grp, student_code, student_name, file_status, line_no, status)
SELECT rc.id, 3, 'SE229999', 'Tran Van Moi', 'ENROLLED', 45, 'INFO' FROM auth_reconciliation rc;
