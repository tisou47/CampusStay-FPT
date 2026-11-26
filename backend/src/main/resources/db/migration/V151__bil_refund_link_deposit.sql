-- Deposit refunds of ended waitlists made before ef304b3 (25/11/2026) were recorded without their Invoice, so the
-- one-refund-per-Invoice check (JdbcBilling.refunded, ux_refund_one_per_invoice) did not see them. Link each to the
-- paid Deposit of its Application, one refund per Invoice, and only when that Invoice has no other live refund.
-- A refund left unlinked is named in a warning for a Manager to look at; nothing is rejected here.
WITH pick AS (
    SELECT DISTINCT ON (i.id) r.id AS refund_id, i.id AS invoice_id
    FROM bil_refund r
    JOIN bil_invoice i ON i.application_id = r.source_id AND i.type = 'DEPOSIT' AND i.status = 'PAID'
    WHERE r.invoice_id IS NULL AND r.source_type = 'APPLICATION_CANCEL' AND r.status <> 'REJECTED'
      AND (SELECT count(*) FROM bil_invoice d
           WHERE d.application_id = r.source_id AND d.type = 'DEPOSIT' AND d.status = 'PAID') = 1
      AND NOT EXISTS (SELECT 1 FROM bil_refund o WHERE o.invoice_id = i.id AND o.status <> 'REJECTED')
    ORDER BY i.id, r.id
)
UPDATE bil_refund r SET invoice_id = p.invoice_id FROM pick p WHERE r.id = p.refund_id;

DO $$
DECLARE
    left_over BIGINT;
BEGIN
    SELECT count(*) INTO left_over FROM bil_refund
    WHERE invoice_id IS NULL AND source_type = 'APPLICATION_CANCEL' AND status <> 'REJECTED';
    IF left_over > 0 THEN
        RAISE WARNING '% live APPLICATION_CANCEL refunds have no Invoice (a second refund of the same Deposit?)', left_over;
    END IF;
    -- V44 skipped the index when two live refunds shared an Invoice; create it now if it can be.
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_refund_one_per_invoice') THEN
        IF EXISTS (SELECT invoice_id FROM bil_refund WHERE invoice_id IS NOT NULL AND status <> 'REJECTED'
                   GROUP BY invoice_id HAVING count(*) > 1) THEN
            RAISE WARNING 'An Invoice has two live refunds: ux_refund_one_per_invoice is still not created';
        ELSE
            CREATE UNIQUE INDEX ux_refund_one_per_invoice ON bil_refund (invoice_id)
                WHERE invoice_id IS NOT NULL AND status <> 'REJECTED';
        END IF;
    END IF;
END $$;
