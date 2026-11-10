-- =====================================================================
-- CampusStay FPT — V67: transfer receipts and refund accounts (30/10/2026,
-- review items R-19, R-22, R-23).
-- 1. A Manager confirms a payment claim only with the transfer receipt.
--    Bulk confirmation needs one receipt per Invoice: it is attached to the
--    open claim first (bil_payment_claim.receipt_file_id), then the claims
--    with a receipt are confirmed together; the Payment keeps the file.
-- 2. The refund account's bank is chosen from the list of Vietnamese banks
--    and kept by its NAPAS / VietQR BIN (refund_bank keeps the short name
--    shown to Managers). The student commits that a wrong account is their
--    responsibility (refund_account_accepted_at). Free-text banks entered
--    before are matched by name; the others wait for the student to choose.
-- 3. REFUND_ACCOUNT_REMINDER: a Manager reminds a student whose refund
--    waits for their bank account.
-- =====================================================================

ALTER TABLE bil_payment_claim ADD COLUMN receipt_file_id BIGINT REFERENCES shared_file (id);

ALTER TABLE auth_student
    ADD COLUMN refund_bank_bin            VARCHAR(8),
    ADD COLUMN refund_account_accepted_at TIMESTAMPTZ;

UPDATE auth_student s SET refund_bank_bin = b.bin, refund_bank = b.short_name
FROM (VALUES
  ('970436', 'Vietcombank', 'vietcombank|vcb'),
  ('970415', 'VietinBank', 'vietinbank|vietin|icb|ctg'),
  ('970418', 'BIDV', 'bidv'),
  ('970405', 'Agribank', 'agribank|vba'),
  ('970422', 'MB Bank', 'mb|mbbank|mb bank|quan doi|quân đội'),
  ('970407', 'Techcombank', 'techcombank|tcb'),
  ('970416', 'ACB', 'acb|a chau|á châu'),
  ('970432', 'VPBank', 'vpbank|vp bank'),
  ('970423', 'TPBank', 'tpbank|tp bank|tien phong|tiên phong'),
  ('970403', 'Sacombank', 'sacombank|stb'),
  ('970437', 'HDBank', 'hdbank|hd bank'),
  ('970441', 'VIB', 'vib'),
  ('970443', 'SHB', 'shb'),
  ('970431', 'Eximbank', 'eximbank|eib'),
  ('970426', 'MSB', 'msb|maritime bank|hang hai|hàng hải'),
  ('970448', 'OCB', 'ocb|phuong dong|phương đông'),
  ('970440', 'SeABank', 'seabank|sea bank'),
  ('970449', 'LPBank', 'lpbank|lienvietpostbank|lienviet|lpb'),
  ('970412', 'PVcomBank', 'pvcombank|pvcom'),
  ('970428', 'Nam A Bank', 'nam a bank|namabank|nam a'),
  ('970409', 'Bac A Bank', 'bac a bank|bacabank|bac a'),
  ('970454', 'Viet Capital Bank', 'viet capital bank|vietcapitalbank|ban viet|bản việt|vccb')
) AS b (bin, short_name, names)
WHERE s.refund_bank IS NOT NULL
  AND lower(trim(s.refund_bank)) = ANY (string_to_array(b.names, '|'));

INSERT INTO ntf_template (key, event, push, title_en, title_vi, body, body_vi, variables) VALUES
  ('REFUND_ACCOUNT_REMINDER', 'A Manager reminds a student to enter the bank account for a refund',
     TRUE, 'Enter your bank account for the refund', 'Nhập tài khoản ngân hàng để nhận hoàn tiền',
     'A refund of {{amount}} is waiting for you ({{reason}}). Enter the bank account it should go to on Payments: a Manager can only transfer it once you do.',
     'Bạn có khoản hoàn tiền {{amount}} ({{reason}}). Hãy nhập tài khoản ngân hàng nhận tiền ở trang Thanh toán: Quản lý chỉ chuyển được khi bạn đã nhập.',
     '{amount,reason}')
ON CONFLICT (key) DO NOTHING;

-- A Manager reminds once a day at most.
ALTER TABLE bil_refund ADD COLUMN account_reminded_at TIMESTAMPTZ;
