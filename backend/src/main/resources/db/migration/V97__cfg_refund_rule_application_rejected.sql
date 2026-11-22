-- An Application the office rejects (or one no longer active when its Deposit is confirmed) refunds the whole
-- Deposit, whatever the student-cancellation rules say (review findings BE-APP-BIL-04, BE-APP-BIL-06).
INSERT INTO cfg_refund_rule (trigger_code, description, refund_percent, approver_role, sort_order)
SELECT 'APPLICATION_REJECTED', 'Application not approved by the dormitory office (the whole Deposit)', 100, 'SYSTEM', 8
WHERE NOT EXISTS (SELECT 1 FROM cfg_refund_rule WHERE trigger_code = 'APPLICATION_REJECTED');
