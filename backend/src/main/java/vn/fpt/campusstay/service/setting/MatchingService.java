package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.service.setting.MatchingPreviewer;
import vn.fpt.campusstay.common.audit.ActorResolver;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin › Matching Criteria. Criteria are immutable snapshots ({@code v1, v2 …});
 * saving creates the next one and makes it active, and every assignment run
 * records the snapshot it used. The database keeps weights as fractions; the
 * screen edits them as whole percentages that total 100.
 */
@Service
public class MatchingService {

    public record OrderItem(String key, String title, String note) {
    }

    /** {@code value} is a percentage (0–100). */
    public record Weight(String key, String label, String note, Boolean on, Integer value) {
    }

    /**
     * @param snapshot number of the active snapshot ({@code 3} for v3)
     * @param boost    multiplier for matching Roommate preferences; 1 = off. A PUT may also send
     *                 {@code true}/{@code false} (the screen's checkbox).
     * @param preview  last dry run; the server keeps none, so always null on GET (ignored on PUT)
     */
    public record Matching(Integer snapshot, List<String> hardConstraints, List<OrderItem> order, List<Weight> weights,
            Object boost, Object preview) {
    }

    public record Saved(int snapshot) {
    }

    private static final BigDecimal NO_BOOST = BigDecimal.ONE;
    private static final BigDecimal MAX_BOOST = new BigDecimal("5");

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final ObjectProvider<MatchingPreviewer> previewer;
    private final ActorResolver actors;
    private final AuditLog audit;

    public MatchingService(JdbcClient jdbc, JsonMapper json, ObjectProvider<MatchingPreviewer> previewer,
            ActorResolver actors, AuditLog audit) {
        this.jdbc = jdbc;
        this.json = json;
        this.previewer = previewer;
        this.actors = actors;
        this.audit = audit;
    }

    private record Snapshot(long id, String label, List<String> hardConstraints, List<OrderItem> order,
            List<Map<String, Object>> weights, BigDecimal boost) {
    }

    @Transactional(readOnly = true)
    public Matching get() {
        Snapshot s = active();
        List<Weight> weights = s.weights().stream()
                .map(w -> new Weight((String) w.get("key"), (String) w.get("label"), (String) w.get("note"),
                        Boolean.TRUE.equals(w.get("on")), percent(w.get("value"))))
                .toList();
        return new Matching(number(s.label()), s.hardConstraints(), s.order(), weights, Decimals.plain(s.boost()), null);
    }

    /** Saves the settings as the next snapshot and makes it the active one. */
    @Transactional
    public Saved save(Matching body) {
        Snapshot current = active();
        Validated v = validate(body, current);
        int next = jdbc.sql("""
                SELECT COALESCE(max(CAST(substring(label FROM '^v([0-9]+)$') AS int)), 0) + 1 FROM cfg_matching_snapshot
                """).query(Integer.class).single();
        List<Map<String, Object>> weights = new ArrayList<>();
        for (Map<String, Object> w : current.weights()) {
            Weight edited = v.weights().get((String) w.get("key"));
            Map<String, Object> stored = new LinkedHashMap<>(w);
            stored.put("on", edited.on());
            stored.put("value", BigDecimal.valueOf(edited.on() ? edited.value() : 0).movePointLeft(2));
            weights.add(stored);
        }
        jdbc.sql("UPDATE cfg_matching_snapshot SET active = FALSE WHERE active").update();
        jdbc.sql("""
                INSERT INTO cfg_matching_snapshot (label, hard_constraints, criteria_order, weights, boost, active, created_by)
                VALUES (:label, CAST(:hard AS jsonb), CAST(:order AS jsonb), CAST(:weights AS jsonb), :boost, TRUE, :by)
                """)
                .param("label", "v" + next)
                .param("hard", json.writeValueAsString(current.hardConstraints()))
                .param("order", json.writeValueAsString(v.order()))
                .param("weights", json.writeValueAsString(weights))
                .param("boost", v.boost())
                .param("by", actors.currentActor().id())
                .update();
        audit.record("MATCHING_SNAPSHOT_SAVED", AuditLog.Tone.INFO, "Matching criteria", null, "v" + next,
                Map.of("snapshot", List.of(current.label(), "v" + next)));
        return new Saved(next);
    }

    /** Dry run with unsaved settings; nothing is stored or allocated. */
    @Transactional(readOnly = true)
    public MatchingPreviewer.Preview preview(Matching body) {
        Validated v = validate(body, active());
        Map<String, BigDecimal> weights = new LinkedHashMap<>();
        v.weights().forEach((key, w) -> {
            if (w.on()) {
                weights.put(key, BigDecimal.valueOf(w.value()).movePointLeft(2));
            }
        });
        MatchingPreviewer engine = previewer.getIfAvailable();
        if (engine == null) {
            return new MatchingPreviewer.Preview(null, null, 0,
                    "No Applications are approved yet, so the dry run had nobody to place.");
        }
        return engine.preview(new MatchingPreviewer.Settings(v.order().stream().map(OrderItem::key).toList(), weights,
                v.boost()));
    }

    private record Validated(List<OrderItem> order, Map<String, Weight> weights, BigDecimal boost) {
    }

    private Validated validate(Matching body, Snapshot current) {
        FieldErrors errors = new FieldErrors();
        Map<String, OrderItem> criteria = new LinkedHashMap<>();
        current.order().forEach(o -> criteria.put(o.key(), o));
        List<OrderItem> order = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (OrderItem o : body.order() == null ? List.<OrderItem>of() : body.order()) {
            if (o != null && criteria.containsKey(o.key()) && seen.add(o.key())) {
                order.add(criteria.get(o.key()));
            }
        }
        errors.check(order.size() == criteria.size() && seen.size() == (body.order() == null ? 0 : body.order().size()),
                "order", "Keep every criterion in the processing order exactly once.");

        Set<String> weightKeys = new HashSet<>();
        current.weights().forEach(w -> weightKeys.add((String) w.get("key")));
        Map<String, Weight> weights = new LinkedHashMap<>();
        int total = 0;
        for (Weight w : body.weights() == null ? List.<Weight>of() : body.weights()) {
            if (w == null || !weightKeys.contains(w.key()) || weights.containsKey(w.key())) {
                errors.add("weights", "Keep every matching weight exactly once.");
                continue;
            }
            boolean on = Boolean.TRUE.equals(w.on());
            int value = w.value() == null ? 0 : w.value();
            errors.check(value >= 0 && value <= 100, "weights", "Each weight is between 0 and 100%.");
            weights.put(w.key(), new Weight(w.key(), w.label(), w.note(), on, value));
            total += on ? value : 0;
        }
        errors.check(weights.size() == weightKeys.size(), "weights", "Keep every matching weight exactly once.");
        errors.check(total == 100, "weights", "The weights that are on must total 100%.");
        BigDecimal boost = boost(body.boost(), current.boost(), errors);
        errors.throwIfAny();
        return new Validated(order, weights, boost);
    }

    /** {@code false} → no boost; {@code true} → keep the current multiplier, or the last one used; a number → itself. */
    private BigDecimal boost(Object value, BigDecimal current, FieldErrors errors) {
        if (value instanceof Boolean on) {
            if (!on) {
                return NO_BOOST;
            }
            if (current.compareTo(NO_BOOST) > 0) {
                return current;
            }
            return jdbc.sql("SELECT boost FROM cfg_matching_snapshot WHERE boost > 1 ORDER BY id DESC LIMIT 1")
                    .query(BigDecimal.class).optional()
                    .orElse(NO_BOOST);
        }
        BigDecimal number = null;
        if (value instanceof Number n) {
            number = new BigDecimal(n.toString());
        } else if (value instanceof String s && !s.isBlank()) {
            try {
                number = new BigDecimal(s.trim());
            } catch (NumberFormatException e) {
                number = null;
            }
        }
        if (number == null || number.compareTo(NO_BOOST) < 0 || number.compareTo(MAX_BOOST) > 0) {
            errors.add("boost", "Enter a boost from 1 (off) to 5.");
            return NO_BOOST;
        }
        return number.setScale(2, RoundingMode.HALF_UP);
    }

    private Snapshot active() {
        return jdbc.sql("""
                SELECT id, label, hard_constraints::text AS hard, criteria_order::text AS criteria,
                       weights::text AS weights, boost
                FROM cfg_matching_snapshot WHERE active
                """)
                .query((rs, i) -> new Snapshot(rs.getLong("id"), rs.getString("label"),
                        json.readValue(rs.getString("hard"), new TypeReference<List<String>>() {
                        }),
                        json.readValue(rs.getString("criteria"), new TypeReference<List<OrderItem>>() {
                        }),
                        json.readValue(rs.getString("weights"), new TypeReference<List<Map<String, Object>>>() {
                        }),
                        rs.getBigDecimal("boost")))
                .optional()
                .orElseThrow(() -> new IllegalStateException("No active matching snapshot"));
    }

    private static Integer number(String label) {
        String digits = label.replaceAll("\\D", "");
        return digits.isEmpty() ? null : Integer.valueOf(digits);
    }

    /** Stored fraction ({@code 0.40}) → whole percentage ({@code 40}). */
    private static Integer percent(Object fraction) {
        if (fraction == null) {
            return 0;
        }
        return new BigDecimal(fraction.toString()).movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
    }
}
