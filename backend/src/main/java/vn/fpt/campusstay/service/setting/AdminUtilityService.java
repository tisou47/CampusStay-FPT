package vn.fpt.campusstay.service.setting;

import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.IntStream;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.ActorResolver;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin › Utility: meter prices, the monthly reading day, payment terms,
 * rounding of each share, reminders and the Utility Deposit (estimate × months
 * held). Changes apply to the next billing period and to Balances issued after.
 */
@Service
public class AdminUtilityService {

    public record Option(String value, String label) {
    }

    public record Options(List<Option> readingDays, List<Option> paymentDueDays, List<Option> rounding,
            List<Option> overdueReminder) {
    }

    /** {@code options} is ignored on save. */
    public record Utility(Long priceKwh, Long priceM3, Integer readingDay, Integer paymentDueDays, String rounding,
            String overdueReminder, Long estimateMonthly, Integer monthsHeld, Boolean blockChangesWhenOverdue,
            Options options) {
    }

    private static final List<Integer> DUE_DAYS = List.of(3, 5, 7, 10, 14, 30);
    private static final Map<String, String> ROUNDING = new LinkedHashMap<>();
    private static final Map<String, String> REMINDERS = new LinkedHashMap<>();

    static {
        NumberFormat n = NumberFormat.getIntegerInstance(Locale.US);
        for (int step : new int[] { 100, 500, 1000, 5000 }) {
            ROUNDING.put("ROUND_UP_" + step, "Round up to " + n.format(step) + " VND");
        }
        ROUNDING.put("NONE", "No rounding");
        REMINDERS.put("DAILY_AFTER_DUE", "Every day after the due date");
        REMINDERS.put("EVERY_3_DAYS", "Every 3 days after the due date");
        REMINDERS.put("WEEKLY", "Every week after the due date");
        REMINDERS.put("NONE", "No automatic reminders");
    }

    private final JdbcClient jdbc;
    private final ActorResolver actors;
    private final AuditLog audit;
    private final Clock clock;

    public AdminUtilityService(JdbcClient jdbc, ActorResolver actors, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.actors = actors;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Utility get() {
        return jdbc.sql("""
                SELECT price_kwh, price_m3, reading_day, payment_due_days, rounding, overdue_reminder, estimate_monthly,
                       months_held, block_changes_when_overdue
                FROM cfg_utility_policy WHERE id = 1
                """)
                .query((rs, i) -> new Utility(rs.getLong("price_kwh"), rs.getLong("price_m3"), rs.getInt("reading_day"),
                        rs.getInt("payment_due_days"), rs.getString("rounding"), rs.getString("overdue_reminder"),
                        rs.getLong("estimate_monthly"), rs.getInt("months_held"),
                        rs.getBoolean("block_changes_when_overdue"), options()))
                .single();
    }

    @Transactional
    public Utility save(Utility body) {
        Utility before = get();
        FieldErrors errors = new FieldErrors();
        errors.check(between(body.priceKwh(), 1, 100_000), "priceKwh", "Enter a price per kWh from 1 to 100,000 VND.");
        errors.check(between(body.priceM3(), 1, 1_000_000), "priceM3", "Enter a price per m³ from 1 to 1,000,000 VND.");
        errors.check(body.readingDay() != null && body.readingDay() >= 1 && body.readingDay() <= 28, "readingDay",
                "Choose a day from 1 to 28.");
        errors.check(body.paymentDueDays() != null && DUE_DAYS.contains(body.paymentDueDays()), "paymentDueDays",
                "Choose one of the listed payment terms.");
        errors.check(body.rounding() != null && ROUNDING.containsKey(body.rounding()), "rounding",
                "Choose one of the listed rounding rules.");
        errors.check(body.overdueReminder() != null && REMINDERS.containsKey(body.overdueReminder()), "overdueReminder",
                "Choose one of the listed reminder rules.");
        errors.check(between(body.estimateMonthly(), 1, 100_000_000), "estimateMonthly",
                "Enter the monthly estimate per student in VND.");
        errors.check(body.monthsHeld() != null && body.monthsHeld() >= 2 && body.monthsHeld() <= 12, "monthsHeld",
                "Hold 2 to 12 months of the estimate.");
        errors.throwIfAny();
        jdbc.sql("""
                UPDATE cfg_utility_policy SET price_kwh = :kwh, price_m3 = :m3, reading_day = :day,
                       payment_due_days = :due, rounding = :rounding, overdue_reminder = :reminder,
                       estimate_monthly = :estimate, months_held = :months, block_changes_when_overdue = :block,
                       updated_at = :now, updated_by = :by, version = version + 1
                WHERE id = 1
                """)
                .param("kwh", body.priceKwh()).param("m3", body.priceM3()).param("day", body.readingDay())
                .param("due", body.paymentDueDays()).param("rounding", body.rounding())
                .param("reminder", body.overdueReminder()).param("estimate", body.estimateMonthly())
                .param("months", body.monthsHeld()).param("block", Boolean.TRUE.equals(body.blockChangesWhenOverdue()))
                .param("now", Timestamp.from(Instant.now(clock))).param("by", actors.currentActor().id())
                .update();
        Utility after = get();
        Map<String, Object> change = new LinkedHashMap<>();
        diff(change, "priceKwh", before.priceKwh(), after.priceKwh());
        diff(change, "priceM3", before.priceM3(), after.priceM3());
        diff(change, "readingDay", before.readingDay(), after.readingDay());
        diff(change, "paymentDueDays", before.paymentDueDays(), after.paymentDueDays());
        diff(change, "rounding", before.rounding(), after.rounding());
        diff(change, "overdueReminder", before.overdueReminder(), after.overdueReminder());
        diff(change, "estimateMonthly", before.estimateMonthly(), after.estimateMonthly());
        diff(change, "monthsHeld", before.monthsHeld(), after.monthsHeld());
        diff(change, "blockChangesWhenOverdue", before.blockChangesWhenOverdue(), after.blockChangesWhenOverdue());
        if (!change.isEmpty()) {
            audit.record("UTILITY_UPDATED", AuditLog.Tone.INFO, "Utility policy", null, "Utility", change);
        }
        return after;
    }

    private static Options options() {
        return new Options(
                IntStream.rangeClosed(1, 28).mapToObj(d -> new Option(String.valueOf(d), "Day " + d)).toList(),
                DUE_DAYS.stream().map(d -> new Option(String.valueOf(d), d + " days")).toList(),
                ROUNDING.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).toList(),
                REMINDERS.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).toList());
    }

    private static boolean between(Long value, long min, long max) {
        return value != null && value >= min && value <= max;
    }

    private static void diff(Map<String, Object> change, String key, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            change.put(key, Arrays.asList(before == null ? null : String.valueOf(before),
                    after == null ? null : String.valueOf(after)));
        }
    }
}
