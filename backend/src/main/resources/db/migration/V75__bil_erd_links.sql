-- =====================================================================
-- CampusStay FPT — V75: the links of the conceptual ERD (Chen) that Billing
-- kept only as text or as a polymorphic source, now real foreign keys:
--   generating  Meter Reading 1 : M Invoice   bil_invoice.meter_reading_id
--   returning   Check-out     1 : 1 Refund    bil_refund.check_out_id
--   refunding   Application   1 : M Refund    bil_refund.application_id
-- source_type / source_id stay as they are (every refund source keeps
-- working); the new columns are filled when the refund or Invoice is made.
-- =====================================================================

-- A Utility Invoice is issued from one Room's reading of a closed meter period.
ALTER TABLE bil_invoice ADD COLUMN meter_reading_id BIGINT REFERENCES bil_meter_reading (id);
CREATE INDEX ix_invoice_meter_reading ON bil_invoice (meter_reading_id) WHERE meter_reading_id IS NOT NULL;

-- Issued Invoices so far: the title is 'Utility · <period label>' and the breakdown names the Room.
-- (tr_invoice_fixed only guards money, type, student and status, so this update passes.)
UPDATE bil_invoice i SET meter_reading_id = mr.id
FROM bil_meter_period p
JOIN bil_meter_reading mr ON mr.period_id = p.id
JOIN inv_room r ON r.id = mr.room_id
WHERE i.type = 'UTILITY' AND i.meter_reading_id IS NULL
  AND p.building_id = i.building_id AND i.title = 'Utility · ' || p.label
  AND r.code = i.breakdown ->> 'room';

-- A refund of the Utility Deposit settled at a check-out.
ALTER TABLE bil_refund ADD COLUMN check_out_id BIGINT REFERENCES asg_check_out (id);
-- A refund because an Application was cancelled (its Deposit, or a Round-2 credit).
ALTER TABLE bil_refund ADD COLUMN application_id BIGINT REFERENCES app_application (id);

-- CHECK_OUT refunds carry the Allocation as source_id; APPLICATION_CANCEL ones the Application.
UPDATE bil_refund f SET check_out_id = c.id
FROM asg_check_out c
WHERE f.source_type = 'CHECK_OUT' AND c.allocation_id = f.source_id;
UPDATE bil_refund f SET application_id = f.source_id
WHERE f.source_type = 'APPLICATION_CANCEL' AND EXISTS (SELECT 1 FROM app_application a WHERE a.id = f.source_id);

-- One live refund per check-out (a rejected one does not count), as the ERD's 1 : 1.
CREATE UNIQUE INDEX ux_refund_one_per_check_out ON bil_refund (check_out_id)
    WHERE check_out_id IS NOT NULL AND status <> 'REJECTED';
CREATE INDEX ix_refund_application ON bil_refund (application_id) WHERE application_id IS NOT NULL;
