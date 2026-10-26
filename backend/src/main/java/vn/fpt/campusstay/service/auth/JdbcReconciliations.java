package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Implements {@link Reconciliations} on {@code auth_reconciliation} and its items. */
@Component
@Transactional(readOnly = true)
class JdbcReconciliations implements Reconciliations {

    private final JdbcClient jdbc;

    JdbcReconciliations(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Status status(long termId) {
        return jdbc.sql("""
                SELECT count(*) AS runs, max(created_at) AS last_at,
                       (SELECT count(*) FROM auth_reconciliation_item i JOIN auth_reconciliation r2
                               ON r2.id = i.reconciliation_id
                        WHERE r2.term_id = :t AND i.status = 'OPEN') AS open_items
                FROM auth_reconciliation WHERE term_id = :t
                """).param("t", termId)
                .query((rs, i) -> {
                    Timestamp last = rs.getTimestamp("last_at");
                    return new Status(rs.getLong("runs"), rs.getLong("open_items"), last == null ? null : last.toInstant());
                })
                .single();
    }
}
