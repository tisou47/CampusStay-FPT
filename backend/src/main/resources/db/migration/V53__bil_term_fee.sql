-- =====================================================================
-- CampusStay FPT — V53: the next-Term room fee (Change Specification v2
-- phase 6; D-15, D-31, spec §6.10 step 4, §6.11 step 6, §8, §12).
--   * TERM_FEE: "Room fee · Term N+1 · Room X", 100 % of the next Term's price
--     of the Bed's Room Type × the Room's Room Class in that Term, issued by a
--     Manager at M6 to each continuing resident; no Deposit, the Utility
--     Deposit stays held. Unpaid at M7 (no open claim) it is void and the
--     next-Term Allocation is cancelled; it is never Overdue.
--   * One live next-Term fee per Allocation.
--   * A refund for a Room Class set back after the fee was paid (§6.11 step 6).
--   * Meter readings cut at an operational move and at the turnover.
-- =====================================================================

ALTER TABLE bil_invoice DROP CONSTRAINT bil_invoice_type_check;
ALTER TABLE bil_invoice ADD CONSTRAINT ck_invoice_type
    CHECK (type IN ('DEPOSIT', 'BALANCE', 'UTILITY', 'ROOM_CHANGE', 'DAMAGE', 'TERM_FEE'));

CREATE UNIQUE INDEX ux_invoice_one_term_fee ON bil_invoice (allocation_id)
    WHERE type = 'TERM_FEE' AND status <> 'VOID';

ALTER TABLE bil_refund DROP CONSTRAINT ck_refund_source;
ALTER TABLE bil_refund ADD CONSTRAINT ck_refund_source CHECK (source_type IN
    ('APPLICATION_CANCEL', 'CHECK_OUT', 'ROOM_CHANGE', 'OTHER', 'FORFEIT', 'TERMINATION', 'ROOM_CLASS'));

-- Meter readings cut when residents change during a Term (an operational move, spec §6.13) or at the turnover
-- between two Terms (spec §5.1 M9), besides check-in, check-out, room changes and swaps.
ALTER TABLE bil_meter_cut DROP CONSTRAINT bil_meter_cut_reason_check;
ALTER TABLE bil_meter_cut ADD CONSTRAINT ck_meter_cut_reason
    CHECK (reason IN ('CHECK_IN', 'CHECK_OUT', 'ROOM_CHANGE', 'SWAP', 'MOVE', 'TURNOVER'));
