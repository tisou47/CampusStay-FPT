-- BE-3RD-06: a new list of the same kind for the same Term closes the open items of the earlier one as SUPERSEDED,
-- so the counts do not double and the Term can still be reconciled.
ALTER TABLE auth_reconciliation_item DROP CONSTRAINT auth_reconciliation_item_outcome_check;
ALTER TABLE auth_reconciliation_item ADD CONSTRAINT auth_reconciliation_item_outcome_check
    CHECK (outcome IN ('NOT_ENROLLED', 'ENROLLED', 'SUPERSEDED'));
