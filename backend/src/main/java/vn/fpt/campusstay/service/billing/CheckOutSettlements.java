package vn.fpt.campusstay.service.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.UtilityPolicy;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * The Utility Deposit settlement at check-out. A Utility Invoice whose claim waits for a Manager is not taken from
 * the deposit: the Manager's decision settles it (spec §6.7). The final share covers the
 * Room's consumption since its last reading (a monthly reading or a reading
 * taken when residents changed), split evenly between the current residents
 * and rounded by the Admin rule.
 */
@Component
class CheckOutSettlements {

    record Computed(Billing.Settlement settlement, List<Long> unpaidUtilityIds) {
    }

    private record Reading(LocalDate date, BigDecimal electricity, BigDecimal water) {
    }

    private record Unpaid(long id, long amount) {
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final Map<String, String> REFUND_STATUSES = Map.of("PENDING", "Pending", "APPROVED", "Approved",
            "REJECTED", "Rejected", "PAID", "Paid");

    private final JdbcClient jdbc;
    private final UtilityPolicy utility;

    CheckOutSettlements(JdbcClient jdbc, UtilityPolicy utility) {
        this.jdbc = jdbc;
        this.utility = utility;
    }

    Map<Long, Billing.CheckInDue> dues(Collection<Long> allocationIds) {
        Map<Long, Billing.CheckInDue> result = new HashMap<>();
        if (allocationIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT allocation_id, code, amount, utility_deposit FROM bil_invoice
                WHERE allocation_id IN (:allocations) AND type IN ('BALANCE', 'TERM_FEE')
                  AND status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')
                ORDER BY id
                """).param("allocations", List.copyOf(allocationIds))
                .query((rs, i) -> Map.entry(rs.getLong("allocation_id"), new Billing.CheckInDue(rs.getString("code"),
                        rs.getLong("amount") - rs.getLong("utility_deposit"), rs.getLong("utility_deposit"))))
                .list().forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    Computed compute(Billing.SettlementRequest r) {
        // The Utility Deposit is held for the whole Stay and settles its Utility debt (spec §8).
        List<Long> stay = r.stayAllocationIds() == null || r.stayAllocationIds().isEmpty() ? List.of(r.allocationId())
                : r.stayAllocationIds();
        long held = jdbc.sql("""
                SELECT coalesce(sum(utility_deposit), 0) FROM bil_invoice
                WHERE allocation_id IN (:allocations) AND status = 'PAID'
                """).param("allocations", stay).query(Long.class).single();
        List<Unpaid> unpaid = jdbc.sql("""
                SELECT id, amount FROM bil_invoice
                WHERE student_id = :student AND type = 'UTILITY' AND status IN ('UNPAID', 'OVERDUE')
                  AND (term_id = :term OR allocation_id IN (:allocations))
                """).param("student", r.studentId()).param("term", r.termId()).param("allocations", stay)
                .query((rs, i) -> new Unpaid(rs.getLong("id"), rs.getLong("amount"))).list();
        long unpaidTotal = unpaid.stream().mapToLong(Unpaid::amount).sum();

        long share = 0;
        String periodLabel = null;
        Optional<Reading> last = lastReading(r.roomId());
        if (r.electricity() != null && r.water() != null && last.isPresent()) {
            Reading from = last.get();
            FieldErrors errors = new FieldErrors();
            NumberFormat number = NumberFormat.getNumberInstance(Locale.US);
            errors.check(r.electricity().compareTo(from.electricity()) >= 0, "electricity",
                    "The reading is lower than the last one (" + number.format(from.electricity()) + " kWh on "
                            + DAY.format(from.date()) + ").");
            errors.check(r.water().compareTo(from.water()) >= 0, "water",
                    "The reading is lower than the last one (" + number.format(from.water()) + " m³ on "
                            + DAY.format(from.date()) + ").");
            errors.throwIfAny();
            UtilityPolicy.Prices prices = utility.prices();
            BigDecimal cost = r.electricity().subtract(from.electricity()).multiply(BigDecimal.valueOf(prices.priceKwh()))
                    .add(r.water().subtract(from.water()).multiply(BigDecimal.valueOf(prices.priceM3())));
            long total = cost.setScale(0, RoundingMode.CEILING).longValueExact();
            share = prices.round(Math.ceilDiv(total, Math.max(1, r.residents())));
            periodLabel = "since " + DAY.format(from.date());
        }
        long refund = held - share - unpaidTotal - r.damageCharge();
        return new Computed(new Billing.Settlement(held, periodLabel, share, unpaidTotal, r.damageCharge(), refund),
                unpaid.stream().map(Unpaid::id).toList());
    }

    /**
     * Refuses a reading lower than the Room's latest one.
     *
     * @param prefix put before the field names ({@code from}: {@code fromElectricity}), empty for none
     */
    void checkReading(long roomId, String room, BigDecimal electricity, BigDecimal water, String prefix) {
        String e = prefix.isEmpty() ? "electricity" : prefix + "Electricity";
        String w = prefix.isEmpty() ? "water" : prefix + "Water";
        FieldErrors errors = new FieldErrors();
        errors.check(electricity != null && electricity.signum() >= 0, e, "Enter the electricity reading of Room " + room
                + ".");
        errors.check(water != null && water.signum() >= 0, w, "Enter the water reading of Room " + room + ".");
        errors.throwIfAny();
        lastReading(roomId).ifPresent(from -> {
            NumberFormat number = NumberFormat.getNumberInstance(Locale.US);
            errors.check(electricity.compareTo(from.electricity()) >= 0, e,
                    "The reading is lower than the last one (" + number.format(from.electricity()) + " kWh on "
                            + DAY.format(from.date()) + ").");
            errors.check(water.compareTo(from.water()) >= 0, w,
                    "The reading is lower than the last one (" + number.format(from.water()) + " m³ on "
                            + DAY.format(from.date()) + ").");
            errors.throwIfAny();
        });
    }

    Optional<String> refundStatus(long allocationId) {
        return jdbc.sql("""
                SELECT status FROM bil_refund WHERE source_type = 'CHECK_OUT' AND source_id = :allocation
                ORDER BY id DESC LIMIT 1
                """).param("allocation", allocationId).query(String.class).optional().map(REFUND_STATUSES::get);
    }

    /** The Room's latest reading: a reading taken at a resident change, or a monthly reading. */
    private Optional<Reading> lastReading(long roomId) {
        return jdbc.sql("""
                SELECT day, electricity, water FROM (
                    SELECT cut_date AS day, electricity, water, 1 AS rank, created_at AS at
                    FROM bil_meter_cut WHERE room_id = :room
                    UNION ALL
                    SELECT p.period_end, r.electricity_curr, r.water_curr, 0, coalesce(r.confirmed_at, r.entered_at)
                    FROM bil_meter_reading r JOIN bil_meter_period p ON p.id = r.period_id
                    WHERE r.room_id = :room AND r.electricity_curr IS NOT NULL AND r.water_curr IS NOT NULL
                ) readings
                ORDER BY day DESC, rank DESC, at DESC NULLS LAST
                LIMIT 1
                """).param("room", roomId)
                .query((rs, i) -> new Reading(rs.getObject("day", LocalDate.class), rs.getBigDecimal("electricity"),
                        rs.getBigDecimal("water")))
                .optional();
    }
}
