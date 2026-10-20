package vn.fpt.campusstay.auth;

/**
 * Port implemented by CFG (system parameters): AUTH shows the Audit Log and must
 * not depend on CFG, which already depends on AUTH.
 */
public interface AuditLogSettings {

    /** How long Audit Log entries are kept (Admin › System parameters). */
    int retentionMonths();
}
