package vn.fpt.campusstay.service.setting;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.auth.AuditLogSettings;
import vn.fpt.campusstay.service.setting.Parameters;

/** System parameters for other modules; also Auth's {@link AuditLogSettings} port. */
@Component
@Transactional(readOnly = true)
class JdbcParameters implements Parameters, AuditLogSettings {

    private final JdbcClient jdbc;

    JdbcParameters(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int intValue(String key) {
        String value = jdbc.sql("SELECT value FROM cfg_parameter WHERE key = :key").param("key", key)
                .query(String.class).optional()
                .orElseThrow(() -> new IllegalStateException("Missing system parameter " + key));
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            throw new IllegalStateException("System parameter " + key + " is not a whole number", e);
        }
    }

    @Override
    public String textValue(String key) {
        return jdbc.sql("SELECT value FROM cfg_parameter WHERE key = :key").param("key", key)
                .query(String.class).optional()
                .orElseThrow(() -> new IllegalStateException("Missing system parameter " + key));
    }

    @Override
    public int retentionMonths() {
        return intValue("audit.retention_months");
    }
}
