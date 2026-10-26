-- =====================================================================
-- CampusStay FPT — V44: payment claims, reminders and Utility warnings
-- (Change Specification v2 phase 5; ADR-22, spec §6.7, §6.14, §8, §12–§14).
--   * The student's "I have transferred" is a claim that a Manager confirms
--     or rejects. A claim stops the Invoice's deadline: time_left_seconds is
--     what was left, and a rejection gives it back (at least the configured
--     hours). A confirmed claim becomes a Payment of method TRANSFER, paid at
--     the time of the claim ("earlier Deposit first" uses it).
--   * SePay, its webhook and the payment simulator are gone. The bank-feed
--     inbox is kept read-only as bil_bank_transaction_archive: the Payments
--     it settled still point to it.
--   * An Invoice's money never changes once it is issued, a Paid or Void
--     Invoice never comes back (trigger), and an Invoice is refunded at most
--     once (unique index).
--   * Balance reminders are counted per Invoice; Utility warnings (warning 1,
--     final warning with its termination day) are kept per Allocation.
-- =====================================================================

ALTER TABLE bil_bank_transaction RENAME TO bil_bank_transaction_archive;
COMMENT ON TABLE bil_bank_transaction_archive IS
    'SePay webhook inbox until Change Specification v2 phase 5 (ADR-22); read-only archive';

CREATE TABLE bil_payment_claim (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id        BIGINT       NOT NULL REFERENCES bil_invoice (id),
    student_id        BIGINT       NOT NULL REFERENCES auth_user (id),
    claimed_at        TIMESTAMPTZ  NOT NULL,
    claimed_by        BIGINT       NOT NULL REFERENCES auth_user (id),  -- the student, or the Manager who saw the transfer
    reference         VARCHAR(60),                                      -- bank reference the student typed, optional
    time_left_seconds BIGINT       NOT NULL CHECK (time_left_seconds >= 0),
    status            VARCHAR(10)  NOT NULL DEFAULT 'CLAIMED' CHECK (status IN ('CLAIMED', 'CONFIRMED', 'REJECTED')),
    decided_by        BIGINT REFERENCES auth_user (id),
    decided_at        TIMESTAMPTZ,
    reason            VARCHAR(500),
    CONSTRAINT ck_claim_decided CHECK ((status = 'CLAIMED') = (decided_at IS NULL)),
    CONSTRAINT ck_claim_rejected CHECK (status <> 'REJECTED' OR reason IS NOT NULL)
);
-- One open claim per Invoice: a second "I have transferred" waits for the first decision.
CREATE UNIQUE INDEX ux_claim_open ON bil_payment_claim (invoice_id) WHERE status = 'CLAIMED';
CREATE INDEX ix_claim_invoice ON bil_payment_claim (invoice_id, claimed_at DESC);
CREATE INDEX ix_claim_waiting ON bil_payment_claim (claimed_at) WHERE status = 'CLAIMED';

ALTER TABLE bil_payment ADD COLUMN claim_id BIGINT UNIQUE REFERENCES bil_payment_claim (id);
ALTER TABLE bil_payment DROP CONSTRAINT bil_payment_method_check;
ALTER TABLE bil_payment ADD CONSTRAINT ck_payment_method CHECK (method IN ('VIETQR', 'MANUAL', 'TRANSFER'));
ALTER TABLE bil_payment DROP CONSTRAINT ck_payment_source;
ALTER TABLE bil_payment ADD CONSTRAINT ck_payment_source CHECK (
    (method = 'VIETQR' AND bank_transaction_id IS NOT NULL)
    OR (method = 'MANUAL' AND confirmed_by IS NOT NULL AND reference IS NOT NULL)
    OR (method = 'TRANSFER' AND claim_id IS NOT NULL AND confirmed_by IS NOT NULL));

ALTER TABLE bil_invoice DROP CONSTRAINT bil_invoice_payment_method_check;
ALTER TABLE bil_invoice ADD CONSTRAINT ck_invoice_payment_method
    CHECK (payment_method IN ('VIETQR', 'MANUAL', 'TRANSFER'));
-- Payment reminders sent before the deadline (Balance; spec §5.1 M7, §6.6): 0, 1 or 2.
ALTER TABLE bil_invoice ADD COLUMN reminders_sent SMALLINT NOT NULL DEFAULT 0 CHECK (reminders_sent BETWEEN 0 AND 2);

-- An Invoice keeps the money it was issued with; Paid and Void are final (spec §14).
CREATE FUNCTION bil_invoice_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.amount <> OLD.amount OR NEW.lines IS DISTINCT FROM OLD.lines OR NEW.utility_deposit <> OLD.utility_deposit
       OR NEW.type <> OLD.type OR NEW.student_id <> OLD.student_id OR NEW.term_id <> OLD.term_id
       OR NEW.code <> OLD.code OR NEW.transfer_content <> OLD.transfer_content THEN
        RAISE EXCEPTION 'Invoice % cannot change its amount, lines, type or student once issued', OLD.code
            USING ERRCODE = 'check_violation';
    END IF;
    IF (OLD.status IN ('PAID', 'REFUNDED') AND NEW.status NOT IN ('PAID', 'REFUNDED'))
       OR (OLD.status = 'VOID' AND NEW.status <> 'VOID') THEN
        RAISE EXCEPTION 'Invoice % is % and cannot become %', OLD.code, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tr_invoice_fixed BEFORE UPDATE ON bil_invoice FOR EACH ROW EXECUTE FUNCTION bil_invoice_fixed();

-- Refunds of a forfeit (Balance not paid) and of a termination (unused room fee, spec §6.15).
ALTER TABLE bil_refund DROP CONSTRAINT bil_refund_source_type_check;
ALTER TABLE bil_refund ADD CONSTRAINT ck_refund_source CHECK (source_type IN
    ('APPLICATION_CANCEL', 'CHECK_OUT', 'ROOM_CHANGE', 'OTHER', 'FORFEIT', 'TERMINATION'));
-- An Invoice is refunded at most once (a rejected refund does not count).
DO $$
BEGIN
    IF EXISTS (SELECT invoice_id FROM bil_refund WHERE invoice_id IS NOT NULL AND status <> 'REJECTED'
               GROUP BY invoice_id HAVING count(*) > 1) THEN
        RAISE WARNING 'An Invoice has two live refunds: ux_refund_one_per_invoice is not created';
    ELSE
        CREATE UNIQUE INDEX ux_refund_one_per_invoice ON bil_refund (invoice_id)
            WHERE invoice_id IS NOT NULL AND status <> 'REJECTED';
    END IF;
END $$;

-- Utility debt (spec §6.14, D-27): warning 1 when a Utility Invoice becomes overdue, the final warning when a
-- new one is issued (or the debt reaches the Utility Deposit) while one is overdue; paying everything closes them.
CREATE TABLE bil_utility_warning (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id BIGINT       NOT NULL REFERENCES asg_allocation (id),
    student_id    BIGINT       NOT NULL REFERENCES auth_user (id),
    term_id       BIGINT       NOT NULL REFERENCES cfg_term (id),
    building_id   BIGINT       REFERENCES inv_building (id),
    level         VARCHAR(5)   NOT NULL CHECK (level IN ('FIRST', 'FINAL')),
    invoice_id    BIGINT       NOT NULL REFERENCES bil_invoice (id),  -- the overdue Invoice, or the new one (final)
    overdue_count INT          NOT NULL CHECK (overdue_count >= 0),
    debt          BIGINT       NOT NULL CHECK (debt >= 0),
    terminate_on  DATE,                                              -- final warning: the earliest termination day
    issued_at     TIMESTAMPTZ  NOT NULL,
    closed_at     TIMESTAMPTZ,
    closed_reason VARCHAR(10)  CHECK (closed_reason IN ('PAID', 'TERMINATED', 'ENDED')),
    CONSTRAINT ck_warning_final CHECK ((level = 'FINAL') = (terminate_on IS NOT NULL)),
    CONSTRAINT ck_warning_closed CHECK ((closed_at IS NULL) = (closed_reason IS NULL))
);
CREATE UNIQUE INDEX ux_utility_warning_open ON bil_utility_warning (allocation_id, level) WHERE closed_at IS NULL;
CREATE INDEX ix_utility_warning_student ON bil_utility_warning (student_id, issued_at DESC);

-- ---------- read contract for reports ----------
CREATE VIEW rpt_v_payment_claim AS
SELECT c.id, c.invoice_id, i.term_id, i.building_id, i.gender, i.type, i.amount, c.status, c.claimed_at, c.decided_at
FROM bil_payment_claim c JOIN bil_invoice i ON i.id = c.invoice_id;

CREATE VIEW rpt_v_utility_warning AS
SELECT id, allocation_id, student_id, term_id, building_id, level, issued_at, closed_at, closed_reason
FROM bil_utility_warning;
