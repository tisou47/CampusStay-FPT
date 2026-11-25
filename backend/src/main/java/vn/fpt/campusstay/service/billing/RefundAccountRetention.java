package vn.fpt.campusstay.service.billing;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.service.auth.RefundAccounts;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Decree 13/2023 (W3-D3): a student's refund bank account is kept only while a refund needs it. Daily, the accounts
 * of students whose last refund was paid more than {@code privacy.bank_account_retention_days} days ago, with no
 * refund still open, are cleared through AUTH's port.
 */
@Service
public class RefundAccountRetention {

    private static final Logger log = LoggerFactory.getLogger(RefundAccountRetention.class);

    private final JdbcClient jdbc;
    private final RefundAccounts accounts;
    private final Parameters parameters;
    private final AuditLog audit;
    private final Clock clock;

    RefundAccountRetention(JdbcClient jdbc, RefundAccounts accounts, Parameters parameters, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.parameters = parameters;
        this.audit = audit;
        this.clock = clock;
    }

    /** @return how many bank accounts were cleared */
    @Transactional
    public int run() {
        Instant before = Instant.now(clock)
                .minus(Duration.ofDays(Math.max(0, parameters.intValue("privacy.bank_account_retention_days"))));
        List<Long> students = jdbc.sql("""
                SELECT student_id FROM bil_refund GROUP BY student_id
                HAVING bool_and(status IN ('PAID', 'REJECTED')) AND max(paid_at) IS NOT NULL AND max(paid_at) < :before
                """).param("before", Timestamp.from(before)).query(Long.class).list();
        int cleared = accounts.clear(students);
        if (cleared > 0) {
            audit.record(Actor.SYSTEM, "REFUND_ACCOUNTS_CLEARED", AuditLog.Tone.INFO, "Refund accounts", null,
                    "Retention", Map.of("cleared", cleared));
            log.info("{} refund bank accounts cleared after their retention period", cleared);
        }
        return cleared;
    }

    @Scheduled(cron = "${campusstay.bil.refund-account-retention-cron:0 30 3 * * *}", zone = "Asia/Ho_Chi_Minh")
    void daily() {
        run();
    }
}
