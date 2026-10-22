package vn.fpt.campusstay.service.auth;

/**
 * Port implemented by Settings (system parameters): Auth shows the Audit Log and must
 * not depend on Settings, which already depends on Auth.
 */
public interface AuditLogSettings {

    /** How long Audit Log entries are kept (Admin › System parameters). */
    int retentionMonths();
}
