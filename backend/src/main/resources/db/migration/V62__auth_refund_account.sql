-- =====================================================================
-- CampusStay FPT — V62: the bank account a student's refunds are paid to
-- (29/10/2026). A student who is not placed in Round 1 may withdraw from
-- the waitlist, decline the Round-2 offer or wait until check-in starts;
-- each way the Deposit comes back in full, and a Manager transfers it to
-- this account. It is kept on the student, so refunds the system starts
-- (an expired offer, the end of the waitlist) find it too.
-- =====================================================================

ALTER TABLE auth_student
    ADD COLUMN refund_account_holder VARCHAR(100),
    ADD COLUMN refund_account_number VARCHAR(30),
    ADD COLUMN refund_bank           VARCHAR(100),
    ADD COLUMN refund_account_at     TIMESTAMPTZ;
