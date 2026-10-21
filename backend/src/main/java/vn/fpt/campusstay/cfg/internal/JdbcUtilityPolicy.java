package vn.fpt.campusstay.cfg.internal;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.cfg.UtilityPolicy;

/** Reads the singleton {@code cfg_utility_policy}. */
@Component
@Transactional(readOnly = true)
class JdbcUtilityPolicy implements UtilityPolicy {

    private final JdbcClient jdbc;

    JdbcUtilityPolicy(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Prices prices() {
        return jdbc.sql("SELECT price_kwh, price_m3, rounding, payment_due_days FROM cfg_utility_policy WHERE id = 1")
                .query((rs, i) -> new Prices(rs.getLong("price_kwh"), rs.getLong("price_m3"), rs.getString("rounding"),
                        rs.getInt("payment_due_days")))
                .single();
    }

    @Override
    public boolean blockChangesWhenOverdue() {
        return jdbc.sql("SELECT block_changes_when_overdue FROM cfg_utility_policy WHERE id = 1").query(Boolean.class)
                .single();
    }
}
