-- Family Day wrote its Audit Log actions as labels ("Family Day guest checked in") instead of codes like every other
-- feature (FAMILY_DAY_GUEST_CHECKED_IN). Admin › Audit Log turns a chosen label back into a code to filter, so those
-- entries could not be found. The service now writes codes; this turns the entries already written into codes too.
UPDATE shared_audit_log
SET action = upper(translate(action, ' -', '__'))
WHERE action LIKE 'Family Day %';
