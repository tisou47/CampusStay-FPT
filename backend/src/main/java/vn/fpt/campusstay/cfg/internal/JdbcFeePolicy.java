package vn.fpt.campusstay.cfg.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.cfg.FeePolicy;
import vn.fpt.campusstay.cfg.Parameters;

@Component
@Transactional(readOnly = true)
class JdbcFeePolicy implements FeePolicy {

    private final JdbcClient jdbc;
    private final Parameters parameters;

    JdbcFeePolicy(JdbcClient jdbc, Parameters parameters) {
        this.jdbc = jdbc;
        this.parameters = parameters;
    }

    @Override
    public OptionalLong termPrice(long roomTypeId, long roomClassId) {
        Optional<BigDecimal> raw = jdbc.sql("""
                SELECT t.base_price * (1 + c.surcharge_rate)
                FROM cfg_room_type t, cfg_room_class c
                WHERE t.id = :type AND c.id = :class AND t.status = 'ACTIVE' AND c.status = 'ACTIVE'
                """)
                .param("type", roomTypeId).param("class", roomClassId)
                .query(BigDecimal.class).optional();
        if (raw.isEmpty()) {
            return OptionalLong.empty();
        }
        return OptionalLong.of(roundUp(raw.get(), parameters.intValue("pricing.rounding_vnd")));
    }

    @Override
    public BigDecimal depositRate() {
        BigDecimal percent = jdbc.sql("SELECT deposit_percent FROM cfg_fee_policy WHERE id = 1")
                .query(BigDecimal.class).single();
        return Decimals.plain(percent.movePointLeft(2));
    }

    @Override
    public long deposit(long termPrice) {
        return BigDecimal.valueOf(termPrice).multiply(depositRate()).setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    @Override
    public long utilityDeposit() {
        return jdbc.sql("SELECT estimate_monthly * months_held FROM cfg_utility_policy WHERE id = 1")
                .query(Long.class).single();
    }

    @Override
    public Map<Long, RefundRule> refundRules() {
        Map<Long, RefundRule> result = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT id, trigger_code, description, refund_percent, approver_role FROM cfg_refund_rule
                ORDER BY sort_order, id
                """)
                .query((rs, i) -> new RefundRule(rs.getLong("id"), rs.getString("trigger_code"),
                        rs.getString("description"), Decimals.plain(rs.getBigDecimal("refund_percent")),
                        rs.getString("approver_role")))
                .list().forEach(r -> result.put(r.id(), r));
        return result;
    }

    @Override
    public Optional<RefundRule> refundRule(String triggerCode) {
        return jdbc.sql("""
                SELECT id, trigger_code, description, refund_percent, approver_role FROM cfg_refund_rule
                WHERE trigger_code = :code AND active ORDER BY sort_order, id LIMIT 1
                """)
                .param("code", triggerCode)
                .query((rs, i) -> new RefundRule(rs.getLong("id"), rs.getString("trigger_code"),
                        rs.getString("description"), Decimals.plain(rs.getBigDecimal("refund_percent")),
                        rs.getString("approver_role")))
                .optional();
    }

    @Override
    public boolean manualConfirmAllowed() {
        return jdbc.sql("SELECT allow_manual_confirm FROM cfg_fee_policy WHERE id = 1").query(Boolean.class).single();
    }

    @Override
    public int balanceDays() {
        return jdbc.sql("SELECT balance_days FROM cfg_fee_policy WHERE id = 1").query(Integer.class).single();
    }

    /** {@code 10,350,001} with step 1,000 → {@code 10,351,000}. */
    static long roundUp(BigDecimal amount, int step) {
        BigDecimal s = BigDecimal.valueOf(Math.max(1, step));
        return amount.divide(s, 0, RoundingMode.CEILING).multiply(s).longValueExact();
    }
}
