package vn.fpt.campusstay.service.setting;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.ActorResolver;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.event.PolicyChanged;
import vn.fpt.campusstay.event.ValueChange;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin configuration grouped by subject (spec §9, D-25): Deadlines and reminders; Refunds, penalties and
 * terminations; Stay and renewal. Each setting says where it is used and from when it applies; a saved change is
 * written to the Audit Log and announced to every student (spec §10). The refund rules themselves are edited on the
 * same screen through {@code /admin/fees}; the Deposit window and Balance days live in the fee policy, the rest in
 * system parameters with a settings group (V42). The Utility due days stay with the Utility prices (Admin › Utility).
 */
@Service
public class AdminSettingsService {

    /**
     * @param type   {@code INT} or {@code BOOL}
     * @param unit   hours, days, months, %, or null
     * @param usedIn where the setting acts
     */
    public record Setting(String key, String label, String type, Object value, String unit, Integer min, Integer max,
            String usedIn) {
    }

    /** {@code appliesFrom}: the next Term to open (Terms keep what they opened with), or null when none is planned. */
    public record Group(String key, String title, String appliesFrom, List<Setting> settings) {
    }

    /** {@code values}: key → new value (a number or true/false). */
    public record Save(Map<String, Object> values) {
    }

    private record Spec(String key, String label, String type, String unit, int min, int max, String usedIn,
            String source) {
    }

    private static final Map<String, String> TITLES = Map.of("DEADLINES", "Deadlines and reminders", "REFUNDS",
            "Refunds, penalties and terminations", "STAY", "Stay and renewal");

    /** Settings stored outside {@code cfg_parameter}, by group. */
    private static final Map<String, List<Spec>> FIXED = Map.of(
            "DEADLINES", List.of(
                    new Spec("fee.deposit_hours", "Deposit payment window (hours)", "INT", "hours", 1, 720,
                            "New Applications of the Terms built afterwards", "cfg_fee_policy.deposit_hours"),
                    new Spec("fee.balance_days", "Balance due after the assignment (days)", "INT", "days", 1, 365,
                            "Balance Invoices issued when the assignment is committed", "cfg_fee_policy.balance_days")),
            "REFUNDS", List.of(),
            "STAY", List.of());

    private final JdbcClient jdbc;
    private final ActorResolver actors;
    private final AuditLog audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AdminSettingsService(JdbcClient jdbc, ActorResolver actors, AuditLog audit, ApplicationEventPublisher events,
            Clock clock) {
        this.jdbc = jdbc;
        this.actors = actors;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Group get(String group) {
        String key = groupKey(group);
        List<Setting> settings = new ArrayList<>();
        for (Spec s : specs(key)) {
            settings.add(new Setting(s.key(), s.label(), s.type(), typed(s.type(), read(s)), s.unit(),
                    s.type().equals("INT") ? s.min() : null, s.type().equals("INT") ? s.max() : null, s.usedIn()));
        }
        String appliesFrom = jdbc.sql("""
                SELECT name FROM cfg_term WHERE status <> 'CLOSED' AND (status = 'DRAFT' OR registration_opens_at > :now)
                ORDER BY stay_start LIMIT 1
                """)
                .param("now", Timestamp.from(Instant.now(clock))).query(String.class).optional().orElse(null);
        return new Group(key.toLowerCase(Locale.ROOT), TITLES.get(key), appliesFrom, settings);
    }

    @Transactional
    public Group save(String group, Save body) {
        String key = groupKey(group);
        Map<String, Object> values = body == null || body.values() == null ? Map.of() : body.values();
        List<Spec> specs = specs(key);
        Map<String, Spec> byKey = new LinkedHashMap<>();
        specs.forEach(s -> byKey.put(s.key(), s));
        FieldErrors errors = new FieldErrors();
        Map<String, String> next = new LinkedHashMap<>();
        values.forEach((k, v) -> {
            Spec s = byKey.get(k);
            if (s == null) {
                errors.add(k, "This setting does not exist.");
                return;
            }
            String value = normalize(s, v);
            if (value == null) {
                errors.add(k, s.type().equals("BOOL") ? "Choose yes or no."
                        : "Enter a whole number from " + s.min() + " to " + s.max() + ".");
            } else {
                next.put(k, value);
            }
        });
        errors.throwIfAny();
        Map<String, Object> change = new LinkedHashMap<>();
        List<ValueChange> announced = new ArrayList<>();
        Timestamp now = Timestamp.from(Instant.now(clock));
        for (Map.Entry<String, String> e : next.entrySet()) {
            Spec s = byKey.get(e.getKey());
            String before = read(s);
            if (Objects.equals(before, e.getValue())) {
                continue;
            }
            write(s, e.getValue(), now);
            change.put(s.key(), List.of(before, e.getValue()));
            announced.add(new ValueChange(s.label(), s.type().equals("BOOL") ? "BOOL" : "NUMBER", before, e.getValue()));
        }
        if (!change.isEmpty()) {
            audit.record("SETTINGS_UPDATED", AuditLog.Tone.INFO, "Settings", null, TITLES.get(key), change);
            events.publishEvent(new PolicyChanged(key.equals("REFUNDS") ? "FINANCE" : "RULES", TITLES.get(key), null,
                    null, announced, null));
        }
        return get(group);
    }

    private List<Spec> specs(String group) {
        List<Spec> specs = new ArrayList<>(FIXED.get(group));
        jdbc.sql("""
                SELECT key, label, value_type, used_in FROM cfg_parameter WHERE settings_group = :g ORDER BY sort_order, key
                """)
                .param("g", group)
                .query((rs, i) -> {
                    String k = rs.getString("key");
                    String type = rs.getString("value_type");
                    return new Spec(k, rs.getString("label"), type, unit(k), min(k), max(k), rs.getString("used_in"),
                            "cfg_parameter");
                })
                .list()
                .forEach(specs::add);
        return specs;
    }

    private String read(Spec s) {
        return switch (s.source()) {
            case "cfg_fee_policy.deposit_hours" -> String.valueOf(jdbc.sql(
                    "SELECT deposit_hours FROM cfg_fee_policy WHERE id = 1").query(Integer.class).single());
            case "cfg_fee_policy.balance_days" -> String.valueOf(jdbc.sql(
                    "SELECT balance_days FROM cfg_fee_policy WHERE id = 1").query(Integer.class).single());
            default -> jdbc.sql("SELECT value FROM cfg_parameter WHERE key = :k").param("k", s.key())
                    .query(String.class).single();
        };
    }

    private void write(Spec s, String value, Timestamp now) {
        long by = actors.currentActor().id();
        switch (s.source()) {
            case "cfg_fee_policy.deposit_hours" -> jdbc.sql("""
                    UPDATE cfg_fee_policy SET deposit_hours = :v, updated_at = :now, updated_by = :by, version = version + 1
                    WHERE id = 1
                    """).param("v", Integer.parseInt(value)).param("now", now).param("by", by).update();
            case "cfg_fee_policy.balance_days" -> jdbc.sql("""
                    UPDATE cfg_fee_policy SET balance_days = :v, updated_at = :now, updated_by = :by, version = version + 1
                    WHERE id = 1
                    """).param("v", Integer.parseInt(value)).param("now", now).param("by", by).update();
            default -> jdbc.sql("UPDATE cfg_parameter SET value = :v, updated_at = :now, updated_by = :by WHERE key = :k")
                    .param("v", value).param("now", now).param("by", by).param("k", s.key()).update();
        }
    }

    /** The stored text of a submitted value, or null when it is out of range. */
    private static String normalize(Spec s, Object value) {
        String text = value == null ? "" : String.valueOf(value).trim();
        if (s.type().equals("BOOL")) {
            return text.equalsIgnoreCase("true") || text.equalsIgnoreCase("false") ? text.toLowerCase(Locale.ROOT) : null;
        }
        if (!text.matches("\\d{1,7}")) {
            return null;
        }
        int n = Integer.parseInt(text);
        return n >= s.min() && n <= s.max() ? String.valueOf(n) : null;
    }

    private static Object typed(String type, String value) {
        return type.equals("BOOL") ? Boolean.valueOf(value) : Integer.valueOf(value.trim());
    }

    private static String unit(String key) {
        if (key.endsWith("_hours")) {
            return "hours";
        }
        if (key.endsWith("_days")) {
            return "days";
        }
        if (key.endsWith("_months")) {
            return "months";
        }
        return key.endsWith("_percent") ? "%" : null;
    }

    /** Counts that must be at least 1; the others may be 0 (a reminder or a share that is off). */
    private static int min(String key) {
        return Set.of("stay.max_terms", "payment.rejections_to_cancel", "termination.overdue_months").contains(key) ? 1 : 0;
    }

    private static int max(String key) {
        return key.endsWith("_percent") ? 100 : key.equals("stay.max_terms") ? 9 : 1000;
    }

    private static String groupKey(String group) {
        String key = group == null ? "" : group.trim().toUpperCase(Locale.ROOT);
        if (!TITLES.containsKey(key)) {
            throw ApiException.notFound("This settings group does not exist.");
        }
        return key;
    }
}
