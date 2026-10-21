-- =====================================================================
-- CampusStay FPT — V12: BIL changes for Deposits and VietQR (S2)
-- =====================================================================

-- What an Invoice is for, shown on the payment page ("For: Application
-- APP-SP27-000001"). BIL stores it because it must not read APP tables.
ALTER TABLE bil_invoice ADD COLUMN reference VARCHAR(60);

-- V6 allowed source_type 'APPLICATION_CANCEL' (18 characters) in a VARCHAR(16).
ALTER TABLE bil_refund ALTER COLUMN source_type TYPE VARCHAR(20);
